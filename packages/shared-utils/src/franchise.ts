import { z } from 'zod';
import { dateOfBirthSchema, indianPhoneSchema, pincodeSchema } from './validation';

// Verhoeff tables: Aadhaar's last digit is a Verhoeff check digit.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** 12 digits, not starting with 0 or 1, valid Verhoeff check digit (catches most typos). */
export function isValidAadhaar(value: string): boolean {
  const n = value.replace(/\s/g, '');
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  let c = 0;
  [...n].reverse().forEach((ch, i) => {
    c = D[c]![P[i % 8]![Number(ch)]!]!;
  });
  return c === 0;
}

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');

/** Shared by the admin form and the API (POST/PUT /admin/franchises). */
export const franchiseSchema = z
  .object({
    name: z.string().trim().min(3, 'Enter the franchise name').max(120),
    town: z.string().trim().min(2, 'Enter the town or city').max(120),
    district: z.string().trim().min(2, 'Enter the district').max(120),
    state: z.string().trim().min(2).max(80),
    ownerName: z.string().trim().min(2, "Enter the manager's full name").max(120),
    ownerPhone: indianPhoneSchema,
    ownerEmail: z.union([z.literal(''), z.email('Enter a valid email')]).nullish().transform((v) => v || null),
    ownerDateOfBirth: z.union([z.literal(''), dateOfBirthSchema(18)]).nullish().transform((v) => v || null),
    ownerAddress: z.string().trim().min(10, 'Enter the full address').max(500),
    ownerPincode: pincodeSchema,
    aadhaarNumber: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s/g, ''))
      .refine((v) => v === '' || isValidAadhaar(v), 'Enter a valid 12-digit Aadhaar number')
      .optional()
      .transform((v) => v || undefined),
    aadhaarFrontUrl: z.string().trim().min(1, 'Upload the Aadhaar photo (front)').max(512),
    aadhaarBackUrl: optionalText(512),
    panNumber: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid PAN (e.g. ABCDE1234F)')]).nullish().transform((v) => v || null),
    panPhotoUrl: optionalText(512),
    gstin: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN')]).nullish().transform((v) => v || null),
    businessName: optionalText(160),
    commissionPercent: z.coerce.number({ error: 'Enter the commission %' }).min(0, '0–100%').max(100, '0–100%'),
    agreementStart: isoDate,
    agreementEnd: z.union([z.literal(''), isoDate]).nullish().transform((v) => v || null),
    agreementUrl: optionalText(512),
    depositAmount: z.coerce.number().int().min(0).max(10_000_000_00).default(0),
    bankAccountHolder: optionalText(120),
    bankIfsc: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC (e.g. SBIN0001234)')]).nullish().transform((v) => v || null),
    bankAccountNumber: z.union([z.literal(''), z.string().trim().regex(/^\d{9,18}$/, '9–18 digits')]).nullish().transform((v) => v || null),
    upiId: z.union([z.literal(''), z.string().trim().regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, 'Enter a valid UPI ID (e.g. name@okaxis)')]).nullish().transform((v) => v || null),
    emergencyContact: z.union([z.literal(''), indianPhoneSchema]).nullish().transform((v) => v || null),
    notes: optionalText(2000),
    localityIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .refine((v) => !v.agreementEnd || v.agreementEnd > v.agreementStart, { path: ['agreementEnd'], message: 'Must be after the start date' });

export type FranchiseFormInput = z.input<typeof franchiseSchema>;
export type FranchiseFormOutput = z.output<typeof franchiseSchema>;
