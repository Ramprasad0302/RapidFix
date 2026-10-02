import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AccessTokenPayload, Role } from '@fixora/shared-types';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { hmacSha256, randomToken } from '../utils/crypto';

const ISSUER = 'fixora';
const AUDIENCE = 'fixora-api';
/** A refresh token rotated this recently is treated as a concurrent refresh (two tabs), not theft. */
const REUSE_GRACE_MS = 15_000;

/** Keyed hash: a leaked DB row cannot be matched against a guessed token without the secret. */
const hashRefreshToken = (token: string) => hmacSha256(env.JWT_REFRESH_SECRET, token);

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export function signAccessToken(userId: string, role: Role): { token: string; expiresIn: number } {
  const token = jwt.sign({ role }, env.JWT_SECRET, {
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
  const { exp, iat } = jwt.decode(token) as { exp: number; iat: number };
  return { token, expiresIn: exp - iat };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') throw new Error('bad claims');
    return { sub: payload.sub, role: payload.role as Role };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw AppError.unauthorized('Session expired', 'TOKEN_EXPIRED');
    throw AppError.unauthorized('Invalid session', 'INVALID_TOKEN');
  }
}

/**
 * Background location key for the technician's Android app (the "on duty"
 * service posts GPS while the app is closed). It can do nothing else: its own
 * audience, so it is never accepted as a login, and it only works while the
 * account is an active technician who is online.
 */
const LOCATION_AUDIENCE = 'fixora-location';
export const LOCATION_TOKEN_TTL_S = 7 * 86_400;

export function signLocationToken(userId: string) {
  const token = jwt.sign({ scope: 'technician-location' }, env.JWT_SECRET, {
    subject: userId,
    issuer: ISSUER,
    audience: LOCATION_AUDIENCE,
    algorithm: 'HS256',
    expiresIn: LOCATION_TOKEN_TTL_S,
  });
  return { token, expiresIn: LOCATION_TOKEN_TTL_S };
}

export function verifyLocationToken(token: string): string {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, audience: LOCATION_AUDIENCE, algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || payload.scope !== 'technician-location') throw new Error('bad claims');
    return payload.sub;
  } catch {
    throw AppError.unauthorized('Invalid location key', 'INVALID_TOKEN');
  }
}

export const refreshTtlMs = () => env.JWT_REFRESH_TTL_DAYS * 86_400_000;

export async function issueRefreshToken(userId: string, meta: ClientMeta, familyId: string = randomUUID()) {
  const token = randomToken();
  const row = await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + refreshTtlMs()),
      ip: meta.ip?.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 255),
    },
  });
  return { token, id: row.id };
}

export async function revokeFamily(familyId: string) {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/**
 * Rotates a refresh token: the presented token is revoked and a new one in the
 * same family is issued. Presenting an already-rotated token (outside a short
 * grace window) is treated as theft and kills the whole family.
 */
export async function rotateRefreshToken(presented: string, meta: ClientMeta) {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(presented) },
    include: { user: true },
  });
  if (!existing) throw AppError.unauthorized('Session expired. Please log in again.', 'INVALID_REFRESH_TOKEN');

  if (existing.revokedAt) {
    if (existing.replacedById && Date.now() - existing.revokedAt.getTime() < REUSE_GRACE_MS) {
      throw AppError.conflict('Session is being refreshed, retry', 'REFRESH_IN_PROGRESS');
    }
    await revokeFamily(existing.familyId);
    throw AppError.unauthorized('Session expired. Please log in again.', 'REFRESH_TOKEN_REUSED');
  }
  if (existing.expiresAt.getTime() <= Date.now()) {
    throw AppError.unauthorized('Session expired. Please log in again.', 'REFRESH_TOKEN_EXPIRED');
  }

  const next = await issueRefreshToken(existing.userId, meta, existing.familyId);
  // Conditional update: only one concurrent request can win the rotation.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date(), replacedById: next.id },
  });
  if (count === 0) {
    await prisma.refreshToken.update({ where: { id: next.id }, data: { revokedAt: new Date() } });
    throw AppError.conflict('Session is being refreshed, retry', 'REFRESH_IN_PROGRESS');
  }

  return { user: existing.user, refreshToken: next.token, familyId: existing.familyId };
}

export async function revokeRefreshToken(presented: string) {
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(presented) } });
  if (existing) await revokeFamily(existing.familyId);
}
