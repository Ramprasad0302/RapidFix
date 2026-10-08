import { bookingAdvance, razorpayConfigured } from '../services/payment.service';
import { assistantEnabled } from '../services/assistant.service';
import { Router } from 'express';
import { z } from 'zod';
import { optionalAuthenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../config/prisma';
import * as catalog from '../services/catalog.service';
import { estimatePrice } from '../services/pricing.service';
import { getSetting } from '../services/settings.service';
import { env } from '../config/env';
import { ok } from '../utils/response';
import * as serviceArea from '../services/serviceArea.service';
import { isReviewDemoPhone } from '../services/reviewDemo';
import { indianPhoneSchema, toE164India } from '@fixora/shared-utils';

/** Public, cacheable catalogue — guests can browse, search and price everything. */
export const catalogRouter = Router();

const cachePublic = (seconds: number) => (_req: unknown, res: { set: (k: string, v: string) => void }, next: () => void) => {
  res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 10}`);
  next();
};

catalogRouter.get('/services/categories', cachePublic(300), async (_req, res) => {
  ok(res, await catalog.listCategories());
});

const listQuery = z.object({
  categoryId: z.uuid().optional(),
  category: z.string().max(80).optional(),
  popular: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

catalogRouter.get('/services', validate(listQuery, 'query'), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof listQuery>;
  ok(
    res,
    await catalog.listServices({
      categoryId: q.categoryId,
      categorySlug: q.category,
      popular: q.popular === 'true',
      q: q.q,
      limit: q.limit,
    }),
  );
});

catalogRouter.get('/services/:idOrSlug', cachePublic(120), async (req, res) => {
  ok(res, await catalog.getService(String(req.params.idOrSlug)));
});

catalogRouter.get('/locations', cachePublic(600), async (_req, res) => {
  ok(res, await catalog.listLocations());
});

const nearbyQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(50).default(15),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

catalogRouter.get('/technicians/nearby', validate(nearbyQuery, 'query'), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof nearbyQuery>;
  ok(res, await catalog.nearbyTechnicians(q.lat, q.lng, q.radiusKm, q.limit));
});

catalogRouter.get('/stats/public', cachePublic(300), async (_req, res) => {
  ok(res, await catalog.publicStats());
});

/** Is this map point inside the area we serve (e.g. Tanuku within 10 km)? */
catalogRouter.get(
  '/service-area',
  optionalAuthenticate(),
  validate(z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }), 'query'),
  async (req, res) => {
    const q = res.locals.query as { lat: number; lng: number };
    res.set('Cache-Control', 'private, no-cache');
    const check = await serviceArea.checkPoint(q.lat, q.lng);
    // App Store / Play reviewers book from wherever they are (see reviewDemo.ts).
    if (!check.served && req.auth) {
      const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { phone: true } });
      if (isReviewDemoPhone(user?.phone)) return ok(res, { ...check, served: true });
    }
    ok(res, check);
  },
);

/** "I'm interested" from someone outside the service area. */
catalogRouter.post(
  '/service-area/interest',
  optionalAuthenticate(),
  validate(
    z.object({
      name: z.string().trim().max(120).optional(),
      phone: indianPhoneSchema.optional(),
      label: z.string().trim().max(255).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    }),
  ),
  async (req, res) => {
    const b = req.body as { name?: string; phone?: string; label?: string; lat?: number; lng?: number };
    ok(res, await serviceArea.recordInterest({ userId: req.auth?.userId ?? null, name: b.name, phone: b.phone ? toE164India(b.phone) : null, label: b.label, latitude: b.lat, longitude: b.lng }), 201);
  },
);

/** Public contact details (admin-editable in Settings). */
// Not cached: it tells the app which login method to use, which must switch immediately.
catalogRouter.get('/app-config', async (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  const [supportPhone, supportEmail] = await Promise.all([getSetting('support.phone', '+91 94919 63366'), getSetting('support.email', 'support@rapidfix.in')]);
  ok(res, { supportPhone, supportEmail, otpProvider: env.OTP_PROVIDER === 'firebase' ? 'firebase' : 'server', onlinePayments: razorpayConfigured(), bookingAdvance: await bookingAdvance(), assistant: assistantEnabled(), autoCancelMinutes: Number(await getSetting<number>('dispatch.autoCancelMinutes', 30)) });
});

catalogRouter.get('/reviews/featured', cachePublic(300), async (_req, res) => {
  ok(res, await catalog.featuredReviews());
});

catalogRouter.get('/offers', validate(z.object({ category: z.string().max(80).optional() }), 'query'), async (_req, res) => {
  ok(res, await catalog.listOffers((res.locals.query as { category?: string }).category));
});

catalogRouter.get('/offers/:code', async (req, res) => {
  ok(res, await catalog.getOffer(String(req.params.code)));
});

const estimateSchema = z.object({
  serviceId: z.uuid(),
  couponCode: z.string().trim().max(32).optional(),
});

/** Price preview. With a session, per-customer coupon rules are applied too. */
catalogRouter.post('/bookings/estimate', optionalAuthenticate(), validate(estimateSchema), async (req, res) => {
  let customerId: string | null = null;
  if (req.auth?.role === 'CUSTOMER') {
    customerId = (await prisma.customer.findUnique({ where: { userId: req.auth.userId }, select: { id: true } }))?.id ?? null;
  }
  const { breakdown } = await estimatePrice(req.body.serviceId, req.body.couponCode, customerId);
  ok(res, breakdown);
});
