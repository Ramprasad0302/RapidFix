import { Router } from 'express';
import { z } from 'zod';
import { Role, type TechnicianJobAction } from '@fixora/shared-types';
import { authenticate, authOf, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as tech from '../services/technician.service';
import { ok } from '../utils/response';

/** Technicians see and act on only their own profile and assigned jobs. */
export const technicianRouter = Router();
technicianRouter.use(authenticate(), authorize(Role.TECHNICIAN));

technicianRouter.get('/profile', async (req, res) => {
  ok(res, tech.toProfileSummary(await tech.technicianOf(authOf(req).userId)));
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
    validate(z.object({ reason: z.string().trim().max(300).optional() })),
    async (req, res) => {
      ok(res, await tech.performAction(authOf(req).userId, String(req.params.id), action, req.body.reason));
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
