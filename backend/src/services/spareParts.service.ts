import { BookingStatus as B, SocketEvent, type BookingStatus, type SparePartDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { prisma } from '../config/prisma';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { taxRate } from './pricing.service';
import { emitBookingEvent } from './realtime.service';
import { isOwnUploadPath } from './storage.service';

/**
 * Spare parts the technician bought for a job (a capacitor, a tap, a cable…).
 * They go straight onto the bill — the customer is notified with the item, price
 * and (optionally) a photo of the shop bill — and show on the invoice as their own
 * lines. RapidFix takes no commission on them: the technician gets the full amount.
 */

/** From starting the work until the bill is paid. */
export const SPARE_EDITABLE: readonly BookingStatus[] = [
  B.SERVICE_STARTED,
  B.ADDITIONAL_CHARGE_REQUESTED,
  B.ADDITIONAL_CHARGE_APPROVED,
  B.SERVICE_COMPLETED,
  B.PAYMENT_PENDING,
];

export const MAX_SPARE_LINES = 30;

type SpareRow = { id: string; name: string; quantity: number; unitPrice: number; amount: number; billPhotoUrl: string | null; createdAt: Date };
export const toSpareDto = (s: SpareRow): SparePartDto => ({
  id: s.id,
  name: s.name,
  quantity: s.quantity,
  unitPrice: s.unitPrice,
  amount: s.amount,
  billPhotoUrl: s.billPhotoUrl,
  createdAt: s.createdAt.toISOString(),
});

/** Bill = service + visit + extra work + spare parts − discount, plus tax on all of it. */
export async function billTotals(b: { serviceCharge: number; visitCharge: number; additionalChargesTotal: number; sparePartsTotal: number; discountAmount: number }) {
  const taxable = Math.max(0, b.serviceCharge + b.visitCharge + b.additionalChargesTotal + b.sparePartsTotal - b.discountAmount);
  const tax = Math.round((taxable * (await taxRate())) / 100);
  return { taxAmount: tax, totalAmount: taxable + tax };
}

/** Locks the booking, re-adds its spare parts and saves the new bill (bumps the version like a status change). */
async function rebill(tx: Prisma.TransactionClient, bookingId: string) {
  const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const sum = await tx.bookingSparePart.aggregate({ where: { bookingId }, _sum: { amount: true } });
  const sparePartsTotal = sum._sum.amount ?? 0;
  const totals = await billTotals({ ...b, sparePartsTotal });
  const { count } = await tx.booking.updateMany({
    where: { id: bookingId, version: b.version },
    data: { sparePartsTotal, ...totals, version: { increment: 1 } },
  });
  if (!count) throw AppError.conflict('This booking was just updated. Please refresh and try again.', 'STALE_BOOKING');
  return { ...totals, sparePartsTotal };
}

async function ownedJob(tx: Prisma.TransactionClient, techUserId: string, bookingId: string) {
  // Row lock: two parts added at the same moment are both counted.
  await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
  const b = await tx.booking.findFirst({
    where: { id: bookingId, technician: { userId: techUserId } },
    select: { id: true, code: true, status: true, technicianId: true, customer: { select: { userId: true } } },
  });
  if (!b || !b.technicianId) throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  if (!SPARE_EDITABLE.includes(b.status)) {
    throw AppError.conflict('Spare parts can be added after you start the work and before the bill is paid.', 'SPARES_LOCKED');
  }
  return b as typeof b & { technicianId: string };
}

export async function addSparePart(techUserId: string, bookingId: string, input: { name: string; quantity: number; unitPrice: number; billPhotoUrl?: string | null }) {
  if (input.billPhotoUrl && !isOwnUploadPath(input.billPhotoUrl)) throw AppError.badRequest('Please upload the bill photo again.', 'INVALID_UPLOAD');
  const amount = input.quantity * input.unitPrice;
  const { b, totals } = await prisma.$transaction(async (tx) => {
    const b = await ownedJob(tx, techUserId, bookingId);
    if ((await tx.bookingSparePart.count({ where: { bookingId } })) >= MAX_SPARE_LINES) {
      throw AppError.badRequest(`Up to ${MAX_SPARE_LINES} spare parts per job.`, 'TOO_MANY_SPARES');
    }
    await tx.bookingSparePart.create({
      data: { bookingId, technicianId: b.technicianId, name: input.name.trim(), quantity: input.quantity, unitPrice: input.unitPrice, amount, billPhotoUrl: input.billPhotoUrl || null },
    });
    const totals = await rebill(tx, bookingId);
    await tx.notification.create({
      data: {
        userId: b.customer.userId,
        type: 'SPARE_PART',
        title: 'Spare part added to your bill',
        body: `${input.name.trim()}${input.quantity > 1 ? ` × ${input.quantity}` : ''} — ${formatINR(amount)}. New total ${formatINR(totals.totalAmount)}.`,
        data: { bookingId },
      },
    });
    return { b, totals };
  });
  emitBookingEvent(bookingId, [b.customer.userId, techUserId], SocketEvent.BOOKING_UPDATED, { spareParts: totals.sparePartsTotal }, { staff: true });
  return totals;
}

export async function removeSparePart(techUserId: string, bookingId: string, partId: string) {
  const { b, totals } = await prisma.$transaction(async (tx) => {
    const b = await ownedJob(tx, techUserId, bookingId);
    const part = await tx.bookingSparePart.findFirst({ where: { id: partId, bookingId } });
    if (!part) throw AppError.notFound('Spare part not found', 'SPARE_NOT_FOUND');
    await tx.bookingSparePart.delete({ where: { id: part.id } });
    const totals = await rebill(tx, bookingId);
    await tx.notification.create({
      data: {
        userId: b.customer.userId,
        type: 'SPARE_PART',
        title: 'Spare part removed from your bill',
        body: `${part.name} (${formatINR(part.amount)}) was removed. New total ${formatINR(totals.totalAmount)}.`,
        data: { bookingId },
      },
    });
    return { b, totals };
  });
  emitBookingEvent(bookingId, [b.customer.userId, techUserId], SocketEvent.BOOKING_UPDATED, { spareParts: totals.sparePartsTotal }, { staff: true });
  return totals;
}
