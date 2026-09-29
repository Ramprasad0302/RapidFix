import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { Role, type AuthAudience } from '@fixora/shared-types';
import { env, isProd } from '../config/env';
import { authOf } from '../middleware/auth';
import * as authService from '../services/auth.service';
import { refreshTtlMs, type ClientMeta } from '../services/token.service';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/response';

/**
 * Refresh tokens never reach JavaScript: each app gets its own httpOnly cookie,
 * scoped to the auth routes. Access tokens live only in memory on the client.
 */
const COOKIE_NAME: Record<AuthAudience, string> = {
  customer: 'fx_rt_customer',
  technician: 'fx_rt_technician',
  admin: 'fx_rt_admin',
};

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: `${env.API_PREFIX}/auth`,
});

function setRefreshCookie(res: Response, audience: AuthAudience, token: string) {
  res.cookie(COOKIE_NAME[audience], token, { ...cookieOptions(), maxAge: refreshTtlMs() });
}

function clearRefreshCookie(res: Response, audience: AuthAudience) {
  res.clearCookie(COOKIE_NAME[audience], cookieOptions());
}

const meta = (req: Request): ClientMeta => ({ ip: req.ip, userAgent: req.get('user-agent') });

export const sendOtpFor =
  (role: typeof Role.CUSTOMER | typeof Role.TECHNICIAN): RequestHandler =>
  async (req, res) => {
    ok(res, await authService.sendOtp(req.body.phone, role, meta(req)));
  };

export const verifyOtpFor =
  (role: typeof Role.CUSTOMER | typeof Role.TECHNICIAN): RequestHandler =>
  async (req, res) => {
    const { session, refreshToken } = await authService.verifyOtp(req.body.phone, role, req.body.otp, meta(req));
    setRefreshCookie(res, role === Role.CUSTOMER ? 'customer' : 'technician', refreshToken);
    ok(res, session);
  };

export const adminLogin: RequestHandler = async (req, res) => {
  const { session, refreshToken } = await authService.adminLogin(req.body.email, req.body.password, meta(req));
  setRefreshCookie(res, 'admin', refreshToken);
  ok(res, session);
};

export const refresh: RequestHandler = async (req, res) => {
  const audience = req.body.audience as AuthAudience;
  const presented: string | undefined = req.cookies?.[COOKIE_NAME[audience]];
  if (!presented) throw AppError.unauthorized('No active session', 'NO_SESSION');
  try {
    const { session, refreshToken } = await authService.refreshSession(presented, audience, meta(req));
    setRefreshCookie(res, audience, refreshToken);
    ok(res, session);
  } catch (err) {
    // A concurrent refresh already set a fresh cookie — keep it.
    if (!(err instanceof AppError && err.code === 'REFRESH_IN_PROGRESS')) clearRefreshCookie(res, audience);
    throw err;
  }
};

export const logout: RequestHandler = async (req, res) => {
  const audience = req.body.audience as AuthAudience;
  await authService.logout(req.cookies?.[COOKIE_NAME[audience]]);
  clearRefreshCookie(res, audience);
  ok(res, { loggedOut: true });
};

export const me: RequestHandler = async (req, res) => {
  ok(res, await authService.getMe(authOf(req).userId));
};
