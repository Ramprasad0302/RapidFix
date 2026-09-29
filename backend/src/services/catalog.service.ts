import type {
  CategoryDto,
  FeaturedReviewDto,
  PublicStatsDto,
  CategoryRef,
  LocationDto,
  NearbyTechnicianDto,
  OfferDto,
  ServiceDetailDto,
  ServiceSummaryDto,
} from '@fixora/shared-types';
import { formatINR, haversineKm } from '@fixora/shared-utils';
import { prisma } from '../config/prisma';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { stateCode } from '../utils/locality';

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

const catRef = (c: { id: string; name: string; slug: string; iconKey: string }): CategoryRef => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  iconKey: c.iconKey,
});

type ServiceWithCat = Prisma.ServiceGetPayload<{ include: { category: true } }>;

const toSummary = (s: ServiceWithCat): ServiceSummaryDto => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  tagline: s.tagline,
  imageUrl: s.imageUrl,
  basePrice: s.basePrice,
  visitCharge: s.visitCharge,
  durationMinMinutes: s.durationMinMinutes,
  durationMaxMinutes: s.durationMaxMinutes,
  isPopular: s.isPopular,
  category: catRef(s.category),
});

export async function listCategories(): Promise<CategoryDto[]> {
  const rows = await prisma.serviceCategory.findMany({
    where: { isActive: true, parentId: null },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { services: { where: { isActive: true } } } } },
  });
  return rows.map((c) => ({
    ...catRef(c),
    tagline: c.tagline,
    imageUrl: c.imageUrl,
    professionalTitle: c.professionalTitle,
    serviceCount: c._count.services,
  }));
}

export async function listServices(opts: { categoryId?: string; categorySlug?: string; popular?: boolean; q?: string; limit: number }) {
  const q = opts.q?.trim();
  const where: Prisma.ServiceWhereInput = {
    isActive: true,
    category: { isActive: true, ...(opts.categorySlug && { slug: opts.categorySlug }) },
    ...(opts.categoryId && { categoryId: opts.categoryId }),
    ...(opts.popular && { isPopular: true }),
    // "plumber", "electrician", "AC", "washing machine" all match via name, tagline,
    // category name or the category's professional title.
    ...(q && {
      OR: [
        { name: { contains: q } },
        { tagline: { contains: q } },
        { category: { name: { contains: q } } },
        { category: { professionalTitle: { contains: q } } },
      ],
    }),
  };
  const rows = await prisma.service.findMany({
    where,
    include: { category: true },
    orderBy: [{ isPopular: 'desc' }, { sortOrder: 'asc' }],
    take: opts.limit,
  });
  return rows.map(toSummary);
}

export async function getService(idOrSlug: string): Promise<ServiceDetailDto> {
  const s = await prisma.service.findFirst({
    where: { isActive: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: { category: true },
  });
  if (!s) throw AppError.notFound('Service not found', 'SERVICE_NOT_FOUND');
  return {
    ...toSummary(s),
    description: s.description,
    inclusions: asStrings(s.inclusions),
    exclusions: asStrings(s.exclusions),
    warrantyDays: s.warrantyDays,
  };
}

export async function listLocations(): Promise<LocationDto[]> {
  const rows = await prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    district: l.district,
    state: l.state,
    stateCode: stateCode(l.state),
    latitude: l.latitude,
    longitude: l.longitude,
  }));
}

/**
 * Verified, online professionals near a point — only what the backend can
 * actually confirm is shown to customers.
 */
export async function nearbyTechnicians(lat: number, lng: number, radiusKm: number, limit: number): Promise<NearbyTechnicianDto[]> {
  // Cheap bounding box first (1° lat ≈ 111 km), exact distance after.
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const rows = await prisma.technician.findMany({
    where: {
      verificationStatus: 'VERIFIED',
      isOnline: true,
      user: { status: 'ACTIVE', role: 'TECHNICIAN' },
      lastLatitude: { gte: lat - dLat, lte: lat + dLat },
      lastLongitude: { gte: lng - dLng, lte: lng + dLng },
    },
    include: { user: { select: { name: true, avatarUrl: true } }, skills: { include: { category: true }, orderBy: { category: { sortOrder: 'asc' } }, take: 1 } },
    take: 100,
  });
  return rows
    .map((t) => ({ t, d: haversineKm(lat, lng, t.lastLatitude!, t.lastLongitude!) }))
    .filter(({ t, d }) => d <= Math.min(radiusKm, Math.max(t.serviceRadiusKm, 1)))
    .sort((a, b) => a.d - b.d || b.t.ratingAvg - a.t.ratingAvg)
    .slice(0, limit)
    .map(({ t, d }) => ({
      id: t.id,
      name: t.user.name ?? 'FIXORA Professional',
      avatarUrl: t.user.avatarUrl,
      title: t.skills[0]?.category.professionalTitle ?? 'Technician',
      ratingAvg: Math.round(t.ratingAvg * 10) / 10,
      ratingCount: t.ratingCount,
      experienceYears: t.experienceYears,
      distanceKm: Math.round(d * 10) / 10,
      categorySlug: t.skills[0]?.category.slug ?? null,
    }));
}

// ─── Trust content (Home page) ───────────────────────────────────────────

/** Real platform numbers — never marketing guesses. */
export async function publicStats(): Promise<PublicStatsDto> {
  const [verifiedProfessionals, jobsCompleted, rating, townsServed, warranty] = await Promise.all([
    prisma.technician.count({ where: { verificationStatus: 'VERIFIED', user: { status: 'ACTIVE', role: 'TECHNICIAN' } } }),
    prisma.booking.count({ where: { status: { in: ['SERVICE_COMPLETED', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED'] } } }),
    prisma.review.aggregate({ where: { isVisible: true }, _avg: { rating: true } }),
    prisma.location.count({ where: { isActive: true } }),
    prisma.service.aggregate({ where: { isActive: true }, _max: { warrantyDays: true } }),
  ]);
  return {
    verifiedProfessionals,
    jobsCompleted,
    averageRating: Math.round((rating._avg.rating ?? 0) * 10) / 10,
    townsServed,
    maxWarrantyDays: warranty._max.warrantyDays ?? 0,
  };
}

/** Recent 4–5★ reviews with a comment; names shortened to "First L." for privacy. */
export async function featuredReviews(limit = 8): Promise<FeaturedReviewDto[]> {
  const rows = await prisma.review.findMany({
    where: { isVisible: true, rating: { gte: 4 }, comment: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { customer: { include: { user: { select: { name: true } } } }, booking: { select: { addressSnapshot: true, service: { select: { name: true } } } } },
  });
  return rows.map((r) => {
    const [first = 'Customer', last] = (r.customer.user.name ?? 'Customer').trim().split(/\s+/);
    const town = (r.booking.addressSnapshot as { villageTown?: string } | null)?.villageTown ?? '';
    return {
      id: r.id,
      name: last ? `${first} ${last[0]}.` : first,
      town,
      service: r.booking.service.name,
      rating: r.rating,
      comment: r.comment ?? '',
      createdAt: r.createdAt.toISOString(),
    };
  });
}

// ─── Offers ──────────────────────────────────────────────────────────────

const couponInclude = { category: true, service: { select: { id: true, name: true, slug: true } } } as const;
type CouponRow = Prisma.CouponGetPayload<{ include: typeof couponInclude }>;

export function offerBadge(c: { discountType: string; discountValue: number }) {
  return c.discountType === 'PERCENTAGE' ? `FLAT ${c.discountValue}% OFF` : `FLAT ${formatINR(c.discountValue)} OFF`;
}

const toOffer = (c: CouponRow): OfferDto => ({
  id: c.id,
  code: c.code,
  title: c.title,
  description: c.description ?? '',
  badge: offerBadge(c),
  discountType: c.discountType,
  discountValue: c.discountValue,
  minOrderAmount: c.minOrderAmount,
  maxDiscountAmount: c.maxDiscountAmount,
  endsAt: c.endsAt.toISOString(),
  terms: asStrings(c.terms),
  highlights: asStrings(c.highlights),
  isFirstBookingOnly: c.isFirstBookingOnly,
  category: c.category ? catRef(c.category) : null,
  service: c.service,
});

const liveCoupon = (): Prisma.CouponWhereInput => {
  const now = new Date();
  return { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } };
};

export async function listOffers(categorySlug?: string): Promise<OfferDto[]> {
  const rows = await prisma.coupon.findMany({
    where: { ...liveCoupon(), ...(categorySlug && { category: { slug: categorySlug } }) },
    include: couponInclude,
    orderBy: [{ endsAt: 'asc' }],
  });
  // Category order (as on the home screen), platform-wide offers last.
  const rank = (c: CouponRow) => c.category?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  return rows
    .filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit)
    .sort((a, b) => rank(a) - rank(b))
    .map(toOffer);
}

export async function getOffer(code: string): Promise<OfferDto> {
  const c = await prisma.coupon.findFirst({ where: { ...liveCoupon(), code: code.toUpperCase() }, include: couponInclude });
  if (!c) throw AppError.notFound('This offer is no longer available', 'OFFER_NOT_FOUND');
  return toOffer(c);
}
