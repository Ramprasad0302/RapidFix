import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { env, isProd } from '../config/env';
import { authOf } from '../middleware/auth';
import * as authService from '../services/auth.service';
import { refreshTtlMs, type ClientMeta } from '../services/token.service';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/response';

/**
 * The refresh token never reaches JavaScript: it lives in one httpOnly cookie
 * scoped to the auth routes. Access tokens live only in memory on the client.
 */
export const REFRESH_COOKIE = 'fx_rt';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: `${env.API_PREFIX}/auth`,
});

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), maxAge: refreshTtlMs() });
const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, cookieOptions());

const meta = (req: Request): ClientMeta => ({ ip: req.ip, userAgent: req.get('user-agent') });

export const sendOtp: RequestHandler = async (req, res) => {
  ok(res, await authService.sendOtp(req.body.phone, meta(req)));
};

export const verifyOtp: RequestHandler = async (req, res) => {
  const { session, refreshToken } = await authService.verifyOtp(req.body.phone, req.body.otp, meta(req));
  setRefreshCookie(res, refreshToken);
  ok(res, session);
};

export const passwordLogin: RequestHandler = async (req, res) => {
  const { session, refreshToken } = await authService.passwordLogin(req.body.email, req.body.password, meta(req));
  setRefreshCookie(res, refreshToken);
  ok(res, session);
};

export const refresh: RequestHandler = async (req, res) => {
  const presented: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (!presented) throw AppError.unauthorized('No active session', 'NO_SESSION');
  try {
    const { session, refreshToken } = await authService.refreshSession(presented, meta(req));
    setRefreshCookie(res, refreshToken);
    ok(res, session);
  } catch (err) {
    // A concurrent refresh already set a fresh cookie — keep it.
    if (!(err instanceof AppError && err.code === 'REFRESH_IN_PROGRESS')) clearRefreshCookie(res);
    throw err;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  ok(res, { loggedOut: true });
};

export const me: RequestHandler = async (req, res) => {
  ok(res, await authService.getMe(authOf(req).userId));
};
