import { Router } from 'express';
import { ADMIN_ROLES, Permission } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { authenticate, authorize, requirePermission } from '../middleware/auth';
import { ok } from '../utils/response';

export const adminRouter = Router();
adminRouter.use(authenticate(), authorize(...ADMIN_ROLES));

/** KPI header cards. Charts and activity feeds are added in Phase 9. */
adminRouter.get('/dashboard', requirePermission(Permission.DASHBOARD_VIEW), async (_req, res) => {
  const [totalCustomers, totalTechnicians, totalBookings, revenue] = await prisma.$transaction([
    prisma.customer.count(),
    prisma.technician.count(),
    prisma.booking.count(),
    prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
  ]);
  ok(res, {
    kpis: {
      totalCustomers,
      totalTechnicians,
      totalBookings,
      totalRevenue: revenue._sum.amount ?? 0,
    },
  });
});
