import { bookingScope, customerScope, technicianScope, type Scope } from '../franchiseScope';
import {
  hasPermission,
  Permission,
  type AdminCustomerDetailDto,
  type AdminCustomerRowDto,
  type AdminTechnicianDetailDto,
  type AdminTechnicianRowDto,
  type Paged,
  type Role,
  type TechnicianVerificationStatus,
} from '@fixora/shared-types';
import { prisma } from '../../config/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../utils/AppError';
import { decryptField } from '../../utils/crypto';
import { recordAudit } from '../audit.service';
import { technicianTitle } from '../booking.service';
import { istMonthStart } from '../technician.service';
import { revokeAllForUser } from '../token.service';
import { complaintInclude, toComplaint } from '../work.service';
import { rowInclude, toAdminRow } from './bookings';

type Actor = { userId: string; role: string };
const audit = (actor: Actor, action: string, entity: string, entityId: string, oldValue?: unknown, newValue?: unknown, ip?: string) =>
  recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action, entity, entityId, oldValue, newValue, ip });

// ─── Customers ───────────────────────────────────────────────────────────

const customerInclude = { user: true, franchise: { select: { name: true } }, _count: { select: { bookings: true, addresses: true } } } as const satisfies Prisma.CustomerInclude;

async function spentBy(customerIds: string[]) {
  const rows = await prisma.payment.groupBy({ by: ['bookingId'], where: { status: 'SUCCESS', booking: { customerId: { in: customerIds } } }, _sum: { amount: true } });
  const byBooking = await prisma.booking.findMany({ where: { id: { in: rows.map((r) => r.bookingId) } }, select: { id: true, customerId: true } });
  const map = new Map<string, number>();
  for (const r of rows) {
    const c = byBooking.find((b) => b.id === r.bookingId)?.customerId;
    if (c) map.set(c, (map.get(c) ?? 0) + (r._sum.amount ?? 0));
  }
  return map;
}

function toCustomerRow(c: Prisma.CustomerGetPayload<{ include: typeof customerInclude }>, spent: number): AdminCustomerRowDto {
  return {
    id: c.id,
    userId: c.userId,
    name: c.user.name,
    phone: c.user.phone,
    email: c.user.email,
    city: c.city,
    franchise: c.franchise?.name ?? null,
    status: c.user.status,
    bookings: c._count.bookings,
    spent,
    createdAt: c.createdAt.toISOString(),
    lastLoginAt: c.user.lastLoginAt?.toISOString() ?? null,
  };
}

export async function listCustomers(q: { q?: string; status?: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED'; page: number; pageSize: number }, scope: Scope = null): Promise<Paged<AdminCustomerRowDto>> {
  const term = q.q?.trim();
  const where: Prisma.CustomerWhereInput = {
    AND: [customerScope(scope)],
    user: {
      role: 'CUSTOMER',
      ...(q.status && { status: q.status }),
      ...(term && { OR: [{ name: { contains: term } }, { phone: { contains: term } }, { email: { contains: term } }] }),
    },
  };
  const [rows, total] = await prisma.$transaction([
    prisma.customer.findMany({ where, include: customerInclude, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.customer.count({ where }),
  ]);
  const spent = await spentBy(rows.map((r) => r.id));
  return { items: rows.map((r) => toCustomerRow(r, spent.get(r.id) ?? 0)), total, page: q.page, pageSize: q.pageSize };
}

export async function customerDetail(id: string, scope: Scope = null): Promise<AdminCustomerDetailDto> {
  const c = await prisma.customer.findUnique({ where: { id }, include: customerInclude });
  if (!c) throw AppError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
  const [bookings, payments, reviews, complaints, spent] = await Promise.all([
    prisma.booking.findMany({ where: { customerId: id, ...bookingScope(scope) }, include: rowInclude, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.payment.findMany({ where: { booking: { customerId: id, ...bookingScope(scope) } }, include: { booking: { select: { code: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.review.findMany({ where: { customerId: id }, include: { booking: { select: { service: { select: { name: true } } } }, technician: { select: { user: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } }),
    prisma.complaint.findMany({ where: { raisedById: c.userId }, include: complaintInclude, orderBy: { createdAt: 'desc' } }),
    spentBy([id]),
  ]);
  return {
    ...toCustomerRow(c, spent.get(id) ?? 0),
    referralCode: c.referralCode,
    addresses: c._count.addresses,
    bookingsList: bookings.map(toAdminRow),
    payments: payments.map((p) => ({ bookingCode: p.booking.code ?? '', amount: p.amount, method: p.method, status: p.status, paidAt: p.paidAt?.toISOString() ?? null })),
    reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, service: r.booking.service.name, technician: r.technician.user.name ?? 'Technician', createdAt: r.createdAt.toISOString() })),
    complaints: complaints.map(toComplaint),
  };
}

/** Suspend / block / reactivate any account. Suspension ends every session immediately. */
export async function setUserStatus(actor: Actor, userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED', reason: string | undefined, ip?: string) {
  if (actor.userId === userId) throw AppError.badRequest("You can't change your own account status", 'SELF_STATUS_CHANGE');
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { technician: { select: { id: true } } } });
  if (!user) throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  if (user.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') throw AppError.forbidden('Only a Super Admin can change a Super Admin.', 'SUPER_ADMIN_REQUIRED');
  // The permission follows the account being changed: support → customers, operations → technicians, super admin → staff.
  const needed = user.role === 'CUSTOMER' ? Permission.CUSTOMERS_MANAGE : user.role === 'TECHNICIAN' ? Permission.TECHNICIANS_MANAGE : Permission.ADMINS_MANAGE;
  if (!hasPermission(actor.role as Role, needed)) throw AppError.forbidden("You don't have permission to change this account.", 'FORBIDDEN');
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status } });
    if (status !== 'ACTIVE' && user.technician) await tx.technician.update({ where: { id: user.technician.id }, data: { isOnline: false } });
    await tx.notification.create({
      data: {
        userId,
        type: 'ACCOUNT',
        title: status === 'ACTIVE' ? 'Account reactivated' : 'Account suspended',
        body: status === 'ACTIVE' ? 'Your RapidFix account is active again.' : `Your account has been ${status.toLowerCase()}${reason ? `: ${reason}` : ''}. Contact support for help.`,
      },
    });
  });
  if (status !== 'ACTIVE') await revokeAllForUser(userId);
  await audit(actor, status === 'ACTIVE' ? 'USER_REACTIVATED' : 'USER_SUSPENDED', 'User', userId, { status: user.status }, { status, reason }, ip);
}

// ─── Technicians ─────────────────────────────────────────────────────────

const techInclude = {
  user: { select: { name: true, phone: true, email: true, status: true, dateOfBirth: true } },
  skills: { include: { category: true }, orderBy: { category: { sortOrder: 'asc' } } },
  wallet: true,
  franchise: { select: { name: true } },
  _count: { select: { documents: { where: { status: 'PENDING' } } } },
} as const satisfies Prisma.TechnicianInclude;
type TechRow = Prisma.TechnicianGetPayload<{ include: typeof techInclude }>;

function toTechRow(t: TechRow): AdminTechnicianRowDto {
  return {
    id: t.id,
    userId: t.userId,
    name: t.user.name,
    phone: t.user.phone,
    title: technicianTitle(t.skills),
    skills: t.skills.map((s) => s.category.name),
    villageTown: t.villageTown,
    franchise: t.franchise?.name ?? null,
    franchiseId: t.franchiseId,
    district: t.district,
    verificationStatus: t.verificationStatus,
    userStatus: t.user.status,
    isOnline: t.isOnline,
    ratingAvg: Math.round(t.ratingAvg * 10) / 10,
    ratingCount: t.ratingCount,
    completedJobs: t.completedJobs,
    activeJobs: t.activeJobCount,
    walletBalance: t.wallet?.balance ?? 0,
    lastLatitude: t.lastLatitude,
    lastLongitude: t.lastLongitude,
    lastLocationAt: t.lastLocationAt?.toISOString() ?? null,
    pendingDocuments: t._count.documents,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function listTechnicians(q: { q?: string; verification?: TechnicianVerificationStatus; online?: boolean; categoryId?: string; page: number; pageSize: number }, scope: Scope = null): Promise<Paged<AdminTechnicianRowDto>> {
  const term = q.q?.trim();
  const where: Prisma.TechnicianWhereInput = {
    ...technicianScope(scope),
    user: { role: 'TECHNICIAN', ...(term && { OR: [{ name: { contains: term } }, { phone: { contains: term } }] }) },
    ...(q.verification && { verificationStatus: q.verification }),
    ...(q.online !== undefined && { isOnline: q.online }),
    ...(q.categoryId && { skills: { some: { categoryId: q.categoryId } } }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.technician.findMany({ where, include: techInclude, orderBy: [{ verificationStatus: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.technician.count({ where }),
  ]);
  return { items: rows.map(toTechRow), total, page: q.page, pageSize: q.pageSize };
}

/** All online technicians with a position — the admin live map. */
export async function liveTechnicians(scope: Scope = null) {
  const rows = await prisma.technician.findMany({
    where: { ...technicianScope(scope), isOnline: true, lastLatitude: { not: null }, user: { role: 'TECHNICIAN', status: 'ACTIVE' } },
    include: techInclude,
    take: 500,
  });
  return rows.map(toTechRow);
}

export async function technicianDetail(id: string): Promise<AdminTechnicianDetailDto> {
  const t = await prisma.technician.findUnique({ where: { id }, include: { ...techInclude, documents: { orderBy: { createdAt: 'desc' } } } });
  if (!t) throw AppError.notFound('Technician not found', 'TECHNICIAN_NOT_FOUND');
  const monthStart = istMonthStart();
  const [bookings, month, reviews, complaints] = await Promise.all([
    prisma.booking.findMany({ where: { technicianId: id }, include: rowInclude, orderBy: { scheduledFor: 'desc' }, take: 50 }),
    prisma.booking.aggregate({ where: { technicianId: id, status: 'PAYMENT_COMPLETED', completedAt: { gte: monthStart } }, _sum: { technicianEarning: true } }),
    prisma.review.findMany({ where: { technicianId: id }, include: { customer: { select: { user: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.complaint.findMany({ where: { OR: [{ raisedById: t.userId }, { booking: { technicianId: id } }] }, include: complaintInclude, orderBy: { createdAt: 'desc' } }),
  ]);
  return {
    ...toTechRow(t),
    email: t.user.email,
    dateOfBirth: t.user.dateOfBirth ? t.user.dateOfBirth.toISOString().slice(0, 10) : null,
    alternatePhone: t.alternatePhone,
    hasOwnTools: t.hasOwnTools,
    hasVehicle: t.hasVehicle,
    bio: t.bio,
    experienceYears: t.experienceYears,
    languages: Array.isArray(t.languages) ? (t.languages as string[]) : [],
    serviceRadiusKm: t.serviceRadiusKm,
    addressLine: t.addressLine,
    state: t.state,
    pincode: t.pincode,
    rejectionReason: t.rejectionReason,
    skillIds: t.skills.map((s) => s.categoryId),
    documents: t.documents.map((d) => ({ id: d.id, type: d.type, fileUrl: d.fileUrl, status: d.status, remarks: d.remarks, createdAt: d.createdAt.toISOString() })),
    kyc: { aadhaarLast4: t.aadhaarLast4, panNumber: t.panNumber },
    bookings: bookings.map(toAdminRow),
    earnings: { month: month._sum.technicianEarning ?? 0, total: t.wallet?.totalEarned ?? 0, totalPaidOut: t.wallet?.totalPaidOut ?? 0, balance: t.wallet?.balance ?? 0 },
    payout: { upiId: t.payoutUpiId, bankAccountHolder: t.bankAccountHolder, bankIfsc: t.bankIfsc, bankAccountLast4: t.bankAccountLast4 },
    reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, customer: r.customer.user.name ?? 'Customer', createdAt: r.createdAt.toISOString() })),
    complaints: complaints.map(toComplaint),
  };
}

const VERIFICATION_COPY: Record<TechnicianVerificationStatus, { title: string; body: string }> = {
  VERIFIED: { title: 'You are verified!', body: 'Your RapidFix partner profile is approved. Go online to start receiving jobs.' },
  REJECTED: { title: 'Verification not approved', body: 'Please check the reason and update your documents.' },
  SUSPENDED: { title: 'Partner account suspended', body: 'Contact RapidFix support to know more.' },
  BLOCKED: { title: 'Partner account blocked', body: 'Contact RapidFix support to know more.' },
  PENDING: { title: 'Verification pending', body: 'Our team will review your profile.' },
};

/** Approve / reject / suspend / block / reactivate a partner. */
export async function setVerification(actor: Actor, technicianId: string, status: TechnicianVerificationStatus, reason: string | undefined, ip?: string) {
  const t = await prisma.technician.findUnique({ where: { id: technicianId } });
  if (!t) throw AppError.notFound('Technician not found', 'TECHNICIAN_NOT_FOUND');
  if ((status === 'REJECTED' || status === 'SUSPENDED' || status === 'BLOCKED') && !reason) throw AppError.badRequest('Please give a reason', 'REASON_REQUIRED');
  if (status === 'VERIFIED') {
    const skills = await prisma.technicianSkill.count({ where: { technicianId } });
    if (!skills) throw AppError.badRequest('Add at least one skill before approving.', 'SKILLS_REQUIRED');
  }
  await prisma.$transaction(async (tx) => {
    await tx.technician.update({
      where: { id: technicianId },
      data: {
        verificationStatus: status,
        rejectionReason: status === 'VERIFIED' ? null : (reason ?? null),
        ...(status === 'VERIFIED' && { verifiedAt: new Date() }),
        ...(status !== 'VERIFIED' && { isOnline: false }),
      },
    });
    const copy = VERIFICATION_COPY[status];
    await tx.notification.create({ data: { userId: t.userId, type: 'VERIFICATION', title: copy.title, body: reason ? `${copy.body} Reason: ${reason}` : copy.body } });
  });
  if (status === 'SUSPENDED' || status === 'BLOCKED') await revokeAllForUser(t.userId);
  const action = status === 'VERIFIED' ? 'TECHNICIAN_APPROVED' : status === 'REJECTED' ? 'TECHNICIAN_REJECTED' : status === 'PENDING' ? 'TECHNICIAN_RESET' : 'TECHNICIAN_SUSPENDED';
  await audit(actor, action, 'Technician', technicianId, { status: t.verificationStatus }, { status, reason }, ip);
}

export async function setSkills(actor: Actor, technicianId: string, categoryIds: string[], ip?: string) {
  const before = await prisma.technicianSkill.findMany({ where: { technicianId }, select: { categoryId: true } });
  await prisma.$transaction([
    prisma.technicianSkill.deleteMany({ where: { technicianId } }),
    prisma.technicianSkill.createMany({ data: categoryIds.map((categoryId) => ({ technicianId, categoryId })) }),
    // Specific-service picks only make sense inside the technician's categories.
    prisma.technicianService.deleteMany({ where: { technicianId, service: { categoryId: { notIn: categoryIds } } } }),
  ]);
  await audit(actor, 'TECHNICIAN_SKILLS_CHANGED', 'Technician', technicianId, before.map((b) => b.categoryId), categoryIds, ip);
}

export async function reviewDocument(actor: Actor, documentId: string, status: 'APPROVED' | 'REJECTED', remarks: string | undefined, ip?: string) {
  const d = await prisma.technicianDocument.update({ where: { id: documentId }, data: { status, remarks: remarks ?? null }, include: { technician: { select: { userId: true } } } });
  const what = d.type.replace('_', ' ').toLowerCase();
  await prisma.notification.create({
    data:
      status === 'REJECTED'
        ? { userId: d.technician.userId, type: 'VERIFICATION', title: 'Document needs attention', body: `Your ${what} was not accepted${remarks ? `: ${remarks}` : ''}. Please upload it again.` }
        : { userId: d.technician.userId, type: 'VERIFICATION', title: 'Document approved', body: `Your ${what} was checked and approved.` },
  });
  await audit(actor, 'DOCUMENT_REVIEWED', 'TechnicianDocument', documentId, undefined, { status, remarks }, ip);
}

/** Full Aadhaar number given at sign-up, to match against the uploaded card. Every view is audited. */
export async function revealTechnicianAadhaar(actor: Actor, technicianId: string, ip?: string) {
  const t = await prisma.technician.findUnique({ where: { id: technicianId }, select: { aadhaarEnc: true } });
  if (!t) throw AppError.notFound('Technician not found', 'TECHNICIAN_NOT_FOUND');
  if (!t.aadhaarEnc) throw AppError.notFound('No Aadhaar number on file', 'NO_AADHAAR');
  await audit(actor, 'TECHNICIAN_AADHAAR_VIEWED', 'Technician', technicianId, undefined, undefined, ip);
  const n = decryptField(t.aadhaarEnc);
  return { aadhaar: `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8)}` };
}
