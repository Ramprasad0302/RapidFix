import { Router } from 'express';
import { z } from 'zod';
import { Role, type TechnicianJobAction } from '@fixora/shared-types';
import { dateOfBirthSchema, indianPhoneSchema, toE164India } from '@fixora/shared-utils';
import { authenticate, authOf, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as tech from '../services/technician.service';
import * as account from '../services/technicianAccount.service';
import * as payments from '../services/payment.service';
import * as work from '../services/work.service';
import { ok } from '../utils/response';

/** Technicians see and act on only their own profile and assigned jobs. */
export const technicianRouter = Router();
technicianRouter.use(authenticate(), authorize(Role.TECHNICIAN));

technicianRouter.get('/profile', async (req, res) => {
  ok(res, tech.toProfileSummary(await tech.technicianOf(authOf(req).userId)));
});

technicianRouter.get('/profile/details', async (req, res) => {
  ok(res, await account.technicianDetails(authOf(req).userId));
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email().trim().toLowerCase(), z.literal('')]).optional(),
  avatarUrl: z.string().nullable().optional(),
  experienceYears: z.number().int().min(0).max(60),
  bio: z.string().trim().max(500).nullable().optional(),
  languages: z.array(z.string().trim().min(2).max(30)).max(10),
  serviceRadiusKm: z.number().int().min(1).max(50),
  addressLine: z.string().trim().max(255).optional(),
  villageTown: z.string().trim().min(1).max(120),
  district: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(80),
  pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid pincode'),
  baseLatitude: z.number().min(-90).max(90).nullable().optional(),
  baseLongitude: z.number().min(-180).max(180).nullable().optional(),
  dateOfBirth: dateOfBirthSchema(18, 70).optional(),
  alternatePhone: z
    .union([indianPhoneSchema.transform((v) => toE164India(v)), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  hasOwnTools: z.boolean().optional(),
  hasVehicle: z.boolean().optional(),
});

technicianRouter.put('/profile', validate(profileSchema), async (req, res) => {
  ok(res, await account.updateProfile(authOf(req).userId, req.body));
});

technicianRouter.post('/location', validate(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })), async (req, res) => {
  ok(res, await account.updateLocation(authOf(req).userId, req.body.lat, req.body.lng));
});

technicianRouter.get('/payout-details', async (req, res) => {
  ok(res, await account.getPayoutDetails(authOf(req).userId));
});

technicianRouter.put(
  '/payout-details',
  validate(
    z.object({
      payoutUpiId: z.union([z.string().trim().regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, 'Enter a valid UPI ID'), z.literal('')]).optional(),
      bankAccountHolder: z.string().trim().max(120).optional(),
      bankIfsc: z.union([z.string().trim().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'Enter a valid IFSC'), z.literal('')]).optional(),
      bankAccountNumber: z.string().trim().regex(/^\d{9,18}$/, 'Enter a valid account number').optional(),
    }),
  ),
  async (req, res) => {
    ok(res, await account.setPayoutDetails(authOf(req).userId, req.body));
  },
);

technicianRouter.get('/documents', async (req, res) => {
  ok(res, await account.listDocuments(authOf(req).userId));
});

technicianRouter.post(
  '/documents',
  validate(z.object({ type: z.enum(['AADHAAR', 'PAN', 'DRIVING_LICENSE', 'CERTIFICATE', 'PROFILE_PHOTO', 'OTHER']), fileUrl: z.string().max(200) })),
  async (req, res) => {
    ok(res, await account.addDocument(authOf(req).userId, req.body.type, req.body.fileUrl), 201);
  },
);

technicianRouter.delete('/documents/:id', async (req, res) => {
  await account.deleteDocument(authOf(req).userId, String(req.params.id));
  ok(res, { deleted: true });
});

technicianRouter.get('/wallet', async (req, res) => {
  ok(res, await account.wallet(authOf(req).userId));
});

technicianRouter.get('/reviews', async (req, res) => {
  ok(res, await account.myReviews(authOf(req).userId));
});

technicianRouter.get('/performance', async (req, res) => {
  ok(res, await account.performance(authOf(req).userId));
});

technicianRouter.post(
  '/jobs/:id/additional-charges',
  validate(z.object({ title: z.string().trim().min(2).max(160), description: z.string().trim().max(500).optional(), amount: z.number().int().min(100).max(10_000_000) })),
  async (req, res) => {
    await work.requestAdditionalCharge(authOf(req).userId, String(req.params.id), req.body);
    ok(res, await tech.getJob(authOf(req).userId, String(req.params.id)), 201);
  },
);

technicianRouter.post('/jobs/:id/collect-payment', validate(z.object({ method: z.enum(['CASH', 'UPI']) })), async (req, res) => {
  await payments.collectOffline(authOf(req).userId, String(req.params.id), req.body.method);
  ok(res, await tech.getJob(authOf(req).userId, String(req.params.id)));
});

technicianRouter.get('/dashboard', async (req, res) => {
  ok(res, await tech.dashboard(authOf(req).userId));
});

const coordsSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

technicianRouter.post('/online', validate(coordsSchema), async (req, res) => {
  const { lat, lng } = req.body as z.infer<typeof coordsSchema>;
  ok(res, await tech.setOnline(authOf(req).userId, true, lat != null && lng != null ? { lat, lng } : undefined));
});

technicianRouter.post('/offline', async (req, res) => {
  ok(res, await tech.setOnline(authOf(req).userId, false));
});

const jobsQuery = z.object({ tab: z.enum(['all', 'upcoming', 'inProgress', 'completed', 'cancelled']).default('all') });

technicianRouter.get('/jobs', validate(jobsQuery, 'query'), async (req, res) => {
  ok(res, await tech.listJobs(authOf(req).userId, (res.locals.query as z.infer<typeof jobsQuery>).tab));
});

technicianRouter.get('/requests', async (req, res) => {
  ok(res, await tech.pendingRequests(authOf(req).userId));
});

technicianRouter.get('/jobs/:id', async (req, res) => {
  ok(res, await tech.getJob(authOf(req).userId, String(req.params.id)));
});

const ACTIONS: Record<string, TechnicianJobAction> = {
  accept: 'ACCEPT',
  reject: 'REJECT',
  'en-route': 'EN_ROUTE',
  arrived: 'ARRIVED',
  start: 'START',
  complete: 'COMPLETE',
};

for (const [path, action] of Object.entries(ACTIONS)) {
  technicianRouter.post(
    `/jobs/:id/${path}`,
    validate(
      z.object({
        reason: z.string().trim().max(300).optional(),
        // Starting the trip sends the technician's current GPS position.
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
      }),
    ),
    async (req, res) => {
      const { reason, lat, lng } = req.body as { reason?: string; lat?: number; lng?: number };
      ok(res, await tech.performAction(authOf(req).userId, String(req.params.id), action, reason, lat != null && lng != null ? { lat, lng } : undefined));
    },
  );
}

technicianRouter.put('/jobs/:id/notes', validate(z.object({ notes: z.string().trim().max(500) })), async (req, res) => {
  ok(res, await tech.saveNotes(authOf(req).userId, String(req.params.id), req.body.notes));
});

const earningsQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

technicianRouter.get('/earnings', validate(earningsQuery, 'query'), async (req, res) => {
  ok(res, await tech.earnings(authOf(req).userId, (res.locals.query as z.infer<typeof earningsQuery>).month));
});
