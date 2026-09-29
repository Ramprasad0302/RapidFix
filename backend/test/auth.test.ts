import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { signAccessToken } from '../src/services/token.service';
import { API, captureOtps, cookieFrom, createAdmin, createTechnician, request, resetDb } from './helpers';

const PHONE = '9000000001';

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
});
afterAll(() => prisma.$disconnect());

async function customerLogin(phone = PHONE) {
  const otp = captureOtps();
  await request().post(`${API}/auth/customer/send-otp`).send({ phone }).expect(200);
  const res = await request().post(`${API}/auth/customer/verify-otp`).send({ phone, otp: otp.last() }).expect(200);
  return { res, token: res.body.data.accessToken as string, cookie: cookieFrom(res, 'fx_rt_customer')! };
}

describe('customer OTP', () => {
  it('rejects an invalid phone number', async () => {
    const res = await request().post(`${API}/auth/customer/send-otp`).send({ phone: '12345' }).expect(400);
    expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
  });

  it('creates a CUSTOMER on first verify and sets an httpOnly refresh cookie', async () => {
    const { res, cookie } = await customerLogin();
    expect(res.body.data.user).toMatchObject({ role: 'CUSTOMER', phone: '+919000000001' });
    expect(res.body.data.isNewUser).toBe(true);
    expect(res.body.data).not.toHaveProperty('refreshToken');
    expect(cookie).toBeDefined();
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Path=\/api\/v1\/auth/);

    // Simulate the resend cooldown having elapsed.
    await prisma.otpCode.updateMany({ data: { createdAt: new Date(Date.now() - 60_000) } });
    const again = await customerLogin();
    expect(again.res.body.data.isNewUser).toBe(false);
    expect(await prisma.customer.count()).toBe(1);
  });

  it('stores only a hash of the OTP', async () => {
    const otp = captureOtps();
    await request().post(`${API}/auth/customer/send-otp`).send({ phone: PHONE }).expect(200);
    const row = await prisma.otpCode.findFirstOrThrow();
    expect(row.codeHash).not.toContain(otp.last());
    expect(row.codeHash).toHaveLength(64);
  });

  it('enforces the resend cooldown', async () => {
    captureOtps();
    await request().post(`${API}/auth/customer/send-otp`).send({ phone: PHONE }).expect(200);
    const res = await request().post(`${API}/auth/customer/send-otp`).send({ phone: PHONE }).expect(429);
    expect(res.body.code).toBe('OTP_COOLDOWN');
  });

  it('locks the code after too many wrong attempts, even if the right code follows', async () => {
    const otp = captureOtps();
    await request().post(`${API}/auth/customer/send-otp`).send({ phone: PHONE }).expect(200);
    const wrong = otp.last() === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      const r = await request().post(`${API}/auth/customer/verify-otp`).send({ phone: PHONE, otp: wrong }).expect(400);
      expect(r.body.code).toBe('OTP_INVALID');
    }
    await request().post(`${API}/auth/customer/verify-otp`).send({ phone: PHONE, otp: wrong }).expect(429);
    const res = await request().post(`${API}/auth/customer/verify-otp`).send({ phone: PHONE, otp: otp.last() }).expect(429);
    expect(res.body.code).toBe('OTP_LOCKED');
  });

  it('rejects an expired OTP', async () => {
    const otp = captureOtps();
    await request().post(`${API}/auth/customer/send-otp`).send({ phone: PHONE }).expect(200);
    await prisma.otpCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request().post(`${API}/auth/customer/verify-otp`).send({ phone: PHONE, otp: otp.last() }).expect(400);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('an OTP is single-use', async () => {
    const otp = captureOtps();
    await request().post(`${API}/auth/customer/send-otp`).send({ phone: PHONE }).expect(200);
    await request().post(`${API}/auth/customer/verify-otp`).send({ phone: PHONE, otp: otp.last() }).expect(200);
    await request().post(`${API}/auth/customer/verify-otp`).send({ phone: PHONE, otp: otp.last() }).expect(400);
  });

  it('a customer OTP cannot log in a technician with the same phone', async () => {
    await createTechnician('+919000000001');
    const otp = captureOtps();
    await request().post(`${API}/auth/customer/send-otp`).send({ phone: PHONE }).expect(200);
    await request().post(`${API}/auth/technician/verify-otp`).send({ phone: PHONE, otp: otp.last() }).expect(400);
  });
});

describe('technician OTP', () => {
  it('refuses unregistered numbers', async () => {
    const res = await request().post(`${API}/auth/technician/send-otp`).send({ phone: '9000000199' }).expect(404);
    expect(res.body.code).toBe('TECHNICIAN_NOT_REGISTERED');
  });

  it('refuses suspended and blocked technicians', async () => {
    await createTechnician('+919000000102', 'SUSPENDED');
    await createTechnician('+919000000103', 'BLOCKED');
    expect((await request().post(`${API}/auth/technician/send-otp`).send({ phone: '9000000102' }).expect(403)).body.code).toBe('TECHNICIAN_SUSPENDED');
    expect((await request().post(`${API}/auth/technician/send-otp`).send({ phone: '9000000103' }).expect(403)).body.code).toBe('TECHNICIAN_BLOCKED');
  });

  it('logs in a registered technician (pending verification is allowed to sign in)', async () => {
    await createTechnician('+919000000101', 'PENDING');
    const otp = captureOtps();
    await request().post(`${API}/auth/technician/send-otp`).send({ phone: '9000000101' }).expect(200);
    const res = await request().post(`${API}/auth/technician/verify-otp`).send({ phone: '9000000101', otp: otp.last() }).expect(200);
    expect(res.body.data.user).toMatchObject({ role: 'TECHNICIAN', technician: { verificationStatus: 'PENDING' } });
    expect(cookieFrom(res, 'fx_rt_technician')).toBeDefined();
  });
});

describe('admin login', () => {
  it('accepts correct credentials and writes an audit log', async () => {
    const admin = await createAdmin('ops@test.local', 'correct-horse-9', 'OPERATIONS');
    const res = await request().post(`${API}/auth/admin/login`).send({ email: 'OPS@test.local', password: 'correct-horse-9' }).expect(200);
    expect(res.body.data.user.role).toBe('OPERATIONS');
    expect(await prisma.auditLog.count({ where: { action: 'ADMIN_LOGIN', actorId: admin.id } })).toBe(1);
  });

  it('gives the same error for unknown email and wrong password', async () => {
    await createAdmin('a@test.local', 'correct-horse-9');
    const r1 = await request().post(`${API}/auth/admin/login`).send({ email: 'a@test.local', password: 'wrong-password' }).expect(401);
    const r2 = await request().post(`${API}/auth/admin/login`).send({ email: 'nobody@test.local', password: 'wrong-password' }).expect(401);
    expect(r1.body).toEqual(r2.body);
  });

  it('a customer can never use admin login', async () => {
    await customerLogin();
    await prisma.user.updateMany({ data: { email: 'c@test.local' } });
    await request().post(`${API}/auth/admin/login`).send({ email: 'c@test.local', password: 'whatever-123' }).expect(401);
  });
});

describe('refresh tokens', () => {
  it('rotates: new cookie works, the old one is rejected and kills the family', async () => {
    const { cookie } = await customerLogin();
    const r1 = await request().post(`${API}/auth/refresh`).set('Cookie', cookie).send({ audience: 'customer' }).expect(200);
    const rotated = cookieFrom(r1, 'fx_rt_customer')!;
    expect(rotated).not.toEqual(cookie);

    // Replay of the old token after the grace window = theft.
    await prisma.refreshToken.updateMany({ where: { revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    const replay = await request().post(`${API}/auth/refresh`).set('Cookie', cookie).send({ audience: 'customer' }).expect(401);
    expect(replay.body.code).toBe('REFRESH_TOKEN_REUSED');
    // …and the legitimately rotated token is now dead too.
    await request().post(`${API}/auth/refresh`).set('Cookie', rotated).send({ audience: 'customer' }).expect(401);
  });

  it('refuses a customer cookie presented as the admin app', async () => {
    const { cookie } = await customerLogin();
    const adminStyle = cookie.replace('fx_rt_customer', 'fx_rt_admin');
    const res = await request().post(`${API}/auth/refresh`).set('Cookie', adminStyle).send({ audience: 'admin' }).expect(403);
    expect(res.body.code).toBe('WRONG_APP');
  });

  it('logout revokes the session', async () => {
    const { cookie } = await customerLogin();
    await request().post(`${API}/auth/logout`).set('Cookie', cookie).send({ audience: 'customer' }).expect(200);
    await request().post(`${API}/auth/refresh`).set('Cookie', cookie).send({ audience: 'customer' }).expect(401);
  });

  it('a suspended user cannot refresh', async () => {
    const { cookie } = await customerLogin();
    await prisma.user.updateMany({ data: { status: 'SUSPENDED' } });
    const res = await request().post(`${API}/auth/refresh`).set('Cookie', cookie).send({ audience: 'customer' }).expect(403);
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('authorization', () => {
  it('401 without a token, 401 TOKEN_EXPIRED with an expired one', async () => {
    await request().get(`${API}/customer/profile`).expect(401);
    const expired = (await import('jsonwebtoken')).default.sign({ role: 'CUSTOMER' }, process.env.JWT_SECRET!, {
      subject: 'x', issuer: 'fixora', audience: 'fixora-api', expiresIn: -10,
    });
    const res = await request().get(`${API}/customer/profile`).set('Authorization', `Bearer ${expired}`).expect(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a token signed with another secret', async () => {
    const forged = (await import('jsonwebtoken')).default.sign({ role: 'SUPER_ADMIN' }, 'not-the-secret-not-the-secret-123', {
      subject: 'x', issuer: 'fixora', audience: 'fixora-api',
    });
    await request().get(`${API}/admin/dashboard`).set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('customer → own profile OK; technician & admin routes 403', async () => {
    const { token } = await customerLogin();
    const me = await request().get(`${API}/customer/profile`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.data.phone).toBe('+919000000001');
    await request().get(`${API}/technician/profile`).set('Authorization', `Bearer ${token}`).expect(403);
    await request().get(`${API}/admin/dashboard`).set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('technician cannot reach admin or customer routes', async () => {
    const tech = await createTechnician('+919000000101');
    const { token } = signAccessToken(tech.id, 'TECHNICIAN');
    await request().get(`${API}/technician/profile`).set('Authorization', `Bearer ${token}`).expect(200);
    await request().get(`${API}/admin/dashboard`).set('Authorization', `Bearer ${token}`).expect(403);
    await request().get(`${API}/customer/profile`).set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('customer profile updates only touch the caller', async () => {
    const a = await customerLogin('9000000001');
    const b = await customerLogin('9000000002');
    await request().put(`${API}/customer/profile`).set('Authorization', `Bearer ${a.token}`).send({ name: 'Alpha' }).expect(200);
    const bProfile = await request().get(`${API}/customer/profile`).set('Authorization', `Bearer ${b.token}`).expect(200);
    expect(bProfile.body.data.name).toBeNull();
  });

  it('admin permission matrix: FINANCE and SUPPORT see the dashboard, customers cannot', async () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS', 'SUPPORT', 'FINANCE'] as const) {
      const admin = await createAdmin(`${role.toLowerCase()}@test.local`, 'correct-horse-9', role);
      const { token } = signAccessToken(admin.id, role);
      const res = await request().get(`${API}/admin/dashboard`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.data.kpis).toHaveProperty('totalRevenue');
    }
  });
});
