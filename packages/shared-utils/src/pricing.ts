import type { DiscountType } from '@fixora/shared-types';

/**
 * Pure pricing math. The backend is authoritative — it calls these with
 * values loaded from the database. Frontends may call them only to preview.
 * All amounts are integer paise.
 */

export interface CouponRule {
  discountType: DiscountType;
  /** Percentage (0–100) for PERCENTAGE, paise for FIXED. */
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
}

export interface PriceInput {
  serviceCharge: number;
  visitCharge: number;
  additionalCharges: number;
  /** e.g. 18 for 18% GST. */
  taxPercent: number;
  coupon?: CouponRule | null;
}

export interface PriceBreakdown {
  serviceCharge: number;
  visitCharge: number;
  additionalCharges: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function calculateDiscount(subtotal: number, coupon: CouponRule | null | undefined): number {
  if (!coupon || subtotal < coupon.minOrderAmount) return 0;
  let discount =
    coupon.discountType === 'PERCENTAGE'
      ? Math.floor((subtotal * coupon.discountValue) / 100)
      : coupon.discountValue;
  if (coupon.maxDiscountAmount != null) discount = Math.min(discount, coupon.maxDiscountAmount);
  return Math.max(0, Math.min(discount, subtotal));
}

export function calculatePrice(input: PriceInput): PriceBreakdown {
  const subtotal = input.serviceCharge + input.visitCharge + input.additionalCharges;
  const discount = calculateDiscount(subtotal, input.coupon);
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * input.taxPercent) / 100);
  return {
    serviceCharge: input.serviceCharge,
    visitCharge: input.visitCharge,
    additionalCharges: input.additionalCharges,
    subtotal,
    discount,
    tax,
    total: taxable + tax,
  };
}

export interface CommissionRule {
  type: DiscountType;
  /** Percentage (0–100) for PERCENTAGE, paise for FIXED. */
  value: number;
}

export interface CommissionSplit {
  gross: number;
  commission: number;
  technicianNet: number;
}

/** Commission is taken on the pre-tax service amount (tax is remitted by the platform). */
export function splitCommission(gross: number, rule: CommissionRule): CommissionSplit {
  const raw = rule.type === 'PERCENTAGE' ? Math.round((gross * rule.value) / 100) : rule.value;
  const commission = Math.max(0, Math.min(raw, gross));
  return { gross, commission, technicianNet: gross - commission };
}
