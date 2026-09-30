const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** Amounts are stored in paise (integer) everywhere; format for display. */
export function formatINR(paise: number): string {
  return inr.format(Math.round(paise) / 100);
}

export const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);

/** RF-2026-000123 */
export function formatBookingCode(year: number, sequence: number): string {
  return `RF-${year}-${String(sequence).padStart(6, '0')}`;
}

/** "+91 98765 43210" for display; storage is always E.164 (+919876543210). */
export function formatIndianPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : e164;
}

export function toE164India(tenDigits: string): string {
  return `+91${tenDigits.replace(/\D/g, '').slice(-10)}`;
}
