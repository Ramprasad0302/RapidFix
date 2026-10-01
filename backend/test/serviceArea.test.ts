import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { clearServiceAreaCache } from '../src/services/serviceArea.service';
import { API, bearer, createStaff, otpLogin, request, resetDb, sampleAddress, seedCatalog } from './helpers';

let serviceId: string;
beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
  clearServiceAreaCache();
  serviceId = (await seedCatalog()).service.id;
  // We serve only Tanuku, within 10 km.
  await prisma.location.create({ data: { name: 'Tanuku', district: 'West Godavari', state: 'Andhra Pradesh', latitude: 16.7547, longitude: 81.6818, radiusKm: 10, isActive: true } });
  await prisma.location.create({ data: { name: 'Bhimavaram', district: 'West Godavari', state: 'Andhra Pradesh', latitude: 16.5449, longitude: 81.5212, radiusKm: 15, isActive: false } });
});
afterAll(() => prisma.$disconnect());

const book = (token: string, address: object) => request().post(`${API}/customer/bookings`).set(bearer(token)).send({ serviceId, scheduleType: 'NOW', address });

describe('service area', () => {
  it('checks a map point against the active towns and radius', async () => {
    const inTanuku = await request().get(`${API}/service-area`).query({ lat: 16.76, lng: 81.69 }).expect(200);
    expect(inTanuku.body.data).toMatchObject({ served: true, town: 'Tanuku' });
    // Bhimavaram is ~28 km away and switched off.
    const outside = await request().get(`${API}/service-area`).query({ lat: 16.5449, lng: 81.5212 }).expect(200);
    expect(outside.body.data).toMatchObject({ served: false, town: 'Tanuku' });
    expect(outside.body.data.distanceKm).toBeGreaterThan(10);
  });

  it('refuses bookings outside the area and records "I\'m interested"', async () => {
    const c = await otpLogin('9000000090');
    await book(c.token, sampleAddress).expect(201); // Tanuku address
    const far = await otpLogin('9000000092');
    const res = await book(far.token, { ...sampleAddress, villageTown: 'Bhimavaram', latitude: 16.5449, longitude: 81.5212 }).expect(422);
    expect(res.body.code).toBe('OUT_OF_SERVICE_AREA');

    await request().post(`${API}/service-area/interest`).set(bearer(c.token)).send({ label: 'Bhimavaram', lat: 16.5449, lng: 81.5212 }).expect(201);
    await request().post(`${API}/service-area/interest`).send({ name: 'Guest', phone: '9876501234', label: 'Eluru' }).expect(201);
    expect(await prisma.serviceAreaInterest.count()).toBe(2);

    const admin = await createStaff('SUPER_ADMIN');
    const list = await request().get(`${API}/admin/service-area`).set(bearer(admin.token)).expect(200);
    expect(list.body.data.interest).toHaveLength(2);
    expect(list.body.data.locations.find((l: { name: string }) => l.name === 'Tanuku')).toMatchObject({ isActive: true, radiusKm: 10 });
  });

  it('admins can switch a town on — bookings there then work', async () => {
    const c = await otpLogin('9000000091');
    const admin = await createStaff('SUPER_ADMIN');
    const bhimavaram = await prisma.location.findFirstOrThrow({ where: { name: 'Bhimavaram' } });
    await request().patch(`${API}/admin/service-area/${bhimavaram.id}`).set(bearer(admin.token)).send({ isActive: true }).expect(200);
    await book(c.token, { ...sampleAddress, villageTown: 'Bhimavaram', latitude: 16.5449, longitude: 81.5212 }).expect(201);
  });
});
