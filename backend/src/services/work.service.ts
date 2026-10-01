import { BookingStatus as B, SocketEvent, type ComplaintDto, type InvoiceDto, type Role } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { prisma } from '../config/prisma';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { bookingAccess } from './access.service';
import { transitionBooking } from './bookingState';
import { taxRate } from './pricing.service';
import { emitBookingEvent } from './realtime.service';
import { getSetting } from './settings.service';

// ─── Additional charges (spec §31) ───────────────────────────────────────

/** Technician proposes extra work; nothing changes on the bill until the customer approves. */
export async function requestAdditionalCharge(techUserId: string, bookingId: string, input: { title: string; description?: string; amount: number }) {
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, technician: { userId: techUserId } },
    include: { technician: true, customer: { select: { userId: true } }, service: { select: { name: true } } },
  });
  if (!b || !b.technician) throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  if (b.status !== B.SERVICE_STARTED && b.status !== B.ADDITIONAL_CHARGE_APPROVED) {
    throw AppError.conflict('You can request extra work only while the service is in progress.', 'INVALID_TRANSITION');
  }
  const charge = await prisma.$transaction(async (tx) => {
    const c = await tx.bookingAdditionalCharge.create({
      data: { bookingId, technicianId: b.technician!.id, title: input.title, description: input.description ?? null, amount: input.amount },
    });
    await transitionBooking(tx, b, B.ADDITIONAL_CHARGE_REQUESTED, { actorId: techUserId, note: `${input.title} · ${formatINR(input.amount)}` });
    await tx.notification.create({
      data: {
        userId: b.customer.userId,
        type: 'ADDITIONAL_CHARGE',
        title: 'Approval needed',
        body: `Your technician requested ${input.title} for ${formatINR(input.amount)}. Please approve or reject.`,
        data: { bookingId },
      },
    });
    return c;
  });
  emitBookingEvent(bookingId, [b.customer.userId, techUserId], SocketEvent.ADDITIONAL_CHARGE_REQUESTED, { chargeId: charge.id });
  return charge;
}

/** Customer approves (bill updated, GST recalculated) or rejects (work continues at the original price). */
export async function respondAdditionalCharge(customerId: string, userId: string, bookingId: string, chargeId: string, approve: boolean) {
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, customerId },
    include: { technician: { select: { userId: true } } },
  });
  if (!b) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  const charge = await prisma.bookingAdditionalCharge.findFirst({ where: { id: chargeId, bookingId, status: 'PENDING' } });
  if (!charge || b.status !== B.ADDITIONAL_CHARGE_REQUESTED) throw AppError.conflict('There is no pending request to answer.', 'NO_PENDING_CHARGE');

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.bookingAdditionalCharge.updateMany({
      where: { id: chargeId, status: 'PENDING' },
      data: { status: approve ? 'APPROVED' : 'REJECTED', respondedAt: new Date() },
    });
    if (!count) throw AppError.conflict('Already answered.', 'NO_PENDING_CHARGE');
    if (approve) {
      const additional = b.additionalChargesTotal + charge.amount;
      const taxable = b.serviceCharge + b.visitCharge + additional - b.discountAmount;
      const tax = Math.round((taxable * (await taxRate())) / 100);
      await tx.bookingItem.create({ data: { bookingId, type: 'ADDITIONAL', name: charge.title, unitPrice: charge.amount, amount: charge.amount } });
      await transitionBooking(tx, b, B.ADDITIONAL_CHARGE_APPROVED, {
        actorId: userId,
        note: `Approved ${charge.title}`,
        data: { additionalChargesTotal: additional, taxAmount: tax, totalAmount: taxable + tax },
      });
    } else {
      await transitionBooking(tx, b, B.SERVICE_STARTED, { actorId: userId, note: `Rejected ${charge.title}` });
    }
    if (b.technician) {
      await tx.notification.create({
        data: {
          userId: b.technician.userId,
          type: 'ADDITIONAL_CHARGE',
          title: approve ? 'Extra work approved' : 'Extra work declined',
          body: `${charge.title} (${formatINR(charge.amount)}) was ${approve ? 'approved' : 'declined'} by the customer.`,
          data: { bookingId },
        },
      });
    }
  });
  const participants = [userId, b.technician?.userId].filter((x): x is string => !!x);
  emitBookingEvent(bookingId, participants, approve ? SocketEvent.ADDITIONAL_CHARGE_APPROVED : SocketEvent.BOOKING_REJECTED, { chargeId });
}

// ─── Reviews ─────────────────────────────────────────────────────────────

export async function submitReview(customerId: string, bookingId: string, input: { rating: number; comment?: string }) {
  const b = await prisma.booking.findFirst({ where: { id: bookingId, customerId }, include: { review: true } });
  if (!b) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (b.status !== B.PAYMENT_COMPLETED || !b.technicianId) throw AppError.conflict('You can rate a service after it is completed and paid.', 'NOT_REVIEWABLE');
  if (b.review) throw AppError.conflict('You have already rated this booking.', 'ALREADY_REVIEWED');
  const technicianId = b.technicianId;
  await prisma.$transaction(async (tx) => {
    await tx.review.create({ data: { bookingId, customerId, technicianId, rating: input.rating, comment: input.comment?.trim() || null } });
    await recomputeRating(tx, technicianId);
  });
}

/** Rating = mean of visible reviews (so hiding abusive reviews also corrects the score). */
export async function recomputeRating(tx: Prisma.TransactionClient, technicianId: string) {
  const agg = await tx.review.aggregate({ where: { technicianId, isVisible: true }, _avg: { rating: true }, _count: { _all: true } });
  await tx.technician.update({
    where: { id: technicianId },
    data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100, ratingCount: agg._count._all },
  });
}

// ─── Invoice (spec §55) ──────────────────────────────────────────────────

export async function invoice(bookingId: string, auth: { userId: string; role: Role }): Promise<InvoiceDto> {
  await bookingAccess(bookingId, auth);
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      items: { orderBy: [{ type: 'asc' }, { createdAt: 'asc' }] },
      payment: true,
      coupon: { select: { code: true } },
      service: { select: { name: true } },
      customer: { include: { user: { select: { name: true, phone: true } } } },
      technician: { include: { user: { select: { name: true } } } },
    },
  });
  const done = [B.SERVICE_COMPLETED, B.PAYMENT_PENDING, B.PAYMENT_COMPLETED, B.REFUNDED, B.DISPUTED] as string[];
  if (!done.includes(b.status)) throw AppError.conflict('The invoice is available once the service is completed.', 'INVOICE_NOT_READY');
  const a = b.addressSnapshot as { houseNo: string; street: string; area: string; villageTown: string; district: string; state: string; pincode: string };
  const subtotal = b.serviceCharge + b.visitCharge + b.additionalChargesTotal;
  const [supportPhone, supportEmail] = await Promise.all([getSetting('support.phone', '+91 94919 63366'), getSetting('support.email', 'support@rapidfix.in')]);
  return {
    invoiceNumber: b.payment?.invoiceNumber ?? `PRO-${b.code}`,
    issuedAt: (b.payment?.paidAt ?? b.completedAt ?? b.updatedAt).toISOString(),
    status: b.payment?.status === 'REFUNDED' ? 'REFUNDED' : b.payment?.status === 'SUCCESS' ? 'PAID' : 'DUE',
    seller: { name: 'RapidFix', tagline: 'Get It Fixed.', developer: 'Nirmaan Digital', supportPhone, supportEmail },
    customer: {
      name: b.customer.user.name ?? 'Customer',
      phone: b.customer.user.phone,
      address: [[a.houseNo, a.street, a.area].filter(Boolean).join(', '), `${a.villageTown}, ${a.district}, ${a.state} - ${a.pincode}`].join(', '),
    },
    technician: b.technician ? { name: b.technician.user.name ?? 'Technician' } : null,
    bookingCode: b.code ?? '',
    service: b.service.name,
    serviceDate: (b.completedAt ?? b.scheduledFor).toISOString(),
    items: b.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, amount: i.amount })),
    subtotal,
    discount: b.discountAmount,
    couponCode: b.coupon?.code ?? null,
    taxPercent: subtotal - b.discountAmount > 0 ? Math.round((b.taxAmount / (subtotal - b.discountAmount)) * 100) : await taxRate(),
    tax: b.taxAmount,
    total: b.totalAmount,
    paymentMethod: b.payment?.method ?? b.paymentMethod,
    paidAt: b.payment?.paidAt?.toISOString() ?? null,
  };
}

// ─── Complaints ──────────────────────────────────────────────────────────

export const complaintInclude = {
  booking: { select: { code: true } },
  raisedBy: { select: { id: true, name: true, role: true } },
  assignedTo: { select: { id: true, name: true } },
} as const satisfies Prisma.ComplaintInclude;

export const toComplaint = (c: Prisma.ComplaintGetPayload<{ include: typeof complaintInclude }>): ComplaintDto => ({
  id: c.id,
  bookingId: c.bookingId,
  bookingCode: c.booking?.code ?? null,
  raisedBy: c.raisedBy,
  assignedTo: c.assignedTo,
  category: c.category,
  subject: c.subject,
  description: c.description,
  status: c.status,
  resolution: c.resolution,
  createdAt: c.createdAt.toISOString(),
  resolvedAt: c.resolvedAt?.toISOString() ?? null,
});

export async function raiseComplaint(auth: { userId: string; role: Role }, input: { bookingId?: string; category: string; subject: string; description: string }) {
  if (input.bookingId) await bookingAccess(input.bookingId, auth);
  const c = await prisma.complaint.create({
    data: { raisedById: auth.userId, bookingId: input.bookingId ?? null, category: input.category, subject: input.subject, description: input.description },
    include: complaintInclude,
  });
  // Tell staff (support queue) through the outbox.
  const staff = await prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'] }, status: 'ACTIVE' }, select: { id: true } });
  if (staff.length) {
    await prisma.notification.createMany({
      data: staff.map((s) => ({ userId: s.id, type: 'COMPLAINT', title: 'New complaint', body: `${input.category}: ${input.subject}`, data: { complaintId: c.id } })),
    });
  }
  return toComplaint(c);
}

export async function myComplaints(userId: string) {
  const rows = await prisma.complaint.findMany({ where: { raisedById: userId }, include: complaintInclude, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map(toComplaint);
}
