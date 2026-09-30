import {
  BOOKING_TAB_STATUSES,
  BookingStatus as B,
  canTransition,
  SocketEvent,
  TECHNICIAN_TAB_STATUSES,
  type AddressSnapshot,
  type AdminBookingDetailDto,
  type AdminBookingRowDto,
  type BookingStatus,
  type Paged,
} from '@fixora/shared-types';
import { prisma } from '../../config/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../utils/AppError';
import { locality } from '../../utils/locality';
import { recordAudit } from '../audit.service';
import { toChargeDto, toPaymentInfo } from '../booking.service';
import { transitionBooking } from '../bookingState';
import { buildTimeline } from '../bookingTimeline';
import { refundPayment } from '../payment.service';
import { emitBookingEvent } from '../realtime.service';
import { complaintInclude, toComplaint } from '../work.service';

type Actor = { userId: string; role: string };

export const STATUS_GROUPS: Record<string, BookingStatus[]> = {
  searching: [B.PENDING, B.SEARCHING],
  upcoming: [...TECHNICIAN_TAB_STATUSES.upcoming],
  inProgress: [...TECHNICIAN_TAB_STATUSES.inProgress],
  awaitingPayment: [B.SERVICE_COMPLETED, B.PAYMENT_PENDING],
  completed: [B.PAYMENT_COMPLETED],
  cancelled: [...BOOKING_TAB_STATUSES.cancelled],
  disputed: [B.DISPUTED],
};

export const rowInclude = {
  service: { select: { name: true, category: { select: { name: true } } } },
  customer: { select: { user: { select: { name: true, phone: true } } } },
  technician: { select: { user: { select: { name: true } } } },
} as const satisfies Prisma.BookingInclude;

export function toAdminRow(b: Prisma.BookingGetPayload<{ include: typeof rowInclude }>): AdminBookingRowDto {
  return {
    id: b.id,
    code: b.code ?? '',
    status: b.status,
    service: b.service.name,
    category: b.service.category.name,
    customerName: b.customer.user.name ?? 'Customer',
    customerPhone: b.customer.user.phone,
    technicianName: b.technician?.user.name ?? null,
    scheduledFor: b.scheduledFor.toISOString(),
    timeSlot: b.timeSlot,
    scheduleType: b.scheduleType,
    locality: locality(b.addressSnapshot as unknown as AddressSnapshot),
    totalAmount: b.totalAmount,
    paymentStatus: b.paymentStatus,
    paymentMethod: b.paymentMethod,
    createdAt: b.createdAt.toISOString(),
  };
}

export async function listBookings(q: { q?: string; group?: string; from?: Date; to?: Date; page: number; pageSize: number }): Promise<Paged<AdminBookingRowDto>> {
  const term = q.q?.trim();
  const where: Prisma.BookingWhereInput = {
    ...(q.group && STATUS_GROUPS[q.group] && { status: { in: STATUS_GROUPS[q.group] } }),
    ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } }),
    ...(term && {
      OR: [
        { code: { contains: term } },
        { customer: { user: { name: { contains: term } } } },
        { customer: { user: { phone: { contains: term } } } },
        { technician: { user: { name: { contains: term } } } },
        { service: { name: { contains: term } } },
      ],
    }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.booking.findMany({ where, include: rowInclude, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.booking.count({ where }),
  ]);
  return { items: rows.map(toAdminRow), total, page: q.page, pageSize: q.pageSize };
}

export async function bookingDetail(id: string): Promise<AdminBookingDetailDto> {
  const b = await prisma.booking.findUnique({
    where: { id },
    include: {
      ...rowInclude,
      customer: { select: { id: true, userId: true, user: { select: { name: true, phone: true, email: true } } } },
      technician: { select: { id: true, userId: true, ratingAvg: true, user: { select: { name: true, phone: true } } } },
      coupon: { select: { code: true } },
      payment: { include: { transactions: { orderBy: { createdAt: 'asc' } } } },
      statusHistory: { orderBy: { createdAt: 'asc' }, include: { changedBy: { select: { name: true, role: true } } } },
      assignments: { orderBy: { offeredAt: 'asc' }, include: { technician: { select: { user: { select: { name: true } } } } } },
      additionalCharges: { orderBy: { requestedAt: 'asc' } },
      complaints: { include: complaintInclude, orderBy: { createdAt: 'desc' } },
      review: true,
    },
  });
  if (!b) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  const row = toAdminRow(b as unknown as Prisma.BookingGetPayload<{ include: typeof rowInclude }>);
  return {
    ...row,
    description: b.description,
    photos: Array.isArray(b.photos) ? (b.photos as string[]) : [],
    address: b.addressSnapshot as unknown as AddressSnapshot,
    customer: { id: b.customer.id, userId: b.customer.userId, ...b.customer.user },
    technician: b.technician ? { id: b.technician.id, userId: b.technician.userId, name: b.technician.user.name, phone: b.technician.user.phone, ratingAvg: b.technician.ratingAvg } : null,
    price: { serviceCharge: b.serviceCharge, visitCharge: b.visitCharge, additionalCharges: b.additionalChargesTotal, discount: b.discountAmount, tax: b.taxAmount, total: b.totalAmount },
    commissionAmount: b.commissionAmount,
    technicianEarning: b.technicianEarning,
    couponCode: b.coupon?.code ?? null,
    payment: toPaymentInfo(b.payment),
    transactions: (b.payment?.transactions ?? []).map((t) => ({ id: t.id, type: t.type, status: t.status, amount: t.amount, provider: t.provider, providerRef: t.providerRef, createdAt: t.createdAt.toISOString() })),
    history: b.statusHistory.map((h) => ({ from: h.fromStatus, to: h.toStatus, note: h.note, by: h.changedBy ? `${h.changedBy.name ?? 'User'} (${h.changedBy.role})` : 'System', at: h.createdAt.toISOString() })),
    assignments: b.assignments.map((a) => ({ technicianName: a.technician.user.name ?? 'Technician', status: a.status, isManual: a.isManual, distanceKm: a.distanceKm, offeredAt: a.offeredAt.toISOString(), respondedAt: a.respondedAt?.toISOString() ?? null })),
    additionalChargeItems: b.additionalCharges.map(toChargeDto),
    complaints: b.complaints.map(toComplaint),
    review: b.review ? { rating: b.review.rating, comment: b.review.comment } : null,
    timeline: buildTimeline('customer', b.status, b.statusHistory, b.createdAt),
    cancellationReason: b.cancellationReason,
    canCancel: canTransition(b.status, B.ADMIN_CANCELLED) && b.payment?.status !== 'SUCCESS',
    canAssign: [B.SEARCHING, B.TECHNICIAN_ASSIGNED, B.TECHNICIAN_ACCEPTED, B.TECHNICIAN_EN_ROUTE].includes(b.status as never),
    canResolveDispute: b.status === B.DISPUTED,
    canRefund: b.payment?.status === 'SUCCESS',
  };
}

export async function adminCancel(id: string, actor: Actor, reason: string, ip?: string) {
  const b = await prisma.booking.findUnique({ where: { id }, include: { payment: true, customer: { select: { userId: true } }, technician: { select: { id: true, userId: true } } } });
  if (!b) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (b.payment?.status === 'SUCCESS') throw AppError.conflict('This booking is paid — issue a refund instead.', 'USE_REFUND');
  if (!canTransition(b.status, B.ADMIN_CANCELLED)) throw AppError.conflict('This booking can no longer be cancelled.', 'NOT_CANCELLABLE');
  const wasActive = ([B.TECHNICIAN_ACCEPTED, B.TECHNICIAN_EN_ROUTE, B.TECHNICIAN_ARRIVED] as BookingStatus[]).includes(b.status);
  await prisma.$transaction(async (tx) => {
    await transitionBooking(tx, b, B.ADMIN_CANCELLED, { actorId: actor.userId, note: reason, data: { cancelledAt: new Date(), cancellationReason: reason } });
    await tx.bookingAssignment.updateMany({ where: { bookingId: id, status: 'OFFERED' }, data: { status: 'CANCELLED', respondedAt: new Date() } });
    const usage = await tx.couponUsage.findUnique({ where: { bookingId: id } });
    if (usage) {
      await tx.couponUsage.delete({ where: { id: usage.id } });
      await tx.coupon.update({ where: { id: usage.couponId }, data: { usedCount: { decrement: 1 } } });
    }
    if (b.technician && wasActive) await tx.technician.updateMany({ where: { id: b.technician.id, activeJobCount: { gt: 0 } }, data: { activeJobCount: { decrement: 1 } } });
    const notify = [b.customer.userId, b.technician?.userId].filter((x): x is string => !!x);
    await tx.notification.createMany({ data: notify.map((userId) => ({ userId, type: 'BOOKING_CANCELLED', title: 'Booking cancelled', body: `${b.code} was cancelled by RapidFix: ${reason}`, data: { bookingId: id } })) });
  });
  emitBookingEvent(id, [b.customer.userId, b.technician?.userId].filter((x): x is string => !!x), SocketEvent.BOOKING_CANCELLED, {}, { staff: true });
  await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: 'BOOKING_CANCELLED', entity: 'Booking', entityId: id, oldValue: { status: b.status }, newValue: { reason }, ip });
}

/** Put a booking under review (customer complaint, payment dispute). */
export async function openDispute(id: string, actor: Actor, note: string, ip?: string) {
  const b = await prisma.booking.findUnique({ where: { id } });
  if (!b) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (!canTransition(b.status, B.DISPUTED)) throw AppError.conflict('This booking cannot be disputed in its current state.', 'INVALID_TRANSITION');
  await prisma.$transaction((tx) => transitionBooking(tx, b, B.DISPUTED, { actorId: actor.userId, note }));
  await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: 'DISPUTE_OPENED', entity: 'Booking', entityId: id, oldValue: { status: b.status }, newValue: { note }, ip });
}

/** Close a dispute: collect payment as normal, confirm the paid job, refund, or cancel. */
export async function resolveDispute(id: string, actor: Actor, resolution: 'PAYMENT_PENDING' | 'PAYMENT_COMPLETED' | 'REFUND' | 'CANCEL', note: string, ip?: string) {
  const b = await prisma.booking.findUnique({ where: { id }, include: { payment: true } });
  if (!b || b.status !== B.DISPUTED) throw AppError.conflict('This booking is not under dispute.', 'NOT_DISPUTED');
  if (resolution === 'REFUND') {
    await refundPayment(id, actor, { reason: note }, ip);
  } else if (resolution === 'PAYMENT_COMPLETED') {
    if (b.payment?.status !== 'SUCCESS') throw AppError.conflict('No successful payment on this booking.', 'NOT_PAID');
    await prisma.$transaction((tx) => transitionBooking(tx, b, B.PAYMENT_COMPLETED, { actorId: actor.userId, note }));
  } else if (resolution === 'CANCEL') {
    if (b.payment?.status === 'SUCCESS') throw AppError.conflict('Paid booking — refund instead.', 'USE_REFUND');
    await prisma.$transaction((tx) => transitionBooking(tx, b, B.ADMIN_CANCELLED, { actorId: actor.userId, note, data: { cancelledAt: new Date(), cancellationReason: note } }));
  } else {
    await prisma.$transaction((tx) => transitionBooking(tx, b, B.PAYMENT_PENDING, { actorId: actor.userId, note }));
  }
  await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: 'DISPUTE_RESOLVED', entity: 'Booking', entityId: id, newValue: { resolution, note }, ip });
}
