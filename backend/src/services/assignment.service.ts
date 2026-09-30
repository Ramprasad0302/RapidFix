import { BookingStatus as B, SocketEvent, type AssignmentCandidateDto, type BookingStatus } from '@fixora/shared-types';
import { haversineKm } from '@fixora/shared-utils';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { recordAudit } from './audit.service';
import { technicianTitle } from './booking.service';
import { transitionBooking } from './bookingState';
import { emitToUser } from './realtime.service';
import { dispatchSettings, type DispatchWeights } from './settings.service';

/**
 * TechnicianAssignmentService — finds, ranks and offers jobs to technicians.
 *
 *   filter:  skill ✓ · VERIFIED · online · inside radius · no clashing job · not already offered
 *   rank:    weighted skill + distance + rating + workload (weights in settings.dispatch.weights)
 *   offer:   one technician at a time, timed; reject/expiry → next candidate
 *
 * Kept out of the booking controller on purpose; the booking code only calls `dispatchBooking`.
 */

/** Jobs that keep a technician busy for the ±2h window around their slot. */
const BUSY: BookingStatus[] = [
  B.TECHNICIAN_ASSIGNED,
  B.TECHNICIAN_ACCEPTED,
  B.TECHNICIAN_EN_ROUTE,
  B.TECHNICIAN_ARRIVED,
  B.SERVICE_STARTED,
  B.ADDITIONAL_CHARGE_REQUESTED,
  B.ADDITIONAL_CHARGE_APPROVED,
];
const CONFLICT_WINDOW_MS = 2 * 3_600_000;
const MANUAL_OFFER_SECONDS = 15 * 60;

const bookingForDispatch = {
  service: { select: { id: true, name: true, categoryId: true } },
  customer: { select: { userId: true } },
  assignments: { select: { technicianId: true, status: true, isManual: true, expiresAt: true } },
} as const satisfies Prisma.BookingInclude;
type DispatchBooking = Prisma.BookingGetPayload<{ include: typeof bookingForDispatch }>;

export interface RankedCandidate extends AssignmentCandidateDto {
  userId: string;
  /** Missed (didn't answer) this booking earlier — asked again only when nobody new is free. */
  retry?: boolean;
}

/** A technician who didn't answer (not one who rejected) may be asked again after this long. */
const MISSED_RETRY_MS = 2 * 60_000;

/** Pure scoring — exported for tests and so admins can reason about the order. */
export function scoreCandidate(
  w: DispatchWeights,
  c: { distanceKm: number | null; radiusKm: number; ratingAvg: number; activeJobs: number },
) {
  const distance = c.distanceKm == null ? 0.5 : Math.max(0, 1 - c.distanceKm / c.radiusKm);
  const rating = Math.min(1, Math.max(0, c.ratingAvg / 5));
  const workload = 1 - Math.min(c.activeJobs, 3) / 3;
  return Math.round((w.skill * 1 + w.distance * distance + w.rating * rating + w.workload * workload) * 1000) / 1000;
}

/**
 * Every skilled, verified technician for the booking with eligibility + score.
 * `forAdmin` also returns offline / far / busy technicians (marked ineligible with a reason).
 */
export async function rankCandidates(booking: DispatchBooking, opts: { forAdmin?: boolean } = {}): Promise<RankedCandidate[]> {
  const settings = await dispatchSettings();
  const techs = await prisma.technician.findMany({
    where: {
      verificationStatus: 'VERIFIED',
      user: { status: 'ACTIVE', role: 'TECHNICIAN' },
      skills: { some: { categoryId: booking.service.categoryId } },
      ...(!opts.forAdmin && { isOnline: true }),
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      skills: { include: { category: true }, orderBy: { category: { sortOrder: 'asc' } }, take: 1 },
    },
    take: 300,
  });
  if (techs.length === 0) return [];

  // Rejected or currently offered: never again for this booking. Missed (expired): again after a pause,
  // so one unanswered ring doesn't leave a booking stuck in a town with few technicians.
  const now = Date.now();
  const missedLongAgo = new Set(
    booking.assignments.filter((a) => a.status === 'EXPIRED' && a.expiresAt.getTime() <= now - MISSED_RETRY_MS).map((a) => a.technicianId),
  );
  const tried = new Set(
    booking.assignments
      .filter((a) => a.status === 'OFFERED' || a.status === 'REJECTED' || (a.status === 'EXPIRED' && !missedLongAgo.has(a.technicianId)))
      .map((a) => a.technicianId),
  );
  const clashes = await prisma.booking.findMany({
    where: {
      id: { not: booking.id },
      technicianId: { in: techs.map((t) => t.id) },
      status: { in: BUSY },
      scheduledFor: {
        gte: new Date(booking.scheduledFor.getTime() - CONFLICT_WINDOW_MS),
        lte: new Date(booking.scheduledFor.getTime() + CONFLICT_WINDOW_MS),
      },
    },
    select: { technicianId: true },
  });
  const busy = new Set(clashes.map((c) => c.technicianId));
  const snap = booking.addressSnapshot as { villageTown?: string; district?: string } | null;

  const ranked = techs.map((t): RankedCandidate => {
    const radiusKm = Math.min(settings.radiusKm, Math.max(1, t.serviceRadiusKm));
    const distanceKm =
      booking.latitude != null && booking.longitude != null && t.lastLatitude != null && t.lastLongitude != null
        ? Math.round(haversineKm(booking.latitude, booking.longitude, t.lastLatitude, t.lastLongitude) * 10) / 10
        : null;
    // Without coordinates, fall back to "same town / district".
    const nearby =
      distanceKm != null
        ? distanceKm <= radiusKm
        : !!snap && (t.villageTown.toLowerCase() === snap.villageTown?.toLowerCase() || t.district.toLowerCase() === snap.district?.toLowerCase());

    const reason = !t.isOnline
      ? 'Offline'
      : !nearby
        ? distanceKm != null
          ? `Outside ${radiusKm} km radius`
          : 'Different area'
        : busy.has(t.id)
          ? 'Busy at this time'
          : tried.has(t.id)
            ? 'Already offered this job'
            : null;

    return {
      technicianId: t.id,
      userId: t.user.id,
      name: t.user.name ?? 'Technician',
      avatarUrl: t.user.avatarUrl,
      title: technicianTitle(t.skills),
      isOnline: t.isOnline,
      distanceKm,
      ratingAvg: Math.round(t.ratingAvg * 10) / 10,
      activeJobs: t.activeJobCount,
      retry: missedLongAgo.has(t.id),
      score: scoreCandidate(settings.weights, { distanceKm, radiusKm, ratingAvg: t.ratingAvg, activeJobs: t.activeJobCount }),
      eligible: reason === null,
      reason,
    };
  });

  return ranked.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
}

async function loadBooking(id: string) {
  return prisma.booking.findUnique({ where: { id }, include: bookingForDispatch });
}

/** Creates the timed offer and moves the booking to TECHNICIAN_ASSIGNED. */
async function offer(booking: DispatchBooking, c: RankedCandidate, opts: { manual: boolean; seconds: number; actorId?: string | null }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + opts.seconds * 1000);
  await prisma.$transaction(async (tx) => {
    await transitionBooking(tx, booking, B.TECHNICIAN_ASSIGNED, {
      actorId: opts.actorId ?? null,
      note: opts.manual ? 'Assigned by admin' : `Offered to ${c.name}`,
      data: { technicianId: c.technicianId, assignedAt: now },
    });
    await tx.bookingAssignment.create({
      data: {
        bookingId: booking.id,
        technicianId: c.technicianId,
        status: 'OFFERED',
        distanceKm: c.distanceKm,
        score: c.score,
        isManual: opts.manual,
        assignedById: opts.actorId ?? null,
        offeredAt: now,
        expiresAt,
      },
    });
    await tx.notification.create({
      data: {
        userId: c.userId,
        type: 'NEW_JOB',
        title: 'New service request',
        body: `${booking.service.name}${c.distanceKm != null ? ` · ${c.distanceKm} km away` : ''}. Respond within ${opts.seconds >= 120 ? `${Math.round(opts.seconds / 60)} minutes` : `${opts.seconds} seconds`}.`,
        data: { bookingId: booking.id },
      },
    });
  });
  emitToUser(c.userId, SocketEvent.BOOKING_REQUEST, { bookingId: booking.id, expiresAt: expiresAt.toISOString() });
  emitToUser(booking.customer.userId, SocketEvent.TECHNICIAN_ASSIGNED, { bookingId: booking.id });
}

/** Tell the customer (once per booking) that we're still looking. */
async function notifyStillSearching(booking: DispatchBooking) {
  const already = await prisma.notification.count({
    where: { userId: booking.customer.userId, type: 'NO_TECHNICIAN_YET', data: { path: '$.bookingId', equals: booking.id } },
  });
  if (already) return;
  await prisma.notification.create({
    data: {
      userId: booking.customer.userId,
      type: 'NO_TECHNICIAN_YET',
      title: 'Still finding a professional',
      body: `We couldn't find a free professional nearby for ${booking.service.name} yet. We'll keep trying and notify you.`,
      data: { bookingId: booking.id },
    },
  });
}

export type DispatchOutcome = 'offered' | 'no_candidates' | 'max_attempts' | 'skipped';

/** Offer a SEARCHING booking to the best available technician. Safe to call repeatedly. */
export async function dispatchBooking(bookingId: string): Promise<DispatchOutcome> {
  const booking = await loadBooking(bookingId);
  if (!booking || booking.status !== B.SEARCHING) return 'skipped';
  const settings = await dispatchSettings();

  const autoOffers = booking.assignments.filter((a) => !a.isManual).length;
  if (autoOffers >= settings.maxAttempts) {
    // Hand over to operations; admins can still assign manually.
    await notifyStillSearching(booking);
    return 'max_attempts';
  }
  const eligible = (await rankCandidates(booking)).filter((c) => c.eligible);
  // Fresh technicians first; someone who missed the ring earlier only when nobody else is free.
  const best = eligible.find((c) => !c.retry) ?? eligible[0];
  if (!best) {
    await notifyStillSearching(booking);
    return 'no_candidates';
  }
  try {
    await offer(booking, best, { manual: false, seconds: settings.timeoutSeconds });
    return 'offered';
  } catch (err) {
    // Lost a race (another worker / admin changed the booking) — the next tick retries.
    if (err instanceof AppError && err.code === 'STALE_BOOKING') return 'skipped';
    throw err;
  }
}

/** Expire timed-out offers and move each booking on to the next technician. */
export async function expireOffers(now = new Date()): Promise<number> {
  const due = await prisma.bookingAssignment.findMany({
    where: { status: 'OFFERED', expiresAt: { lt: now } },
    select: { id: true, bookingId: true, technicianId: true },
    take: 50,
  });
  let expired = 0;
  for (const a of due) {
    const moved = await prisma.$transaction(async (tx) => {
      const { count } = await tx.bookingAssignment.updateMany({
        where: { id: a.id, status: 'OFFERED' },
        data: { status: 'EXPIRED', respondedAt: now },
      });
      if (!count) return false;
      const b = await tx.booking.findUnique({ where: { id: a.bookingId }, select: { id: true, status: true, version: true, technicianId: true } });
      if (b?.status === B.TECHNICIAN_ASSIGNED && b.technicianId === a.technicianId) {
        await transitionBooking(tx, b, B.SEARCHING, { note: 'Request expired', data: { technicianId: null, assignedAt: null } });
        return true;
      }
      return false;
    });
    if (moved) {
      expired++;
      await dispatchBooking(a.bookingId).catch((err) => logger.error({ err, bookingId: a.bookingId }, 'redispatch failed'));
    }
  }
  return expired;
}

// ─── Admin ───────────────────────────────────────────────────────────────

const REASSIGNABLE: BookingStatus[] = [B.SEARCHING, B.TECHNICIAN_ASSIGNED, B.TECHNICIAN_ACCEPTED, B.TECHNICIAN_EN_ROUTE];

export async function candidatesForAdmin(bookingId: string): Promise<AssignmentCandidateDto[]> {
  const booking = await loadBooking(bookingId);
  if (!booking) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  return (await rankCandidates(booking, { forAdmin: true })).map(({ userId: _u, ...c }) => c);
}

/**
 * Manual (re)assignment. Admins may pick an offline or busy technician — the
 * technician still has to accept (15-minute window).
 */
export async function assignManually(bookingId: string, technicianId: string, actor: { userId: string; role: string }, ip?: string) {
  let booking = await loadBooking(bookingId);
  if (!booking) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (!REASSIGNABLE.includes(booking.status)) {
    throw AppError.conflict('This booking can no longer be (re)assigned.', 'NOT_ASSIGNABLE');
  }
  if (booking.technicianId === technicianId && booking.status !== B.SEARCHING) {
    throw AppError.conflict('This technician is already on the booking.', 'ALREADY_ASSIGNED');
  }
  const candidate = (await rankCandidates(booking, { forAdmin: true })).find((c) => c.technicianId === technicianId);
  if (!candidate) throw AppError.badRequest('This technician is not verified for this service.', 'NOT_A_CANDIDATE');

  const previous = booking.technicianId;
  const wasActive = booking.status === B.TECHNICIAN_ACCEPTED || booking.status === B.TECHNICIAN_EN_ROUTE;
  if (booking.status !== B.SEARCHING) {
    const current = booking;
    await prisma.$transaction(async (tx) => {
      await tx.bookingAssignment.updateMany({
        where: { bookingId: current.id, status: { in: ['OFFERED', 'ACCEPTED'] } },
        data: { status: 'REASSIGNED', respondedAt: new Date() },
      });
      await transitionBooking(tx, current, B.SEARCHING, {
        actorId: actor.userId,
        note: 'Reassigned by admin',
        data: { technicianId: null, assignedAt: null, acceptedAt: null },
      });
      if (previous && wasActive) {
        await tx.technician.updateMany({ where: { id: previous, activeJobCount: { gt: 0 } }, data: { activeJobCount: { decrement: 1 } } });
      }
      if (previous) {
        const prevTech = await tx.technician.findUnique({ where: { id: previous }, select: { userId: true } });
        if (prevTech) {
          await tx.notification.create({
            data: { userId: prevTech.userId, type: 'JOB_REASSIGNED', title: 'Job reassigned', body: `${current.service.name} was reassigned by RapidFix operations.`, data: { bookingId: current.id } },
          });
        }
      }
    });
    booking = (await loadBooking(bookingId))!;
  }

  await offer(booking, candidate, { manual: true, seconds: MANUAL_OFFER_SECONDS, actorId: actor.userId });
  await recordAudit({
    actorId: actor.userId,
    actorRole: actor.role as never,
    action: previous ? 'BOOKING_REASSIGNED' : 'BOOKING_ASSIGNED',
    entity: 'Booking',
    entityId: bookingId,
    oldValue: previous ? { technicianId: previous } : undefined,
    newValue: { technicianId },
    ip,
  });
}
