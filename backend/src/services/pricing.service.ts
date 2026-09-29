import type { PriceBreakdownDto } from '@fixora/shared-types';
import { calculatePrice, formatINR } from '@fixora/shared-utils';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import type { Coupon, Service } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';

export type CouponCheck = { coupon: Coupon; valid: true } | { coupon: Coupon | null; valid: false; message: string };

/**
 * Server-side coupon rules. `customerId` enables per-customer rules
 * (usage limit, first booking); without it those are checked at booking time.
 */
export async function checkCoupon(
  rawCode: string,
  service: Pick<Service, 'id' | 'categoryId' | 'basePrice' | 'visitCharge'>,
  customerId?: string | null,
): Promise<CouponCheck> {
  const code = rawCode.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  const now = new Date();
  const invalid = (message: string): CouponCheck => ({ coupon, valid: false, message });

  if (!coupon || !coupon.isActive) return invalid('This coupon code is not valid.');
  if (coupon.startsAt > now) return invalid('This offer has not started yet.');
  if (coupon.endsAt < now) return invalid('This offer has expired.');
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return invalid('This offer is fully redeemed.');
  if (coupon.serviceId && coupon.serviceId !== service.id) return invalid('This coupon is not valid for this service.');
  if (coupon.categoryId && coupon.categoryId !== service.categoryId) return invalid('This coupon is not valid for this service.');
  const subtotal = service.basePrice + service.visitCharge;
  if (subtotal < coupon.minOrderAmount) return invalid(`Minimum order of ${formatINR(coupon.minOrderAmount)} required.`);

  if (customerId) {
    const used = await prisma.couponUsage.count({ where: { couponId: coupon.id, customerId } });
    if (used >= coupon.perCustomerLimit) return invalid('You have already used this coupon.');
    if (coupon.isFirstBookingOnly) {
      const previous = await prisma.booking.count({
        where: { customerId, status: { notIn: ['CUSTOMER_CANCELLED', 'ADMIN_CANCELLED', 'TECHNICIAN_CANCELLED'] } },
      });
      if (previous > 0) return invalid('This offer is for your first booking only.');
    }
  }
  return { coupon, valid: true };
}

export interface Estimate {
  service: Service;
  breakdown: PriceBreakdownDto;
  coupon: Coupon | null;
}

export async function estimatePrice(serviceId: string, couponCode?: string | null, customerId?: string | null): Promise<Estimate> {
  const service = await prisma.service.findFirst({ where: { id: serviceId, isActive: true } });
  if (!service) throw AppError.notFound('This service is not available', 'SERVICE_NOT_FOUND');

  const check = couponCode ? await checkCoupon(couponCode, service, customerId) : null;
  const applied = check?.valid ? check.coupon : null;

  const p = calculatePrice({
    serviceCharge: service.basePrice,
    visitCharge: service.visitCharge,
    additionalCharges: 0,
    taxPercent: env.TAX_PERCENT,
    coupon: applied,
  });

  return {
    service,
    coupon: applied,
    breakdown: {
      ...p,
      taxPercent: env.TAX_PERCENT,
      coupon: check
        ? { code: couponCode!.trim().toUpperCase(), valid: check.valid, message: check.valid ? null : check.message }
        : null,
    },
  };
}
