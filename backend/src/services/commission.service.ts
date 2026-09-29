import { splitCommission, type CommissionRule } from '@fixora/shared-utils';
import { prisma } from '../config/prisma';

/**
 * Most specific active rule wins: technician → service → category → location → global.
 * Falls back to 15% if nothing is configured.
 */
export async function resolveCommissionRule(ctx: {
  technicianId?: string | null;
  serviceId: string;
  categoryId: string;
  locationId?: string | null;
}): Promise<CommissionRule> {
  const rules = await prisma.commission.findMany({
    where: {
      isActive: true,
      OR: [
        { scope: 'GLOBAL' },
        { scope: 'CATEGORY', categoryId: ctx.categoryId },
        { scope: 'SERVICE', serviceId: ctx.serviceId },
        ...(ctx.locationId ? [{ scope: 'LOCATION' as const, locationId: ctx.locationId }] : []),
        ...(ctx.technicianId ? [{ scope: 'TECHNICIAN' as const, technicianId: ctx.technicianId }] : []),
      ],
    },
  });
  const order = ['TECHNICIAN', 'SERVICE', 'CATEGORY', 'LOCATION', 'GLOBAL'] as const;
  const rule = order.map((scope) => rules.find((r) => r.scope === scope)).find(Boolean);
  return rule ? { type: rule.type, value: rule.value } : { type: 'PERCENTAGE', value: 15 };
}

/** Technician's estimated share of a booking's pre-tax amount. */
export async function estimateTechnicianEarning(b: {
  serviceCharge: number;
  visitCharge: number;
  additionalChargesTotal: number;
  discountAmount: number;
  serviceId: string;
  categoryId: string;
  locationId: string | null;
  technicianId: string;
}) {
  const gross = b.serviceCharge + b.visitCharge + b.additionalChargesTotal - b.discountAmount;
  const rule = await resolveCommissionRule(b);
  return splitCommission(gross, rule).technicianNet;
}
