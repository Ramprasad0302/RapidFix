import { BookingStatus as B, SocketEvent, type PaymentMethod, type RazorpayOrderDto } from '@fixora/shared-types';
import { formatINR, splitCommission } from '@fixora/shared-utils';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { hmacSha256, safeEqual } from '../utils/crypto';
import { recordAudit } from './audit.service';
import { transitionBooking } from './bookingState';
import { resolveCommissionRule } from './commission.service';
import { emitBookingEvent } from './realtime.service';
import { postWalletTxn } from './wallet.service';

/**
 * Payments. The client is never trusted: Razorpay payments are confirmed only
 * by a verified signature (checkout callback) or a verified webhook, and both
 * paths funnel into the same idempotent `completePayment`.
 */

export const razorpayConfigured = () => !!env.RAZORPAY_KEY_ID && !!env.RAZORPAY_KEY_SECRET;

async function razorpay<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) {
    logger.warn({ status: res.status, path, error: json.error }, 'Razorpay request failed');
    throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', json.error?.description ?? 'Payment gateway error. Please try again.');
  }
  return json;
}

const invoiceNumber = (seq: number, year = new Date().getFullYear()) => `INV-${year}-${String(seq).padStart(6, '0')}`;

// ─── Razorpay order (customer) ───────────────────────────────────────────

export async function createRazorpayOrder(customerId: string, bookingId: string): Promise<RazorpayOrderDto> {
  if (!razorpayConfigured()) throw new AppError(503, 'ONLINE_PAYMENT_UNAVAILABLE', 'Online payment is not available right now. Please pay cash or UPI to your technician.');
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, customerId },
    include: { payment: true, customer: { include: { user: true } } },
  });
  if (!b) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (b.status !== B.PAYMENT_PENDING) throw AppError.conflict('This booking is not awaiting payment.', 'NOT_PAYABLE');

  // Re-use an open order for the same amount (a retried checkout).
  let orderId = b.payment?.status === 'PROCESSING' && b.payment.amount === b.totalAmount ? b.payment.razorpayOrderId : null;
  if (!orderId) {
    const order = await razorpay<{ id: string }>('/orders', {
      amount: b.totalAmount,
      currency: 'INR',
      receipt: b.code ?? b.id,
      notes: { bookingId: b.id },
    });
    orderId = order.id;
    await prisma.payment.upsert({
      where: { bookingId: b.id },
      update: { method: 'RAZORPAY', status: 'PROCESSING', amount: b.totalAmount, razorpayOrderId: orderId },
      create: { bookingId: b.id, method: 'RAZORPAY', status: 'PROCESSING', amount: b.totalAmount, razorpayOrderId: orderId },
    });
  }
  return {
    orderId,
    keyId: env.RAZORPAY_KEY_ID,
    amount: b.totalAmount,
    currency: 'INR',
    bookingCode: b.code ?? '',
    prefill: { name: b.customer.user.name ?? '', contact: b.customer.user.phone ?? '', email: b.customer.user.email ?? '' },
  };
}

/** Checkout callback: HMAC(order_id|payment_id, key_secret) must match. */
export async function verifyRazorpayCheckout(
  customerId: string,
  bookingId: string,
  p: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
) {
  const payment = await prisma.payment.findFirst({ where: { bookingId, booking: { customerId }, razorpayOrderId: p.razorpay_order_id } });
  if (!payment) throw AppError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
  const expected = hmacSha256(env.RAZORPAY_KEY_SECRET, `${p.razorpay_order_id}|${p.razorpay_payment_id}`);
  if (!safeEqual(expected, p.razorpay_signature)) {
    await recordAudit({ action: 'PAYMENT_SIGNATURE_INVALID', entity: 'Booking', entityId: bookingId, newValue: { orderId: p.razorpay_order_id } });
    throw AppError.badRequest('Payment could not be verified.', 'PAYMENT_VERIFICATION_FAILED');
  }
  return completePayment(bookingId, {
    method: 'RAZORPAY',
    provider: 'razorpay',
    providerRef: p.razorpay_payment_id,
    idempotencyKey: `rzp:${p.razorpay_payment_id}`,
    amount: payment.amount,
  });
}

/** Razorpay webhook (signature over the raw body). Handles captured / failed / refund events idempotently. */
export async function handleRazorpayWebhook(rawBody: Buffer, signature: string | undefined) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'Webhook secret not configured');
  const expected = hmacSha256(env.RAZORPAY_WEBHOOK_SECRET, rawBody.toString('utf8'));
  if (!signature || !safeEqual(expected, signature)) throw AppError.unauthorized('Invalid webhook signature', 'INVALID_SIGNATURE');

  const event = JSON.parse(rawBody.toString('utf8')) as {
    event: string;
    payload: {
      payment?: { entity: { id: string; order_id: string; amount: number; status: string } };
      refund?: { entity: { id: string; payment_id: string; amount: number } };
    };
  };
  const pay = event.payload.payment?.entity;
  if ((event.event === 'payment.captured' || event.event === 'order.paid') && pay) {
    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: pay.order_id } });
    if (!payment) return { handled: false };
    if (pay.amount !== payment.amount) {
      logger.error({ order: pay.order_id }, 'Razorpay amount mismatch');
      return { handled: false };
    }
    await completePayment(payment.bookingId, { method: 'RAZORPAY', provider: 'razorpay', providerRef: pay.id, idempotencyKey: `rzp:${pay.id}`, amount: pay.amount, raw: event });
    return { handled: true };
  }
  if (event.event === 'payment.failed' && pay) {
    await prisma.payment.updateMany({ where: { razorpayOrderId: pay.order_id, status: 'PROCESSING' }, data: { status: 'FAILED' } });
    return { handled: true };
  }
  if (event.event === 'refund.processed' && event.payload.refund) {
    const r = event.payload.refund.entity;
    const payment = await prisma.payment.findFirst({ where: { razorpayPaymentId: r.payment_id } });
    if (payment) {
      await prisma.paymentTransaction
        .create({ data: { paymentId: payment.id, type: 'REFUND', status: 'SUCCESS', amount: r.amount, provider: 'razorpay', providerRef: r.id, idempotencyKey: `rzp-refund:${r.id}`, rawPayload: event as object } })
        .catch((e) => {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        });
    }
    return { handled: true };
  }
  return { handled: false };
}

// ─── Cash / UPI collected by the technician ─────────────────────────────

export async function collectOffline(technicianUserId: string, bookingId: string, method: 'CASH' | 'UPI') {
  const b = await prisma.booking.findFirst({ where: { id: bookingId, technician: { userId: technicianUserId } } });
  if (!b) throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  if (b.status !== B.PAYMENT_PENDING) throw AppError.conflict('This job is not awaiting payment.', 'NOT_PAYABLE');
  return completePayment(bookingId, {
    method,
    provider: method.toLowerCase(),
    providerRef: null,
    idempotencyKey: `offline:${bookingId}`,
    amount: b.totalAmount,
    actorId: technicianUserId,
  });
}

// ─── The single settlement path ──────────────────────────────────────────

interface Settlement {
  method: PaymentMethod;
  provider: string;
  providerRef: string | null;
  idempotencyKey: string;
  amount: number;
  raw?: unknown;
  actorId?: string | null;
}

/**
 * Marks the booking paid, splits commission, posts wallet entries and issues
 * the invoice number — all in one transaction. Re-running with the same
 * idempotency key (duplicate webhook, retried callback) returns without effect.
 */
export async function completePayment(bookingId: string, s: Settlement) {
  const result = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { service: { select: { categoryId: true, name: true } }, customer: { select: { userId: true } }, technician: { select: { id: true, userId: true } } },
    });
    const seen = await tx.paymentTransaction.findUnique({ where: { idempotencyKey: s.idempotencyKey } });
    if (seen || b.status === B.PAYMENT_COMPLETED) return { already: true as const, b };
    if (b.status !== B.PAYMENT_PENDING) throw AppError.conflict('This booking is not awaiting payment.', 'NOT_PAYABLE');
    if (!b.technician) throw AppError.conflict('No technician on this booking.', 'NO_TECHNICIAN');
    if (s.amount !== b.totalAmount) throw AppError.badRequest('Paid amount does not match the bill.', 'AMOUNT_MISMATCH');

    const gross = b.serviceCharge + b.visitCharge + b.additionalChargesTotal - b.discountAmount;
    const rule = await resolveCommissionRule({ technicianId: b.technician.id, serviceId: b.serviceId, categoryId: b.service.categoryId, locationId: b.locationId });
    const split = splitCommission(gross, rule);
    const now = new Date();

    const payment = await tx.payment.upsert({
      where: { bookingId },
      update: { method: s.method, status: 'SUCCESS', amount: b.totalAmount, paidAt: now, ...(s.method === 'RAZORPAY' && { razorpayPaymentId: s.providerRef }) },
      create: { bookingId, method: s.method, status: 'SUCCESS', amount: b.totalAmount, paidAt: now, ...(s.method === 'RAZORPAY' && { razorpayPaymentId: s.providerRef }) },
    });
    await tx.payment.update({ where: { id: payment.id }, data: { invoiceNumber: payment.invoiceNumber ?? invoiceNumber(b.seq) } });
    await tx.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        type: 'CHARGE',
        status: 'SUCCESS',
        amount: b.totalAmount,
        provider: s.provider,
        providerRef: s.providerRef,
        idempotencyKey: s.idempotencyKey,
        rawPayload: s.raw ? (s.raw as object) : undefined,
      },
    });

    if (s.method === 'RAZORPAY') {
      // FIXORA holds the money → credit the technician's share.
      await postWalletTxn(tx, b.technician.id, {
        type: 'EARNING_CREDIT',
        amount: split.technicianNet,
        earned: split.technicianNet,
        bookingId,
        description: `Earning for ${b.code} (${b.service.name})`,
        idempotencyKey: `earn:${bookingId}`,
      });
    } else {
      // Technician holds the cash → they owe FIXORA the commission and the GST.
      await postWalletTxn(tx, b.technician.id, {
        type: 'COMMISSION_DEBIT',
        amount: -(split.commission + b.taxAmount),
        earned: split.technicianNet,
        bookingId,
        description: `${s.method === 'CASH' ? 'Cash' : 'UPI'} job ${b.code}: commission ${formatINR(split.commission)} + GST ${formatINR(b.taxAmount)}`,
        idempotencyKey: `commission:${bookingId}`,
      });
    }

    await transitionBooking(tx, b, B.PAYMENT_COMPLETED, {
      actorId: s.actorId ?? null,
      note: `Paid by ${s.method}`,
      data: { paymentStatus: 'SUCCESS', paymentMethod: s.method, commissionAmount: split.commission, technicianEarning: split.technicianNet },
    });
    await tx.notification.createMany({
      data: [
        { userId: b.customer.userId, type: 'PAYMENT', title: 'Payment received', body: `${formatINR(b.totalAmount)} paid for ${b.service.name}. Please rate your experience.`, data: { bookingId } },
        { userId: b.technician.userId, type: 'PAYMENT', title: 'Payment confirmed', body: `${b.code}: you earned ${formatINR(split.technicianNet)}.`, data: { bookingId } },
      ],
    });
    return { already: false as const, b };
  });

  const { b } = result;
  emitBookingEvent(b.id, [b.customer.userId, b.technician?.userId].filter((x): x is string => !!x), SocketEvent.PAYMENT_UPDATED, { status: 'PAYMENT_COMPLETED' }, { staff: true });
  return { alreadyProcessed: result.already };
}

// ─── Refunds (admin) ─────────────────────────────────────────────────────

export async function refundPayment(bookingId: string, actor: { userId: string; role: string }, opts: { amount?: number; reason: string }, ip?: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { payment: true, technician: true } });
  if (!b?.payment || b.payment.status !== 'SUCCESS') throw AppError.conflict('There is no successful payment to refund.', 'NOT_REFUNDABLE');
  const refundable = b.payment.amount - b.payment.refundedAmount;
  const amount = opts.amount ?? refundable;
  if (amount <= 0 || amount > refundable) throw AppError.badRequest(`You can refund up to ${formatINR(refundable)}.`, 'INVALID_REFUND_AMOUNT');

  let providerRef: string | null = null;
  if (b.payment.method === 'RAZORPAY') {
    if (!razorpayConfigured() || !b.payment.razorpayPaymentId) throw new AppError(503, 'ONLINE_PAYMENT_UNAVAILABLE', 'Razorpay is not configured.');
    providerRef = (await razorpay<{ id: string }>(`/payments/${b.payment.razorpayPaymentId}/refund`, { amount, notes: { bookingId, reason: opts.reason } })).id;
  }
  const full = amount === refundable;
  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.create({
      data: {
        paymentId: b.payment!.id,
        type: 'REFUND',
        status: 'SUCCESS',
        amount,
        provider: b.payment!.method.toLowerCase(),
        providerRef,
        idempotencyKey: providerRef ? `rzp-refund:${providerRef}` : `manual-refund:${bookingId}:${Date.now()}`,
      },
    });
    await tx.payment.update({ where: { id: b.payment!.id }, data: { refundedAmount: { increment: amount }, ...(full && { status: 'REFUNDED' }) } });
    // Claw back the technician's share proportionally when FIXORA had credited it.
    if (b.technician && b.technicianEarning && b.payment!.method === 'RAZORPAY') {
      const clawback = Math.round((b.technicianEarning * amount) / b.payment!.amount);
      await postWalletTxn(tx, b.technician.id, {
        type: 'ADJUSTMENT',
        amount: -clawback,
        bookingId,
        description: `Refund on ${b.code}: ${opts.reason}`,
        idempotencyKey: `refund-clawback:${bookingId}:${b.payment!.refundedAmount + amount}`,
      });
    }
    if (full && [B.PAYMENT_COMPLETED, B.DISPUTED].includes(b.status as never)) {
      await transitionBooking(tx, b, B.REFUNDED, { actorId: actor.userId, note: opts.reason, data: { paymentStatus: 'REFUNDED' } });
    }
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: b.customerId }, select: { userId: true } });
    await tx.notification.create({
      data: { userId: customer.userId, type: 'PAYMENT', title: 'Refund issued', body: `${formatINR(amount)} refunded for ${b.code}.`, data: { bookingId } },
    });
  });
  await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: 'REFUND', entity: 'Booking', entityId: bookingId, newValue: { amount, reason: opts.reason }, ip });
}
