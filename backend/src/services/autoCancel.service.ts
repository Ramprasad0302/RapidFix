import { BookingStatus as B, SocketEvent } from '@fixora/shared-types';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { transitionBooking } from './bookingState';
import { refundOnlineCharges } from './payment.service';
import { emitBookingEvent } from './realtime.service';
import { getSetting } from './settings.service';

/**
 * No technician accepted a booking within 30 minutes (admin setting
 * `dispatch.autoCancelMinutes`, 0 = off) of it starting to look for one:
 * cancel it and refund whatever the customer paid online, automatically.
 * Bookings a technician accepted earlier (then admin re-dispatched) are left to staff.
 */
export const AUTO_CANCEL_KEY = 'dispatch.autoCancelMinutes';

export async function cancelUnassignedBookings(now = Date.now()) {
  const minutes = Number(await getSetting<number>(AUTO_CANCEL_KEY, 30));
  if (!minutes || minutes <= 0) return 0;
  const cutoff = new Date(now - minutes * 60_000);
  const stale = await prisma.booking.findMany({
    where: {
      status: { in: [B.SEARCHING, B.TECHNICIAN_ASSIGNED] },
      acceptedAt: null,
      statusHistory: { some: { toStatus: B.SEARCHING, createdAt: { lt: cutoff } } },
    },
    include: { customer: { select: { userId: true } }, service: { select: { name: true } }, technician: { select: { userId: true } } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  let cancelled = 0;
  for (const b of stale) {
    const reason = `No technician was available within ${minutes} minutes`;
    try {
      await prisma.$transaction(async (tx) => {
        await transitionBooking(tx, b, B.ADMIN_CANCELLED, { actorId: null, note: reason, data: { cancelledAt: new Date(now), cancellationReason: reason, technicianId: null } });
        await tx.bookingAssignment.updateMany({ where: { bookingId: b.id, status: 'OFFERED' }, data: { status: 'CANCELLED', respondedAt: new Date(now) } });
        const usage = await tx.couponUsage.findUnique({ where: { bookingId: b.id } });
        if (usage) {
          await tx.couponUsage.delete({ where: { id: usage.id } });
          await tx.coupon.update({ where: { id: usage.couponId }, data: { usedCount: { decrement: 1 } } });
        }
        await tx.notification.create({
          data: {
            userId: b.customer.userId,
            type: 'BOOKING_CANCELLED',
            title: 'Sorry — no technician was free',
            body: `We couldn't find a technician for your ${b.service.name} booking within ${minutes} minutes, so we cancelled it. Anything you paid online is refunded automatically. Please try another time slot.`,
            data: { bookingId: b.id },
          },
        });
      });
      emitBookingEvent(b.id, [b.customer.userId, b.technician?.userId].filter((x): x is string => !!x), SocketEvent.BOOKING_CANCELLED, {}, { staff: true });
      cancelled++;
    } catch (err) {
      // Accepted (or changed) at the same moment: leave it.
      logger.warn({ err, bookingId: b.id }, 'auto-cancel skipped');
      continue;
    }
    try {
      await refundOnlineCharges(b.id, reason);
    } catch (err) {
      logger.error({ err, bookingId: b.id }, 'auto-cancel refund failed — refund it from Admin → Payments');
    }
  }
  if (cancelled) logger.info({ cancelled, minutes }, 'Cancelled bookings no technician accepted');
  return cancelled;
}
