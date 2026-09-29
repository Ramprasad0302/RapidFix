import {
  BookingStatus as B,
  TECHNICIAN_TAB_STATUSES,
  type AddressSnapshot,
  type BookingStatus,
  type TechnicianDashboardDto,
  type TechnicianEarningsDto,
  type TechnicianJobAction,
  type TechnicianJobDetailDto,
  type TechnicianJobDto,
  type TechnicianProfileSummary,
  type TechnicianTab,
} from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { locality } from '../utils/locality';
import { technicianTitle } from './booking.service';
import { transitionBooking } from './bookingState';
import { buildTimeline } from './bookingTimeline';

const IST_OFFSET_MS = 330 * 60_000;

/** Midnight IST for the day containing `d`, `addDays` days later. */
export function istDayStart(d = new Date(), addDays = 0): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + addDays) - IST_OFFSET_MS);
}
export function istMonthStart(d = new Date(), addMonths = 0): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + addMonths, 1) - IST_OFFSET_MS);
}

const jobInclude = {
  service: { include: { category: true } },
  customer: { include: { user: { select: { name: true, phone: true } } } },
  statusHistory: { select: { toStatus: true, createdAt: true } },
} as const satisfies Prisma.BookingInclude;
type JobRow = Prisma.BookingGetPayload<{ include: typeof jobInclude }>;

const CANCELLED: BookingStatus[] = [...TECHNICIAN_TAB_STATUSES.cancelled];
const COMPLETED: BookingStatus[] = [...TECHNICIAN_TAB_STATUSES.completed];
const CUSTOMER_PHONE_VISIBLE: BookingStatus[] = [
  B.TECHNICIAN_ACCEPTED,
  ...TECHNICIAN_TAB_STATUSES.inProgress,
  B.SERVICE_COMPLETED,
  B.PAYMENT_PENDING,
];

function toJob(b: JobRow): TechnicianJobDto {
  return {
    id: b.id,
    code: b.code ?? '',
    status: b.status,
    service: {
      id: b.service.id,
      name: b.service.name,
      slug: b.service.slug,
      imageUrl: b.service.imageUrl,
      iconKey: b.service.category.iconKey,
    },
    customerName: b.customer.user.name ?? 'Customer',
    scheduleType: b.scheduleType,
    scheduledFor: b.scheduledFor.toISOString(),
    timeSlot: b.timeSlot,
    locality: locality(b.addressSnapshot as unknown as AddressSnapshot),
    totalAmount: b.totalAmount,
  };
}

function actionsFor(status: BookingStatus, verified: boolean): TechnicianJobAction[] {
  if (!verified) return [];
  switch (status) {
    case B.TECHNICIAN_ASSIGNED:
      return ['ACCEPT', 'REJECT'];
    case B.TECHNICIAN_ACCEPTED:
      return ['EN_ROUTE'];
    case B.TECHNICIAN_EN_ROUTE:
      return ['ARRIVED'];
    case B.TECHNICIAN_ARRIVED:
      return ['START'];
    case B.SERVICE_STARTED:
    case B.ADDITIONAL_CHARGE_APPROVED:
      return ['COMPLETE'];
    default:
      return [];
  }
}

export async function technicianOf(userId: string) {
  const tech = await prisma.technician.findUnique({
    where: { userId },
    include: { user: { select: { name: true, phone: true, avatarUrl: true } }, skills: { include: { category: true }, orderBy: { category: { sortOrder: 'asc' } } } },
  });
  if (!tech) throw AppError.forbidden('Technician profile not found', 'TECHNICIAN_PROFILE_MISSING');
  return tech;
}
type Tech = Awaited<ReturnType<typeof technicianOf>>;

export function toProfileSummary(t: Tech): TechnicianProfileSummary {
  return {
    id: t.id,
    name: t.user.name ?? 'Partner',
    phone: t.user.phone,
    avatarUrl: t.user.avatarUrl,
    title: technicianTitle(t.skills),
    isOnline: t.isOnline,
    verificationStatus: t.verificationStatus,
    ratingAvg: Math.round(t.ratingAvg * 10) / 10,
    ratingCount: t.ratingCount,
    experienceYears: t.experienceYears,
    skills: t.skills.map((s) => ({ id: s.category.id, name: s.category.name, slug: s.category.slug, iconKey: s.category.iconKey })),
  };
}

export async function dashboard(userId: string): Promise<TechnicianDashboardDto> {
  const tech = await technicianOf(userId);
  const from = istDayStart();
  const to = istDayStart(new Date(), 1);
  const today = await prisma.booking.findMany({
    where: { technicianId: tech.id, scheduledFor: { gte: from, lt: to }, status: { notIn: CANCELLED } },
    include: jobInclude,
    orderBy: { scheduledFor: 'asc' },
  });
  const earned = await prisma.booking.aggregate({
    where: { technicianId: tech.id, status: B.PAYMENT_COMPLETED, completedAt: { gte: from, lt: to } },
    _sum: { technicianEarning: true },
  });
  return {
    profile: toProfileSummary(tech),
    today: {
      jobs: today.length,
      completed: today.filter((b) => COMPLETED.includes(b.status)).length,
      earnings: earned._sum.technicianEarning ?? 0,
    },
    schedule: today.map(toJob),
  };
}

export async function listJobs(userId: string, tab: TechnicianTab | 'all') {
  const tech = await technicianOf(userId);
  const where: Prisma.BookingWhereInput = {
    technicianId: tech.id,
    ...(tab !== 'all' && { status: { in: [...TECHNICIAN_TAB_STATUSES[tab]] } }),
  };
  const history = tab === 'completed' || tab === 'cancelled';
  // Today onwards (soonest first), then the past (most recent first).
  const today = istDayStart();
  const [ahead, past] = await Promise.all([
    history ? Promise.resolve([]) : prisma.booking.findMany({ where: { ...where, scheduledFor: { gte: today } }, include: jobInclude, orderBy: { scheduledFor: 'asc' }, take: 100 }),
    prisma.booking.findMany({ where: { ...where, ...(!history && { scheduledFor: { lt: today } }) }, include: jobInclude, orderBy: { scheduledFor: 'desc' }, take: 100 }),
  ]);
  const rows = [...ahead, ...past].slice(0, 100);
  const grouped = await prisma.booking.groupBy({ by: ['status'], where: { technicianId: tech.id }, _count: { _all: true } });
  const count = (statuses: readonly BookingStatus[]) =>
    grouped.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  return {
    items: rows.map(toJob),
    counts: {
      upcoming: count(TECHNICIAN_TAB_STATUSES.upcoming),
      inProgress: count(TECHNICIAN_TAB_STATUSES.inProgress),
      completed: count(TECHNICIAN_TAB_STATUSES.completed),
      cancelled: count(TECHNICIAN_TAB_STATUSES.cancelled),
    },
  };
}

/** A technician only ever sees jobs assigned to them. */
async function findOwnedJob(techId: string, id: string) {
  const job = await prisma.booking.findFirst({ where: { id, technicianId: techId }, include: jobInclude });
  if (!job) throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
  return job;
}

export async function getJob(userId: string, id: string): Promise<TechnicianJobDetailDto> {
  const tech = await technicianOf(userId);
  const b = await findOwnedJob(tech.id, id);
  return {
    ...toJob(b),
    customerPhone: CUSTOMER_PHONE_VISIBLE.includes(b.status) ? b.customer.user.phone : null,
    address: b.addressSnapshot as unknown as AddressSnapshot,
    latitude: b.latitude,
    longitude: b.longitude,
    description: b.description,
    photos: Array.isArray(b.photos) ? (b.photos as string[]) : [],
    technicianNotes: b.technicianNotes,
    timeline: buildTimeline('technician', b.status, b.statusHistory, b.createdAt),
    actions: actionsFor(b.status, tech.verificationStatus === 'VERIFIED'),
  };
}

const ACTION_TARGET: Record<TechnicianJobAction, BookingStatus> = {
  ACCEPT: B.TECHNICIAN_ACCEPTED,
  REJECT: B.SEARCHING,
  EN_ROUTE: B.TECHNICIAN_EN_ROUTE,
  ARRIVED: B.TECHNICIAN_ARRIVED,
  START: B.SERVICE_STARTED,
  COMPLETE: B.SERVICE_COMPLETED,
};

const CUSTOMER_NOTICE: Partial<Record<TechnicianJobAction, (tech: string, service: string) => { type: string; title: string; body: string }>> = {
  ACCEPT: (t, s) => ({ type: 'TECHNICIAN_ACCEPTED', title: 'Technician assigned', body: `${t} accepted your ${s} booking.` }),
  EN_ROUTE: (t) => ({ type: 'TECHNICIAN_EN_ROUTE', title: 'Technician on the way', body: `${t} is heading to your location.` }),
  ARRIVED: (t) => ({ type: 'TECHNICIAN_ARRIVED', title: 'Technician arrived', body: `${t} has arrived at your address.` }),
  START: (_t, s) => ({ type: 'SERVICE_STARTED', title: 'Service started', body: `Work on your ${s} has started.` }),
  COMPLETE: (_t, s) => ({ type: 'SERVICE_COMPLETED', title: 'Service completed', body: `Your ${s} is complete. Please complete the payment.` }),
};

export async function performAction(userId: string, id: string, action: TechnicianJobAction, reason?: string) {
  const tech = await technicianOf(userId);
  if (tech.verificationStatus !== 'VERIFIED') {
    throw AppError.forbidden('Only verified partners can take jobs.', 'TECHNICIAN_NOT_VERIFIED');
  }
  const job = await findOwnedJob(tech.id, id);
  if (!actionsFor(job.status, true).includes(action)) {
    throw AppError.conflict('This action is not available for the job right now.', 'INVALID_TRANSITION');
  }
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const target = ACTION_TARGET[action];
    const data: Prisma.BookingUpdateManyMutationInput =
      action === 'ACCEPT'
        ? { acceptedAt: now }
        : action === 'START'
          ? { startedAt: now }
          : action === 'COMPLETE'
            ? { completedAt: now }
            : {};
    const state = await transitionBooking(tx, job, target, { actorId: userId, note: reason, data });

    if (action === 'REJECT') {
      // Back to the pool; the assignment engine (Phase 6) re-offers it.
      await tx.booking.update({ where: { id: job.id }, data: { technicianId: null, assignedAt: null } });
      await tx.bookingAssignment.updateMany({
        where: { bookingId: job.id, technicianId: tech.id, status: 'OFFERED' },
        data: { status: 'REJECTED', respondedAt: now, rejectReason: reason ?? null },
      });
    }
    if (action === 'ACCEPT') {
      await tx.bookingAssignment.updateMany({
        where: { bookingId: job.id, technicianId: tech.id, status: 'OFFERED' },
        data: { status: 'ACCEPTED', respondedAt: now },
      });
      await tx.technician.update({ where: { id: tech.id }, data: { activeJobCount: { increment: 1 } } });
    }
    if (action === 'COMPLETE') {
      // Payment collection (cash/UPI/Razorpay) is Phase 8; the job now awaits payment.
      await transitionBooking(tx, state, B.PAYMENT_PENDING, { actorId: userId });
      await tx.technician.update({
        where: { id: tech.id },
        data: { completedJobs: { increment: 1 }, activeJobCount: { decrement: tech.activeJobCount > 0 ? 1 : 0 } },
      });
    }

    const notice = CUSTOMER_NOTICE[action]?.(tech.user.name ?? 'Your technician', job.service.name);
    if (notice) {
      await tx.notification.create({ data: { userId: job.customer.userId, ...notice, data: { bookingId: job.id } } });
    }
  });

  return action === 'REJECT' ? null : getJob(userId, id);
}

export async function saveNotes(userId: string, id: string, notes: string) {
  const tech = await technicianOf(userId);
  await findOwnedJob(tech.id, id);
  await prisma.booking.update({ where: { id }, data: { technicianNotes: notes || null } });
  return getJob(userId, id);
}

export async function setOnline(userId: string, online: boolean, coords?: { lat: number; lng: number }) {
  const tech = await technicianOf(userId);
  if (online && tech.verificationStatus !== 'VERIFIED') {
    throw AppError.forbidden('You can go online once your profile is verified.', 'TECHNICIAN_NOT_VERIFIED');
  }
  await prisma.technician.update({
    where: { id: tech.id },
    data: {
      isOnline: online,
      ...(coords && { lastLatitude: coords.lat, lastLongitude: coords.lng, lastLocationAt: new Date() }),
    },
  });
  return toProfileSummary(await technicianOf(userId));
}

export async function earnings(userId: string, month?: string): Promise<TechnicianEarningsDto> {
  const tech = await technicianOf(userId);
  const now = new Date();
  let monthStart = istMonthStart(now);
  if (month) {
    const [y, m] = month.split('-').map(Number) as [number, number];
    monthStart = new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS);
  }
  const nextMonth = istMonthStart(new Date(monthStart.getTime() + 15 * 86_400_000), 1);
  const prevMonth = istMonthStart(new Date(monthStart.getTime() + 15 * 86_400_000), -1);

  const paid = { technicianId: tech.id, status: B.PAYMENT_COMPLETED } as const;
  const sum = async (from?: Date, to?: Date) =>
    (
      await prisma.booking.aggregate({
        where: { ...paid, ...(from && { completedAt: { gte: from, ...(to && { lt: to }) } }) },
        _sum: { technicianEarning: true },
      })
    )._sum.technicianEarning ?? 0;

  const [today, week, monthTotal, lastMonth, total, completedJobs, cancelledJobs, ledgerRows] = await Promise.all([
    sum(istDayStart()),
    sum(istDayStart(now, -6)),
    sum(monthStart, nextMonth),
    sum(prevMonth, monthStart),
    sum(),
    prisma.booking.count({ where: { technicianId: tech.id, status: { in: COMPLETED }, completedAt: { gte: monthStart, lt: nextMonth } } }),
    prisma.booking.count({ where: { technicianId: tech.id, status: { in: CANCELLED }, updatedAt: { gte: monthStart, lt: nextMonth } } }),
    prisma.booking.findMany({
      where: { ...paid, completedAt: { gte: monthStart, lt: nextMonth } },
      include: { service: { select: { name: true } } },
      orderBy: { completedAt: 'desc' },
      take: 100,
    }),
  ]);

  return {
    today,
    week,
    month: monthTotal,
    total,
    monthGrowthPct: lastMonth > 0 ? Math.round(((monthTotal - lastMonth) / lastMonth) * 100) : null,
    completedJobs,
    cancelledJobs,
    ratingAvg: Math.round(tech.ratingAvg * 10) / 10,
    ledger: ledgerRows.map((b) => {
      const gross = b.serviceCharge + b.visitCharge + b.additionalChargesTotal - b.discountAmount;
      return {
        bookingId: b.id,
        code: b.code ?? '',
        service: b.service.name,
        gross,
        commission: b.commissionAmount ?? 0,
        net: b.technicianEarning ?? 0,
        date: (b.completedAt ?? b.updatedAt).toISOString(),
      };
    }),
  };
}
