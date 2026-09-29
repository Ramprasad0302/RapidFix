import { z } from 'zod';

/** 10-digit Indian mobile, optional +91/0 prefix and spaces. */
export const indianPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'));

export const otpSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit OTP');

export const pincodeSchema = z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode');

export const sendOtpSchema = z.object({ phone: indianPhoneSchema });
export const verifyOtpSchema = z.object({ phone: indianPhoneSchema, otp: otpSchema });

export const adminLoginSchema = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const addressSchema = z.object({
  label: z.enum(['HOME', 'WORK', 'OTHER']).default('HOME'),
  houseNo: z.string().trim().min(1, 'Required').max(120),
  street: z.string().trim().max(160).optional().default(''),
  area: z.string().trim().min(1, 'Required').max(120),
  villageTown: z.string().trim().min(1, 'Required').max(120),
  district: z.string().trim().min(1, 'Required').max(120),
  state: z.string().trim().min(1, 'Required').max(80),
  pincode: pincodeSchema,
  landmark: z.string().trim().max(160).optional().default(''),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isDefault: z.boolean().optional().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;
