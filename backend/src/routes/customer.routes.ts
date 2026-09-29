import { Router, type Request } from 'express';
import { z } from 'zod';
import { Role, TIME_SLOTS, type AddressDto, type CustomerProfileDto } from '@fixora/shared-types';
import { addressSchema } from '@fixora/shared-utils';
import { prisma } from '../config/prisma';
import { authenticate, authOf, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as bookings from '../services/booking.service';
import { isOwnUploadPath } from '../services/storage.service';
import { AppError } from '../utils/AppError';
import { ok, paginationMeta } from '../utils/response';

/**
 * Everything here is keyed by the caller's own customer id, so a customer can
 * never read or change another customer's data — other ids are "not found".
 */
export const customerRouter = Router();
customerRouter.use(authenticate(), authorize(Role.CUSTOMER));

async function customerOf(req: Request) {
  const { userId } = authOf(req);
  const customer = await prisma.customer.findUnique({ where: { userId }, select: { id: true } });
  if (!customer) throw AppError.forbidden('Customer profile not found', 'CUSTOMER_PROFILE_MISSING');
  return { userId, customerId: customer.id };
}

// ─── Profile ─────────────────────────────────────────────────────────────

async function loadProfile(userId: string): Promise<CustomerProfileDto> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { customer: true } });
  return {
    id: u.id,
    name: u.name,
    phone: u.phone ?? '',
    email: u.email,
    avatarUrl: u.avatarUrl,
    city: u.customer?.city ?? null,
    language: u.customer?.language ?? 'en',
    notificationsEnabled: u.customer?.notificationsEnabled ?? true,
    marketingOptIn: u.customer?.marketingOptIn ?? true,
    referralCode: u.customer?.referralCode ?? '',
    createdAt: u.createdAt.toISOString(),
  };
}

customerRouter.get('/profile', async (req, res) => {
  ok(res, await loadProfile(authOf(req).userId));
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email: z
    .union([z.email('Enter a valid email').trim().toLowerCase(), z.literal('')])
    .optional()
    .transform((v) => v || null),
  city: z.string().trim().max(120).optional().transform((v) => v || null),
  language: z.enum(['en', 'te', 'hi']).optional(),
  notificationsEnabled: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
  avatarUrl: z
    .string()
    .nullable()
    .optional()
    .refine((v) => v == null || isOwnUploadPath(v), 'Invalid photo'),
});

customerRouter.put('/profile', validate(updateProfileSchema), async (req, res) => {
  const { userId } = authOf(req);
  const b = req.body as z.infer<typeof updateProfileSchema>;
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: b.name,
      email: b.email,
      ...(b.avatarUrl !== undefined && { avatarUrl: b.avatarUrl }),
      customer: {
        update: {
          city: b.city,
          ...(b.language && { language: b.language }),
          ...(b.notificationsEnabled !== undefined && { notificationsEnabled: b.notificationsEnabled }),
          ...(b.marketingOptIn !== undefined && { marketingOptIn: b.marketingOptIn }),
        },
      },
    },
  });
  ok(res, await loadProfile(userId));
});

// ─── Bookings ────────────────────────────────────────────────────────────

customerRouter.get('/bookings/stats', async (req, res) => {
  ok(res, await bookings.customerStats((await customerOf(req)).customerId));
});

const listQuery = z.object({
  tab: z.enum(['all', 'upcoming', 'active', 'completed', 'cancelled']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

customerRouter.get('/bookings', validate(listQuery, 'query'), async (req, res) => {
  const q = res.locals.query as z.infer<typeof listQuery>;
  const { items, total } = await bookings.listCustomerBookings((await customerOf(req)).customerId, q.tab, q.page, q.pageSize);
  ok(res, items, 200, paginationMeta(q.page, q.pageSize, total));
});

const slotIds = TIME_SLOTS.map((s) => s.id) as [string, ...string[]];
const scheduleSchema = z.object({
  scheduleType: z.enum(['NOW', 'SCHEDULED']),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  timeSlot: z.enum(slotIds).optional(),
});

const createSchema = scheduleSchema
  .extend({
    serviceId: z.uuid(),
    description: z.string().trim().max(500).default(''),
    photos: z.array(z.string()).max(5).default([]),
    videoUrl: z.string().nullable().optional(),
    addressId: z.uuid().optional(),
    address: addressSchema.optional(),
    saveAddress: z.boolean().default(true),
    couponCode: z.string().trim().max(32).optional(),
    paymentMethod: z.enum(['CASH', 'UPI', 'RAZORPAY']).default('CASH'),
  })
  .refine((b) => !!b.addressId !== !!b.address, { message: 'Choose a saved address or add a new one', path: ['address'] })
  .refine((b) => b.scheduleType === 'NOW' || (b.date && b.timeSlot), { message: 'Choose a date and time slot', path: ['timeSlot'] });

customerRouter.post('/bookings', validate(createSchema), async (req, res) => {
  const { customerId, userId } = await customerOf(req);
  ok(res, await bookings.createBooking(customerId, userId, req.body), 201);
});

customerRouter.get('/bookings/:id', async (req, res) => {
  ok(res, await bookings.getCustomerBooking((await customerOf(req)).customerId, String(req.params.id)));
});

customerRouter.post(
  '/bookings/:id/cancel',
  validate(z.object({ reason: z.string().trim().max(300).optional() })),
  async (req, res) => {
    const { customerId, userId } = await customerOf(req);
    ok(res, await bookings.cancelCustomerBooking(customerId, userId, String(req.params.id), req.body.reason));
  },
);

customerRouter.post('/bookings/:id/reschedule', validate(scheduleSchema), async (req, res) => {
  const { customerId, userId } = await customerOf(req);
  ok(res, await bookings.rescheduleCustomerBooking(customerId, userId, String(req.params.id), req.body));
});

// ─── Addresses ───────────────────────────────────────────────────────────

const toAddress = (a: Omit<AddressDto, 'label'> & { label: AddressDto['label'] }): AddressDto => ({
  id: a.id,
  label: a.label,
  houseNo: a.houseNo,
  street: a.street,
  area: a.area,
  villageTown: a.villageTown,
  district: a.district,
  state: a.state,
  pincode: a.pincode,
  landmark: a.landmark,
  latitude: a.latitude,
  longitude: a.longitude,
  isDefault: a.isDefault,
});

customerRouter.get('/addresses', async (req, res) => {
  const { customerId } = await customerOf(req);
  const rows = await prisma.address.findMany({
    where: { customerId, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  ok(res, rows.map(toAddress));
});

customerRouter.post('/addresses', validate(addressSchema), async (req, res) => {
  const { customerId } = await customerOf(req);
  const count = await prisma.address.count({ where: { customerId, deletedAt: null } });
  if (count >= 10) throw AppError.badRequest('You can save up to 10 addresses', 'ADDRESS_LIMIT');
  const isDefault = req.body.isDefault || count === 0;
  const row = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    return tx.address.create({ data: { ...req.body, customerId, isDefault } });
  });
  ok(res, toAddress(row), 201);
});

customerRouter.put('/addresses/:id', validate(addressSchema), async (req, res) => {
  const { customerId } = await customerOf(req);
  const id = String(req.params.id);
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, customerId, deletedAt: null } });
    if (!existing) throw AppError.notFound('Address not found', 'ADDRESS_NOT_FOUND');
    if (req.body.isDefault) await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    return tx.address.update({ where: { id }, data: req.body });
  });
  ok(res, toAddress(row));
});

customerRouter.delete('/addresses/:id', async (req, res) => {
  const { customerId } = await customerOf(req);
  // Soft delete: past bookings keep pointing at the row (they also store a snapshot).
  const { count } = await prisma.address.updateMany({
    where: { id: String(req.params.id), customerId, deletedAt: null },
    data: { deletedAt: new Date(), isDefault: false },
  });
  if (count === 0) throw AppError.notFound('Address not found', 'ADDRESS_NOT_FOUND');
  ok(res, { deleted: true });
});
