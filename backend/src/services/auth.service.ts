import bcrypt from 'bcryptjs';
import {
  ADMIN_ROLES,
  isAdminRole,
  Role,
  type AuthAudience,
  type AuthSession,
  type AuthUser,
  type SendOtpResult,
} from '@fixora/shared-types';
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

type OtpRole = typeof Role.CUSTOMER | typeof Role.TECHNICIAN;

/** Bound to phone + role so a customer code can never unlock a technician account. */
const hashOtp = (phone: string, role: OtpRole, code: string) => hmacSha256(env.JWT_SECRET, `${phone}|${role}|${code}`);

// Pre-computed so a login for an unknown email costs the same as a wrong password.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('fixora-timing-equaliser', 12);

const userInclude = { technician: { select: { id: true, verificationStatus: true, isOnline: true } } } as const;
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

function assertUserActive(user: Pick<User, 'status'>) {
  if (user.status !== 'ACTIVE') {
    throw AppError.forbidden('Your account is suspended. Please contact FIXORA support.', 'ACCOUNT_SUSPENDED');
  }
}

/** Technicians may sign in while PENDING/REJECTED (to see their status) but not when suspended or blocked. */
function assertTechnicianCanLogin(user: UserWithTech) {
  assertUserActive(user);
  const status = user.technician?.verificationStatus;
  if (!status) throw AppError.forbidden('Technician profile not found', 'TECHNICIAN_PROFILE_MISSING');
  if (status === 'SUSPENDED' || status === 'BLOCKED') {
    throw AppError.forbidden(
      `Your partner account is ${status.toLowerCase()}. Please contact FIXORA support.`,
      'TECHNICIAN_' + status,
    );
  }
}

// ─── OTP ─────────────────────────────────────────────────────────────────

export async function sendOtp(rawPhone: string, role: OtpRole, meta: ClientMeta): Promise<SendOtpResult> {
  const phone = toE164India(rawPhone);

  if (role === Role.TECHNICIAN) {
    const tech = await prisma.user.findUnique({
      where: { phone_role: { phone, role } },
      include: userInclude,
    });
    if (!tech) {
      throw AppError.notFound(
        'This number is not registered as a FIXORA partner. Please register first.',
        'TECHNICIAN_NOT_REGISTERED',
      );
    }
    assertTechnicianCanLogin(tech);
  } else {
    const existing = await prisma.user.findUnique({ where: { phone_role: { phone, role } } });
    if (existing) assertUserActive(existing);
  }

  const now = Date.now();
  const recent = await prisma.otpCode.findMany({
    where: { phone, role, createdAt: { gte: new Date(now - 3_600_000) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const last = recent[0];
  if (last) {
    const waitMs = last.createdAt.getTime() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000 - now;
    if (waitMs > 0) {
      throw new AppError(429, 'OTP_COOLDOWN', `Please wait ${Math.ceil(waitMs / 1000)}s before requesting a new OTP.`, {
        retryAfterSeconds: Math.ceil(waitMs / 1000),
      });
    }
  }
  if (recent.length >= env.OTP_MAX_PER_HOUR) {
    throw AppError.tooMany('Too many OTP requests. Please try again after some time.', 'OTP_LIMIT');
  }

  const code = generateOtp();
  await prisma.$transaction([
    // Only the newest code is ever valid.
    prisma.otpCode.updateMany({ where: { phone, role, consumedAt: null }, data: { consumedAt: new Date() } }),
    prisma.otpCode.create({
      data: {
        phone,
        role,
        codeHash: hashOtp(phone, role, code),
        expiresAt: new Date(now + env.OTP_TTL_SECONDS * 1000),
        ip: meta.ip?.slice(0, 64),
      },
    }),
  ]);

  await otpProvider.send({ phone, code, expiresInSeconds: env.OTP_TTL_SECONDS });

  return {
    resendInSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    expiresInSeconds: env.OTP_TTL_SECONDS,
    ...(otpProvider.exposesCode && { devCode: code }),
  };
}

async function consumeOtp(phone: string, role: OtpRole, code: string) {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, role, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt.getTime() <= Date.now()) {
    throw AppError.badRequest('This OTP has expired. Please request a new one.', 'OTP_EXPIRED');
  }
  if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw AppError.tooMany('Too many incorrect attempts. Please request a new OTP.', 'OTP_LOCKED');
  }
  if (!safeEqual(hashOtp(phone, role, code), otp.codeHash)) {
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

async function createCustomerUser(phone: string): Promise<UserWithTech> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.user.create({
        data: { role: Role.CUSTOMER, phone, customer: { create: { referralCode: randomReferralCode() } } },
        include: userInclude,
      });
    } catch (err) {
      const target = err instanceof Prisma.PrismaClientKnownRequestError ? String(err.meta?.target ?? '') : '';
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        if (target.includes('referral')) continue; // referral code collision → retry
        // Concurrent first login created the user already.
        const existing = await prisma.user.findUnique({ where: { phone_role: { phone, role: Role.CUSTOMER } }, include: userInclude });
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
  const session: AuthSession = { user: toAuthUser(user), accessToken, expiresIn };
  if (isNewUser !== undefined) session.isNewUser = isNewUser;
  return { session, refreshToken: refresh.token };
}

export async function verifyOtp(rawPhone: string, role: OtpRole, code: string, meta: ClientMeta) {
  const phone = toE164India(rawPhone);
  await consumeOtp(phone, role, code);

  let user = await prisma.user.findUnique({ where: { phone_role: { phone, role } }, include: userInclude });
  let isNewUser = false;

  if (role === Role.TECHNICIAN) {
    if (!user) throw AppError.notFound('This number is not registered as a FIXORA partner.', 'TECHNICIAN_NOT_REGISTERED');
    assertTechnicianCanLogin(user);
  } else if (!user) {
    user = await createCustomerUser(phone);
    isNewUser = true;
  } else {
    assertUserActive(user);
  }

  return startSession(user, meta, role === Role.CUSTOMER ? isNewUser : undefined);
}

// ─── Admin ───────────────────────────────────────────────────────────────

export async function adminLogin(email: string, password: string, meta: ClientMeta) {
  const user = await prisma.user.findUnique({ where: { email }, include: userInclude });
  const isAdmin = !!user && isAdminRole(user.role);
  const valid = await bcrypt.compare(password, isAdmin && user.passwordHash ? user.passwordHash : DUMMY_PASSWORD_HASH);

  if (!isAdmin || !user.passwordHash || !valid) {
    if (isAdmin) {
      await recordAudit({ actorId: user.id, actorRole: user.role, action: 'ADMIN_LOGIN_FAILED', entity: 'User', entityId: user.id, ip: meta.ip });
    }
    throw AppError.unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
  }
  assertUserActive(user);

  const result = await startSession(user, meta);
  await prisma.adminUser.updateMany({ where: { userId: user.id }, data: { lastLoginIp: meta.ip?.slice(0, 64) ?? null } });
  await recordAudit({ actorId: user.id, actorRole: user.role, action: 'ADMIN_LOGIN', entity: 'User', entityId: user.id, ip: meta.ip });
  return result;
}

// ─── Refresh / logout / me ───────────────────────────────────────────────

const AUDIENCE_ROLES: Record<AuthAudience, readonly Role[]> = {
  customer: [Role.CUSTOMER],
  technician: [Role.TECHNICIAN],
  admin: ADMIN_ROLES,
};

export async function refreshSession(presented: string, audience: AuthAudience, meta: ClientMeta) {
  const { user, refreshToken, familyId } = await rotateRefreshToken(presented, meta);
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude });

  const revokeAnd = async (err: AppError) => {
    await revokeFamily(familyId);
    throw err;
  };
  if (!AUDIENCE_ROLES[audience].includes(full.role)) {
    await revokeAnd(AppError.forbidden('This account cannot use this app', 'WRONG_APP'));
  }
  try {
    if (full.role === Role.TECHNICIAN) assertTechnicianCanLogin(full);
    else assertUserActive(full);
  } catch (err) {
    await revokeAnd(err as AppError);
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
