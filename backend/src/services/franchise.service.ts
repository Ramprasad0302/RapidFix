import { haversineKm, toE164India } from '@fixora/shared-utils';
import {
  Role,
  type FranchiseDetailDto,
  type FranchiseInput,
  type FranchiseLocalityDto,
  type FranchiseReportDto,
  type FranchiseRowDto,
  type FranchiseStatsDto,
  type FranchiseStatus,
  type LocationInput,
  type MyFranchiseDto,
} from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { decryptField, encryptField, randomReferralCode } from '../utils/crypto';
import { recordAudit } from './audit.service';
import { clearServiceAreaCache } from './serviceArea.service';
import { istMonthStart } from './technician.service';
import { revokeAllForUser } from './token.service';

/**
 * Franchises: a franchise manager (FRANCHISE_ADMIN) runs one town and its
 * localities. Bookings in those localities, the technicians based there and
 * their customers belong to the franchise; the manager sees only those, and
 * earns the agreed % of RapidFix's commission on them. Head office sees all.
 */

type Actor = { userId: string; role: Role };

const DONE = ['SERVICE_COMPLETED', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED'] as const;
const CANCELLED = ['CUSTOMER_CANCELLED', 'TECHNICIAN_CANCELLED', 'ADMIN_CANCELLED', 'REFUNDED'] as const;

const localityDto = (l: { id: string; name: string; district: string; state: string; radiusKm: number; isActive: boolean }): FranchiseLocalityDto => ({
  id: l.id,
  name: l.name,
  district: l.district,
  state: l.state,
  radiusKm: l.radiusKm,
  isActive: l.isActive,
});

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const share = (commission: number, percent: number) => Math.round((commission * percent) / 100);
export const maskAadhaar = (last4: string) => `XXXX XXXX ${last4}`;

// ─── Numbers ─────────────────────────────────────────────────────────────

/** Bookings, money and people for each franchise (null key = head office / no franchise). */
async function stats(range: { from?: Date; to?: Date }): Promise<Map<string | null, Omit<FranchiseStatsDto, 'share'>>> {
  const created = range.from || range.to ? { createdAt: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } } : {};
  const [all, done, cancelled, money, techs, customers] = await Promise.all([
    prisma.booking.groupBy({ by: ['franchiseId'], where: created, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ['franchiseId'], where: { ...created, status: { in: [...DONE] } }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ['franchiseId'], where: { ...created, status: { in: [...CANCELLED] } }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ['franchiseId'], where: { ...created, status: 'PAYMENT_COMPLETED' }, _sum: { totalAmount: true, commissionAmount: true } }),
    prisma.technician.groupBy({ by: ['franchiseId'], where: { verificationStatus: 'VERIFIED' }, _count: { _all: true } }),
    prisma.customer.groupBy({ by: ['franchiseId'], _count: { _all: true } }),
  ]);
  const out = new Map<string | null, Omit<FranchiseStatsDto, 'share'>>();
  const row = (k: string | null) => {
    if (!out.has(k)) out.set(k, { bookings: 0, completed: 0, cancelled: 0, revenue: 0, commission: 0, technicians: 0, customers: 0 });
    return out.get(k)!;
  };
  for (const r of all) row(r.franchiseId).bookings = r._count._all;
  for (const r of done) row(r.franchiseId).completed = r._count._all;
  for (const r of cancelled) row(r.franchiseId).cancelled = r._count._all;
  for (const r of money) Object.assign(row(r.franchiseId), { revenue: r._sum.totalAmount ?? 0, commission: r._sum.commissionAmount ?? 0 });
  for (const r of techs) row(r.franchiseId).technicians = r._count._all;
  for (const r of customers) row(r.franchiseId).customers = r._count._all;
  return out;
}

const empty: Omit<FranchiseStatsDto, 'share'> = { bookings: 0, completed: 0, cancelled: 0, revenue: 0, commission: 0, technicians: 0, customers: 0 };
const withShare = (s: Omit<FranchiseStatsDto, 'share'> | undefined, percent: number): FranchiseStatsDto => {
  const v = s ?? empty;
  return { ...v, share: share(v.commission, percent) };
};

const rowInclude = { locations: { orderBy: { name: 'asc' } } } as const satisfies Prisma.FranchiseInclude;
type Row = Prisma.FranchiseGetPayload<{ include: typeof rowInclude }>;

function toRow(f: Row, month: Map<string | null, Omit<FranchiseStatsDto, 'share'>>, total: Map<string | null, Omit<FranchiseStatsDto, 'share'>>): FranchiseRowDto {
  const pct = Number(f.commissionPercent);
  return {
    id: f.id,
    code: f.code,
    name: f.name,
    town: f.town,
    district: f.district,
    state: f.state,
    status: f.status,
    ownerName: f.ownerName,
    ownerPhone: f.ownerPhone,
    commissionPercent: pct,
    agreementStart: dateOnly(f.agreementStart)!,
    agreementEnd: dateOnly(f.agreementEnd),
    localities: f.locations.map(localityDto),
    month: withShare(month.get(f.id), pct),
    total: withShare(total.get(f.id), pct),
    createdAt: f.createdAt.toISOString(),
  };
}

export async function listFranchises(): Promise<FranchiseRowDto[]> {
  const [rows, month, total] = await Promise.all([
    prisma.franchise.findMany({ include: rowInclude, orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
    stats({ from: istMonthStart() }),
    stats({}),
  ]);
  return rows.map((f) => toRow(f, month, total));
}

export async function franchiseDetail(id: string): Promise<FranchiseDetailDto> {
  const f = await prisma.franchise.findUnique({ where: { id }, include: rowInclude });
  if (!f) throw AppError.notFound('Franchise not found', 'FRANCHISE_NOT_FOUND');
  const [month, total] = await Promise.all([stats({ from: istMonthStart() }), stats({})]);
  return {
    ...toRow(f, month, total),
    userId: f.userId,
    ownerEmail: f.ownerEmail,
    ownerDateOfBirth: dateOnly(f.ownerDateOfBirth),
    ownerAddress: f.ownerAddress,
    ownerPincode: f.ownerPincode,
    aadhaarMasked: maskAadhaar(f.aadhaarLast4),
    aadhaarFrontUrl: f.aadhaarFrontUrl,
    aadhaarBackUrl: f.aadhaarBackUrl,
    panNumber: f.panNumber,
    panPhotoUrl: f.panPhotoUrl,
    gstin: f.gstin,
    businessName: f.businessName,
    agreementUrl: f.agreementUrl,
    depositAmount: f.depositAmount,
    bankAccountHolder: f.bankAccountHolder,
    bankIfsc: f.bankIfsc,
    bankAccountLast4: f.bankAccountLast4,
    upiId: f.upiId,
    emergencyContact: f.emergencyContact,
    notes: f.notes,
  };
}

/** Full Aadhaar number — head office only, every view is audited. */
export async function revealAadhaar(actor: Actor, id: string, ip?: string) {
  const f = await prisma.franchise.findUnique({ where: { id }, select: { aadhaarEnc: true } });
  if (!f) throw AppError.notFound('Franchise not found', 'FRANCHISE_NOT_FOUND');
  await recordAudit({ actorId: actor.userId, actorRole: actor.role, action: 'FRANCHISE_AADHAAR_VIEWED', entity: 'Franchise', entityId: id, ip });
  const n = decryptField(f.aadhaarEnc);
  return { aadhaar: `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8)}` };
}

export async function myFranchise(userId: string): Promise<MyFranchiseDto> {
  const f = await prisma.franchise.findUnique({ where: { userId }, include: rowInclude });
  if (!f) throw AppError.notFound('No franchise is linked to this account', 'NO_FRANCHISE');
  const [month, total] = await Promise.all([stats({ from: istMonthStart() }), stats({})]);
  const r = toRow(f, month, total);
  return { id: r.id, code: r.code, name: r.name, town: r.town, commissionPercent: r.commissionPercent, localities: r.localities, month: r.month, total: r.total };
}

// ─── Create / edit ───────────────────────────────────────────────────────

async function nextCode() {
  const last = await prisma.franchise.findFirst({ orderBy: { code: 'desc' }, select: { code: true } });
  const n = last ? Number(last.code.replace(/\D/g, '')) + 1 : 1;
  return `FR-${String(n).padStart(4, '0')}`;
}

/** Each locality belongs to at most one franchise. */
async function assertLocalitiesFree(localityIds: string[], franchiseId: string | null) {
  if (!localityIds.length) return;
  const found = await prisma.location.findMany({ where: { id: { in: localityIds } }, select: { id: true, name: true, franchiseId: true, franchise: { select: { name: true } } } });
  if (found.length !== new Set(localityIds).size) throw AppError.badRequest('One of the chosen localities no longer exists.', 'LOCALITY_NOT_FOUND');
  const taken = found.find((l) => l.franchiseId && l.franchiseId !== franchiseId);
  if (taken) throw AppError.conflict(`${taken.name} is already part of ${taken.franchise?.name ?? 'another franchise'}.`, 'LOCALITY_TAKEN');
}

function profileData(input: FranchiseInput) {
  return {
    name: input.name,
    town: input.town,
    district: input.district,
    state: input.state,
    ownerName: input.ownerName,
    ownerEmail: input.ownerEmail || null,
    ownerDateOfBirth: input.ownerDateOfBirth ? new Date(`${input.ownerDateOfBirth}T00:00:00Z`) : null,
    ownerAddress: input.ownerAddress,
    ownerPincode: input.ownerPincode,
    aadhaarFrontUrl: input.aadhaarFrontUrl,
    aadhaarBackUrl: input.aadhaarBackUrl || null,
    panNumber: input.panNumber ? input.panNumber.toUpperCase() : null,
    panPhotoUrl: input.panPhotoUrl || null,
    gstin: input.gstin ? input.gstin.toUpperCase() : null,
    businessName: input.businessName || null,
    commissionPercent: new Prisma.Decimal(input.commissionPercent),
    agreementStart: new Date(`${input.agreementStart}T00:00:00Z`),
    agreementEnd: input.agreementEnd ? new Date(`${input.agreementEnd}T00:00:00Z`) : null,
    agreementUrl: input.agreementUrl || null,
    depositAmount: input.depositAmount ?? 0,
    bankAccountHolder: input.bankAccountHolder || null,
    bankIfsc: input.bankIfsc ? input.bankIfsc.toUpperCase() : null,
    upiId: input.upiId || null,
    emergencyContact: input.emergencyContact ? toE164India(input.emergencyContact) : null,
    notes: input.notes || null,
    ...(input.aadhaarNumber && { aadhaarEnc: encryptField(input.aadhaarNumber), aadhaarLast4: input.aadhaarNumber.slice(-4) }),
    ...(input.bankAccountNumber && { bankAccountEnc: encryptField(input.bankAccountNumber), bankAccountLast4: input.bankAccountNumber.slice(-4) }),
  };
}

/**
 * New franchise + its manager's login. The manager signs in with the given
 * mobile number (OTP). An existing customer account with that number is
 * upgraded; technician and staff numbers can't be used.
 */
export async function createFranchise(actor: Actor, input: FranchiseInput, ip?: string): Promise<FranchiseDetailDto> {
  if (!input.aadhaarNumber) throw AppError.badRequest('Enter the 12-digit Aadhaar number', 'AADHAAR_REQUIRED');
  const phone = toE164India(input.ownerPhone);
  await assertLocalitiesFree(input.localityIds, null);

  const existing = await prisma.user.findUnique({ where: { phone }, include: { franchise: true, customer: { select: { id: true } }, adminUser: { select: { id: true } } } });
  if (existing?.franchise) throw AppError.conflict('This mobile number already manages a franchise.', 'ALREADY_FRANCHISE_MANAGER');
  if (existing && existing.role !== Role.CUSTOMER) {
    throw AppError.conflict(`This mobile number belongs to a ${existing.role.toLowerCase().replace('_', ' ')} account. Use a different number for the franchise manager.`, 'PHONE_IN_USE');
  }
  if (existing?.customer) {
    const busy = await prisma.booking.count({ where: { customerId: existing.customer.id, status: { notIn: [...DONE, ...CANCELLED, 'PAYMENT_COMPLETED'] } } });
    if (busy) throw AppError.conflict('This customer has bookings in progress. Finish them before making them a franchise manager.', 'ACTIVE_BOOKINGS');
  }
  if (input.ownerEmail) {
    const emailOwner = await prisma.user.findFirst({ where: { email: input.ownerEmail, ...(existing && { id: { not: existing.id } }) }, select: { id: true } });
    if (emailOwner) throw AppError.conflict('This email is already used by another account.', 'EMAIL_IN_USE');
  }

  const code = await nextCode();
  const created = await prisma.$transaction(async (tx) => {
    const user = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { role: Role.FRANCHISE_ADMIN, name: input.ownerName, ...(input.ownerEmail && { email: input.ownerEmail }), status: 'ACTIVE' } })
      : await tx.user.create({
          data: { role: Role.FRANCHISE_ADMIN, phone, name: input.ownerName, email: input.ownerEmail || null, customer: { create: { referralCode: randomReferralCode() } } },
        });
    if (!existing?.adminUser) await tx.adminUser.create({ data: { userId: user.id, department: `Franchise ${code}` } });
    const f = await tx.franchise.create({
      data: { ...profileData(input), aadhaarEnc: encryptField(input.aadhaarNumber!), aadhaarLast4: input.aadhaarNumber!.slice(-4), code, ownerPhone: phone, userId: user.id, createdById: actor.userId },
    });
    // A franchise town takes bookings: attaching switches the locality on.
    if (input.localityIds.length) await tx.location.updateMany({ where: { id: { in: input.localityIds } }, data: { franchiseId: f.id, isActive: true } });
    await tx.notification.create({
      data: { userId: user.id, type: 'FRANCHISE', title: `Welcome to RapidFix ${input.town}`, body: `You now manage ${input.name}. Sign in with this mobile number to see your bookings, technicians and customers.`, data: { franchiseId: f.id } },
    });
    return f;
  });
  if (existing) await revokeAllForUser(existing.id);
  clearServiceAreaCache();
  await linkExisting(created.id);
  await recordAudit({ actorId: actor.userId, actorRole: actor.role, action: 'FRANCHISE_CREATED', entity: 'Franchise', entityId: created.id, newValue: { code, name: input.name, town: input.town, commissionPercent: input.commissionPercent, localities: input.localityIds }, ip });
  return franchiseDetail(created.id);
}

export async function updateFranchise(actor: Actor, id: string, input: FranchiseInput, ip?: string): Promise<FranchiseDetailDto> {
  const before = await prisma.franchise.findUnique({ where: { id }, include: { locations: { select: { id: true } } } });
  if (!before) throw AppError.notFound('Franchise not found', 'FRANCHISE_NOT_FOUND');
  if (toE164India(input.ownerPhone) !== before.ownerPhone) {
    throw AppError.badRequest("The manager's mobile number can't be changed. Create a new franchise for a new manager.", 'PHONE_FIXED');
  }
  await assertLocalitiesFree(input.localityIds, id);
  await prisma.$transaction(async (tx) => {
    await tx.franchise.update({ where: { id }, data: profileData(input) });
    await tx.user.update({ where: { id: before.userId }, data: { name: input.ownerName, ...(input.ownerEmail && { email: input.ownerEmail }) } });
    await tx.location.updateMany({ where: { franchiseId: id, id: { notIn: input.localityIds } }, data: { franchiseId: null } });
    if (input.localityIds.length) await tx.location.updateMany({ where: { id: { in: input.localityIds }, franchiseId: null }, data: { franchiseId: id, isActive: true } });
  });
  clearServiceAreaCache();
  await linkExisting(id);
  await recordAudit({
    actorId: actor.userId,
    actorRole: actor.role,
    action: 'FRANCHISE_UPDATED',
    entity: 'Franchise',
    entityId: id,
    oldValue: { commissionPercent: Number(before.commissionPercent), localities: before.locations.map((l) => l.id) },
    newValue: { commissionPercent: input.commissionPercent, localities: input.localityIds },
    ip,
  });
  return franchiseDetail(id);
}

/** Suspend / end a franchise. Its manager is signed out; new bookings go to head office until it's active again. */
export async function setFranchiseStatus(actor: Actor, id: string, status: FranchiseStatus, reason: string | undefined, ip?: string) {
  const f = await prisma.franchise.findUnique({ where: { id } });
  if (!f) throw AppError.notFound('Franchise not found', 'FRANCHISE_NOT_FOUND');
  await prisma.$transaction([
    prisma.franchise.update({ where: { id }, data: { status } }),
    prisma.user.update({ where: { id: f.userId }, data: { status: status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED' } }),
  ]);
  if (status !== 'ACTIVE') await revokeAllForUser(f.userId);
  await recordAudit({ actorId: actor.userId, actorRole: actor.role, action: 'FRANCHISE_STATUS', entity: 'Franchise', entityId: id, oldValue: { status: f.status }, newValue: { status, reason }, ip });
  return franchiseDetail(id);
}

/** Move a technician to a franchise (or back to head office). */
export async function setTechnicianFranchise(actor: Actor, technicianId: string, franchiseId: string | null, ip?: string) {
  const t = await prisma.technician.findUnique({ where: { id: technicianId }, select: { franchiseId: true } });
  if (!t) throw AppError.notFound('Technician not found', 'TECHNICIAN_NOT_FOUND');
  if (franchiseId && !(await prisma.franchise.count({ where: { id: franchiseId } }))) throw AppError.notFound('Franchise not found', 'FRANCHISE_NOT_FOUND');
  await prisma.technician.update({ where: { id: technicianId }, data: { franchiseId } });
  await recordAudit({ actorId: actor.userId, actorRole: actor.role, action: 'TECHNICIAN_FRANCHISE', entity: 'Technician', entityId: technicianId, oldValue: { franchiseId: t.franchiseId }, newValue: { franchiseId }, ip });
}

/**
 * After localities are attached: their earlier unassigned bookings, the
 * technicians based inside them and those bookings' customers join the franchise.
 */
export async function linkExisting(franchiseId: string) {
  const locations = await prisma.location.findMany({ where: { franchiseId } });
  if (!locations.length) return;
  await prisma.booking.updateMany({ where: { franchiseId: null, locationId: { in: locations.map((l) => l.id) } }, data: { franchiseId } });
  const techs = await prisma.technician.findMany({
    where: { franchiseId: null },
    select: { id: true, baseLatitude: true, baseLongitude: true, lastLatitude: true, lastLongitude: true, villageTown: true },
  });
  const inside = techs.filter((t) => {
    const lat = t.baseLatitude ?? t.lastLatitude;
    const lng = t.baseLongitude ?? t.lastLongitude;
    return locations.some((l) =>
      lat != null && lng != null ? haversineKm(lat, lng, l.latitude, l.longitude) <= l.radiusKm : l.name.toLowerCase() === t.villageTown.trim().toLowerCase(),
    );
  });
  if (inside.length) await prisma.technician.updateMany({ where: { id: { in: inside.map((t) => t.id) } }, data: { franchiseId } });
  await prisma.customer.updateMany({ where: { franchiseId: null, bookings: { some: { franchiseId } } }, data: { franchiseId } });
}

// ─── Localities (service area) ───────────────────────────────────────────

export async function createLocality(actor: Actor, input: LocationInput, ip?: string) {
  // Already listed (e.g. switched off): reuse it with the new map point and radius.
  const dupe = await prisma.location.findFirst({ where: { name: input.name, district: input.district, state: input.state } });
  if (dupe && input.franchiseId) await assertLocalitiesFree([dupe.id], input.franchiseId);
  const l = await prisma.location.upsert({
    where: { id: dupe?.id ?? '' },
    update: {
      latitude: input.latitude,
      longitude: input.longitude,
      radiusKm: input.radiusKm,
      isActive: input.isActive ?? true,
      ...(input.franchiseId !== undefined && { franchiseId: input.franchiseId }),
    },
    create: {
      name: input.name,
      district: input.district,
      state: input.state,
      latitude: input.latitude,
      longitude: input.longitude,
      radiusKm: input.radiusKm,
      isActive: input.isActive ?? true,
      franchiseId: input.franchiseId ?? null,
    },
  });
  clearServiceAreaCache();
  if (l.franchiseId) await linkExisting(l.franchiseId);
  await recordAudit({ actorId: actor.userId, actorRole: actor.role, action: 'SERVICE_AREA_CREATED', entity: 'Location', entityId: l.id, newValue: { ...input }, ip });
  return l;
}

/** Attach a locality to a franchise (or back to head office). */
export async function setLocalityFranchise(actor: Actor, locationId: string, franchiseId: string | null, ip?: string) {
  const l = await prisma.location.findUnique({ where: { id: locationId } });
  if (!l) throw AppError.notFound('Locality not found', 'LOCALITY_NOT_FOUND');
  if (franchiseId) {
    if (!(await prisma.franchise.count({ where: { id: franchiseId } }))) throw AppError.notFound('Franchise not found', 'FRANCHISE_NOT_FOUND');
    await assertLocalitiesFree([locationId], franchiseId);
  }
  await prisma.location.update({ where: { id: locationId }, data: { franchiseId, ...(franchiseId && { isActive: true }) } });
  clearServiceAreaCache();
  if (franchiseId) await linkExisting(franchiseId);
  await recordAudit({ actorId: actor.userId, actorRole: actor.role, action: 'LOCALITY_FRANCHISE', entity: 'Location', entityId: locationId, oldValue: { franchiseId: l.franchiseId }, newValue: { franchiseId }, ip });
}

// ─── Reports ─────────────────────────────────────────────────────────────

export async function franchiseReport(from: Date, to: Date): Promise<FranchiseReportDto> {
  const [franchises, s] = await Promise.all([prisma.franchise.findMany({ orderBy: { name: 'asc' } }), stats({ from, to })]);
  const rows: FranchiseReportDto['rows'] = franchises.map((f) => {
    const pct = Number(f.commissionPercent);
    return { franchiseId: f.id, code: f.code, name: f.name, status: f.status, commissionPercent: pct, ...withShare(s.get(f.id), pct) };
  });
  rows.push({ franchiseId: null, code: 'HQ', name: 'RapidFix direct (no franchise)', status: null, commissionPercent: 0, ...withShare(s.get(null), 0) });
  const totals = rows.reduce<FranchiseStatsDto>(
    (t, r) => ({
      bookings: t.bookings + r.bookings,
      completed: t.completed + r.completed,
      cancelled: t.cancelled + r.cancelled,
      revenue: t.revenue + r.revenue,
      commission: t.commission + r.commission,
      share: t.share + r.share,
      technicians: t.technicians + r.technicians,
      customers: t.customers + r.customers,
    }),
    { bookings: 0, completed: 0, cancelled: 0, revenue: 0, commission: 0, share: 0, technicians: 0, customers: 0 },
  );
  return { from: from.toISOString(), to: to.toISOString(), rows, totals };
}
