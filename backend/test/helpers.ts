import bcrypt from 'bcryptjs';
import supertest from 'supertest';
import { vi } from 'vitest';
import type { Role } from '@fixora/shared-types';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { otpProvider } from '../src/services/otp';
import { signAccessToken } from '../src/services/token.service';

export const app = createApp();
export const request = () => supertest(app);
export const API = '/api/v1';

/** Empties every table (FK checks off) so each test starts clean. */
export async function resetDb() {
  const tables = await prisma.$queryRawUnsafe<{ t: string }[]>(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'`,
  );
  // One connection (FOREIGN_KEY_CHECKS is per session). TRUNCATE is slow DDL on MySQL 8.4 — ~40
  // tables can take longer than Prisma's default 5 s transaction limit on a CI runner.
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
      for (const { t } of tables) await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${t}\``);
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

/** Captures OTP codes as the provider "sends" them. */
export function captureOtps() {
  const sent: { phone: string; code: string }[] = [];
  vi.spyOn(otpProvider, 'send').mockImplementation(async (m) => {
    sent.push({ phone: m.phone, code: m.code });
  });
  return { last: () => sent.at(-1)?.code ?? '', sent };
}

/** Full phone + OTP login through the API; returns token, refresh cookie and session body. */
export async function otpLogin(phone: string) {
  const otp = captureOtps();
  await request().post(`${API}/auth/send-otp`).send({ phone }).expect(200);
  const res = await request().post(`${API}/auth/verify-otp`).send({ phone, otp: otp.last() }).expect(200);
  // Let the next login for the same number skip the resend cooldown.
  await prisma.otpCode.updateMany({ data: { createdAt: new Date(Date.now() - 60_000) } });
  return {
    res,
    token: res.body.data.accessToken as string,
    user: res.body.data.user as { id: string; role: Role },
    cookie: cookieFrom(res, 'fx_rt')!,
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function createTechnician(
  phone: string,
  verificationStatus: 'PENDING' | 'VERIFIED' | 'SUSPENDED' | 'BLOCKED' = 'VERIFIED',
) {
  return prisma.user.create({
    data: {
      role: 'TECHNICIAN',
      phone,
      name: 'Test Technician',
      technician: {
        create: {
          languages: ['Telugu'],
          villageTown: 'Tanuku',
          district: 'West Godavari',
          state: 'Andhra Pradesh',
          pincode: '534211',
          verificationStatus,
          lastLatitude: 16.76,
          lastLongitude: 81.69,
          wallet: { create: {} },
        },
      },
    },
    include: { technician: true },
  });
}

export async function createStaff(role: Role, opts: { email?: string; phone?: string; password?: string } = {}) {
  const user = await prisma.user.create({
    data: {
      role,
      email: opts.email ?? `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      phone: opts.phone ?? null,
      name: `Test ${role}`,
      passwordHash: opts.password ? await bcrypt.hash(opts.password, 4) : null,
      adminUser: { create: {} },
    },
  });
  return { user, token: signAccessToken(user.id, role).token };
}

/** Minimal catalogue: one category + one service (₹299 + ₹100 visit). */
export async function seedCatalog() {
  const category = await prisma.serviceCategory.create({
    data: { name: 'AC & Cooling', slug: 'ac-cooling', iconKey: 'ac', professionalTitle: 'AC Technician', tagline: 'Service, Repair' },
  });
  const service = await prisma.service.create({
    data: {
      categoryId: category.id,
      name: 'AC Repair',
      slug: 'ac-repair',
      description: 'Repair',
      basePrice: 29_900,
      visitCharge: 10_000,
      durationMinMinutes: 30,
      durationMaxMinutes: 60,
      inclusions: ['Diagnosis'],
      exclusions: ['Parts'],
    },
  });
  return { category, service };
}

export const sampleAddress = {
  label: 'HOME',
  houseNo: '12A',
  street: 'Main Street',
  area: 'Sajjapuram',
  villageTown: 'Tanuku',
  district: 'West Godavari',
  state: 'Andhra Pradesh',
  pincode: '534211',
  landmark: 'Near Bus Stand',
  latitude: 16.7547,
  longitude: 81.6818,
};

/** Extracts `name=value` from a Set-Cookie header for replay. */
export function cookieFrom(res: { headers: Record<string, unknown> }, name: string): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : [];
  const hit = list.find((c) => c.startsWith(`${name}=`) && !c.startsWith(`${name}=;`));
  return hit?.split(';')[0];
}

/** Payout + ID details every new partner gives at sign-up (synthetic values). */
export const partnerPayout = {
  bankAccountHolder: 'Test Partner',
  bankAccountNumber: '123456789012',
  bankIfsc: 'SBIN0001234',
  payoutUpiId: 'partner@okaxis',
  aadhaarNumber: '234567890124', // synthetic, passes the Verhoeff check
  panNumber: '',
};

/** A tiny PNG, uploaded privately as the sign-up Aadhaar photo (mandatory for partner registration). */
const ID_PHOTO = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a60000000049454e44ae426082',
  'hex',
);
export async function aadhaarPhoto(token: string) {
  const res = await request().post(`${API}/uploads?private=1`).set(bearer(token)).attach('file', ID_PHOTO, 'aadhaar.png');
  return [{ type: 'AADHAAR' as const, fileUrl: res.body.data.path as string }];
}
