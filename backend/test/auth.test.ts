import jwt from 'jsonwebtoken';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { signAccessToken } from '../src/services/token.service';
import { API, bearer, captureOtps, cookieFrom, createStaff, createTechnician, otpLogin, request, resetDb } from './helpers';

const PHONE = '9000000001';

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
});
afterAll(() => prisma.$disconnect());

describe('common OTP login', () => {
  it('rejects an invalid phone number', async () => {
    const res = await request().post(`${API}/auth/send-otp`).send({ phone: '12345' }).expect(400);
    expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
  });

  it('a new number becomes a CUSTOMER; an httpOnly refresh cookie is set', async () => {
    const { res, cookie } = await otpLogin(PHONE);
    expect(res.body.data.user).toMatchObject({ role: 'CUSTOMER', phone: '+919000000001' });
    expect(res.body.data.isNewUser).toBe(true);
    expect(res.body.data).not.toHaveProperty('refreshToken');
    expect(cookie).toBeDefined();
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Path=\/api\/v1\/auth/);

    const again = await otpLogin(PHONE);
    expect(again.res.body.data.isNewUser).toBe(false);
    expect(await prisma.user.count()).toBe(1);
  });

  it('the same page signs in technicians and staff with their own role', async () => {
    await createTechnician('+919000000101');
    await createStaff('SUPER_ADMIN', { phone: '+919000000900' });
    expect((await otpLogin('9000000101')).user.role).toBe('TECHNICIAN');
    const staff = await otpLogin('9000000900');
    expect(staff.user.role).toBe('SUPER_ADMIN');
    expect(await prisma.auditLog.count({ where: { action: 'ADMIN_LOGIN', actorId: staff.user.id } })).toBe(1);
  });

  it('refuses suspended and blocked technicians before sending a code', async () => {
    await createTechnician('+919000000102', 'SUSPENDED');
    await createTechnician('+919000000103', 'BLOCKED');
    expect((await request().post(`${API}/auth/send-otp`).send({ phone: '9000000102' }).expect(403)).body.code).toBe('TECHNICIAN_SUSPENDED');
    expect((await request().post(`${API}/auth/send-otp`).send({ phone: '9000000103' }).expect(403)).body.code).toBe('TECHNICIAN_BLOCKED');
  });

  it('stores only a hash of the OTP', async () => {
    const otp = captureOtps();
    await request().post(`${API}/auth/send-otp`).send({ phone: PHONE }).expect(200);
    const row = await prisma.otpCode.findFirstOrThrow();
    expect(row.codeHash).not.toContain(otp.last());
    expect(row.codeHash).toHaveLength(64);
  });

  it('enforces the resend cooldown', async () => {
    captureOtps();
    await request().post(`${API}/auth/send-otp`).send({ phone: PHONE }).expect(200);
    const res = await request().post(`${API}/auth/send-otp`).send({ phone: PHONE }).expect(429);
    expect(res.body.code).toBe('OTP_COOLDOWN');
    expect(res.body.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('locks the code after too many wrong attempts, even if the right code follows', async () => {
    const otp = captureOtps();
    await request().post(`${API}/auth/send-otp`).send({ phone: PHONE }).expect(200);
    const wrong = otp.last() === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      expect((await request().post(`${API}/auth/verify-otp`).send({ phone: PHONE, otp: wrong }).expect(400)).body.code).toBe('OTP_INVALID');
    }
    await request().post(`${API}/auth/verify-otp`).send({ phone: PHONE, otp: wrong }).expect(429);
    const res = await request().post(`${API}/auth/verify-otp`).send({ phone: PHONE, otp: otp.last() }).expect(429);
    expect(res.body.code).toBe('OTP_LOCKED');
  });

  it('rejects an expired OTP and a reused OTP', async () => {
    const otp = captureOtps();
    await request().post(`${API}/auth/send-otp`).send({ phone: PHONE }).expect(200);
    await prisma.otpCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request().post(`${API}/auth/verify-otp`).send({ phone: PHONE, otp: otp.last() }).expect(400)).body.code).toBe('OTP_EXPIRED');

    await prisma.otpCode.updateMany({ data: { createdAt: new Date(Date.now() - 60_000) } });
    await request().post(`${API}/auth/send-otp`).send({ phone: PHONE }).expect(200);
    await request().post(`${API}/auth/verify-otp`).send({ phone: PHONE, otp: otp.last() }).expect(200);
    await request().post(`${API}/auth/verify-otp`).send({ phone: PHONE, otp: otp.last() }).expect(400);
  });
});

describe('staff email + password (same login page)', () => {
  it('signs in with correct credentials; wrong email and wrong password look identical', async () => {
    await createStaff('OPERATIONS', { email: 'ops@test.local', password: 'correct-horse-9' });
    const res = await request().post(`${API}/auth/login`).send({ email: 'OPS@test.local', password: 'correct-horse-9' }).expect(200);
    expect(res.body.data.user.role).toBe('OPERATIONS');
    const r1 = await request().post(`${API}/auth/login`).send({ email: 'ops@test.local', password: 'wrong-password' }).expect(401);
    const r2 = await request().post(`${API}/auth/login`).send({ email: 'nobody@test.local', password: 'wrong-password' }).expect(401);
    expect(r1.body).toEqual(r2.body);
  });

  it('an account without a password cannot use password login', async () => {
    await otpLogin(PHONE);
    await prisma.user.updateMany({ data: { email: 'c@test.local' } });
    await request().post(`${API}/auth/login`).send({ email: 'c@test.local', password: 'whatever-123' }).expect(401);
  });
});

describe('refresh tokens', () => {
  it('rotates: the new cookie works; replaying the old one revokes the whole session', async () => {
    const { cookie } = await otpLogin(PHONE);
    const r1 = await request().post(`${API}/auth/refresh`).set('Cookie', cookie).expect(200);
    const rotated = cookieFrom(r1, 'fx_rt')!;
    expect(rotated).not.toEqual(cookie);

    await prisma.refreshToken.updateMany({ where: { revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    expect((await request().post(`${API}/auth/refresh`).set('Cookie', cookie).expect(401)).body.code).toBe('REFRESH_TOKEN_REUSED');
    await request().post(`${API}/auth/refresh`).set('Cookie', rotated).expect(401);
  });

  it('logout revokes the session', async () => {
    const { cookie } = await otpLogin(PHONE);
    await request().post(`${API}/auth/logout`).set('Cookie', cookie).expect(200);
    await request().post(`${API}/auth/refresh`).set('Cookie', cookie).expect(401);
  });

  it('a suspended user cannot refresh', async () => {
    const { cookie } = await otpLogin(PHONE);
    await prisma.user.updateMany({ data: { status: 'SUSPENDED' } });
    expect((await request().post(`${API}/auth/refresh`).set('Cookie', cookie).expect(403)).body.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('authorization', () => {
  it('401 without a token, TOKEN_EXPIRED with an expired one, 401 for a forged one', async () => {
    await request().get(`${API}/customer/profile`).expect(401);
    const expired = jwt.sign({ role: 'CUSTOMER' }, process.env.JWT_SECRET!, { subject: 'x', issuer: 'fixora', audience: 'fixora-api', expiresIn: -10 });
    expect((await request().get(`${API}/customer/profile`).set(bearer(expired)).expect(401)).body.code).toBe('TOKEN_EXPIRED');
    const forged = jwt.sign({ role: 'SUPER_ADMIN' }, 'not-the-secret-not-the-secret-123', { subject: 'x', issuer: 'fixora', audience: 'fixora-api' });
    await request().get(`${API}/admin/dashboard`).set(bearer(forged)).expect(401);
  });

  it('customer cannot reach technician or admin APIs', async () => {
    const { token } = await otpLogin(PHONE);
    await request().get(`${API}/customer/profile`).set(bearer(token)).expect(200);
    await request().get(`${API}/technician/dashboard`).set(bearer(token)).expect(403);
    await request().get(`${API}/admin/dashboard`).set(bearer(token)).expect(403);
    await request().get(`${API}/admin/users`).set(bearer(token)).expect(403);
  });

  it('technician cannot reach admin or customer APIs', async () => {
    const tech = await createTechnician('+919000000101');
    const { token } = signAccessToken(tech.id, 'TECHNICIAN');
    await request().get(`${API}/technician/profile`).set(bearer(token)).expect(200);
    await request().get(`${API}/admin/dashboard`).set(bearer(token)).expect(403);
    await request().get(`${API}/customer/bookings`).set(bearer(token)).expect(403);
  });

  it('every staff role sees the dashboard; only ADMIN/SUPER_ADMIN manage users', async () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS', 'SUPPORT', 'FINANCE'] as const) {
      const { token } = await createStaff(role);
      const res = await request().get(`${API}/admin/dashboard`).set(bearer(token)).expect(200);
      expect(res.body.data.kpis.revenue).toHaveProperty('total');
      await request().get(`${API}/admin/users`).set(bearer(token)).expect(role === 'SUPER_ADMIN' || role === 'ADMIN' ? 200 : 403);
    }
  });
});
