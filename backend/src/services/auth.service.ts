import bcrypt from 'bcryptjs';
import { isAdminRole, Role, type AuthSession, type AuthUser, type SendOtpResult } from '@fixora/shared-types';
import { toE164India } from '@fixora/shared-utils';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { Prisma, type User } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { generateOtp, hmacSha256, randomReferralCode, safeEqual } from '../utils/crypto';
import { recordAudit } from './audit.service';
import { otpProvider } from './otp';
import {
  issueRefreshToken,
  revokeFamily,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  type ClientMeta,
} from './token.service';

/**
 * One login for everyone. A phone number maps to exactly one account; the
 * account's role (set by admins) decides where the client takes the user.
 */

const hashOtp = (phone: string, code: string) => hmacSha256(env.JWT_SECRET, `${phone}|${code}`);

// Pre-computed so a login for an unknown email costs the same as a wrong password.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('fixora-timing-equaliser', 12);

export const userInclude = {
  technician: { select: { id: true, verificationStatus: true, isOnline: true } },
} as const;
type UserWithTech = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export function toAuthUser(u: UserWithTech): AuthUser {
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    phone: u.phone,
    email: u.email,
    avatarUrl: u.avatarUrl,
    ...(u.technician && { technician: u.technician }),
  };
}

/** Throws when the account may not sign in (suspended user, suspended/blocked technician). */
export function assertCanSignIn(user: Pick<User, 'status' | 'role'> & { technician?: { verificationStatus: string } | null }) {
  if (user.status !== 'ACTIVE') {
    throw AppError.forbidden('Your account is suspended. Please contact RapidFix support.', 'ACCOUNT_SUSPENDED');
  }
  if (user.role === Role.TECHNICIAN) {
    const vs = user.technician?.verificationStatus;
    if (vs === 'SUSPENDED' || vs === 'BLOCKED') {
      throw AppError.forbidden(
        `Your partner account is ${vs.toLowerCase()}. Please contact RapidFix support.`,
        `TECHNICIAN_${vs}`,
      );
    }
  }
}

// ─── OTP ─────────────────────────────────────────────────────────────────

export async function sendOtp(rawPhone: string, meta: ClientMeta): Promise<SendOtpResult> {
  const phone = toE164India(rawPhone);

  const existing = await prisma.user.findUnique({ where: { phone }, include: userInclude });
  if (existing) assertCanSignIn(existing);

  const now = Date.now();
  const recent = await prisma.otpCode.findMany({
    where: { phone, createdAt: { gte: new Date(now - 3_600_000) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const last = recent[0];
  if (last) {
    const waitMs = last.createdAt.getTime() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000 - now;
    if (waitMs > 0) {
      const retryAfterSeconds = Math.ceil(waitMs / 1000);
      throw new AppError(429, 'OTP_COOLDOWN', `Please wait ${retryAfterSeconds}s before requesting a new OTP.`, {
        retryAfterSeconds,
      });
    }
  }
  if (recent.length >= env.OTP_MAX_PER_HOUR) {
    throw AppError.tooMany('Too many OTP requests. Please try again after some time.', 'OTP_LIMIT');
  }

  const code = generateOtp();
  const [, created] = await prisma.$transaction([
    // Only the newest code is ever valid.
    prisma.otpCode.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } }),
    prisma.otpCode.create({
      data: {
        phone,
        codeHash: hashOtp(phone, code),
        expiresAt: new Date(now + env.OTP_TTL_SECONDS * 1000),
        ip: meta.ip?.slice(0, 64),
      },
    }),
  ]);

  try {
    await otpProvider.send({ phone, code, expiresInSeconds: env.OTP_TTL_SECONDS });
  } catch (err) {
    // Undelivered code: drop it so the cooldown doesn't block an immediate retry.
    await prisma.otpCode.delete({ where: { id: created.id } }).catch(() => undefined);
    throw err;
  }

  return {
    resendInSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    expiresInSeconds: env.OTP_TTL_SECONDS,
    ...(otpProvider.exposesCode && { devCode: code }),
  };
}

async function consumeOtp(phone: string, code: string) {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt.getTime() <= Date.now()) {
    throw AppError.badRequest('This OTP has expired. Please request a new one.', 'OTP_EXPIRED');
  }
  if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw AppError.tooMany('Too many incorrect attempts. Please request a new OTP.', 'OTP_LOCKED');
  }
  if (!safeEqual(hashOtp(phone, code), otp.codeHash)) {
    const { attempts } = await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    const left = env.OTP_MAX_ATTEMPTS - attempts;
    throw left > 0
      ? AppError.badRequest(`Incorrect OTP. ${left} attempt${left === 1 ? '' : 's'} left.`, 'OTP_INVALID')
      : AppError.tooMany('Too many incorrect attempts. Please request a new OTP.', 'OTP_LOCKED');
  }
  // Single use, even under concurrent submissions.
  const { count } = await prisma.otpCode.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count === 0) throw AppError.badRequest('This OTP has already been used.', 'OTP_EXPIRED');
}

/** New numbers become customers; admins can change the role later. */
async function createCustomerUser(phone: string): Promise<UserWithTech> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.user.create({
        data: { role: Role.CUSTOMER, phone, customer: { create: { referralCode: randomReferralCode() } } },
        include: userInclude,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        if (String(err.meta?.target ?? '').includes('referral')) continue;
        // A concurrent first login created the account already.
        const existing = await prisma.user.findUnique({ where: { phone }, include: userInclude });
        if (existing) return existing;
      }
      throw err;
    }
  }
  throw new AppError(500, 'REFERRAL_CODE_EXHAUSTED', 'Something went wrong');
}

async function startSession(user: UserWithTech, meta: ClientMeta, isNewUser?: boolean) {
  const { token: accessToken, expiresIn } = signAccessToken(user.id, user.role);
  const refresh = await issueRefreshToken(user.id, meta);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  if (isAdminRole(user.role)) {
    await prisma.adminUser.updateMany({ where: { userId: user.id }, data: { lastLoginIp: meta.ip?.slice(0, 64) ?? null } });
    await recordAudit({ actorId: user.id, actorRole: user.role, action: 'ADMIN_LOGIN', entity: 'User', entityId: user.id, ip: meta.ip });
  }
  const session: AuthSession = { user: toAuthUser(user), accessToken, expiresIn };
  if (isNewUser !== undefined) session.isNewUser = isNewUser;
  return { session, refreshToken: refresh.token };
}

export async function verifyOtp(rawPhone: string, code: string, meta: ClientMeta) {
  const phone = toE164India(rawPhone);
  await consumeOtp(phone, code);

  let user = await prisma.user.findUnique({ where: { phone }, include: userInclude });
  let isNewUser = false;
  if (!user) {
    user = await createCustomerUser(phone);
    isNewUser = true;
  }
  assertCanSignIn(user);
  return startSession(user, meta, isNewUser);
}

// ─── Staff email + password (same login page, alternative method) ────────

export async function passwordLogin(email: string, password: string, meta: ClientMeta) {
  const user = await prisma.user.findUnique({ where: { email }, include: userInclude });
  const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const valid = await bcrypt.compare(password, hash);

  if (!user || !user.passwordHash || !valid) {
    if (user && isAdminRole(user.role)) {
      await recordAudit({ actorId: user.id, actorRole: user.role, action: 'ADMIN_LOGIN_FAILED', entity: 'User', entityId: user.id, ip: meta.ip });
    }
    throw AppError.unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
  }
  assertCanSignIn(user);
  return startSession(user, meta);
}

// ─── Refresh / logout / me ───────────────────────────────────────────────

export async function refreshSession(presented: string, meta: ClientMeta) {
  const { user, refreshToken, familyId } = await rotateRefreshToken(presented, meta);
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude });
  try {
    assertCanSignIn(full);
  } catch (err) {
    await revokeFamily(familyId);
    throw err;
  }
  const { token: accessToken, expiresIn } = signAccessToken(full.id, full.role);
  const session: AuthSession = { user: toAuthUser(full), accessToken, expiresIn };
  return { session, refreshToken };
}

export async function logout(presented: string | undefined) {
  if (presented) await revokeRefreshToken(presented);
}

export async function getMe(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userInclude });
  if (!user) throw AppError.unauthorized('Account not found', 'INVALID_TOKEN');
  return toAuthUser(user);
}
