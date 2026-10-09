import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { clearNonGpsPositions } from '../src/services/startupTasks';
import { aadhaarPhoto, API, bearer, createTechnician, otpLogin, partnerPayout, request, resetDb, seedCatalog } from './helpers';
import { signAccessToken } from '../src/services/token.service';

let categoryId: string;
beforeEach(async () => {
  await resetDb();
  categoryId = (await seedCatalog()).category.id;
});
afterAll(() => prisma.$disconnect());

describe('technician live location', () => {
  it('sign-up keeps the home address as the base only; the live position comes from the phone', async () => {
    const fresh = await otpLogin('9000000070');
    const reg = await request()
      .post(`${API}/partner/register`)
      .set(bearer(fresh.token))
      .send({
        kycDocuments: await aadhaarPhoto(fresh.token),
        name: 'Ramesh',
        email: 'ramesh@example.com',
        dateOfBirth: '1991-03-03',
        experienceYears: 2,
        languages: ['Telugu'],
        serviceRadiusKm: 10,
        addressLine: '1-1, Main Road',
        villageTown: 'Tanuku',
        district: 'West Godavari',
        state: 'Andhra Pradesh',
        pincode: '534211',
        baseLatitude: 16.75,
        baseLongitude: 81.68,
        skills: [categoryId],
        ...partnerPayout,
      })
      .expect(201);
    const t = await prisma.technician.findFirstOrThrow({ where: { user: { phone: '+919000000070' } } });
    expect(t).toMatchObject({ baseLatitude: 16.75, baseLongitude: 81.68, lastLatitude: null, lastLongitude: null, lastLocationAt: null });

    // Opening the app sends where the phone really is (even before going online).
    await request().post(`${API}/technician/location`).set(bearer(reg.body.data.accessToken)).send({ lat: 16.8, lng: 81.7 }).expect(200);
    const after = await prisma.technician.findUniqueOrThrow({ where: { id: t.id } });
    expect(after).toMatchObject({ lastLatitude: 16.8, lastLongitude: 81.7, baseLatitude: 16.75 });
    expect(after.lastLocationAt).not.toBeNull();
  });

  it('going online with the phone position records it straight away', async () => {
    const u = await createTechnician('+919000000071');
    const token = signAccessToken(u.id, 'TECHNICIAN').token;
    await request().post(`${API}/technician/online`).set(bearer(token)).send({ lat: 16.71, lng: 81.66 }).expect(200);
    const t = await prisma.technician.findUniqueOrThrow({ where: { id: u.technician!.id } });
    expect(t).toMatchObject({ isOnline: true, lastLatitude: 16.71, lastLongitude: 81.66 });
    expect(t.lastLocationAt).not.toBeNull();
  });

  it('start-up clears old positions that were only a copy of the home address', async () => {
    const copied = await createTechnician('+919000000072'); // position but never a GPS ping
    const real = await createTechnician('+919000000073');
    await prisma.technician.update({ where: { id: real.technician!.id }, data: { lastLocationAt: new Date() } });
    await clearNonGpsPositions();
    expect(await prisma.technician.findUniqueOrThrow({ where: { id: copied.technician!.id } })).toMatchObject({ lastLatitude: null, lastLongitude: null });
    expect(await prisma.technician.findUniqueOrThrow({ where: { id: real.technician!.id } })).toMatchObject({ lastLatitude: 16.76, lastLongitude: 81.69 });
  });
});
