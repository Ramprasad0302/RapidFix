import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { limiterBase } from '../middleware/rateLimit';
import { z } from 'zod';
import { env } from '../config/env';
import { validate } from '../middleware/validate';
import { lookupIfsc, lookupPincode, reverseGeocode, searchPlaces } from '../services/geo.service';
import { ok } from '../utils/response';

/** Address lookup for the location picker (public: guests set their location too). */
export const geoRouter = Router();

geoRouter.use(
  rateLimit({
    ...limiterBase,
    windowMs: 60_000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
    message: { success: false, message: 'Too many location lookups. Please wait a moment.', code: 'RATE_LIMITED' },
  }),
);

const reverseQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });
geoRouter.get('/reverse', validate(reverseQuery, 'query'), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof reverseQuery>;
  ok(res, await reverseGeocode(q.lat, q.lng));
});

const searchQuery = z.object({
  q: z.string().trim().min(3).max(120),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
geoRouter.get('/search', validate(searchQuery, 'query'), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof searchQuery>;
  ok(res, await searchPlaces(q.q, q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined));
});

const pincodeParams = z.object({ pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode') });
geoRouter.get('/pincode/:pincode', validate(pincodeParams, 'params'), async (req, res) => {
  ok(res, await lookupPincode(String(req.params.pincode)));
});

const ifscParams = z.object({ ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC') });
geoRouter.get('/ifsc/:ifsc', validate(ifscParams, 'params'), async (req, res) => {
  ok(res, await lookupIfsc(String(req.params.ifsc)));
});
