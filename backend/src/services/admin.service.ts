import { bookingScope, customerScope, technicianScope, type Scope } from './franchiseScope';
import {
  BOOKING_TAB_STATUSES,
  CANCELLED_STATUSES,
  hasPermission,
  isAdminRole,
  Permission,
  Role,
  TECHNICIAN_TAB_STATUSES,
  type AdminDashboardDto,
  type AdminUserRowDto,
  type BookingStatus,
  type DashboardRange,
  type KpiDto,
} from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { randomReferralCode } from '../utils/crypto';
import { recordAudit } from './audit.service';
import { technicianTitle } from './booking.service';
import { istDayStart, istMonthStart } from './technician.service';
import { revokeAllForUser } from './token.service';

const IST_OFFSET_MS = 330 * 60_000;
const istDateKey = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const growth = (current: number, previous: number) =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

const COMPLETED: BookingStatus[] = [...TECHNICIAN_TAB_STATUSES.completed];
const ACTIVE: BookingStatus[] = [...BOOKING_TAB_STATUSES.upcoming, ...BOOKING_TAB_STATUSES.active].filter(
  (s) => !COMPLETED.includes(s),
);

async function kpi(count: (where: { gte?: Date; lt?: Date }) => Promise<number>): Promise<KpiDto> {
  const monthStart = istMonthStart();
  const [total, thisMonth, lastMonth] = await Promise.all([
    count({}),
    count({ gte: monthStart }),
    count({ gte: istMonthStart(new Date(), -1), lt: monthStart }),
  ]);
  return { total, thisMonth, growthPct: growth(thisMonth, lastMonth) };
}

export async function dashboard(range: DashboardRange, scope: Scope = null): Promise<AdminDashboardDto> {
  const inBooking = bookingScope(scope);
  const now = new Date();
  const periodDays = range === 'today' ? 1 : range === '7d' ? 7 : 30;
  const periodStart = istDayStart(now, -(periodDays - 1));
  const chartDays = range === '30d' ? 30 : 7;
  const chartStart = istDayStart(now, -(chartDays - 1));

  const revenueSum = async (w: { gte?: Date; lt?: Date }) =>
    (await prisma.payment.aggregate({ where: { status: 'SUCCESS', booking: inBooking, ...(w.gte && { paidAt: w }) }, _sum: { amount: true } }))._sum
      .amount ?? 0;

  const [customers, technicians, bookingsKpi, revenueKpi] = await Promise.all([
    kpi((w) => prisma.customer.count({ where: { user: { role: Role.CUSTOMER }, AND: [customerScope(scope)], ...(w.gte && { createdAt: w }) } })),
    kpi((w) => prisma.technician.count({ where: { user: { role: Role.TECHNICIAN }, ...technicianScope(scope), ...(w.gte && { createdAt: w }) } })),
    kpi((w) => prisma.booking.count({ where: { ...inBooking, ...(w.gte && { createdAt: w }) } })),
    kpi(revenueSum),
  ]);

  const windowStart = chartStart < periodStart ? chartStart : periodStart;
  const periodBookings = await prisma.booking.findMany({
    where: { createdAt: { gte: windowStart }, ...inBooking },
    select: {
      status: true,
      createdAt: true,
      completedAt: true,
      cancelledAt: true,
      service: { select: { name: true, category: { select: { name: true, iconKey: true } } } },
    },
  });

  // Bookings overview (stacked bars per day).
  const days = Array.from({ length: chartDays }, (_, i) => istDateKey(istDayStart(now, -(chartDays - 1 - i))));
  const overview = new Map(days.map((d) => [d, { date: d, completed: 0, active: 0, cancelled: 0 }]));
  for (const b of periodBookings) {
    if (b.createdAt < chartStart) continue;
    const row = overview.get(istDateKey(b.createdAt));
    if (!row) continue;
    if (COMPLETED.includes(b.status)) row.completed++;
    else if (CANCELLED_STATUSES.includes(b.status)) row.cancelled++;
    else row.active++;
  }

  const inPeriod = periodBookings.filter((b) => b.createdAt >= periodStart);
  const tally = (key: (b: (typeof inPeriod)[number]) => string, icon: (b: (typeof inPeriod)[number]) => string) => {
    const m = new Map<string, { name: string; iconKey: string; count: number }>();
    for (const b of inPeriod) {
      const k = key(b);
      const e = m.get(k) ?? { name: k, iconKey: icon(b), count: 0 };
      e.count++;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.count - a.count).map((e) => ({ ...e, pct: pct(e.count, inPeriod.length) }));
  };

  const [activeServices, completedInPeriod, cancelledInPeriod] = await Promise.all([
    prisma.booking.count({ where: { status: { in: [...TECHNICIAN_TAB_STATUSES.inProgress] }, ...inBooking } }),
    prisma.booking.count({ where: { status: { in: COMPLETED }, completedAt: { gte: periodStart }, ...inBooking } }),
    prisma.booking.count({ where: { status: { in: [...CANCELLED_STATUSES] }, cancelledAt: { gte: periodStart }, ...inBooking } }),
  ]);

  const recent = await prisma.booking.findMany({
    where: inBooking,
    orderBy: { createdAt: 'desc' },
    take: 6,
    include: {
      service: { select: { name: true } },
      customer: { include: { user: { select: { name: true, avatarUrl: true } } } },
      technician: { include: { user: { select: { name: true, avatarUrl: true } } } },
    },
  });

  const live = await prisma.technician.findMany({
    where: { verificationStatus: 'VERIFIED', ...technicianScope(scope), user: { role: Role.TECHNICIAN, status: 'ACTIVE' } },
    orderBy: [{ isOnline: 'desc' }, { lastLocationAt: 'desc' }],
    take: 5,
    include: { user: { select: { name: true, avatarUrl: true } }, skills: { include: { category: true }, orderBy: { category: { sortOrder: 'asc' } }, take: 1 } },
  });

  // Revenue (payments collected) and payouts (technician earnings on paid jobs).
  const paidInChart = await prisma.payment.findMany({
    where: { status: 'SUCCESS', paidAt: { gte: chartStart }, booking: inBooking },
    select: { amount: true, paidAt: true },
  });
  const revenueByDay = new Map(days.map((d) => [d, 0]));
  for (const p of paidInChart) {
    const k = istDateKey(p.paidAt!);
    if (revenueByDay.has(k)) revenueByDay.set(k, revenueByDay.get(k)! + p.amount);
  }
  const payoutSum = async (w: { gte?: Date; lt?: Date }) =>
    (
      await prisma.booking.aggregate({
        where: { status: 'PAYMENT_COMPLETED', ...inBooking, ...(w.gte && { completedAt: w }) },
        _sum: { technicianEarning: true },
      })
    )._sum.technicianEarning ?? 0;
  const monthStart = istMonthStart();
  const lastMonthStart = istMonthStart(now, -1);
  const [payoutsTotal, payoutsThisMonth, payoutsLastMonth, revenueThisPeriod, payoutsThisPeriod] = await Promise.all([
    payoutSum({}),
    payoutSum({ gte: monthStart }),
    payoutSum({ gte: lastMonthStart, lt: monthStart }),
    revenueSum({ gte: periodStart }),
    payoutSum({ gte: periodStart }),
  ]);

  const reviews = await prisma.review.findMany({
    where: { isVisible: true, booking: inBooking },
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      customer: { include: { user: { select: { name: true } } } },
      booking: { select: { service: { select: { name: true } } } },
    },
  });

  return {
    range,
    kpis: { customers, technicians, bookings: bookingsKpi, revenue: revenueKpi },
    bookingsOverview: [...overview.values()],
    categoryShare: tally((b) => b.service.category.name, (b) => b.service.category.iconKey),
    summary: {
      newBookings: inPeriod.length,
      activeServices,
      completed: completedInPeriod,
      cancelled: cancelledInPeriod,
    },
    recentBookings: recent.map((b) => ({
      id: b.id,
      code: b.code ?? '',
      customerName: b.customer.user.name ?? 'Customer',
      customerAvatarUrl: b.customer.user.avatarUrl,
      service: b.service.name,
      technicianName: b.technician?.user.name ?? null,
      technicianAvatarUrl: b.technician?.user.avatarUrl ?? null,
      scheduledFor: b.scheduledFor.toISOString(),
      status: b.status,
      amount: b.totalAmount,
    })),
    liveTechnicians: live.map((t) => ({
      id: t.id,
      name: t.user.name ?? 'Technician',
      avatarUrl: t.user.avatarUrl,
      title: technicianTitle(t.skills),
      isOnline: t.isOnline,
    })),
    revenue: {
      points: [...revenueByDay.entries()].map(([date, revenue]) => ({ date, revenue })),
      total: revenueKpi.total,
      growthPct: revenueKpi.growthPct,
      thisPeriod: revenueThisPeriod,
      payouts: payoutsTotal,
      payoutsGrowthPct: growth(payoutsThisMonth, payoutsLastMonth),
      payoutsThisPeriod,
    },
    topServices: tally((b) => b.service.name, (b) => b.service.category.iconKey).slice(0, 5),
    recentReviews: reviews.map((r) => ({
      id: r.id,
      customerName: r.customer.user.name ?? 'Customer',
      service: r.booking.service.name,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ─── Users & roles ───────────────────────────────────────────────────────

export async function listUsers(opts: { q?: string; role?: Role; page: number; pageSize: number }) {
  const q = opts.q?.trim();
  const where: Prisma.UserWhereInput = {
    ...(opts.role && { role: opts.role }),
    ...(q && { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }] }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { technician: { select: { verificationStatus: true } } },
    }),
    prisma.user.count({ where }),
  ]);
  const items: AdminUserRowDto[] = rows.map((u) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    status: u.status,
    technicianStatus: u.technician?.verificationStatus ?? null,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  }));
  return { items, total };
}

const ACTIVE_WORK: BookingStatus[] = [...ACTIVE];

/**
 * Changes a user's role. Rules:
 *  • CUSTOMER ↔ TECHNICIAN needs users:manage (ADMIN, SUPER_ADMIN)
 *  • granting or removing any staff role needs admins:manage (SUPER_ADMIN only)
 *  • nobody changes their own role; the last SUPER_ADMIN can't be demoted
 *  • users with bookings in progress can't switch until those finish
 * The user's sessions are revoked so they sign in again with the new role.
 */
export async function changeRole(actor: { userId: string; role: Role }, targetId: string, newRole: Role, ip?: string) {
  if (!hasPermission(actor.role, Permission.USERS_MANAGE)) throw AppError.forbidden();
  if (actor.userId === targetId) throw AppError.badRequest("You can't change your own role", 'SELF_ROLE_CHANGE');

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { customer: { select: { id: true } }, technician: { select: { id: true } }, adminUser: { select: { id: true } } },
  });
  if (!target) throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  if (target.role === newRole) return target;
  if (target.role === Role.FRANCHISE_ADMIN) {
    throw AppError.conflict('This person manages a franchise. Change it from Franchises.', 'FRANCHISE_MANAGER');
  }

  const touchesStaff = isAdminRole(target.role) || isAdminRole(newRole);
  if (touchesStaff && !hasPermission(actor.role, Permission.ADMINS_MANAGE)) {
    throw AppError.forbidden('Only a Super Admin can grant or remove admin roles.', 'SUPER_ADMIN_REQUIRED');
  }
  if (target.role === Role.SUPER_ADMIN) {
    const supers = await prisma.user.count({ where: { role: Role.SUPER_ADMIN, status: 'ACTIVE' } });
    if (supers <= 1) throw AppError.conflict('RapidFix must keep at least one Super Admin.', 'LAST_SUPER_ADMIN');
  }
  if (isAdminRole(newRole) && !target.phone && !target.email) {
    throw AppError.badRequest('Staff accounts need a phone number or email to sign in.', 'NO_LOGIN_METHOD');
  }

  const busy =
    (target.technician &&
      (await prisma.booking.count({ where: { technicianId: target.technician.id, status: { in: ACTIVE_WORK } } }))) ||
    (target.customer &&
      (await prisma.booking.count({ where: { customerId: target.customer.id, status: { in: ACTIVE_WORK } } })));
  if (busy) {
    throw AppError.conflict('This user has bookings in progress. Finish or cancel them before changing the role.', 'ACTIVE_BOOKINGS');
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Make sure the profile for the new role exists; old profiles are kept for history.
    if (newRole === Role.CUSTOMER && !target.customer) {
      await tx.customer.create({ data: { userId: target.id, referralCode: randomReferralCode() } });
    }
    if (newRole === Role.TECHNICIAN) {
      if (!target.technician) {
        await tx.technician.create({ data: { userId: target.id, languages: [], wallet: { create: {} } } });
      }
    } else if (target.technician) {
      await tx.technician.update({ where: { id: target.technician.id }, data: { isOnline: false } });
    }
    if (isAdminRole(newRole) && !target.adminUser) {
      await tx.adminUser.create({ data: { userId: target.id } });
    }
    return tx.user.update({ where: { id: target.id }, data: { role: newRole } });
  });

  await revokeAllForUser(target.id);
  await recordAudit({
    actorId: actor.userId,
    actorRole: actor.role,
    action: 'ROLE_CHANGED',
    entity: 'User',
    entityId: target.id,
    oldValue: { role: target.role },
    newValue: { role: newRole },
    ip,
  });
  return updated;
}

/** Franchise managers are appointed only through Franchises (with their agreement details). */
export const ASSIGNABLE_ROLES = [Role.CUSTOMER, Role.TECHNICIAN, Role.SUPER_ADMIN, Role.ADMIN, Role.OPERATIONS, Role.SUPPORT, Role.FINANCE] as const;
