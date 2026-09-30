import type { Request, RequestHandler } from 'express';
import { hasPermission, type Permission, type Role } from '@fixora/shared-types';
import { verifyAccessToken } from '../services/token.service';
import { AppError } from '../utils/AppError';

/** Requires a valid Bearer access token; sets `req.auth`. */
export function authenticate(): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized());
    const { sub, role } = verifyAccessToken(header.slice(7).trim());
    req.auth = { userId: sub, role };
    next();
  };
}

/** Attaches `req.auth` when a valid token is present; guests pass through untouched. */
export function optionalAuthenticate(): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const { sub, role } = verifyAccessToken(header.slice(7).trim());
        req.auth = { userId: sub, role };
      } catch {
        // An expired token on a public route is treated as a guest.
      }
    }
    next();
  };
}

/** Restricts a route to the given roles. Must run after `authenticate()`. */
export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(AppError.forbidden());
    next();
  };
}

/** Admin capability check (SUPER_ADMIN / ADMIN / OPERATIONS / SUPPORT / FINANCE matrix). */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!hasPermission(req.auth.role, permission)) return next(AppError.forbidden());
    next();
  };
}

/** Any one of several permissions (e.g. reading a booking from the payments or complaints module). */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!permissions.some((p) => hasPermission(req.auth!.role, p))) return next(AppError.forbidden());
    next();
  };
}

/** For handlers behind `authenticate()` — narrows `req.auth` without non-null assertions. */
export function authOf(req: Request) {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}
