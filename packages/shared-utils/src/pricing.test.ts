import { describe, expect, it } from 'vitest';
import { calculateDiscount, calculatePrice, splitCommission } from './pricing';

describe('calculatePrice', () => {
  it('sums service + visit + additional, applies tax on the discounted subtotal', () => {
    const p = calculatePrice({
      serviceCharge: 49_900,
      visitCharge: 9_900,
      additionalCharges: 0,
      taxPercent: 18,
      coupon: { discountType: 'PERCENTAGE', discountValue: 20, minOrderAmount: 0, maxDiscountAmount: null },
    });
    expect(p.subtotal).toBe(59_800);
    expect(p.discount).toBe(11_960);
    expect(p.tax).toBe(Math.round((59_800 - 11_960) * 0.18));
    expect(p.total).toBe(59_800 - 11_960 + p.tax);
  });
});

describe('calculateDiscount', () => {
  it('returns 0 below the minimum order', () => {
    expect(
      calculateDiscount(10_000, { discountType: 'FIXED', discountValue: 5_000, minOrderAmount: 20_000, maxDiscountAmount: null }),
    ).toBe(0);
  });
  it('caps percentage discounts at maxDiscountAmount', () => {
    expect(
      calculateDiscount(100_000, { discountType: 'PERCENTAGE', discountValue: 50, minOrderAmount: 0, maxDiscountAmount: 20_000 }),
    ).toBe(20_000);
  });
  it('never discounts more than the subtotal', () => {
    expect(
      calculateDiscount(3_000, { discountType: 'FIXED', discountValue: 10_000, minOrderAmount: 0, maxDiscountAmount: null }),
    ).toBe(3_000);
  });
});

describe('splitCommission', () => {
  it('15% of ₹1,000 leaves ₹850 for the technician', () => {
    expect(splitCommission(100_000, { type: 'PERCENTAGE', value: 15 })).toEqual({
      gross: 100_000,
      commission: 15_000,
      technicianNet: 85_000,
    });
  });
  it('fixed commission never exceeds gross', () => {
    expect(splitCommission(5_000, { type: 'FIXED', value: 10_000 }).technicianNet).toBe(0);
  });
});
