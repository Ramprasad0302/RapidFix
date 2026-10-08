import { z } from 'zod';
import { isValidAadhaar } from './franchise';

/** Bank / UPI / ID fields used wherever someone is paid (technicians, franchises). */
export const ifscSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC (e.g. SBIN0001234)');
export const bankAccountSchema = z.string().trim().regex(/^\d{9,18}$/, 'Enter a valid account number (9–18 digits)');
export const upiIdSchema = z.string().trim().regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, 'Enter a valid UPI ID (e.g. name@okaxis)');
export const panSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid PAN (e.g. ABCDE1234F)');
export const aadhaarSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, ''))
  .refine(isValidAadhaar, 'Enter a valid 12-digit Aadhaar number');

/** Required at partner sign-up so earnings can be paid out. */
export const partnerPayoutSchema = z.object({
  bankAccountHolder: z.string().trim().min(2, "Enter the account holder's name").max(120),
  bankAccountNumber: bankAccountSchema,
  bankIfsc: ifscSchema,
  payoutUpiId: z.union([z.literal(''), upiIdSchema]).nullish().transform((v) => v || null),
  aadhaarNumber: aadhaarSchema,
  panNumber: z.union([z.literal(''), panSchema]).nullish().transform((v) => v || null),
});
