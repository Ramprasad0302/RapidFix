import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Client identity for rate limiting. Behind some proxies/sockets req.ip can be
 * missing; fall back to the forwarded header or the socket, never undefined.
 */
export function clientKey(req: Request) {
  const forwarded = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = req.ip ?? forwarded ?? req.socket.remoteAddress;
  return ip ? ipKeyGenerator(ip) : 'unknown-client';
}

/** Shared by every limiter: stable key + no noisy "undefined ip" validation errors. */
export const limiterBase = {
  keyGenerator: clientKey,
  validate: { ip: false },
} as const;

const common = {
  ...limiterBase,
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
