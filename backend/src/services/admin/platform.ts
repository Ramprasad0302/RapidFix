import { z } from 'zod';
import {
  CANCELLED_STATUSES,
  type AdminReviewDto,
  type AuditLogDto,
  type BroadcastDto,
  type Paged,
  type ReportDto,
  type SettingDto,
  type SystemStatusDto,
} from '@fixora/shared-types';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../audit.service';
import { pushEnabled } from '../push.service';
import { razorpayConfigured } from '../payment.service';
import { clearSettingsCache } from '../settings.service';
import { complaintInclude, recomputeRating, toComplaint } from '../work.service';

type Actor = { userId: string; role: string };
const IST = 330 * 60_000;
const istDate = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);

// ─── Reviews ─────────────────────────────────────────────────────────────

export async function listReviews(q: { rating?: number; visible?: boolean; page: number; pageSize: number }): Promise<Paged<AdminReviewDto>> {
  const where: Prisma.ReviewWhereInput = { ...(q.rating && { rating: q.rating }), ...(q.visible !== undefined && { isVisible: q.visible }) };
  const [rows, total] = await prisma.$transaction([
    prisma.review.findMany({
      where,
      include: { booking: { select: { code: true, service: { select: { name: true } } } }, customer: { select: { user: { select: { name: true } } } }, technician: { select: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.review.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({ id: r.id, bookingCode: r.booking.code ?? '', service: r.booking.service.name, customerName: r.customer.user.name, technicianName: r.technician.user.name, rating: r.rating, comment: r.comment, isVisible: r.isVisible, createdAt: r.createdAt.toISOString() })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Hide/show a review; the technician's rating follows visible reviews only. */
export async function setReviewVisibility(actor: Actor, id: string, isVisible: boolean, ip?: string) {
  const r = await prisma.review.update({ where: { id }, data: { isVisible } });
  await prisma.$transaction((tx) => recomputeRating(tx, r.technicianId));
  await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: isVisible ? 'REVIEW_SHOWN' : 'REVIEW_HIDDEN', entity: 'Review', entityId: id, ip });
}

// ─── Complaints ──────────────────────────────────────────────────────────

export async function listComplaints(q: { status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; page: number; pageSize: number }) {
  const where: Prisma.ComplaintWhereInput = q.status ? { status: q.status } : {};
  const [rows, total] = await prisma.$transaction([
    prisma.complaint.findMany({ where, include: complaintInclude, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.complaint.count({ where }),
  ]);
  return { items: rows.map(toComplaint), total, page: q.page, pageSize: q.pageSize };
}

export async function updateComplaint(actor: Actor, id: string, input: { status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; resolution?: string; assignToMe?: boolean }, ip?: string) {
  const before = await prisma.complaint.findUnique({ where: { id } });
  if (!before) throw AppError.notFound('Complaint not found', 'COMPLAINT_NOT_FOUND');
  if ((input.status === 'RESOLVED' || input.status === 'CLOSED') && !(input.resolution ?? before.resolution)) throw AppError.badRequest('Add a resolution note', 'RESOLUTION_REQUIRED');
  const c = await prisma.complaint.update({
    where: { id },
    data: {
      ...(input.status && { status: input.status }),
      ...(input.resolution !== undefined && { resolution: input.resolution }),
      ...(input.assignToMe && { assignedToId: actor.userId }),
      ...((input.status === 'RESOLVED' || input.status === 'CLOSED') && { resolvedAt: new Date() }),
    },
    include: complaintInclude,
  });
  if (input.status && input.status !== before.status && (input.status === 'RESOLVED' || input.status === 'CLOSED')) {
    await prisma.notification.create({ data: { userId: before.raisedById, type: 'COMPLAINT', title: 'Complaint resolved', body: `${before.subject}: ${c.resolution}` } });
  }
  await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: 'COMPLAINT_UPDATED', entity: 'Complaint', entityId: id, oldValue: { status: before.status }, newValue: input, ip });
  return toComplaint(c);
}

// ─── Broadcast notifications ─────────────────────────────────────────────

export async function broadcast(actor: Actor, input: { audience: 'CUSTOMERS' | 'TECHNICIANS' | 'ALL'; title: string; body: string }, ip?: string) {
  const roles = input.audience === 'CUSTOMERS' ? ['CUSTOMER'] : input.audience === 'TECHNICIANS' ? ['TECHNICIAN'] : ['CUSTOMER', 'TECHNICIAN'];
  const users = await prisma.user.findMany({
    where: {
      role: { in: roles as never },
      status: 'ACTIVE',
      // Respect the customer's marketing opt-out.
      OR: [{ role: 'TECHNICIAN' }, { customer: { marketingOptIn: true } }],
    },
    select: { id: true },
  });
  for (let i = 0; i < users.length; i += 500) {
    await prisma.notification.createMany({
      data: users.slice(i, i + 500).map((u) => ({ userId: u.id, type: 'ANNOUNCEMENT', title: input.title, body: input.body })),
    });
  }
  await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: 'BROADCAST_SENT', entity: 'Notification', newValue: { ...input, recipients: users.length }, ip });
  return { recipients: users.length };
}

export async function listBroadcasts(): Promise<BroadcastDto[]> {
  const rows = await prisma.auditLog.findMany({ where: { action: 'BROADCAST_SENT' }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map((r) => {
    const v = r.newValue as { audience: BroadcastDto['audience']; title: string; body: string; recipients: number };
    return { id: r.id, audience: v.audience, title: v.title, body: v.body, recipients: v.recipients, sentBy: r.actor?.name ?? null, createdAt: r.createdAt.toISOString() };
  });
}

// ─── Reports ─────────────────────────────────────────────────────────────

export async function report(from: Date, to: Date): Promise<ReportDto> {
  const created = { gte: from, lte: to };
  const bookings = await prisma.booking.findMany({
    where: { createdAt: created },
    select: {
      id: true,
      status: true,
      customerId: true,
      totalAmount: true,
      commissionAmount: true,
      technicianEarning: true,
      createdAt: true,
      completedAt: true,
      paymentStatus: true,
      addressSnapshot: true,
      service: { select: { name: true } },
    },
  });
  const paid = bookings.filter((b) => b.paymentStatus === 'SUCCESS');
  const completedStatuses = ['SERVICE_COMPLETED', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED'];
  const cancelled = bookings.filter((b) => CANCELLED_STATUSES.includes(b.status)).length;
  const sum = (xs: (number | null)[]) => xs.reduce<number>((n, x) => n + (x ?? 0), 0);

  // Repeat customers: booked in range and had any earlier booking.
  const inRangeCustomers = [...new Set(bookings.map((b) => b.customerId))];
  const earlier = await prisma.booking.groupBy({ by: ['customerId'], where: { customerId: { in: inRangeCustomers }, createdAt: { lt: from } }, _count: { _all: true } });
  const multiInRange = inRangeCustomers.filter((c) => bookings.filter((b) => b.customerId === c).length > 1);
  const repeat = new Set([...earlier.map((e) => e.customerId), ...multiInRange]);

  const [newCustomers, newTechnicians, ratingAgg] = await Promise.all([
    prisma.customer.count({ where: { createdAt: created, user: { role: 'CUSTOMER' } } }),
    prisma.technician.count({ where: { createdAt: created } }),
    prisma.review.aggregate({ where: { createdAt: created }, _avg: { rating: true }, _count: { _all: true } }),
  ]);

  const days = new Map<string, { date: string; bookings: number; completed: number; revenue: number }>();
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) days.set(istDate(d), { date: istDate(d), bookings: 0, completed: 0, revenue: 0 });
  for (const b of bookings) {
    const row = days.get(istDate(b.createdAt));
    if (!row) continue;
    row.bookings++;
    if (completedStatuses.includes(b.status)) row.completed++;
    if (b.paymentStatus === 'SUCCESS') row.revenue += b.totalAmount;
  }

  const group = (key: (b: (typeof bookings)[number]) => string) => {
    const m = new Map<string, { name: string; bookings: number; revenue: number }>();
    for (const b of bookings) {
      const k = key(b) || 'Unknown';
      const e = m.get(k) ?? { name: k, bookings: 0, revenue: 0 };
      e.bookings++;
      if (b.paymentStatus === 'SUCCESS') e.revenue += b.totalAmount;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.bookings - a.bookings).slice(0, 10);
  };

  const techs = await prisma.technician.findMany({
    where: { verificationStatus: 'VERIFIED' },
    select: { id: true, ratingAvg: true, user: { select: { name: true } } },
  });
  const [jobs, earnings, offers, accepted] = await Promise.all([
    prisma.booking.groupBy({ by: ['technicianId'], where: { createdAt: created, status: { in: completedStatuses as never } }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ['technicianId'], where: { createdAt: created, paymentStatus: 'SUCCESS' }, _sum: { technicianEarning: true } }),
    prisma.bookingAssignment.groupBy({ by: ['technicianId'], where: { offeredAt: created, status: { not: 'OFFERED' } }, _count: { _all: true } }),
    prisma.bookingAssignment.groupBy({ by: ['technicianId'], where: { offeredAt: created, status: { in: ['ACCEPTED', 'REASSIGNED'] } }, _count: { _all: true } }),
  ]);
  const technicianPerformance = techs
    .map((t) => {
      const o = offers.find((x) => x.technicianId === t.id)?._count._all ?? 0;
      const a = accepted.find((x) => x.technicianId === t.id)?._count._all ?? 0;
      return {
        name: t.user.name ?? 'Technician',
        jobs: jobs.find((j) => j.technicianId === t.id)?._count._all ?? 0,
        earnings: earnings.find((e) => e.technicianId === t.id)?._sum.technicianEarning ?? 0,
        rating: Math.round(t.ratingAvg * 10) / 10,
        acceptanceRate: o ? Math.round((a / o) * 100) : null,
      };
    })
    .sort((a, b) => b.jobs - a.jobs);

  const revenue = sum(paid.map((b) => b.totalAmount));
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    bookings: bookings.length,
    completed: bookings.filter((b) => completedStatuses.includes(b.status)).length,
    cancelled,
    cancellationRate: bookings.length ? Math.round((cancelled / bookings.length) * 1000) / 10 : 0,
    revenue,
    commission: sum(paid.map((b) => b.commissionAmount)),
    technicianEarnings: sum(paid.map((b) => b.technicianEarning)),
    averageBookingValue: paid.length ? Math.round(revenue / paid.length) : 0,
    newCustomers,
    repeatCustomers: repeat.size,
    newTechnicians,
    averageRating: Math.round((ratingAgg._avg.rating ?? 0) * 10) / 10,
    ratings: ratingAgg._count._all,
    daily: [...days.values()],
    topServices: group((b) => b.service.name),
    topLocations: group((b) => (b.addressSnapshot as { villageTown?: string } | null)?.villageTown ?? ''),
    technicianPerformance,
  };
}

// ─── Settings (whitelisted, validated) ───────────────────────────────────

const SETTINGS: Record<string, { description: string; schema: z.ZodType; default: unknown }> = {
  'pricing.taxPercent': { description: 'GST % applied to new bookings and extra work', schema: z.number().min(0).max(28), default: 18 },
  'commission.globalPercent': { description: 'Default FIXORA commission % (overridden by category / service / technician rules)', schema: z.number().min(0).max(50), default: 15 },
  'dispatch.requestTimeoutSeconds': { description: 'Seconds a technician has to accept an automatic job offer', schema: z.number().int().min(10).max(600), default: 30 },
  'dispatch.maxAttempts': { description: 'Automatic offers per booking before handing over to operations', schema: z.number().int().min(1).max(20), default: 5 },
  'dispatch.searchRadiusKm': { description: 'Maximum distance for automatic assignment', schema: z.number().min(1).max(50), default: 15 },
  'dispatch.weights': {
    description: 'Ranking weights (skill, distance, rating, workload)',
    schema: z.object({ skill: z.number().min(0).max(5), distance: z.number().min(0).max(5), rating: z.number().min(0).max(5), workload: z.number().min(0).max(5) }),
    default: { skill: 1, distance: 0.5, rating: 0.3, workload: 0.2 },
  },
  'support.phone': { description: 'Support phone shown to users', schema: z.string().min(6).max(20), default: '+91 90000 00000' },
  'support.email': { description: 'Support email shown to users', schema: z.email(), default: 'support@fixora.local' },
};

export async function getSettings(): Promise<SettingDto[]> {
  const [rows, global] = await Promise.all([prisma.setting.findMany(), prisma.commission.findFirst({ where: { scope: 'GLOBAL', isActive: true } })]);
  return Object.entries(SETTINGS).map(([key, def]) => {
    const row = rows.find((r) => r.key === key);
    const value = key === 'commission.globalPercent' ? (global?.type === 'PERCENTAGE' ? global.value : def.default) : (row?.value ?? def.default);
    return { key, value, description: def.description, updatedAt: row?.updatedAt.toISOString() ?? global?.updatedAt.toISOString() ?? null };
  });
}

export async function updateSetting(actor: Actor, key: string, value: unknown, ip?: string) {
  const def = SETTINGS[key];
  if (!def) throw AppError.notFound('Unknown setting', 'UNKNOWN_SETTING');
  const parsed = def.schema.safeParse(value);
  if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid value', 'VALIDATION_ERROR');
  const old = (await getSettings()).find((s) => s.key === key)?.value;
  if (key === 'commission.globalPercent') {
    const existing = await prisma.commission.findFirst({ where: { scope: 'GLOBAL' } });
    if (existing) await prisma.commission.update({ where: { id: existing.id }, data: { type: 'PERCENTAGE', value: parsed.data as number, isActive: true } });
    else await prisma.commission.create({ data: { scope: 'GLOBAL', type: 'PERCENTAGE', value: parsed.data as number } });
  } else {
    await prisma.setting.upsert({
      where: { key },
      update: { value: parsed.data as object, updatedById: actor.userId },
      create: { key, value: parsed.data as object, description: def.description, updatedById: actor.userId },
    });
  }
  clearSettingsCache();
  await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: 'SETTING_CHANGED', entity: 'Setting', entityId: key, oldValue: old, newValue: parsed.data, ip });
}

// ─── Audit log ───────────────────────────────────────────────────────────

export async function auditLogs(q: { action?: string; entity?: string; q?: string; page: number; pageSize: number }): Promise<Paged<AuditLogDto>> {
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action && { action: q.action }),
    ...(q.entity && { entity: q.entity }),
    ...(q.q && { OR: [{ entityId: { contains: q.q } }, { actor: { name: { contains: q.q } } }] }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({ where, include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({ id: r.id, actorName: r.actor?.name ?? null, actorRole: r.actorRole, action: r.action, entity: r.entity, entityId: r.entityId, oldValue: r.oldValue, newValue: r.newValue, ip: r.ip, createdAt: r.createdAt.toISOString() })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

export async function auditActions() {
  return (await prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } })).map((a) => a.action);
}

// ─── System status ───────────────────────────────────────────────────────

export async function systemStatus(): Promise<SystemStatusDto> {
  const t = Date.now();
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const latencyMs = Date.now() - t;
  const [searching, pendingPush] = await Promise.all([
    prisma.booking.count({ where: { status: 'SEARCHING' } }),
    prisma.notification.count({ where: { pushedAt: null } }),
  ]);
  return {
    environment: env.NODE_ENV,
    version: '1.0.0',
    database: { ok: dbOk, latencyMs },
    integrations: [
      { name: 'SMS / OTP', configured: env.OTP_PROVIDER !== 'console', detail: env.OTP_PROVIDER === 'console' ? 'Development console (codes shown on screen)' : 'MSG91 SMS (DLT template)' },
      { name: 'Razorpay payments', configured: razorpayConfigured(), detail: razorpayConfigured() ? `Key ${env.RAZORPAY_KEY_ID.slice(0, 12)}…` : 'Cash / UPI only' },
      { name: 'Razorpay webhooks', configured: !!env.RAZORPAY_WEBHOOK_SECRET, detail: '/api/v1/payments/razorpay/webhook' },
      { name: 'Google Maps', configured: !!env.GOOGLE_MAPS_API_KEY, detail: env.GOOGLE_MAPS_API_KEY ? 'Geocoding + maps' : 'OpenStreetMap fallback (development)' },
      { name: 'Push notifications (FCM)', configured: pushEnabled(), detail: pushEnabled() ? `Project ${env.FIREBASE_PROJECT_ID}` : 'In-app + live socket only' },
      { name: 'File storage', configured: env.STORAGE_DRIVER !== 'local', detail: env.STORAGE_DRIVER === 'local' ? 'Local disk (backend/uploads)' : env.STORAGE_DRIVER },
      { name: 'Field encryption key', configured: !!env.DATA_ENCRYPTION_KEY, detail: env.DATA_ENCRYPTION_KEY ? 'AES-256-GCM' : 'Derived development key' },
    ],
    workers: [
      { name: 'Dispatch', detail: `${searching} booking(s) searching for a technician` },
      { name: 'Notification outbox', detail: `${pendingPush} waiting for delivery` },
    ],
  };
}
