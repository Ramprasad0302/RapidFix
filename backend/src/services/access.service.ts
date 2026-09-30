import { isAdminRole, type Role } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

export type BookingRole = 'CUSTOMER' | 'TECHNICIAN' | 'STAFF';

/**
 * Who may see a booking: its customer, its assigned technician, or staff.
 * Everyone else gets "not found" (never "forbidden", so ids can't be probed).
 */
export async function bookingAccess(bookingId: string, auth: { userId: string; role: Role }) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      code: true,
      status: true,
      customer: { select: { userId: true, user: { select: { name: true, phone: true, avatarUrl: true } } } },
      technician: { select: { id: true, userId: true, user: { select: { name: true, phone: true, avatarUrl: true } } } },
      service: { select: { name: true } },
    },
  });
  if (!booking) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  let as: BookingRole | null = null;
  if (booking.customer.userId === auth.userId) as = 'CUSTOMER';
  else if (booking.technician?.userId === auth.userId) as = 'TECHNICIAN';
  else if (isAdminRole(auth.role)) as = 'STAFF';
  if (!as) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  return { booking, as, participants: [booking.customer.userId, booking.technician?.userId].filter((x): x is string => !!x) };
}
