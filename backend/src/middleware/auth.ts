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

/** For handlers behind `authenticate()` — narrows `req.auth` without non-null assertions. */
export function authOf(req: Request) {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}
