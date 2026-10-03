import { BookingStatus as B, SocketEvent, type PaymentLinkDto, type PaymentMethod, type RazorpayOrderDto } from '@fixora/shared-types';
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
import { getSetting } from './settings.service';
import { emitBookingEvent } from './realtime.service';
import { postWalletTxn } from './wallet.service';

/**
 * Payments — fully automatic, and the client is never trusted.
 *
 * Online (Razorpay) money is recorded only when Razorpay itself confirms it:
 * a verified checkout signature, a verified webhook, or a server-side API
 * check. Every confirmed payment goes through `recordOnlinePayment`:
 *
 *  - Booking paid online up front (status PENDING) → booking confirmed and
 *    dispatched to technicians.
 *  - Job finished (PAYMENT_PENDING) → settled: invoice, commission, wallet.
 *    Paid in advance? `settleIfPrepaid` settles the moment the job completes.
 *    Balance left (extra work, or a cash booking)? The customer pays in their
 *    app, or scans the technician's Razorpay QR / SMS link — or pays cash.
 *  - Paid twice, or after a cancellation → refunded automatically.
 *
 * Cancelled bookings with online payments are refunded automatically
 * (`refundOnlineCharges`), and bookings left unpaid expire (`expireUnpaidBookings`).
 */

export const razorpayConfigured = () => !!env.RAZORPAY_KEY_ID && !!env.RAZORPAY_KEY_SECRET;

/** Successful Razorpay charges on a payment (advance at booking, balance after the job). */
export const ONLINE_CHARGE = { type: 'CHARGE', status: 'SUCCESS', provider: 'razorpay' } as const satisfies Prisma.PaymentTransactionWhereInput;

/** Unpaid "pay online" bookings are cancelled after this long. */
export const UNPAID_BOOKING_TTL_MS = 30 * 60_000;

async function razorpay<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
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
const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

type Db = Prisma.TransactionClient | typeof prisma;

/** Paid online so far for a booking. */
export async function paidOnline(db: Db, bookingId: string) {
  const r = await db.paymentTransaction.aggregate({ where: { payment: { bookingId }, ...ONLINE_CHARGE }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

/**
 * Advance (paise) every booking pays online before it goes to technicians
 * (admin setting, ₹100 by default). 0 when switched off or Razorpay isn't set up.
 */
export async function bookingAdvance(): Promise<number> {
  if (!razorpayConfigured()) return 0;
  const rupees = await getSetting<number>('pricing.bookingAdvanceRupees', env.BOOKING_ADVANCE_RUPEES);
  return Math.max(0, Math.round(Number(rupees) * 100));
}

/** What a waiting booking must pay before dispatch: the full bill ("pay full now") or the advance. */
export async function prepayTarget(b: { paymentMethod: PaymentMethod; totalAmount: number }) {
  return b.paymentMethod === 'RAZORPAY' ? b.totalAmount : Math.min(await bookingAdvance(), b.totalAmount);
}

const unavailable = () =>
  new AppError(503, 'ONLINE_PAYMENT_UNAVAILABLE', 'Online payment is not available right now. Please choose cash or UPI to your technician.');

function startDispatch(bookingId: string) {
  if (env.NODE_ENV === 'test') return; // tests drive dispatch explicitly
  void import('./assignment.service')
    .then(({ dispatchBooking }) => dispatchBooking(bookingId))
    .catch((err) => logger.error({ err, bookingId }, 'dispatch after payment failed'));
}

// ─── Razorpay Checkout (customer: at booking, or the balance after the job) ─

export async function createRazorpayOrder(customerId: string, bookingId: string): Promise<RazorpayOrderDto> {
  if (!razorpayConfigured()) throw unavailable();
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, customerId },
    include: { payment: true, customer: { include: { user: true } } },
  });
  if (!b) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  const prepay = b.status === B.PENDING;
  if (!prepay && b.status !== B.PAYMENT_PENDING) throw AppError.conflict('This booking is not awaiting payment.', 'NOT_PAYABLE');
  // Waiting booking: the advance (or the full bill); after the job: whatever is left.
  const due = (prepay ? await prepayTarget(b) : b.totalAmount) - (await paidOnline(prisma, b.id));
  if (due <= 0) throw AppError.conflict('This booking is already paid.', 'ALREADY_PAID');

  // Re-use the open order for the same amount (a retried checkout).
  let orderId = b.payment?.status === 'PROCESSING' && b.payment.amount === due ? b.payment.razorpayOrderId : null;
  if (!orderId) {
    const order = await razorpay<{ id: string }>('POST', '/orders', {
      amount: due,
      currency: 'INR',
      receipt: b.code ?? b.id,
      notes: { bookingId: b.id },
    });
    orderId = order.id;
    await prisma.payment.upsert({
      where: { bookingId: b.id },
      update: { method: 'RAZORPAY', status: 'PROCESSING', amount: due, razorpayOrderId: orderId },
      create: { bookingId: b.id, method: 'RAZORPAY', status: 'PROCESSING', amount: due, razorpayOrderId: orderId },
    });
  }
  return {
    orderId,
    keyId: env.RAZORPAY_KEY_ID,
    amount: due,
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
  return recordOnlinePayment(bookingId, { paymentId: p.razorpay_payment_id, amount: payment.amount });
}

/**
 * Customer chose "pay full amount now" but would rather pay just the advance
 * now and the rest after the service. With no advance configured, the booking
 * is confirmed straight away (pay after service).
 */
export async function switchToPayAfterService(customerId: string, userId: string, bookingId: string) {
  const b = await prisma.booking.findFirst({ where: { id: bookingId, customerId } });
  if (!b) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (b.status !== B.PENDING || b.paymentMethod !== 'RAZORPAY') throw AppError.conflict('This booking is already confirmed.', 'NOT_PENDING_PAYMENT');
  if ((await paidOnline(prisma, b.id)) > 0) throw AppError.conflict('This booking is already paid.', 'ALREADY_PAID');
  const advance = await bookingAdvance();
  await prisma.$transaction(async (tx) => {
    if (advance > 0) {
      await tx.booking.update({ where: { id: b.id }, data: { paymentMethod: 'CASH' } });
      await tx.payment.updateMany({ where: { bookingId: b.id, status: { not: 'SUCCESS' } }, data: { status: 'PENDING', amount: Math.min(advance, b.totalAmount), razorpayOrderId: null } });
    } else {
      await transitionBooking(tx, b, B.SEARCHING, { actorId: userId, note: 'Pay after service (cash / UPI)', data: { paymentMethod: 'CASH' } });
      await tx.payment.deleteMany({ where: { bookingId: b.id, status: { not: 'SUCCESS' } } });
    }
  });
  if (advance === 0) startDispatch(b.id);
}

// ─── Technician: Razorpay QR / payment link at the customer's door ───────

interface RazorpayLink {
  id: string;
  short_url: string;
  status: 'created' | 'partially_paid' | 'expired' | 'cancelled' | 'paid';
  amount: number;
  expire_by?: number;
  notes?: { bookingId?: string } | null;
  payments?: { payment_id: string; amount: number; status: string }[] | null;
}

const toLinkDto = (l: RazorpayLink): PaymentLinkDto => ({
  linkId: l.id,
  shortUrl: l.short_url,
  amount: l.amount,
  expiresAt: l.expire_by ? new Date(l.expire_by * 1000).toISOString() : null,
});

async function ownedPayableJob(technicianUserId: string, bookingId: string) {
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, technician: { userId: technicianUserId } },
    include: { customer: { include: { user: true } }, service: { select: { name: true } } },
  });
  if (!b) throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  if (b.status !== B.PAYMENT_PENDING) throw AppError.conflict('This job is not awaiting payment.', 'NOT_PAYABLE');
  return b;
}

/**
 * A Razorpay payment link for what the customer still owes. The technician's
 * screen shows it as a QR code (UPI / card / net banking) and Razorpay also
 * texts it to the customer. Re-opening the screen re-uses the same link.
 */
export async function createCollectLink(technicianUserId: string, bookingId: string): Promise<PaymentLinkDto> {
  if (!razorpayConfigured()) throw unavailable();
  const b = await ownedPayableJob(technicianUserId, bookingId);
  const due = b.totalAmount - (await paidOnline(prisma, b.id));
  if (due <= 0) throw AppError.conflict('This job is already paid.', 'ALREADY_PAID');

  const reference = `${b.code ?? b.id.slice(0, 12)}-${due}`;
  const existing = await razorpay<{ payment_links?: RazorpayLink[] }>('GET', `/payment_links?reference_id=${encodeURIComponent(reference)}`).catch(() => ({ payment_links: [] }));
  const open = existing.payment_links?.find((l) => l.status === 'created' && l.amount === due);
  if (open) return toLinkDto(open);

  const user = b.customer.user;
  const link = await razorpay<RazorpayLink>('POST', '/payment_links', {
    amount: due,
    currency: 'INR',
    accept_partial: false,
    // A used/expired reference can't be reused, so a fresh one gets a suffix.
    reference_id: existing.payment_links?.length ? `${reference}-${Date.now().toString(36)}` : reference,
    description: `RapidFix ${b.code ?? ''} · ${b.service.name}`.slice(0, 2048),
    customer: { name: user.name ?? 'RapidFix customer', ...(user.phone && { contact: user.phone }), ...(user.email && { email: user.email }) },
    notify: { sms: !!user.phone, email: !!user.email },
    reminder_enable: false,
    expire_by: Math.floor(Date.now() / 1000) + 2 * 24 * 3600,
    notes: { bookingId: b.id },
  });
  return toLinkDto(link);
}

/** The technician's screen polls this: settles the job the moment the link is paid. */
export async function checkCollectLink(technicianUserId: string, bookingId: string, linkId: string) {
  const b = await prisma.booking.findFirst({ where: { id: bookingId, technician: { userId: technicianUserId } }, select: { id: true, status: true } });
  if (!b) throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  if (b.status !== B.PAYMENT_PENDING) return { paid: b.status === B.PAYMENT_COMPLETED };
  const link = await razorpay<RazorpayLink>('GET', `/payment_links/${encodeURIComponent(linkId)}`);
  if (link.notes?.bookingId !== bookingId) throw AppError.notFound('Payment link not found', 'LINK_NOT_FOUND');
  if (link.status !== 'paid') return { paid: false };
  for (const p of link.payments ?? []) {
    if (p.status === 'captured') await recordOnlinePayment(bookingId, { paymentId: p.payment_id, amount: p.amount, raw: link });
  }
  return { paid: true };
}

// ─── Confirm straight from Razorpay (no waiting for the app or the webhook) ─

interface OrderPayment {
  id: string;
  amount: number;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
}

/** An authorized payment is money the customer already approved: capture it so it counts. */
async function captureIfAuthorized(p: OrderPayment): Promise<OrderPayment> {
  if (p.status !== 'authorized') return p;
  try {
    return await razorpay<OrderPayment>('POST', `/payments/${p.id}/capture`, { amount: p.amount, currency: 'INR' });
  } catch {
    // Captured meanwhile (auto-capture / webhook) — re-read it.
    return razorpay<OrderPayment>('GET', `/payments/${p.id}`);
  }
}

/**
 * Ask Razorpay what happened to a booking's open order and record any payment
 * it took. Called by the booking screen as soon as the customer returns from
 * PhonePe / GPay / card, and every few seconds by the background worker — so a
 * payment is confirmed within seconds even if the phone never reported back.
 */
export async function syncOrderPayments(bookingId: string): Promise<boolean> {
  if (!razorpayConfigured()) return false;
  const payment = await prisma.payment.findUnique({ where: { bookingId } });
  if (!payment?.razorpayOrderId) return false;
  const { items } = await razorpay<{ items: OrderPayment[] }>('GET', `/orders/${payment.razorpayOrderId}/payments`);
  let recorded = false;
  for (const item of items) {
    const p = await captureIfAuthorized(item);
    if (p.status === 'captured') {
      await recordOnlinePayment(bookingId, { paymentId: p.id, amount: p.amount });
      recorded = true;
    }
  }
  return recorded;
}

/** Customer's screen: "did my payment go through?" (owned bookings only). */
export async function syncCustomerPayment(customerId: string, bookingId: string) {
  const b = await prisma.booking.findFirst({ where: { id: bookingId, customerId }, select: { id: true } });
  if (!b) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  await syncOrderPayments(b.id).catch((err) => logger.warn({ err, bookingId }, 'payment sync failed'));
}

/** Background: every open order touched in the last 30 minutes. */
export async function syncOpenOrders() {
  if (!razorpayConfigured()) return 0;
  const open = await prisma.payment.findMany({
    where: {
      status: 'PROCESSING',
      razorpayOrderId: { not: null },
      updatedAt: { gte: new Date(Date.now() - UNPAID_BOOKING_TTL_MS) },
      booking: { status: { in: [B.PENDING, B.PAYMENT_PENDING] } },
    },
    select: { bookingId: true },
    take: 25,
  });
  for (const p of open) await syncOrderPayments(p.bookingId).catch((err) => logger.warn({ err, bookingId: p.bookingId }, 'order sync failed'));
  return open.length;
}

// ─── Webhook ─────────────────────────────────────────────────────────────

/** Razorpay webhook (signature over the raw body). Idempotent; safe to receive twice. */
export async function handleRazorpayWebhook(rawBody: Buffer, signature: string | undefined) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'Webhook secret not configured');
  const expected = hmacSha256(env.RAZORPAY_WEBHOOK_SECRET, rawBody.toString('utf8'));
  if (!signature || !safeEqual(expected, signature)) throw AppError.unauthorized('Invalid webhook signature', 'INVALID_SIGNATURE');
  const event = JSON.parse(rawBody.toString('utf8')) as {
    event: string;
    payload: {
      payment?: { entity: { id: string; order_id: string; amount: number; status: string } };
      payment_link?: { entity: { id: string; notes?: { bookingId?: string } | null } };
      refund?: { entity: { id: string; payment_id: string; amount: number } };
    };
  };
  const pay = event.payload.payment?.entity;

  if (event.event === 'payment_link.paid' && pay) {
    const bookingId = event.payload.payment_link?.entity.notes?.bookingId;
    if (!bookingId) return { handled: false };
    await recordOnlinePayment(bookingId, { paymentId: pay.id, amount: pay.amount, raw: event });
    return { handled: true };
  }
  if (event.event === 'payment.authorized' && pay) {
    // Accounts without automatic capture: capture now so the booking is confirmed at once.
    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: pay.order_id } });
    if (!payment) return { handled: false };
    const captured = await captureIfAuthorized({ id: pay.id, amount: pay.amount, status: 'authorized' });
    if (captured.status === 'captured') await recordOnlinePayment(payment.bookingId, { paymentId: pay.id, amount: pay.amount, raw: event });
    return { handled: true };
  }
  if ((event.event === 'payment.captured' || event.event === 'order.paid') && pay) {
    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: pay.order_id } });
    if (!payment) return { handled: false }; // e.g. a payment link's own order — handled by payment_link.paid
    await recordOnlinePayment(payment.bookingId, { paymentId: pay.id, amount: pay.amount, raw: event });
    return { handled: true };
  }
  if (event.event === 'payment.failed' && pay) {
    await prisma.payment.updateMany({ where: { razorpayOrderId: pay.order_id, status: 'PROCESSING' }, data: { status: 'FAILED' } });
    return { handled: true };
  }
  if (event.event === 'refund.processed' && event.payload.refund) {
    const r = event.payload.refund.entity;
    const charge = await prisma.paymentTransaction.findFirst({ where: { providerRef: r.payment_id, ...ONLINE_CHARGE } });
    if (charge) {
      await prisma.paymentTransaction
        .create({
          data: { paymentId: charge.paymentId, type: 'REFUND', status: 'SUCCESS', amount: r.amount, provider: 'razorpay', providerRef: r.id, idempotencyKey: `rzp-refund:${r.id}`, rawPayload: { payment_id: r.payment_id, webhook: true } },
        })
        .catch((e) => {
          if (!isUniqueViolation(e)) throw e;
        });
    }
    return { handled: true };
  }
  return { handled: false };
}

// ─── Every confirmed online payment lands here ───────────────────────────

interface ConfirmedPayment {
  paymentId: string;
  amount: number;
  raw?: unknown;
}

export async function recordOnlinePayment(bookingId: string, p: ConfirmedPayment): Promise<{ alreadyProcessed: boolean }> {
  const seen = await prisma.paymentTransaction.findUnique({ where: { idempotencyKey: `rzp:${p.paymentId}` } });
  if (seen) return { alreadyProcessed: true };
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { alreadyProcessed: false };
  const due = b.totalAmount - (await paidOnline(prisma, bookingId));

  try {
    if (b.status === B.PENDING && p.amount === (await prepayTarget(b)) - (b.totalAmount - due)) {
      await confirmPrepaidBooking(bookingId, p);
      return { alreadyProcessed: false };
    }
    if (b.status === B.PAYMENT_PENDING && p.amount === due) {
      return await completePayment(bookingId, { method: 'RAZORPAY', provider: 'razorpay', providerRef: p.paymentId, idempotencyKey: `rzp:${p.paymentId}`, amount: p.amount, raw: p.raw });
    }
  } catch (err) {
    // Checkout callback and webhook raced: the other one recorded it.
    if (isUniqueViolation(err) || (err instanceof AppError && err.code === 'STALE_BOOKING')) return { alreadyProcessed: true };
    throw err;
  }

  // Paid twice, a wrong amount, or after the booking was cancelled: keep a record and give it back.
  logger.warn({ bookingId, paymentId: p.paymentId, status: b.status }, 'unexpected online payment — refunding');
  await recordCharge(bookingId, p).catch((e) => {
    if (!isUniqueViolation(e)) throw e;
  });
  await refundOnlineCharges(bookingId, 'Payment not needed for this booking', { only: p.paymentId });
  return { alreadyProcessed: false };
}

async function recordCharge(bookingId: string, p: ConfirmedPayment, db: Db = prisma) {
  const payment = await db.payment.upsert({
    where: { bookingId },
    update: {},
    create: { bookingId, method: 'RAZORPAY', status: 'PROCESSING', amount: p.amount },
  });
  await db.paymentTransaction.create({
    data: {
      paymentId: payment.id,
      type: 'CHARGE',
      status: 'SUCCESS',
      amount: p.amount,
      provider: 'razorpay',
      providerRef: p.paymentId,
      idempotencyKey: `rzp:${p.paymentId}`,
      rawPayload: p.raw ? (p.raw as object) : undefined,
    },
  });
  return payment;
}

/** Advance (or full bill) paid at booking → confirmed and sent to technicians. */
async function confirmPrepaidBooking(bookingId: string, p: ConfirmedPayment) {
  const userId = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { customer: { select: { userId: true } }, service: { select: { name: true } } } });
    const payment = await recordCharge(bookingId, p, tx);
    const paid = await paidOnline(tx, bookingId);
    const full = paid >= b.totalAmount;
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCESS', amount: paid, razorpayPaymentId: p.paymentId, paidAt: new Date() } });
    await transitionBooking(tx, b, B.SEARCHING, {
      actorId: null,
      note: `${full ? 'Paid online' : 'Advance paid'} ${formatINR(p.amount)} — looking for a professional`,
      data: { paymentStatus: full ? 'SUCCESS' : 'PENDING' },
    });
    await tx.notification.create({
      data: {
        userId: b.customer.userId,
        type: 'BOOKING_CONFIRMED',
        title: full ? 'Payment received — booking confirmed' : 'Advance received — booking confirmed',
        body: full
          ? `${formatINR(p.amount)} paid for ${b.service.name}. We're finding the right professional for you.`
          : `${formatINR(p.amount)} advance paid for ${b.service.name}. We're finding the right professional for you. Pay the rest (${formatINR(b.totalAmount - paid)}) after the service.`,
        data: { bookingId },
      },
    });
    return b.customer.userId;
  });
  emitBookingEvent(bookingId, [userId], SocketEvent.PAYMENT_UPDATED, { status: B.SEARCHING });
  startDispatch(bookingId);
}

/** Job finished and the advance covers the whole bill → settle immediately (no collection needed). */
export async function settleIfPrepaid(bookingId: string, actorId: string | null) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { status: true, totalAmount: true } });
  if (b?.status !== B.PAYMENT_PENDING) return false;
  const paid = await paidOnline(prisma, bookingId);
  if (paid === 0 || paid !== b.totalAmount) return false;
  await completePayment(bookingId, { method: 'RAZORPAY', provider: 'razorpay', providerRef: null, idempotencyKey: `settle:${bookingId}`, amount: 0, actorId });
  return true;
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
    amount: b.totalAmount - (await paidOnline(prisma, bookingId)),
    actorId: technicianUserId,
  });
}

// ─── The single settlement path ──────────────────────────────────────────

interface Settlement {
  method: PaymentMethod;
  provider: string;
  providerRef: string | null;
  idempotencyKey: string;
  /** Collected in this step (0 when an advance already covers the bill). */
  amount: number;
  raw?: unknown;
  actorId?: string | null;
}

/**
 * Marks the booking paid, splits commission, posts wallet entries and issues
 * the invoice number — all in one transaction. Re-running with the same
 * idempotency key (duplicate webhook, retried callback) returns without effect.
 *
 * Money already paid online (advance) plus this step must equal the bill.
 * Online money is held by RapidFix, cash/UPI-to-technician by the technician;
 * the wallet entry is the technician's share minus the cash they kept.
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
    const advance = await paidOnline(tx, bookingId);
    if (advance + s.amount !== b.totalAmount) throw AppError.badRequest('Paid amount does not match the bill.', 'AMOUNT_MISMATCH');

    const online = advance + (s.method === 'RAZORPAY' ? s.amount : 0);
    const cash = s.method === 'RAZORPAY' ? 0 : s.amount;
    const method: PaymentMethod = online > 0 ? 'RAZORPAY' : s.method;

    const gross = b.serviceCharge + b.visitCharge + b.additionalChargesTotal - b.discountAmount;
    const rule = await resolveCommissionRule({ technicianId: b.technician.id, serviceId: b.serviceId, categoryId: b.service.categoryId, locationId: b.locationId });
    const split = splitCommission(gross, rule);
    const now = new Date();

    const payment = await tx.payment.upsert({
      where: { bookingId },
      update: { method, status: 'SUCCESS', amount: b.totalAmount, paidAt: now, ...(s.method === 'RAZORPAY' && s.providerRef && { razorpayPaymentId: s.providerRef }) },
      create: { bookingId, method, status: 'SUCCESS', amount: b.totalAmount, paidAt: now, ...(s.method === 'RAZORPAY' && s.providerRef && { razorpayPaymentId: s.providerRef }) },
    });
    await tx.payment.update({ where: { id: payment.id }, data: { invoiceNumber: payment.invoiceNumber ?? invoiceNumber(b.seq) } });
    if (s.amount > 0) {
      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          type: 'CHARGE',
          status: 'SUCCESS',
          amount: s.amount,
          provider: s.provider,
          providerRef: s.providerRef,
          idempotencyKey: s.idempotencyKey,
          rawPayload: s.raw ? (s.raw as object) : undefined,
        },
      });
    }

    const delta = split.technicianNet - cash;
    if (delta >= 0) {
      // RapidFix holds (some of) the money → credit the technician's share, less any cash they kept.
      await postWalletTxn(tx, b.technician.id, {
        type: 'EARNING_CREDIT',
        amount: delta,
        earned: split.technicianNet,
        bookingId,
        description: `Earning for ${b.code} (${b.service.name})${cash ? ` — ${formatINR(cash)} collected in cash` : ''}`,
        idempotencyKey: `earn:${bookingId}`,
      });
    } else {
      // Technician holds the cash → they owe RapidFix the commission and the GST.
      await postWalletTxn(tx, b.technician.id, {
        type: 'COMMISSION_DEBIT',
        amount: delta,
        earned: split.technicianNet,
        bookingId,
        description: `${s.method === 'UPI' ? 'UPI' : 'Cash'} job ${b.code}: commission ${formatINR(split.commission)}${b.taxAmount ? ` + GST ${formatINR(b.taxAmount)}` : ''}`,
        idempotencyKey: `commission:${bookingId}`,
      });
    }

    const how = online && cash ? 'online + cash' : online ? 'online' : s.method === 'UPI' ? 'UPI' : 'cash';
    await transitionBooking(tx, b, B.PAYMENT_COMPLETED, {
      actorId: s.actorId ?? null,
      note: `Paid ${how}`,
      data: { paymentStatus: 'SUCCESS', paymentMethod: method, commissionAmount: split.commission, technicianEarning: split.technicianNet },
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

// ─── Refunds ─────────────────────────────────────────────────────────────

type TxnRow = { type: string; status: string; provider: string; providerRef: string | null; amount: number; rawPayload: unknown };

/** How much of each Razorpay payment has been refunded already. */
function refundedByPayment(txns: TxnRow[]) {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== 'REFUND' || t.provider !== 'razorpay') continue;
    const pid = (t.rawPayload as { payment_id?: string } | null)?.payment_id;
    if (pid) map.set(pid, (map.get(pid) ?? 0) + t.amount);
  }
  return map;
}

/**
 * Refund up to `amount` across the booking's Razorpay payments (newest first).
 * Returns what was refunded. Each refund is recorded once (webhook-safe).
 */
async function refundViaRazorpay(bookingId: string, amount: number, reason: string, only?: string) {
  const payment = await prisma.payment.findUnique({ where: { bookingId }, include: { transactions: { orderBy: { createdAt: 'desc' } } } });
  if (!payment || !razorpayConfigured()) return 0;
  const refunded = refundedByPayment(payment.transactions);
  let left = amount;
  let total = 0;
  for (const c of payment.transactions) {
    if (left <= 0) break;
    if (c.type !== 'CHARGE' || c.status !== 'SUCCESS' || c.provider !== 'razorpay' || !c.providerRef) continue;
    if (only && c.providerRef !== only) continue;
    const refundable = c.amount - (refunded.get(c.providerRef) ?? 0);
    const now = Math.min(refundable, left);
    if (now <= 0) continue;
    const r = await razorpay<{ id: string }>('POST', `/payments/${c.providerRef}/refund`, { amount: now, notes: { bookingId, reason: reason.slice(0, 200) } });
    await prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.create({
        data: { paymentId: payment.id, type: 'REFUND', status: 'SUCCESS', amount: now, provider: 'razorpay', providerRef: r.id, idempotencyKey: `rzp-refund:${r.id}`, rawPayload: { payment_id: c.providerRef } },
      });
      await tx.payment.update({ where: { id: payment.id }, data: { refundedAmount: { increment: now } } });
    });
    left -= now;
    total += now;
  }
  return total;
}

/**
 * Give back everything paid online for a booking that won't go ahead
 * (cancelled, expired) — or just one stray payment (`only`). Automatic.
 */
export async function refundOnlineCharges(bookingId: string, reason: string, opts: { only?: string } = {}) {
  const total = await refundViaRazorpay(bookingId, Number.MAX_SAFE_INTEGER, reason, opts.only);
  if (total <= 0) return 0;
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { customer: { select: { userId: true } }, payment: true } });
  await prisma.$transaction(async (tx) => {
    const cancelled = [B.CUSTOMER_CANCELLED, B.ADMIN_CANCELLED].includes(b.status as never);
    if (cancelled) {
      await tx.payment.update({ where: { bookingId }, data: { status: 'REFUNDED' } });
      await transitionBooking(tx, b, B.REFUNDED, { actorId: null, note: `Refunded ${formatINR(total)} automatically`, data: { paymentStatus: 'REFUNDED' } });
    }
    await tx.notification.create({
      data: {
        userId: b.customer.userId,
        type: 'PAYMENT',
        title: 'Refund started',
        body: `${formatINR(total)} is being refunded for ${b.code}. It reaches your account in 5–7 working days.`,
        data: { bookingId },
      },
    });
  });
  emitBookingEvent(bookingId, [b.customer.userId], SocketEvent.PAYMENT_UPDATED, { status: 'REFUNDED' }, { staff: true });
  return total;
}

/** Admin refund (full or partial). */
export async function refundPayment(bookingId: string, actor: { userId: string; role: string }, opts: { amount?: number; reason: string }, ip?: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { payment: true, technician: true } });
  if (!b?.payment || b.payment.status !== 'SUCCESS') throw AppError.conflict('There is no successful payment to refund.', 'NOT_REFUNDABLE');
  const refundable = b.payment.amount - b.payment.refundedAmount;
  const amount = opts.amount ?? refundable;
  if (amount <= 0 || amount > refundable) throw AppError.badRequest(`You can refund up to ${formatINR(refundable)}.`, 'INVALID_REFUND_AMOUNT');

  // Online part first (back to the customer's card/UPI); anything beyond that is settled by hand.
  let online = 0;
  if (b.payment.method === 'RAZORPAY') {
    if (!razorpayConfigured()) throw unavailable();
    online = await refundViaRazorpay(bookingId, amount, opts.reason);
  }
  const manual = amount - online;
  const full = amount === refundable;
  await prisma.$transaction(async (tx) => {
    if (manual > 0) {
      await tx.paymentTransaction.create({
        data: { paymentId: b.payment!.id, type: 'REFUND', status: 'SUCCESS', amount: manual, provider: b.payment!.method.toLowerCase(), providerRef: null, idempotencyKey: `manual-refund:${bookingId}:${Date.now()}` },
      });
      await tx.payment.update({ where: { id: b.payment!.id }, data: { refundedAmount: { increment: manual } } });
    }
    if (full) await tx.payment.update({ where: { id: b.payment!.id }, data: { status: 'REFUNDED' } });
    // Claw back the technician's share proportionally when RapidFix had credited it.
    if (b.technician && b.technicianEarning && online > 0) {
      const clawback = Math.round((b.technicianEarning * online) / b.payment!.amount);
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

// ─── Unpaid "pay online" bookings ────────────────────────────────────────

/**
 * Runs every minute: a booking whose online payment never completed is
 * checked with Razorpay once more (a missed callback/webhook still counts),
 * then cancelled so it doesn't hold the slot.
 */
export async function expireUnpaidBookings(now = Date.now()) {
  const stale = await prisma.booking.findMany({
    where: { status: B.PENDING, createdAt: { lt: new Date(now - UNPAID_BOOKING_TTL_MS) } },
    include: { payment: true, customer: { select: { userId: true } }, service: { select: { name: true } } },
    take: 20,
  });
  for (const b of stale) {
    try {
      if (b.payment?.razorpayOrderId && razorpayConfigured()) {
        if (await syncOrderPayments(b.id)) continue;
      }
      await prisma.$transaction(async (tx) => {
        const reason = 'Online payment was not completed';
        await transitionBooking(tx, b, B.ADMIN_CANCELLED, { actorId: null, note: reason, data: { cancelledAt: new Date(), cancellationReason: reason, paymentStatus: 'FAILED' } });
        const usage = await tx.couponUsage.findUnique({ where: { bookingId: b.id } });
        if (usage) {
          await tx.couponUsage.delete({ where: { id: usage.id } });
          await tx.coupon.update({ where: { id: usage.couponId }, data: { usedCount: { decrement: 1 } } });
        }
        await tx.notification.create({
          data: {
            userId: b.customer.userId,
            type: 'BOOKING_CANCELLED',
            title: 'Booking not confirmed',
            body: `Your ${b.service.name} booking was cancelled because the payment wasn't completed. Book again any time.`,
            data: { bookingId: b.id },
          },
        });
      });
      emitBookingEvent(b.id, [b.customer.userId], SocketEvent.BOOKING_CANCELLED, {});
    } catch (err) {
      logger.warn({ err, bookingId: b.id }, 'unpaid booking expiry failed');
    }
  }
  return stale.length;
}
