import { canTransition, type BookingStatus } from '@fixora/shared-types';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';

type Tx = Prisma.TransactionClient;

/**
 * The only way a booking status changes. Enforces the shared state machine,
 * uses optimistic locking (status + version) so two actors can't both win,
 * and appends to booking_status_history.
 */
export async function transitionBooking(
  tx: Tx,
  booking: { id: string; status: BookingStatus; version: number },
  to: BookingStatus,
  opts: { actorId?: string | null; note?: string; data?: Prisma.BookingUncheckedUpdateManyInput } = {},
) {
  if (!canTransition(booking.status, to)) {
    throw AppError.conflict(`This booking can't move from ${booking.status} to ${to}.`, 'INVALID_TRANSITION');
  }
  const { count } = await tx.booking.updateMany({
    where: { id: booking.id, status: booking.status, version: booking.version },
    data: { ...opts.data, status: to, version: { increment: 1 } },
  });
  if (count === 0) {
    throw AppError.conflict('This booking was just updated. Please refresh and try again.', 'STALE_BOOKING');
  }
  await tx.bookingStatusHistory.create({
    data: {
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus: to,
      changedById: opts.actorId ?? null,
      note: opts.note ?? null,
    },
  });
  return { ...booking, status: to, version: booking.version + 1 };
}
