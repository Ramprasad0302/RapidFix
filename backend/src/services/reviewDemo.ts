import { BookingStatus as B, SocketEvent } from '@fixora/shared-types';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { transitionBooking } from './bookingState';
import { emitToUser } from './realtime.service';

/**
 * App Store / Play Store review account (+91 9000012345, a Firebase test number).
 * Reviewers can't pay real money or meet a real technician, so this account's
 * bookings skip the advance and the service-area check, and go straight to a
 * demo technician who "accepts" and says hello in chat. Real technicians never
 * see these bookings, and the demo technician is never online for real jobs.
 */
const DEMO_TECH_PHONE = '+919000099999';

export const isReviewDemoPhone = (phone: string | null | undefined) =>
  !!phone &&
  env.REVIEW_DEMO_PHONES.split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .includes(phone);

export async function isReviewDemoCustomer(customerId: string) {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { user: { select: { phone: true } } } });
  return isReviewDemoPhone(c?.user.phone);
}

async function demoTechnician() {
  const existing = await prisma.technician.findFirst({ where: { user: { phone: DEMO_TECH_PHONE } }, select: { id: true, userId: true } });
  if (existing) return existing;
  const user = await prisma.user.create({
    data: {
      role: 'TECHNICIAN',
      phone: DEMO_TECH_PHONE,
      name: 'Ravi (Demo Technician)',
      technician: {
        create: {
          languages: ['Telugu', 'English'],
          experienceYears: 6,
          villageTown: 'Tanuku',
          district: 'West Godavari',
          state: 'Andhra Pradesh',
          pincode: '534211',
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
          isOnline: false, // never offered real jobs
        },
      },
    },
    select: { technician: { select: { id: true, userId: true } } },
  });
  return user.technician!;
}

/** Demo booking: assigned to and accepted by the demo technician, with a first chat message. */
export async function acceptForReview(bookingId: string) {
  try {
    const tech = await demoTechnician();
    const now = new Date();
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { id: true, status: true, version: true, customer: { select: { userId: true } } } });
    await prisma.$transaction(async (tx) => {
      const assigned = await transitionBooking(tx, booking, B.TECHNICIAN_ASSIGNED, {
        note: 'Offered to Ravi (Demo Technician)',
        data: { technicianId: tech.id, assignedAt: now },
      });
      await transitionBooking(tx, assigned, B.TECHNICIAN_ACCEPTED, { actorId: tech.userId, data: { acceptedAt: now } });
      await tx.bookingAssignment.create({
        data: { bookingId, technicianId: tech.id, status: 'ACCEPTED', offeredAt: now, respondedAt: now, expiresAt: now },
      });
      await tx.message.create({
        data: { bookingId, senderId: tech.userId, body: 'Hello! I am Ravi from RapidFix (demo technician for App Review). I will be at your address soon.' },
      });
      await tx.notification.create({
        data: { userId: booking.customer.userId, type: 'TECHNICIAN_ACCEPTED', title: 'Technician assigned', body: 'Ravi (Demo Technician) accepted your booking.', data: { bookingId } },
      });
    });
    emitToUser(booking.customer.userId, SocketEvent.TECHNICIAN_ASSIGNED, { bookingId });
  } catch (err) {
    logger.error({ err, bookingId }, 'review demo assignment failed');
  }
}
