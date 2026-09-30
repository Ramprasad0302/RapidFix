import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { prisma } from '../src/config/prisma';
import { resetFirebaseCertCache } from '../src/services/firebaseAuth.service';
import { API, cookieFrom, request, resetDb } from './helpers';

const PROJECT = 'rapidfix-test';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function firebaseToken(overrides: Record<string, unknown> = {}, opts: { kid?: string; audience?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { sub: 'firebase-uid-1', phone_number: '+919491963366', auth_time: now - 5, firebase: { sign_in_provider: 'phone' }, ...overrides },
    privateKey,
    { algorithm: 'RS256', keyid: opts.kid ?? 'key-1', audience: opts.audience ?? PROJECT, issuer: `https://securetoken.google.com/${PROJECT}`, expiresIn: 3600 },
  );
}

const exchange = (idToken: string) => request().post(`${API}/auth/firebase`).send({ idToken });

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
  resetFirebaseCertCache();
  Object.assign(env, { OTP_PROVIDER: 'firebase', FIREBASE_PROJECT_ID: PROJECT });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ 'key-1': publicPem }), { status: 200, headers: { 'cache-control': 'public, max-age=3600' } }));
});
afterAll(() => prisma.$disconnect());

describe('Firebase phone sign-in', () => {
  it('turns a verified Firebase phone token into a RapidFix session (new number → customer)', async () => {
    const res = await exchange(firebaseToken()).expect(200);
    expect(res.body.data.user).toMatchObject({ phone: '+919491963366', role: 'CUSTOMER' });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(cookieFrom(res, 'fx_rt')).toBeDefined();
    expect(await prisma.user.count({ where: { phone: '+919491963366' } })).toBe(1);
  });

  it('signs existing accounts into their own role', async () => {
    await prisma.user.create({ data: { phone: '+919491963366', role: 'TECHNICIAN', name: 'Ravi' } });
    const res = await exchange(firebaseToken()).expect(200);
    expect(res.body.data.user.role).toBe('TECHNICIAN');
  });

  it('rejects tokens for another project, tampered, stale or non-phone sign-ins', async () => {
    await exchange(firebaseToken({}, { audience: 'someone-elses-project' })).expect(401);
    await exchange(firebaseToken({ auth_time: Math.floor(Date.now() / 1000) - 3600 })).expect(401);
    await exchange(firebaseToken({ firebase: { sign_in_provider: 'password' } })).expect(401);
    const [h, p, sig] = firebaseToken().split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), phone_number: '+919000000900' })).toString('base64url');
    await exchange(`${h}.${forged}.${sig}`).expect(401);
    await exchange(firebaseToken({}, { kid: 'unknown-key' })).expect(401);
  });

  it('only accepts Indian mobile numbers', async () => {
    await exchange(firebaseToken({ phone_number: '+14155550100' })).expect(400);
  });

  it('turns off the server OTP routes so codes can only come from Firebase', async () => {
    const res = await request().post(`${API}/auth/send-otp`).send({ phone: '9491963366' }).expect(400);
    expect(res.body.code).toBe('USE_FIREBASE_OTP');
    const cfg = await request().get(`${API}/app-config`).expect(200);
    expect(cfg.body.data.otpProvider).toBe('firebase');
  });
});
