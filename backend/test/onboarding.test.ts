import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { API, bearer, otpLogin, request, resetDb, sampleAddress } from './helpers';

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
});
afterAll(() => prisma.$disconnect());

const about = { name: 'Lakshmi Devi', email: 'lakshmi@example.com', dateOfBirth: '1995-06-20' };

describe('customer sign-up details', () => {
  it('a new customer must add name, email, date of birth and an address', async () => {
    const c = await otpLogin('9000000070');
    expect(c.user).toMatchObject({ role: 'CUSTOMER', profileComplete: false });

    // Every field is required; the first address too.
    await request().post(`${API}/customer/onboarding`).set(bearer(c.token)).send({ ...about, email: '' }).expect(400);
    await request().post(`${API}/customer/onboarding`).set(bearer(c.token)).send({ ...about, dateOfBirth: '' }).expect(400);
    await request().post(`${API}/customer/onboarding`).set(bearer(c.token)).send({ ...about, dateOfBirth: '2024-01-01' }).expect(400);
    await request().post(`${API}/customer/onboarding`).set(bearer(c.token)).send(about).expect(400);

    const res = await request().post(`${API}/customer/onboarding`).set(bearer(c.token)).send({ ...about, address: sampleAddress }).expect(200);
    expect(res.body.data).toMatchObject({ name: 'Lakshmi Devi', email: 'lakshmi@example.com', profileComplete: true });

    const addresses = await request().get(`${API}/customer/addresses`).set(bearer(c.token)).expect(200);
    expect(addresses.body.data).toHaveLength(1);
    expect(addresses.body.data[0]).toMatchObject({ villageTown: 'Tanuku', isDefault: true });
    const profile = await request().get(`${API}/customer/profile`).set(bearer(c.token)).expect(200);
    expect(profile.body.data).toMatchObject({ dateOfBirth: '1995-06-20', city: 'Tanuku' });

    // Signing in again remembers it.
    expect((await otpLogin('9000000070')).user).toMatchObject({ profileComplete: true });
  });

  it('an email already used by another account is refused', async () => {
    const first = await otpLogin('9000000071');
    await request().post(`${API}/customer/onboarding`).set(bearer(first.token)).send({ ...about, address: sampleAddress }).expect(200);
    const second = await otpLogin('9000000072');
    const res = await request().post(`${API}/customer/onboarding`).set(bearer(second.token)).send({ ...about, address: sampleAddress }).expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });
});
