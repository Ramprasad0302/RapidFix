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
  /** Open connections kept in the pool (hosted databases limit connections per hour). */
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(5),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // `console` prints codes to the log (development only — production refuses it); `msg91` sends SMS
  // from the server; `firebase` = Firebase phone auth in the app, verified here (needs FIREBASE_PROJECT_ID).
  OTP_PROVIDER: z.enum(['console', 'msg91', 'firebase']).default('console'),
  OTP_API_KEY: z.string().optional().default(''),
  OTP_TEMPLATE_ID: z.string().optional().default(''),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(30),
  OTP_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),

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
  /** Relative paths resolve from the working directory (the backend folder). */
  UPLOAD_DIR: z.string().default('uploads'),
  PRIVATE_UPLOAD_DIR: z.string().default('uploads-private'),

  DATA_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'DATA_ENCRYPTION_KEY must be 64 hex chars').optional(),
  PUSH_PROVIDER: z.enum(['none', 'fcm']).default('none'),
  WEB_APP_URL: z.string().url().default('http://localhost:5173'),

  /** Swagger UI at /api/docs. `auto` = on everywhere except production. */
  API_DOCS: z.enum(['auto', 'on', 'off']).default('auto'),

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

if (parsed.data.OTP_PROVIDER === 'msg91' && (!parsed.data.OTP_API_KEY || !parsed.data.OTP_TEMPLATE_ID)) {
  console.error('OTP_PROVIDER=msg91 needs OTP_API_KEY and OTP_TEMPLATE_ID.');
  process.exit(1);
}

if (parsed.data.OTP_PROVIDER === 'firebase' && !parsed.data.FIREBASE_PROJECT_ID) {
  console.error('OTP_PROVIDER=firebase needs FIREBASE_PROJECT_ID.');
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && !parsed.data.DATA_ENCRYPTION_KEY) {
  console.error('DATA_ENCRYPTION_KEY is required in production.');
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
