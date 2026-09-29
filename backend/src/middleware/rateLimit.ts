import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';

const common = {
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  // Integration tests exercise the DB-backed OTP limits directly.
  skip: () => env.NODE_ENV === 'test',
  message: { success: false, message: 'Too many requests. Please try again shortly.', code: 'RATE_LIMITED' },
};

/** Per-IP guard in front of OTP sending (the per-phone limits live in auth.service). */
export const otpSendLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 10 });
export const otpVerifyLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 30 });
export const adminLoginLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 10 });
export const refreshLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 30 });
