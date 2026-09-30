import type { AdminCategoryDto, AdminCouponDto, AdminServiceDto } from '@fixora/shared-types';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../audit.service';
import { isOwnUploadPath } from '../storage.service';

type Actor = { userId: string; role: string };
type CommissionInput = { type: 'PERCENTAGE' | 'FIXED'; value: number } | null | undefined;

const asStrings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';

async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
  let slug = slugify(base);
  for (let i = 2; await exists(slug); i++) slug = `${slugify(base).slice(0, 74)}-${i}`;
  return slug;
}

const checkImage = (url: string | null | undefined) => {
  if (url && !isOwnUploadPath(url)) throw AppError.badRequest('Upload the image first', 'INVALID_ATTACHMENT');
};

/** Category / service commission rule: upsert when given, delete when explicitly null. */
async function syncCommission(tx: Prisma.TransactionClient, scope: 'CATEGORY' | 'SERVICE', id: string, c: CommissionInput) {
  if (c === undefined) return;
  const where = scope === 'CATEGORY' ? { scope, categoryId: id } : { scope, serviceId: id };
  await tx.commission.deleteMany({ where });
  if (c) await tx.commission.create({ data: { ...where, type: c.type, value: c.value } });
}

// ─── Categories ──────────────────────────────────────────────────────────

export async function listCategories(): Promise<AdminCategoryDto[]> {
  const [rows, rules] = await Promise.all([
    prisma.serviceCategory.findMany({ orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }], include: { _count: { select: { services: true } } } }),
    prisma.commission.findMany({ where: { scope: 'CATEGORY', isActive: true } }),
  ]);
  return rows.map((c) => {
    const rule = rules.find((r) => r.categoryId === c.id);
    return {
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      slug: c.slug,
      tagline: c.tagline,
      professionalTitle: c.professionalTitle,
      iconKey: c.iconKey,
      imageUrl: c.imageUrl,
      description: c.description,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      services: c._count.services,
      commission: rule ? { type: rule.type, value: rule.value } : null,
    };
  });
}

export interface CategoryInput {
  name: string;
  parentId?: string | null;
  tagline: string;
  professionalTitle: string;
  iconKey: string;
  imageUrl?: string | null;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  commission?: CommissionInput;
}

export async function saveCategory(actor: Actor, id: string | null, input: CategoryInput, ip?: string) {
  checkImage(input.imageUrl);
  if (input.parentId && input.parentId === id) throw AppError.badRequest('A category cannot be its own parent', 'INVALID_PARENT');
  const { commission, ...data } = input;
  const row = await prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.serviceCategory.update({ where: { id }, data })
      : await tx.serviceCategory.create({ data: { ...data, slug: await uniqueSlug(input.name, async (s) => !!(await tx.serviceCategory.findUnique({ where: { slug: s } }))) } });
    await syncCommission(tx, 'CATEGORY', saved.id, commission);
    return saved;
  });
  await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: id ? 'CATEGORY_UPDATED' : 'CATEGORY_CREATED', entity: 'ServiceCategory', entityId: row.id, newValue: input, ip });
  return row;
}

// ─── Services ────────────────────────────────────────────────────────────

export async function listServices(q: { categoryId?: string; q?: string }): Promise<AdminServiceDto[]> {
  const [rows, rules] = await Promise.all([
    prisma.service.findMany({
      where: { ...(q.categoryId && { categoryId: q.categoryId }), ...(q.q && { name: { contains: q.q } }) },
      include: { category: { select: { name: true } }, _count: { select: { bookings: true } } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    }),
    prisma.commission.findMany({ where: { scope: 'SERVICE', isActive: true } }),
  ]);
  return rows.map((s) => {
    const rule = rules.find((r) => r.serviceId === s.id);
    return {
      id: s.id,
      categoryId: s.categoryId,
      categoryName: s.category.name,
      name: s.name,
      slug: s.slug,
      tagline: s.tagline,
      description: s.description,
      imageUrl: s.imageUrl,
      basePrice: s.basePrice,
      visitCharge: s.visitCharge,
      durationMinMinutes: s.durationMinMinutes,
      durationMaxMinutes: s.durationMaxMinutes,
      inclusions: asStrings(s.inclusions),
      exclusions: asStrings(s.exclusions),
      warrantyDays: s.warrantyDays,
      isPopular: s.isPopular,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
      commission: rule ? { type: rule.type, value: rule.value } : null,
      bookings: s._count.bookings,
    };
  });
}

export interface ServiceInput {
  categoryId: string;
  name: string;
  tagline: string;
  description: string;
  imageUrl?: string | null;
  basePrice: number;
  visitCharge: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  inclusions: string[];
  exclusions: string[];
  warrantyDays: number;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
  commission?: CommissionInput;
}

export async function saveService(actor: Actor, id: string | null, input: ServiceInput, ip?: string) {
  checkImage(input.imageUrl);
  if (input.durationMaxMinutes < input.durationMinMinutes) throw AppError.badRequest('Maximum duration must be at least the minimum', 'INVALID_DURATION');
  const before = id ? await prisma.service.findUnique({ where: { id } }) : null;
  if (id && !before) throw AppError.notFound('Service not found', 'SERVICE_NOT_FOUND');
  const { commission, ...data } = input;
  const row = await prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.service.update({ where: { id }, data })
      : await tx.service.create({ data: { ...data, slug: await uniqueSlug(input.name, async (s) => !!(await tx.service.findUnique({ where: { slug: s } }))) } });
    await syncCommission(tx, 'SERVICE', saved.id, commission);
    return saved;
  });
  const priceChanged = before && (before.basePrice !== input.basePrice || before.visitCharge !== input.visitCharge);
  await recordAudit({
    actorId: actor.userId,
    actorRole: actor.role as never,
    action: !id ? 'SERVICE_CREATED' : priceChanged ? 'PRICE_CHANGED' : 'SERVICE_UPDATED',
    entity: 'Service',
    entityId: row.id,
    oldValue: before ? { basePrice: before.basePrice, visitCharge: before.visitCharge, isActive: before.isActive } : undefined,
    newValue: { basePrice: input.basePrice, visitCharge: input.visitCharge, isActive: input.isActive },
    ip,
  });
  return row;
}

// ─── Coupons ─────────────────────────────────────────────────────────────

const toCoupon = (c: Prisma.CouponGetPayload<object>): AdminCouponDto => ({
  id: c.id,
  code: c.code,
  title: c.title,
  description: c.description,
  terms: asStrings(c.terms),
  highlights: asStrings(c.highlights),
  discountType: c.discountType,
  discountValue: c.discountValue,
  minOrderAmount: c.minOrderAmount,
  maxDiscountAmount: c.maxDiscountAmount,
  startsAt: c.startsAt.toISOString(),
  endsAt: c.endsAt.toISOString(),
  usageLimit: c.usageLimit,
  perCustomerLimit: c.perCustomerLimit,
  usedCount: c.usedCount,
  isFirstBookingOnly: c.isFirstBookingOnly,
  categoryId: c.categoryId,
  serviceId: c.serviceId,
  locationId: c.locationId,
  isActive: c.isActive,
});

export async function listCoupons() {
  return (await prisma.coupon.findMany({ orderBy: [{ isActive: 'desc' }, { endsAt: 'desc' }] })).map(toCoupon);
}

export interface CouponInput {
  code: string;
  title: string;
  description?: string | null;
  terms: string[];
  highlights: string[];
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount?: number | null;
  startsAt: Date;
  endsAt: Date;
  usageLimit?: number | null;
  perCustomerLimit: number;
  isFirstBookingOnly: boolean;
  categoryId?: string | null;
  serviceId?: string | null;
  locationId?: string | null;
  isActive: boolean;
}

export async function saveCoupon(actor: Actor, id: string | null, input: CouponInput, ip?: string) {
  if (input.endsAt <= input.startsAt) throw AppError.badRequest('End date must be after the start date', 'INVALID_DATES');
  if (input.discountType === 'PERCENTAGE' && (input.discountValue < 1 || input.discountValue > 100)) throw AppError.badRequest('Percentage must be 1–100', 'INVALID_DISCOUNT');
  const before = id ? await prisma.coupon.findUnique({ where: { id } }) : null;
  const data = { ...input, code: input.code.trim().toUpperCase() };
  try {
    const row = id ? await prisma.coupon.update({ where: { id }, data }) : await prisma.coupon.create({ data });
    await recordAudit({ actorId: actor.userId, actorRole: actor.role as never, action: id ? 'COUPON_UPDATED' : 'COUPON_CREATED', entity: 'Coupon', entityId: row.id, oldValue: before ? toCoupon(before) : undefined, newValue: toCoupon(row), ip });
    return toCoupon(row);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw AppError.conflict('A coupon with this code already exists.', 'DUPLICATE_CODE');
    throw e;
  }
}
