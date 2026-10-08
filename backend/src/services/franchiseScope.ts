import { Role } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';

/**
 * What a staff member may see. Head-office staff see everything (`null`); a
 * franchise manager (FRANCHISE_ADMIN) sees only their franchise's bookings,
 * technicians and customers. Every admin query passes its scope through here.
 */
export type Scope = { franchiseId: string; name: string } | null;

export async function scopeOf(auth: { userId: string; role: Role }): Promise<Scope> {
  if (auth.role !== Role.FRANCHISE_ADMIN) return null;
  const f = await prisma.franchise.findUnique({ where: { userId: auth.userId }, select: { id: true, name: true, status: true } });
  if (!f) throw AppError.forbidden('No franchise is linked to this account.', 'NO_FRANCHISE');
  if (f.status !== 'ACTIVE') throw AppError.forbidden('This franchise is not active. Please contact RapidFix.', 'FRANCHISE_INACTIVE');
  return { franchiseId: f.id, name: f.name };
}

export const bookingScope = (s: Scope): Prisma.BookingWhereInput => (s ? { franchiseId: s.franchiseId } : {});
export const technicianScope = (s: Scope): Prisma.TechnicianWhereInput => (s ? { franchiseId: s.franchiseId } : {});
/** A franchise's customers: their home franchise, or anyone who booked in it. */
export const customerScope = (s: Scope): Prisma.CustomerWhereInput =>
  s ? { OR: [{ franchiseId: s.franchiseId }, { bookings: { some: { franchiseId: s.franchiseId } } }] } : {};
export const complaintScope = (s: Scope): Prisma.ComplaintWhereInput =>
  s
    ? {
        OR: [
          { booking: { franchiseId: s.franchiseId } },
          { raisedBy: { technician: { franchiseId: s.franchiseId } } },
          { raisedBy: { customer: customerScope(s) } },
        ],
      }
    : {};

const notFound = () => AppError.notFound('Not found in your franchise', 'OUT_OF_FRANCHISE');

export async function assertBooking(s: Scope, bookingId: string) {
  if (!s) return;
  if (!(await prisma.booking.count({ where: { id: bookingId, ...bookingScope(s) } }))) throw notFound();
}
export async function assertTechnician(s: Scope, technicianId: string) {
  if (!s) return;
  if (!(await prisma.technician.count({ where: { id: technicianId, ...technicianScope(s) } }))) throw notFound();
}
export async function assertCustomer(s: Scope, customerId: string) {
  if (!s) return;
  if (!(await prisma.customer.count({ where: { id: customerId, ...customerScope(s) } }))) throw notFound();
}
/** A user account (customer or technician) the franchise manager may act on. */
export async function assertUser(s: Scope, userId: string) {
  if (!s) return;
  const ok = await prisma.user.count({
    where: { id: userId, OR: [{ technician: technicianScope(s) }, { customer: customerScope(s) }] },
  });
  if (!ok) throw notFound();
}
export async function assertComplaint(s: Scope, complaintId: string) {
  if (!s) return;
  if (!(await prisma.complaint.count({ where: { id: complaintId, ...complaintScope(s) } }))) throw notFound();
}
