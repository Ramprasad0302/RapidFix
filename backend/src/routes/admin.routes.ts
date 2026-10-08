import { Router } from 'express';
import { z } from 'zod';
import { ADMIN_ROLES, Permission } from '@fixora/shared-types';
import { authenticate, authOf, authorize, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as admin from '../services/admin.service';
import * as assignment from '../services/assignment.service';
import { assertBooking, scopeOf, type Scope } from '../services/franchiseScope';
import { adminModulesRouter } from './adminModules.routes';
import { ok, paginationMeta } from '../utils/response';

export const adminRouter = Router();
adminRouter.use(authenticate(), authorize(...ADMIN_ROLES));
// Franchise managers see only their franchise; everyone else sees everything.
adminRouter.use(async (req, res, next) => {
  try {
    res.locals.scope = await scopeOf(authOf(req));
    next();
  } catch (err) {
    next(err);
  }
});
adminRouter.use(adminModulesRouter);
const scope = (res: { locals: Record<string, unknown> }) => res.locals.scope as Scope;

const dashboardQuery = z.object({ range: z.enum(['today', '7d', '30d']).default('7d') });

adminRouter.get('/dashboard', requirePermission(Permission.DASHBOARD_VIEW), validate(dashboardQuery, 'query'), async (_req, res) => {
  ok(res, await admin.dashboard((res.locals.query as z.infer<typeof dashboardQuery>).range, scope(res)));
});

const usersQuery = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(admin.ASSIGNABLE_ROLES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

adminRouter.get('/users', requirePermission(Permission.USERS_MANAGE), validate(usersQuery, 'query'), async (_req, res) => {
  const q = res.locals.query as z.infer<typeof usersQuery>;
  const { items, total } = await admin.listUsers(q);
  ok(res, items, 200, paginationMeta(q.page, q.pageSize, total));
});

// ─── Manual dispatch ─────────────────────────────────────────────────────

adminRouter.get('/bookings/:id/candidates', requirePermission(Permission.BOOKINGS_MANAGE), async (req, res) => {
  await assertBooking(scope(res), String(req.params.id));
  ok(res, await assignment.candidatesForAdmin(String(req.params.id)));
});

adminRouter.post(
  '/bookings/:id/assign',
  requirePermission(Permission.BOOKINGS_MANAGE),
  validate(z.object({ technicianId: z.uuid() })),
  async (req, res) => {
    await assertBooking(scope(res), String(req.params.id));
    await assignment.assignManually(String(req.params.id), req.body.technicianId, authOf(req), req.ip);
    ok(res, { assigned: true });
  },
);

adminRouter.patch(
  '/users/:id/role',
  requirePermission(Permission.USERS_MANAGE),
  validate(z.object({ role: z.enum(admin.ASSIGNABLE_ROLES) })),
  async (req, res) => {
    const updated = await admin.changeRole(authOf(req), String(req.params.id), req.body.role, req.ip);
    ok(res, { id: updated.id, role: updated.role });
  },
);
