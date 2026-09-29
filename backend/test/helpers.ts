import bcrypt from 'bcryptjs';
import supertest from 'supertest';
import { vi } from 'vitest';
import type { Role } from '@fixora/shared-types';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { otpProvider } from '../src/services/otp';

export const app = createApp();
export const request = () => supertest(app);
export const API = '/api/v1';

/** Empties every table (FK checks off) so each suite starts clean. */
export async function resetDb() {
  const tables = await prisma.$queryRawUnsafe<{ t: string }[]>(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'`,
  );
  await prisma.$transaction([
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0'),
    ...tables.map(({ t }) => prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t}\``)),
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1'),
  ]);
}

/** Captures OTP codes as the provider "sends" them. */
export function captureOtps() {
  const sent: { phone: string; code: string }[] = [];
  vi.spyOn(otpProvider, 'send').mockImplementation(async (m) => {
    sent.push({ phone: m.phone, code: m.code });
  });
  return { last: () => sent.at(-1)?.code ?? '', sent };
}

export async function createTechnician(phone: string, verificationStatus: 'PENDING' | 'VERIFIED' | 'SUSPENDED' | 'BLOCKED' = 'VERIFIED') {
  return prisma.user.create({
    data: {
      role: 'TECHNICIAN',
      phone,
      name: 'Test Technician',
      technician: {
        create: { languages: ['Telugu'], villageTown: 'Tanuku', district: 'West Godavari', state: 'Andhra Pradesh', pincode: '534211', verificationStatus },
      },
    },
  });
}

export async function createAdmin(email: string, password: string, role: Role = 'SUPER_ADMIN') {
  return prisma.user.create({
    data: { role, email, name: 'Test Admin', passwordHash: await bcrypt.hash(password, 4), adminUser: { create: {} } },
  });
}

/** Extracts `name=value` from a Set-Cookie header for replay. */
export function cookieFrom(res: { headers: Record<string, unknown> }, name: string): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : [];
  const hit = list.find((c) => c.startsWith(`${name}=`) && !c.startsWith(`${name}=;`));
  return hit?.split(';')[0];
}
