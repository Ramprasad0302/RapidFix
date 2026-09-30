import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@fixora/shared-types';
import { authOf, requireAnyPermission, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as bookings from '../services/admin/bookings';
import * as catalog from '../services/admin/catalog';
import * as finance from '../services/admin/finance';
import * as people from '../services/admin/people';
import * as platform from '../services/admin/platform';
import { refundPayment } from '../services/payment.service';
import { ok } from '../utils/response';

/** Admin modules (Phase 9). Mounted under /admin after authenticate + staff-role checks. */
export const adminModulesRouter = Router();
const r = adminModulesRouter;
const q = <T>(res: { locals: Record<string, unknown> }) => res.locals.query as T;
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) };
const dateRange = { from: z.coerce.date().optional(), to: z.coerce.date().optional() };
const id = (req: { params: Record<string, unknown> }) => String(req.params.id);

// ─── Bookings (OPERATIONS) ───────────────────────────────────────────────

const bookingsQuery = z.object({ q: z.string().trim().max(80).optional(), group: z.enum(Object.keys(bookings.STATUS_GROUPS) as [string, ...string[]]).optional(), ...dateRange, ...page });
r.get('/bookings', requirePermission(Permission.BOOKINGS_MANAGE), validate(bookingsQuery, 'query'), async (_req, res) => {
  ok(res, await bookings.listBookings(q<z.infer<typeof bookingsQuery>>(res)));
});
// Read-only booking detail is also needed from payments, complaints and customer screens.
const bookingReaders = [Permission.BOOKINGS_MANAGE, Permission.PAYMENTS_MANAGE, Permission.COMPLAINTS_MANAGE, Permission.CUSTOMERS_MANAGE] as const;
r.get('/bookings/:id', requireAnyPermission(...bookingReaders), async (req, res) => {
  ok(res, await bookings.bookingDetail(id(req)));
});
r.post('/bookings/:id/cancel', requirePermission(Permission.BOOKINGS_MANAGE), validate(z.object({ reason: z.string().trim().min(3).max(300) })), async (req, res) => {
  await bookings.adminCancel(id(req), authOf(req), req.body.reason, req.ip);
  ok(res, await bookings.bookingDetail(id(req)));
});
r.post('/bookings/:id/dispute', requirePermission(Permission.BOOKINGS_MANAGE), validate(z.object({ note: z.string().trim().min(3).max(500) })), async (req, res) => {
  await bookings.openDispute(id(req), authOf(req), req.body.note, req.ip);
  ok(res, await bookings.bookingDetail(id(req)));
});
r.post(
  '/bookings/:id/dispute/resolve',
  requirePermission(Permission.BOOKINGS_MANAGE),
  validate(z.object({ resolution: z.enum(['PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'REFUND', 'CANCEL']), note: z.string().trim().min(3).max(500) })),
  async (req, res) => {
    await bookings.resolveDispute(id(req), authOf(req), req.body.resolution, req.body.note, req.ip);
    ok(res, await bookings.bookingDetail(id(req)));
  },
);

// ─── Customers (SUPPORT) ─────────────────────────────────────────────────

const customersQuery = z.object({ q: z.string().trim().max(80).optional(), status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED']).optional(), ...page });
r.get('/customers', requirePermission(Permission.CUSTOMERS_MANAGE), validate(customersQuery, 'query'), async (_req, res) => {
  ok(res, await people.listCustomers(q<z.infer<typeof customersQuery>>(res)));
});
r.get('/customers/:id', requirePermission(Permission.CUSTOMERS_MANAGE), async (req, res) => {
  ok(res, await people.customerDetail(id(req)));
});

// ─── Technicians (OPERATIONS) ────────────────────────────────────────────

const techQuery = z.object({
  q: z.string().trim().max(80).optional(),
  verification: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'BLOCKED']).optional(),
  online: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  categoryId: z.uuid().optional(),
  ...page,
});
r.get('/technicians', requirePermission(Permission.TECHNICIANS_MANAGE), validate(techQuery, 'query'), async (_req, res) => {
  ok(res, await people.listTechnicians(q<z.infer<typeof techQuery>>(res)));
});
r.get('/technicians/live', requirePermission(Permission.TECHNICIANS_MANAGE), async (_req, res) => {
  ok(res, await people.liveTechnicians());
});
r.get('/technicians/:id', requirePermission(Permission.TECHNICIANS_MANAGE), async (req, res) => {
  ok(res, await people.technicianDetail(id(req)));
});
r.post(
  '/technicians/:id/verification',
  requirePermission(Permission.TECHNICIANS_MANAGE),
  validate(z.object({ status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'BLOCKED']), reason: z.string().trim().max(300).optional() })),
  async (req, res) => {
    await people.setVerification(authOf(req), id(req), req.body.status, req.body.reason, req.ip);
    ok(res, await people.technicianDetail(id(req)));
  },
);
r.put('/technicians/:id/skills', requirePermission(Permission.TECHNICIANS_MANAGE), validate(z.object({ categoryIds: z.array(z.uuid()).min(1).max(10) })), async (req, res) => {
  await people.setSkills(authOf(req), id(req), req.body.categoryIds, req.ip);
  ok(res, await people.technicianDetail(id(req)));
});
r.post(
  '/technicians/documents/:id',
  requirePermission(Permission.TECHNICIANS_MANAGE),
  validate(z.object({ status: z.enum(['APPROVED', 'REJECTED']), remarks: z.string().trim().max(300).optional() })),
  async (req, res) => {
    await people.reviewDocument(authOf(req), id(req), req.body.status, req.body.remarks, req.ip);
    ok(res, { reviewed: true });
  },
);
// Permission depends on the target account's role — checked in setUserStatus.
r.post(
  '/users/:id/status',
  validate(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED']), reason: z.string().trim().max(300).optional() })),
  async (req, res) => {
    await people.setUserStatus(authOf(req), id(req), req.body.status, req.body.reason, req.ip);
    ok(res, { updated: true });
  },
);

// ─── Catalogue & offers ──────────────────────────────────────────────────

const commission = z.object({ type: z.enum(['PERCENTAGE', 'FIXED']), value: z.number().int().min(0).max(10_000_000) }).nullable().optional();
const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  parentId: z.uuid().nullable().optional(),
  tagline: z.string().trim().max(120).default(''),
  professionalTitle: z.string().trim().min(2).max(60),
  iconKey: z.string().trim().min(2).max(40),
  imageUrl: z.string().nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
  commission,
});
r.get('/categories', requirePermission(Permission.CATALOG_MANAGE), async (_req, res) => ok(res, await catalog.listCategories()));
r.post('/categories', requirePermission(Permission.CATALOG_MANAGE), validate(categorySchema), async (req, res) => ok(res, await catalog.saveCategory(authOf(req), null, req.body, req.ip), 201));
r.put('/categories/:id', requirePermission(Permission.CATALOG_MANAGE), validate(categorySchema), async (req, res) => ok(res, await catalog.saveCategory(authOf(req), id(req), req.body, req.ip)));

const serviceSchema = z.object({
  categoryId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(160).default(''),
  description: z.string().trim().min(5).max(4000),
  imageUrl: z.string().nullable().optional(),
  basePrice: z.number().int().min(0).max(100_000_000),
  visitCharge: z.number().int().min(0).max(10_000_000),
  durationMinMinutes: z.number().int().min(5).max(2880),
  durationMaxMinutes: z.number().int().min(5).max(2880),
  inclusions: z.array(z.string().trim().min(1).max(160)).max(20),
  exclusions: z.array(z.string().trim().min(1).max(160)).max(20),
  warrantyDays: z.number().int().min(0).max(730),
  isPopular: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
  commission,
});
r.get('/services', requirePermission(Permission.CATALOG_MANAGE), validate(z.object({ categoryId: z.uuid().optional(), q: z.string().max(80).optional() }), 'query'), async (_req, res) =>
  ok(res, await catalog.listServices(q(res))),
);
r.post('/services', requirePermission(Permission.CATALOG_MANAGE), validate(serviceSchema), async (req, res) => ok(res, await catalog.saveService(authOf(req), null, req.body, req.ip), 201));
r.put('/services/:id', requirePermission(Permission.CATALOG_MANAGE), validate(serviceSchema), async (req, res) => ok(res, await catalog.saveService(authOf(req), id(req), req.body, req.ip)));

const couponSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9]{3,20}$/, 'Use 3–20 letters/digits'),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  terms: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  highlights: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
  discountType: z.enum(['PERCENTAGE', 'FIXED']),
  discountValue: z.number().int().min(1),
  minOrderAmount: z.number().int().min(0),
  maxDiscountAmount: z.number().int().min(1).nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(100).default(1),
  isFirstBookingOnly: z.boolean().default(false),
  categoryId: z.uuid().nullable().optional(),
  serviceId: z.uuid().nullable().optional(),
  locationId: z.uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});
r.get('/offers', requirePermission(Permission.OFFERS_MANAGE), async (_req, res) => ok(res, await catalog.listCoupons()));
r.post('/offers', requirePermission(Permission.OFFERS_MANAGE), validate(couponSchema), async (req, res) => ok(res, await catalog.saveCoupon(authOf(req), null, req.body, req.ip), 201));
r.put('/offers/:id', requirePermission(Permission.OFFERS_MANAGE), validate(couponSchema), async (req, res) => ok(res, await catalog.saveCoupon(authOf(req), id(req), req.body, req.ip)));

// ─── Payments & payouts (FINANCE) ────────────────────────────────────────

const paymentsQuery = z.object({ ...dateRange, method: z.enum(['CASH', 'UPI', 'RAZORPAY']).optional(), status: z.enum(['SUCCESS', 'FAILED', 'PENDING', 'PROCESSING', 'REFUNDED']).optional(), ...page });
r.get('/payments', requirePermission(Permission.PAYMENTS_MANAGE), validate(paymentsQuery, 'query'), async (_req, res) => ok(res, await finance.payments(q(res))));
r.post(
  '/payments/:id/refund',
  requirePermission(Permission.PAYMENTS_MANAGE),
  validate(z.object({ amount: z.number().int().min(1).optional(), reason: z.string().trim().min(3).max(300) })),
  async (req, res) => {
    await refundPayment(id(req), authOf(req), req.body, req.ip);
    ok(res, { refunded: true });
  },
);
r.get('/payouts/wallets', requirePermission(Permission.PAYOUTS_MANAGE), validate(z.object({ q: z.string().max(80).optional() }), 'query'), async (_req, res) => ok(res, await finance.wallets(q(res))));
r.get('/payouts', requirePermission(Permission.PAYOUTS_MANAGE), async (_req, res) => ok(res, await finance.listPayouts()));
r.post(
  '/payouts',
  requirePermission(Permission.PAYOUTS_MANAGE),
  validate(z.object({ technicianId: z.uuid(), amount: z.number().int().min(100), method: z.enum(['UPI', 'BANK_TRANSFER', 'CASH']), reference: z.string().trim().min(3).max(128) })),
  async (req, res) => ok(res, await finance.createPayout(authOf(req), req.body, req.ip), 201),
);

// ─── Reviews, complaints, notifications ──────────────────────────────────

const reviewsQuery = z.object({ rating: z.coerce.number().int().min(1).max(5).optional(), visible: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')), ...page });
r.get('/reviews', requirePermission(Permission.REVIEWS_MANAGE), validate(reviewsQuery, 'query'), async (_req, res) => ok(res, await platform.listReviews(q(res))));
r.patch('/reviews/:id', requirePermission(Permission.REVIEWS_MANAGE), validate(z.object({ isVisible: z.boolean() })), async (req, res) => {
  await platform.setReviewVisibility(authOf(req), id(req), req.body.isVisible, req.ip);
  ok(res, { updated: true });
});

const complaintsQuery = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(), ...page });
r.get('/complaints', requirePermission(Permission.COMPLAINTS_MANAGE), validate(complaintsQuery, 'query'), async (_req, res) => ok(res, await platform.listComplaints(q(res))));
r.patch(
  '/complaints/:id',
  requirePermission(Permission.COMPLAINTS_MANAGE),
  validate(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(), resolution: z.string().trim().max(2000).optional(), assignToMe: z.boolean().optional() })),
  async (req, res) => ok(res, await platform.updateComplaint(authOf(req), id(req), req.body, req.ip)),
);

r.get('/notifications/broadcasts', requirePermission(Permission.NOTIFICATIONS_MANAGE), async (_req, res) => ok(res, await platform.listBroadcasts()));
r.post(
  '/notifications/broadcast',
  requirePermission(Permission.NOTIFICATIONS_MANAGE),
  validate(z.object({ audience: z.enum(['CUSTOMERS', 'TECHNICIANS', 'ALL']), title: z.string().trim().min(3).max(160), body: z.string().trim().min(3).max(500) })),
  async (req, res) => ok(res, await platform.broadcast(authOf(req), req.body, req.ip), 201),
);

// ─── Reports, settings, audit, system ────────────────────────────────────

r.get('/reports', requirePermission(Permission.REPORTS_VIEW), validate(z.object({ from: z.coerce.date(), to: z.coerce.date() }), 'query'), async (_req, res) => {
  const { from, to } = q<{ from: Date; to: Date }>(res);
  ok(res, await platform.report(from, to));
});

r.get('/settings', requirePermission(Permission.SETTINGS_MANAGE), async (_req, res) => ok(res, await platform.getSettings()));
r.put('/settings/:key', requirePermission(Permission.SETTINGS_MANAGE), validate(z.object({ value: z.unknown() })), async (req, res) => {
  await platform.updateSetting(authOf(req), String(req.params.key), req.body.value, req.ip);
  ok(res, await platform.getSettings());
});

const auditQuery = z.object({ action: z.string().max(80).optional(), entity: z.string().max(60).optional(), q: z.string().max(80).optional(), ...page });
r.get('/audit-logs', requirePermission(Permission.AUDIT_VIEW), validate(auditQuery, 'query'), async (_req, res) => ok(res, await platform.auditLogs(q(res))));
r.get('/audit-logs/actions', requirePermission(Permission.AUDIT_VIEW), async (_req, res) => ok(res, await platform.auditActions()));
r.get('/system', requirePermission(Permission.SETTINGS_MANAGE), async (_req, res) => ok(res, await platform.systemStatus()));
