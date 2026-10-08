import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { signAccessToken } from '../src/services/token.service';
import { API, bearer, createStaff, otpLogin, request, resetDb, sampleAddress, seedCatalog } from './helpers';

/** Franchise model: head office sees everything; a franchise manager only their town. */

const AADHAAR = '234567890124'; // synthetic, passes the Verhoeff check

let serviceId: string;
let superAdmin: { token: string };
let tanuku: string;
let tadepalligudem: string;

const franchiseBody = (over: Record<string, unknown> = {}) => ({
  name: 'RapidFix Tadepalligudem',
  town: 'Tadepalligudem',
  district: 'West Godavari',
  state: 'Andhra Pradesh',
  ownerName: 'Suresh Kumar',
  ownerPhone: '9000055501',
  ownerEmail: 'suresh@example.com',
  ownerDateOfBirth: '1988-04-12',
  ownerAddress: '4-12, Main Road, Tadepalligudem',
  ownerPincode: '534101',
  aadhaarNumber: AADHAAR,
  aadhaarFrontUrl: '/private/kyc/aadhaar-front.jpg',
  commissionPercent: 40,
  agreementStart: '2026-10-01',
  agreementEnd: '2029-09-30',
  localityIds: [tadepalligudem],
  ...over,
});

const book = (token: string, address: object) =>
  request().post(`${API}/customer/bookings`).set(bearer(token)).send({ serviceId, scheduleType: 'NOW', address, paymentMethod: 'CASH' }).expect(201).then((r) => r.body.data);

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
  serviceId = (await seedCatalog()).service.id;
  superAdmin = await createStaff('SUPER_ADMIN');
  tanuku = (await prisma.location.create({ data: { name: 'Tanuku', district: 'West Godavari', state: 'Andhra Pradesh', latitude: 16.7547, longitude: 81.6818, radiusKm: 10 } })).id;
  tadepalligudem = (await prisma.location.create({ data: { name: 'Tadepalligudem', district: 'West Godavari', state: 'Andhra Pradesh', latitude: 16.8138, longitude: 81.5212, radiusKm: 10 } })).id;
});
afterAll(() => prisma.$disconnect());

describe('Franchises', () => {
  it('head office creates a franchise; its manager signs in and sees only their town', async () => {
    const created = await request().post(`${API}/admin/franchises`).set(bearer(superAdmin.token)).send(franchiseBody()).expect(201);
    const f = created.body.data;
    expect(f).toMatchObject({ code: 'FR-0001', status: 'ACTIVE', commissionPercent: 40, aadhaarMasked: 'XXXX XXXX 0124', localities: [{ name: 'Tadepalligudem' }] });
    const stored = await prisma.franchise.findUniqueOrThrow({ where: { id: f.id } });
    expect(stored.aadhaarEnc).not.toContain(AADHAAR); // encrypted at rest

    // One booking in each town.
    const c1 = await otpLogin('9000000001');
    const tpg = await book(c1.token, { ...sampleAddress, villageTown: 'Tadepalligudem', area: 'KN Road', pincode: '534101', latitude: 16.8138, longitude: 81.5212 });
    const c2 = await otpLogin('9000000002');
    const tnk = await book(c2.token, sampleAddress);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: tpg.id } })).franchiseId).toBe(f.id);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: tnk.id } })).franchiseId).toBeNull();

    // The manager signs in with the franchise mobile number (OTP) and gets the franchise role.
    const manager = await otpLogin('9000055501');
    expect(manager.user).toMatchObject({ role: 'FRANCHISE_ADMIN', franchise: { code: 'FR-0001', town: 'Tadepalligudem' } });
    const m = bearer(manager.token);

    const list = await request().get(`${API}/admin/bookings`).set(m).expect(200);
    expect(list.body.data.items.map((b: { id: string }) => b.id)).toEqual([tpg.id]);
    await request().get(`${API}/admin/bookings/${tnk.id}`).set(m).expect(404);
    await request().post(`${API}/admin/bookings/${tnk.id}/cancel`).set(m).send({ reason: 'Not mine' }).expect(404);

    const customers = await request().get(`${API}/admin/customers`).set(m).expect(200);
    expect(customers.body.data.items.map((c: { phone: string }) => c.phone)).toEqual(['+919000000001']);
    const dash = await request().get(`${API}/admin/dashboard`).set(m).expect(200);
    expect(dash.body.data.kpis.bookings.total).toBe(1);

    // Head-office-only modules stay closed.
    await request().get(`${API}/admin/franchises`).set(m).expect(403);
    await request().get(`${API}/admin/services`).set(m).expect(403);
    await request().get(`${API}/admin/payments`).set(m).expect(403);

    // Head office sees both, with the franchise named on each booking.
    const all = await request().get(`${API}/admin/bookings`).set(bearer(superAdmin.token)).expect(200);
    expect(all.body.data.items.map((b: { franchise: string | null }) => b.franchise).sort()).toEqual(['RapidFix Tadepalligudem', null].sort());

    // Exports: the manager's spreadsheet holds only their town.
    const csv = await request().get(`${API}/admin/exports/bookings`).set(m).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(tpg.code);
    expect(csv.text).not.toContain(tnk.code);
    await request().get(`${API}/admin/exports/franchises`).set(m).expect(403);

    const me = await request().get(`${API}/admin/franchise/me`).set(m).expect(200);
    expect(me.body.data).toMatchObject({ code: 'FR-0001', commissionPercent: 40, total: { bookings: 1 } });
  });

  it('technicians in a franchise town join it, and its bookings are offered only to them (or head-office technicians)', async () => {
    const f = (await request().post(`${API}/admin/franchises`).set(bearer(superAdmin.token)).send(franchiseBody()).expect(201)).body.data;
    const cat = await prisma.service.findUniqueOrThrow({ where: { id: serviceId }, select: { categoryId: true } });
    const mk = async (phone: string, franchiseId: string | null, lat: number, lng: number) => {
      const u = await prisma.user.create({
        data: {
          role: 'TECHNICIAN',
          phone,
          name: phone,
          technician: {
            create: { languages: [], villageTown: 'X', district: 'West Godavari', state: 'Andhra Pradesh', pincode: '534101', verificationStatus: 'VERIFIED', isOnline: true, lastLatitude: lat, lastLongitude: lng, franchiseId, skills: { create: { categoryId: cat.categoryId } }, wallet: { create: {} } },
          },
        },
        include: { technician: true },
      });
      return u.technician!.id;
    };
    const own = await mk('+919000000201', f.id, 16.814, 81.52);
    const other = await prisma.franchise.create({
      data: { ...(await prisma.franchise.findUniqueOrThrow({ where: { id: f.id }, omit: { id: true, code: true, userId: true, createdAt: true, updatedAt: true } })), code: 'FR-0099', name: 'Other', userId: (await createStaff('CUSTOMER')).user.id },
    });
    const foreign = await mk('+919000000202', other.id, 16.814, 81.52);
    const hq = await mk('+919000000203', null, 16.814, 81.52);

    const c = await otpLogin('9000000003');
    const b = await book(c.token, { ...sampleAddress, villageTown: 'Tadepalligudem', latitude: 16.8138, longitude: 81.5212 });
    const cands = await request().get(`${API}/admin/bookings/${b.id}/candidates`).set(bearer(superAdmin.token)).expect(200);
    const ids = cands.body.data.map((x: { technicianId: string }) => x.technicianId);
    expect(ids).toEqual(expect.arrayContaining([own, hq]));
    expect(ids).not.toContain(foreign);
  });

  it('attaching a locality later moves its earlier bookings and customers into the franchise', async () => {
    const c = await otpLogin('9000000004');
    const early = await book(c.token, sampleAddress); // Tanuku, no franchise yet
    const f = (await request().post(`${API}/admin/franchises`).set(bearer(superAdmin.token)).send(franchiseBody({ localityIds: [] })).expect(201)).body.data;
    await request().put(`${API}/admin/service-area/${tanuku}/franchise`).set(bearer(superAdmin.token)).send({ franchiseId: f.id }).expect(200);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: early.id } })).franchiseId).toBe(f.id);
    const cust = await prisma.customer.findFirstOrThrow({ where: { user: { phone: '+919000000004' } } });
    expect(cust.franchiseId).toBe(f.id);

    // A locality belongs to one franchise only.
    const second = franchiseBody({ name: 'Another', ownerPhone: '9000055502', ownerEmail: 'another@example.com', localityIds: [tanuku] });
    await request().post(`${API}/admin/franchises`).set(bearer(superAdmin.token)).send(second).expect(409);
  });

  it('validates the agreement details, keeps Aadhaar private and suspends the manager with the franchise', async () => {
    await request().post(`${API}/admin/franchises`).set(bearer(superAdmin.token)).send(franchiseBody({ aadhaarNumber: '234567890123' })).expect(400);
    await request().post(`${API}/admin/franchises`).set(bearer(superAdmin.token)).send(franchiseBody({ commissionPercent: 140 })).expect(400);
    const tech = await prisma.user.create({ data: { role: 'TECHNICIAN', phone: '+919000055509' } });
    expect(tech).toBeTruthy();
    await request().post(`${API}/admin/franchises`).set(bearer(superAdmin.token)).send(franchiseBody({ ownerPhone: '9000055509' })).expect(409);

    const f = (await request().post(`${API}/admin/franchises`).set(bearer(superAdmin.token)).send(franchiseBody()).expect(201)).body.data;
    const full = await request().post(`${API}/admin/franchises/${f.id}/aadhaar`).set(bearer(superAdmin.token)).expect(200);
    expect(full.body.data.aadhaar).toBe('2345 6789 0124');
    const admin = await createStaff('ADMIN');
    await request().post(`${API}/admin/franchises/${f.id}/aadhaar`).set(bearer(admin.token)).expect(403);

    await request().post(`${API}/admin/franchises/${f.id}/status`).set(bearer(superAdmin.token)).send({ status: 'SUSPENDED', reason: 'Agreement review' }).expect(200);
    const managerToken = signAccessToken(f.userId, 'FRANCHISE_ADMIN').token;
    await request().get(`${API}/admin/bookings`).set(bearer(managerToken)).expect(403);

    // Franchise managers can't be made through Users & Roles.
    await request().patch(`${API}/admin/users/${f.userId}/role`).set(bearer(superAdmin.token)).send({ role: 'CUSTOMER' }).expect(409);
  });

  it('report splits every booking between franchises and head office with each franchise share', async () => {
    const f = (await request().post(`${API}/admin/franchises`).set(bearer(superAdmin.token)).send(franchiseBody()).expect(201)).body.data;
    const c = await otpLogin('9000000005');
    const b = await book(c.token, { ...sampleAddress, latitude: 16.8138, longitude: 81.5212 });
    await prisma.booking.update({ where: { id: b.id }, data: { status: 'PAYMENT_COMPLETED', totalAmount: 50_000, commissionAmount: 10_000 } });
    const r = await request().get(`${API}/admin/franchises/report`).query({ from: '2000-01-01', to: '2100-01-01' }).set(bearer(superAdmin.token)).expect(200);
    const row = r.body.data.rows.find((x: { franchiseId: string | null }) => x.franchiseId === f.id);
    expect(row).toMatchObject({ bookings: 1, completed: 1, revenue: 50_000, commission: 10_000, share: 4_000 });
    expect(r.body.data.rows.at(-1)).toMatchObject({ code: 'HQ' });
  });
});
