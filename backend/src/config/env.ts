import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  OTP_PROVIDER: z.enum(['console', 'msg91', 'twilio']).default('console'),
  OTP_API_KEY: z.string().optional().default(''),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  GOOGLE_MAPS_API_KEY: z.string().optional().default(''),

  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_ENDPOINT: z.string().optional().default(''),
  STORAGE_BUCKET: z.string().optional().default(''),
  STORAGE_ACCESS_KEY: z.string().optional().default(''),
  STORAGE_SECRET_KEY: z.string().optional().default(''),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(5),

  TAX_PERCENT: z.coerce.number().min(0).max(100).default(18),
  ASSIGNMENT_REQUEST_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print only which keys are wrong — never the values.
  const problems = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${problems}`);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.OTP_PROVIDER === 'console') {
  console.error('OTP_PROVIDER=console is not allowed in production.');
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
