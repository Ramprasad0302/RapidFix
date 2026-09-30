import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { API, bearer, createStaff, otpLogin, request, resetDb, sampleAddress } from './helpers';

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
});
afterAll(() => prisma.$disconnect());

const del = (token: string, body: object = { confirm: 'DELETE' }) => request().delete(`${API}/auth/account`).set(bearer(token)).send(body);

describe('delete my account', () => {
  it('erases personal data, signs out everywhere and frees the phone number', async () => {
    const c = await otpLogin('9000000080');
    await request()
      .post(`${API}/customer/onboarding`)
      .set(bearer(c.token))
      .send({ name: 'Anil', email: 'anil@example.com', dateOfBirth: '1990-01-01', address: sampleAddress })
      .expect(200);

    await del(c.token, { confirm: 'yes' }).expect(400); // must type DELETE
    await del(c.token).expect(200);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.user.id } });
    expect(u).toMatchObject({ name: 'Deleted user', phone: null, email: null, dateOfBirth: null, status: 'BLOCKED' });
    expect(await prisma.address.count({ where: { customer: { userId: c.user.id }, deletedAt: null } })).toBe(0);
    await request().post(`${API}/auth/refresh`).set('Cookie', c.cookie).expect(401);

    // Same number can sign up again as a brand-new customer.
    const again = await otpLogin('9000000080');
    expect(again.user.id).not.toBe(c.user.id);
    expect(again.user).toMatchObject({ role: 'CUSTOMER', profileComplete: false });
  });

  it('staff accounts cannot delete themselves here', async () => {
    const admin = await createStaff('ADMIN');
    await del(admin.token).expect(403);
  });
});
