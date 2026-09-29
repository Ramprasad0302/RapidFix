import { z } from 'zod';

export { adminLoginSchema, sendOtpSchema, verifyOtpSchema } from '@fixora/shared-utils';

export const audienceSchema = z.object({
  audience: z.enum(['customer', 'technician', 'admin']),
});
