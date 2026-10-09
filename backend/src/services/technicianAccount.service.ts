import { resolveLocality } from './booking.service';
import {
  BookingStatus as B,
  Role,
  SocketEvent,
  type AuthSession,
  type PayoutDetailsDto,
  type TechnicianDocumentDto,
  type TechnicianPerformanceDto,
  type TechnicianServicesDto,
  type WalletDto,
} from '@fixora/shared-types';
import { haversineKm } from '@fixora/shared-utils';
import { prisma } from '../config/prisma';
import type { DocumentType } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { encryptField } from '../utils/crypto';
import { toAuthUser, userInclude } from './auth.service';
import { emitBookingEvent, emitToStaff } from './realtime.service';
import { isOwnPrivatePath, isOwnUploadPath } from './storage.service';
import { technicianOf, toProfileSummary } from './technician.service';
import { issueRefreshToken, revokeAllForUser, signAccessToken, type ClientMeta } from './token.service';

const TOWN_SPEED_KMPH = 20;
/** Ignore location pings closer together than this (battery / network friendly). */
/** Pings closer than this are ignored (the app sends every 5 s while travelling, 30 s otherwise). */
const MIN_PING_MS = 4000;
const lastPing = new Map<string, number>();

// ─── Live location ───────────────────────────────────────────────────────

/**
 * Technician GPS ping. Updates their position, pushes it (with ETA) to the
 * customer of any job they're travelling to, and to the admin live map.
 */
export async function updateLocation(userId: string, lat: number, lng: number) {
  const now = Date.now();
  if (now - (lastPing.get(userId) ?? 0) < MIN_PING_MS) return { accepted: false, travelling: false };
  lastPing.set(userId, now);

  const tech = await prisma.technician.update({
    where: { userId },
    data: { lastLatitude: lat, lastLongitude: lng, lastLocationAt: new Date(now) },
    select: { id: true, isOnline: true, user: { select: { name: true } } },
  });
  const travelling = await prisma.booking.findMany({
    where: { technicianId: tech.id, status: { in: [B.TECHNICIAN_EN_ROUTE, B.TECHNICIAN_ARRIVED] } },
    select: { id: true, latitude: true, longitude: true, customer: { select: { userId: true } } },
  });
  for (const b of travelling) {
    const distanceKm = b.latitude != null && b.longitude != null ? Math.round(haversineKm(lat, lng, b.latitude, b.longitude) * 10) / 10 : null;
    emitBookingEvent(b.id, [b.customer.userId], SocketEvent.TECHNICIAN_LOCATION_UPDATED, {
      lat,
      lng,
      distanceKm,
      etaMinutes: distanceKm != null ? Math.max(2, Math.ceil((distanceKm / TOWN_SPEED_KMPH) * 60)) : null,
    });
  }
  emitToStaff(SocketEvent.TECHNICIAN_LOCATION_UPDATED, { technicianId: tech.id, name: tech.user.name, lat, lng, isOnline: tech.isOnline });
  // The app pings faster while a customer is watching the technician travel.
  return { accepted: true, travelling: travelling.length > 0 };
}

/** Background ping from the app's "on duty" service: only for an active technician who is online. */
export async function updateDeviceLocation(userId: string, lat: number, lng: number) {
  const tech = await prisma.technician.findUnique({ where: { userId }, select: { isOnline: true, user: { select: { role: true, status: true } } } });
  if (!tech || tech.user.role !== 'TECHNICIAN' || tech.user.status !== 'ACTIVE') throw AppError.unauthorized('Invalid location key', 'INVALID_TOKEN');
  if (!tech.isOnline) return { accepted: false, travelling: false, online: false };
  return { ...(await updateLocation(userId, lat, lng)), online: true };
}

// ─── Profile & service area ──────────────────────────────────────────────

export interface ProfileInput {
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  experienceYears: number;
  bio?: string | null;
  languages: string[];
  serviceRadiusKm: number;
  addressLine?: string;
  villageTown: string;
  district: string;
  state: string;
  pincode: string;
  baseLatitude?: number | null;
  baseLongitude?: number | null;
  /** YYYY-MM-DD */
  dateOfBirth?: string;
  /** +91XXXXXXXXXX, or null to clear */
  alternatePhone?: string | null;
  hasOwnTools?: boolean;
  hasVehicle?: boolean;
}

/** Optional onboarding fields, applied only when sent. */
const extraProfile = (p: ProfileInput) => ({
  ...(p.alternatePhone !== undefined && { alternatePhone: p.alternatePhone }),
  ...(p.hasOwnTools !== undefined && { hasOwnTools: p.hasOwnTools }),
  ...(p.hasVehicle !== undefined && { hasVehicle: p.hasVehicle }),
});
const dobData = (p: ProfileInput) => (p.dateOfBirth ? { dateOfBirth: new Date(`${p.dateOfBirth}T00:00:00Z`) } : {});

export async function updateProfile(userId: string, p: ProfileInput) {
  if (p.avatarUrl && !isOwnUploadPath(p.avatarUrl)) throw AppError.badRequest('Invalid photo', 'INVALID_ATTACHMENT');
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: p.name,
      ...(p.email !== undefined && { email: p.email || null }),
      ...(p.avatarUrl !== undefined && { avatarUrl: p.avatarUrl }),
      ...dobData(p),
      technician: {
        update: {
          ...extraProfile(p),
          experienceYears: p.experienceYears,
          bio: p.bio ?? null,
          languages: p.languages,
          serviceRadiusKm: p.serviceRadiusKm,
          addressLine: p.addressLine ?? '',
          villageTown: p.villageTown,
          district: p.district,
          state: p.state,
          pincode: p.pincode,
          ...(p.baseLatitude != null && p.baseLongitude != null && { baseLatitude: p.baseLatitude, baseLongitude: p.baseLongitude }),
        },
      },
    },
  });
  return technicianDetails(userId);
}

export async function technicianDetails(userId: string) {
  const t = await prisma.technician.findUniqueOrThrow({ where: { userId }, include: { user: { select: { email: true, dateOfBirth: true } } } });
  return {
    ...toProfileSummary(await technicianOf(userId)),
    email: t.user.email,
    dateOfBirth: t.user.dateOfBirth ? t.user.dateOfBirth.toISOString().slice(0, 10) : null,
    alternatePhone: t.alternatePhone,
    hasOwnTools: t.hasOwnTools,
    hasVehicle: t.hasVehicle,
    bio: t.bio,
    languages: Array.isArray(t.languages) ? (t.languages as string[]) : [],
    serviceRadiusKm: t.serviceRadiusKm,
    addressLine: t.addressLine,
    villageTown: t.villageTown,
    district: t.district,
    state: t.state,
    pincode: t.pincode,
    baseLatitude: t.baseLatitude,
    baseLongitude: t.baseLongitude,
    rejectionReason: t.rejectionReason,
    kyc: { aadhaarLast4: t.aadhaarLast4, panNumber: t.panNumber },
  };
}

// ─── Payout details (bank account encrypted at rest) ─────────────────────

export async function getPayoutDetails(userId: string): Promise<PayoutDetailsDto> {
  const t = await prisma.technician.findUniqueOrThrow({ where: { userId } });
  return { payoutUpiId: t.payoutUpiId, bankAccountHolder: t.bankAccountHolder, bankIfsc: t.bankIfsc, bankAccountLast4: t.bankAccountLast4 };
}

export async function setPayoutDetails(userId: string, p: { payoutUpiId?: string | null; bankAccountHolder?: string | null; bankIfsc?: string | null; bankAccountNumber?: string | null }) {
  await prisma.technician.update({
    where: { userId },
    data: {
      payoutUpiId: p.payoutUpiId || null,
      bankAccountHolder: p.bankAccountHolder || null,
      bankIfsc: p.bankIfsc?.toUpperCase() || null,
      ...(p.bankAccountNumber
        ? { bankAccountEnc: encryptField(p.bankAccountNumber), bankAccountLast4: p.bankAccountNumber.slice(-4) }
        : p.bankAccountNumber === null
          ? { bankAccountEnc: null, bankAccountLast4: null }
          : {}),
    },
  });
  return getPayoutDetails(userId);
}

// ─── KYC documents (private files) ───────────────────────────────────────

const toDoc = (d: { id: string; type: DocumentType; fileUrl: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; remarks: string | null; createdAt: Date }): TechnicianDocumentDto => ({
  id: d.id,
  type: d.type,
  fileUrl: d.fileUrl,
  status: d.status,
  remarks: d.remarks,
  createdAt: d.createdAt.toISOString(),
});

export async function listDocuments(userId: string) {
  const tech = await technicianOf(userId);
  const rows = await prisma.technicianDocument.findMany({ where: { technicianId: tech.id }, orderBy: { createdAt: 'desc' } });
  return rows.map(toDoc);
}

/** A private upload that isn't attached to anyone yet (so nobody can claim another person's file). */
async function assertFreshPrivateFile(fileUrl: string) {
  if (!isOwnPrivatePath(fileUrl)) throw AppError.badRequest('Upload the document first', 'INVALID_ATTACHMENT');
  const used =
    (await prisma.technicianDocument.count({ where: { fileUrl } })) +
    (await prisma.franchise.count({ where: { OR: [{ aadhaarFrontUrl: fileUrl }, { aadhaarBackUrl: fileUrl }, { panPhotoUrl: fileUrl }, { agreementUrl: fileUrl }] } }));
  if (used) throw AppError.badRequest('Upload the document again', 'INVALID_ATTACHMENT');
}

export async function addDocument(userId: string, type: DocumentType, fileUrl: string) {
  await assertFreshPrivateFile(fileUrl);
  const tech = await technicianOf(userId);
  const doc = await prisma.technicianDocument.create({ data: { technicianId: tech.id, type, fileUrl } });
  return toDoc(doc);
}

export async function deleteDocument(userId: string, id: string) {
  const tech = await technicianOf(userId);
  const { count } = await prisma.technicianDocument.deleteMany({ where: { id, technicianId: tech.id, status: { not: 'APPROVED' } } });
  if (!count) throw AppError.notFound('Document not found (approved documents cannot be removed)', 'DOCUMENT_NOT_FOUND');
}

// ─── Wallet, reviews, performance ────────────────────────────────────────

export async function wallet(userId: string): Promise<WalletDto> {
  const tech = await technicianOf(userId);
  const w = await prisma.technicianWallet.upsert({ where: { technicianId: tech.id }, update: {}, create: { technicianId: tech.id } });
  const txns = await prisma.walletTransaction.findMany({ where: { walletId: w.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  return {
    balance: w.balance,
    totalEarned: w.totalEarned,
    totalPaidOut: w.totalPaidOut,
    transactions: txns.map((t) => ({ id: t.id, type: t.type, amount: t.amount, balanceAfter: t.balanceAfter, description: t.description, createdAt: t.createdAt.toISOString() })),
  };
}

export async function myReviews(userId: string) {
  const tech = await technicianOf(userId);
  const rows = await prisma.review.findMany({
    where: { technicianId: tech.id, isVisible: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { customer: { include: { user: { select: { name: true } } } }, booking: { select: { code: true, service: { select: { name: true } } } } },
  });
  return rows.map((r) => {
    const [first = 'Customer', last] = (r.customer.user.name ?? 'Customer').split(/\s+/);
    return { id: r.id, rating: r.rating, comment: r.comment, customerName: last ? `${first} ${last[0]}.` : first, service: r.booking.service.name, bookingCode: r.booking.code, createdAt: r.createdAt.toISOString() };
  });
}

export async function performance(userId: string): Promise<TechnicianPerformanceDto> {
  const tech = await technicianOf(userId);
  const [offers, accepted, completed, cancelled, breakdown] = await Promise.all([
    prisma.bookingAssignment.count({ where: { technicianId: tech.id, status: { not: 'OFFERED' } } }),
    prisma.bookingAssignment.count({ where: { technicianId: tech.id, status: { in: ['ACCEPTED', 'REASSIGNED'] } } }),
    prisma.booking.count({ where: { technicianId: tech.id, status: { in: [B.SERVICE_COMPLETED, B.PAYMENT_PENDING, B.PAYMENT_COMPLETED] } } }),
    prisma.booking.count({ where: { technicianId: tech.id, status: B.TECHNICIAN_CANCELLED } }),
    prisma.review.groupBy({ by: ['rating'], where: { technicianId: tech.id, isVisible: true }, _count: { _all: true } }),
  ]);
  return {
    offersReceived: offers,
    offersAccepted: accepted,
    acceptanceRate: offers ? Math.round((accepted / offers) * 100) : null,
    jobsCompleted: completed,
    jobsCancelled: cancelled,
    ratingAvg: Math.round(tech.ratingAvg * 10) / 10,
    ratingCount: tech.ratingCount,
    ratingBreakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: breakdown.find((b) => b.rating === stars)?._count._all ?? 0 })),
  };
}

// ─── Partner registration (spec §25) ─────────────────────────────────────

export interface PartnerRegistration extends ProfileInput {
  skills: string[];
  serviceIds?: string[];
  /** Payout + ID (required at sign-up; account and Aadhaar are stored encrypted). */
  bankAccountHolder: string;
  bankAccountNumber: string;
  bankIfsc: string;
  payoutUpiId?: string | null;
  aadhaarNumber: string;
  panNumber?: string | null;
  /** ID proofs uploaded (privately) during sign-up — shown to the verification team. */
  kycDocuments?: { type: DocumentType; fileUrl: string }[];
}

/**
 * A signed-in customer (fresh phone login) registers as a RapidFix partner. The
 * account becomes a TECHNICIAN pending verification; a new session is issued
 * so the app moves straight into the partner area.
 */
export async function registerPartner(userId: string, input: PartnerRegistration, meta: ClientMeta): Promise<{ session: AuthSession; refreshToken: string }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { technician: true, customer: { select: { id: true } } } });
  if (user.role !== Role.CUSTOMER) throw AppError.conflict('This account is already registered with a different role.', 'ALREADY_REGISTERED');
  if (user.customer) {
    const active = await prisma.booking.count({ where: { customerId: user.customer.id, status: { notIn: [B.PAYMENT_COMPLETED, B.CUSTOMER_CANCELLED, B.ADMIN_CANCELLED, B.TECHNICIAN_CANCELLED, B.REFUNDED, B.NO_SHOW] } } });
    if (active) throw AppError.conflict('Finish your open bookings before registering as a partner.', 'ACTIVE_BOOKINGS');
  }
  if (input.email && (await prisma.user.findFirst({ where: { email: input.email, NOT: { id: userId } }, select: { id: true } }))) {
    throw AppError.conflict('This email is already used by another account.', 'EMAIL_TAKEN');
  }
  const categories = await prisma.serviceCategory.findMany({ where: { id: { in: input.skills }, isActive: true }, select: { id: true } });
  if (!categories.length) throw AppError.badRequest('Choose at least one service you provide', 'SKILLS_REQUIRED');
  const kycDocuments = input.kycDocuments ?? [];
  // A photo of the Aadhaar card is mandatory: the verification team must see it.
  if (!kycDocuments.some((d) => d.type === 'AADHAAR')) {
    throw AppError.badRequest('Add a photo of your Aadhaar card (front) to register.', 'AADHAAR_PHOTO_REQUIRED');
  }
  for (const d of kycDocuments) await assertFreshPrivateFile(d.fileUrl);
  const services = await pickableServices(categories.map((c) => c.id), input.serviceIds);

  const profile = {
    experienceYears: input.experienceYears,
    bio: input.bio ?? null,
    languages: input.languages,
    serviceRadiusKm: input.serviceRadiusKm,
    addressLine: input.addressLine ?? '',
    villageTown: input.villageTown,
    district: input.district,
    state: input.state,
    pincode: input.pincode,
    baseLatitude: input.baseLatitude ?? null,
    baseLongitude: input.baseLongitude ?? null,
    // The live position comes only from the phone's GPS (app open / online), never from the home
    // address — until the first ping, jobs are matched by town / district.
    lastLatitude: null,
    lastLongitude: null,
    lastLocationAt: null,
    ...extraProfile(input),
    verificationStatus: 'PENDING' as const,
    isOnline: false,
    bankAccountHolder: input.bankAccountHolder,
    bankIfsc: input.bankIfsc.toUpperCase(),
    bankAccountEnc: encryptField(input.bankAccountNumber),
    bankAccountLast4: input.bankAccountNumber.slice(-4),
    payoutUpiId: input.payoutUpiId || null,
    aadhaarEnc: encryptField(input.aadhaarNumber),
    aadhaarLast4: input.aadhaarNumber.slice(-4),
    panNumber: input.panNumber ? input.panNumber.toUpperCase() : null,
    // Joins the franchise that runs the partner's town (verified by that franchise's manager).
    franchiseId: (await resolveLocality(input.baseLatitude, input.baseLongitude, input.villageTown)).franchiseId,
  };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { role: Role.TECHNICIAN, name: input.name, ...(input.email && { email: input.email }), ...(input.avatarUrl && { avatarUrl: input.avatarUrl }), ...dobData(input) },
    });
    const tech = user.technician
      ? await tx.technician.update({ where: { id: user.technician.id }, data: profile })
      : await tx.technician.create({ data: { userId, ...profile, wallet: { create: {} } } });
    await tx.technicianSkill.deleteMany({ where: { technicianId: tech.id } });
    await tx.technicianSkill.createMany({ data: categories.map((c) => ({ technicianId: tech.id, categoryId: c.id })) });
    await tx.technicianService.deleteMany({ where: { technicianId: tech.id } });
    if (services.length) await tx.technicianService.createMany({ data: services.map((serviceId) => ({ technicianId: tech.id, serviceId })) });
    if (kycDocuments.length) await tx.technicianDocument.createMany({ data: kycDocuments.map((d) => ({ technicianId: tech.id, type: d.type, fileUrl: d.fileUrl })) });
    const manager = profile.franchiseId ? await tx.franchise.findUnique({ where: { id: profile.franchiseId }, select: { userId: true } }) : null;
    const staff = [
      ...(await tx.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS'] }, status: 'ACTIVE' }, select: { id: true } })),
      ...(manager ? [{ id: manager.userId }] : []),
    ];
    if (staff.length) {
      await tx.notification.createMany({
        data: staff.map((s) => ({ userId: s.id, type: 'NEW_TECHNICIAN', title: 'New partner registration', body: `${input.name} (${input.villageTown}) is waiting for verification.`, data: { technicianId: tech.id } })),
      });
    }
  });

  // Old customer sessions carry the old role — replace them.
  await revokeAllForUser(userId);
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude });
  const { token: accessToken, expiresIn } = signAccessToken(fresh.id, fresh.role);
  const refresh = await issueRefreshToken(fresh.id, meta);
  return { session: { user: toAuthUser(fresh), accessToken, expiresIn }, refreshToken: refresh.token };
}

/**
 * The specific services a technician picked, kept only when they belong to the technician's
 * categories (the "Technician Visit" of a category isn't pickable: every technician in it does visits).
 */
export async function pickableServices(categoryIds: string[], serviceIds: string[] | undefined): Promise<string[]> {
  if (!serviceIds?.length) return [];
  const rows = await prisma.service.findMany({
    where: { id: { in: serviceIds }, isActive: true, categoryId: { in: categoryIds }, NOT: { slug: { endsWith: '-technician-visit' } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** The technician's categories with their services; none picked in a category = all ticked (does all of it). */
export async function myServices(userId: string): Promise<TechnicianServicesDto> {
  const tech = await prisma.technician.findUniqueOrThrow({
    where: { userId },
    select: { skills: { select: { category: { select: { id: true, name: true, sortOrder: true, isActive: true } } } }, services: { select: { serviceId: true } } },
  });
  const picked = new Set(tech.services.map((s) => s.serviceId));
  const categories = tech.skills.map((s) => s.category).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const services = await prisma.service.findMany({
    where: { categoryId: { in: categories.map((c) => c.id) }, isActive: true, NOT: { slug: { endsWith: '-technician-visit' } } },
    select: { id: true, name: true, categoryId: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return {
    categories: categories.map((c) => {
      const list = services.filter((s) => s.categoryId === c.id);
      const any = list.some((s) => picked.has(s.id));
      return { id: c.id, name: c.name, services: list.map((s) => ({ id: s.id, name: s.name, selected: !any || picked.has(s.id) })) };
    }),
  };
}

/** Replace the technician's picks. A category where everything is ticked is stored as "no picks" (= all). */
export async function setMyServices(userId: string, serviceIds: string[]): Promise<TechnicianServicesDto> {
  const tech = await prisma.technician.findUniqueOrThrow({ where: { userId }, select: { id: true, skills: { select: { categoryId: true } } } });
  const categoryIds = tech.skills.map((s) => s.categoryId);
  const keep = await pickableServices(categoryIds, serviceIds);
  const all = await prisma.service.findMany({
    where: { categoryId: { in: categoryIds }, isActive: true, NOT: { slug: { endsWith: '-technician-visit' } } },
    select: { id: true, categoryId: true },
  });
  const chosen = new Set(keep);
  for (const categoryId of categoryIds) {
    const inCat = all.filter((s) => s.categoryId === categoryId);
    if (inCat.length && !inCat.some((s) => chosen.has(s.id))) {
      throw AppError.badRequest('Choose at least one service in each type of work you do.', 'SERVICES_REQUIRED');
    }
    if (inCat.every((s) => chosen.has(s.id))) inCat.forEach((s) => chosen.delete(s.id));
  }
  await prisma.$transaction([
    prisma.technicianService.deleteMany({ where: { technicianId: tech.id } }),
    prisma.technicianService.createMany({ data: [...chosen].map((serviceId) => ({ technicianId: tech.id, serviceId })) }),
  ]);
  return myServices(userId);
}
