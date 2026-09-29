import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { dispatchBooking, expireOffers, scoreCandidate } from '../src/services/assignment.service';
import { clearSettingsCache } from '../src/services/settings.service';
import { signAccessToken } from '../src/services/token.service';
import { API, bearer, createStaff, otpLogin, request, resetDb, sampleAddress, seedCatalog } from './helpers';

let categoryId: string;
let serviceId: string;
let customerToken: string;

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
  clearSettingsCache();
  const cat = await seedCatalog();
  categoryId = cat.category.id;
  serviceId = cat.service.id;
  customerToken = (await otpLogin('9000000001')).token;
});
afterAll(() => prisma.$disconnect());

/** Tanuku booking address is 16.7547, 81.6818. */
async function tech(phone: string, opts: { dLat?: number; online?: boolean; status?: 'VERIFIED' | 'PENDING'; skilled?: boolean; rating?: number; active?: number } = {}) {
  const u = await prisma.user.create({
    data: {
      role: 'TECHNICIAN',
      phone,
      name: `Tech ${phone.slice(-3)}`,
      technician: {
        create: {
          languages: [],
          villageTown: 'Tanuku',
          district: 'West Godavari',
          state: 'Andhra Pradesh',
          pincode: '534211',
          verificationStatus: opts.status ?? 'VERIFIED',
          isOnline: opts.online ?? true,
          lastLatitude: 16.7547 + (opts.dLat ?? 0.01),
          lastLongitude: 81.6818,
          serviceRadiusKm: 15,
          ratingAvg: opts.rating ?? 4.5,
          activeJobCount: opts.active ?? 0,
          ...(opts.skilled !== false && { skills: { create: { categoryId } } }),
          wallet: { create: {} },
        },
      },
    },
    include: { technician: true },
  });
  return { userId: u.id, techId: u.technician!.id, token: signAccessToken(u.id, 'TECHNICIAN').token };
}

async function newBooking(timeSlot?: string) {
  const res = await request()
    .post(`${API}/customer/bookings`)
    .set(bearer(customerToken))
    .send({ serviceId, scheduleType: 'NOW', address: sampleAddress, ...(timeSlot && { timeSlot }) })
    .expect(201);
  return res.body.data.id as string;
}

const bookingOf = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id }, include: { assignments: true } });

describe('TechnicianAssignmentService', () => {
  it('offers the job to the nearest verified, online, skilled technician', async () => {
    const near = await tech('+919000000101', { dLat: 0.01 }); // ~1.1 km
    await tech('+919000000102', { dLat: 0.05 }); // ~5.5 km
    await tech('+919000000103', { dLat: 0.001, online: false });
    await tech('+919000000104', { dLat: 0.001, status: 'PENDING' });
    await tech('+919000000105', { dLat: 0.001, skilled: false });
    await tech('+919000000106', { dLat: 0.5 }); // ~55 km, outside radius
    const id = await newBooking();

    expect(await dispatchBooking(id)).toBe('offered');
    const b = await bookingOf(id);
    expect(b).toMatchObject({ status: 'TECHNICIAN_ASSIGNED', technicianId: near.techId });
    expect(b.assignments).toHaveLength(1);
    expect(b.assignments[0]).toMatchObject({ status: 'OFFERED', isManual: false });
    expect(await prisma.notification.count({ where: { userId: near.userId, type: 'NEW_JOB' } })).toBe(1);

    const requests = await request().get(`${API}/technician/requests`).set(bearer(near.token)).expect(200);
    expect(requests.body.data).toHaveLength(1);
    expect(requests.body.data[0]).toMatchObject({ bookingId: id, locality: 'Tanuku, AP', estimatedEarning: 33_915 }); // (299+100) × 85%
  });

  it('ranking weighs rating and workload, not only distance', () => {
    const w = { skill: 1, distance: 0.5, rating: 0.3, workload: 0.2 };
    const closeButBusy = scoreCandidate(w, { distanceKm: 1, radiusKm: 15, ratingAvg: 3.5, activeJobs: 3 });
    const slightlyFartherTopRated = scoreCandidate(w, { distanceKm: 3, radiusKm: 15, ratingAvg: 4.9, activeJobs: 0 });
    expect(slightlyFartherTopRated).toBeGreaterThan(closeButBusy);
  });

  it('reject → the next best technician gets the offer', async () => {
    const first = await tech('+919000000101', { dLat: 0.01 });
    const second = await tech('+919000000102', { dLat: 0.03 });
    const id = await newBooking();
    await dispatchBooking(id);

    await request().post(`${API}/technician/jobs/${id}/reject`).set(bearer(first.token)).send({}).expect(200);
    const b = await bookingOf(id);
    expect(b).toMatchObject({ status: 'TECHNICIAN_ASSIGNED', technicianId: second.techId });
    expect(b.assignments.map((a) => a.status).sort()).toEqual(['OFFERED', 'REJECTED']);
  });

  it('expired offer moves on, and the late technician can no longer accept', async () => {
    const slow = await tech('+919000000101', { dLat: 0.01 });
    const next = await tech('+919000000102', { dLat: 0.03 });
    const id = await newBooking();
    await dispatchBooking(id);

    // Past the 30 s window.
    await prisma.bookingAssignment.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request().post(`${API}/technician/jobs/${id}/accept`).set(bearer(slow.token)).send({}).expect(409)).body.code).toBe('OFFER_EXPIRED');

    expect(await expireOffers()).toBe(1);
    expect(await bookingOf(id)).toMatchObject({ status: 'TECHNICIAN_ASSIGNED', technicianId: next.techId });
    await request().post(`${API}/technician/jobs/${id}/accept`).set(bearer(next.token)).send({}).expect(200);
    expect((await bookingOf(id)).status).toBe('TECHNICIAN_ACCEPTED');
  });

  it('no candidates → stays SEARCHING and the customer is told once', async () => {
    await tech('+919000000101', { online: false });
    const id = await newBooking();
    expect(await dispatchBooking(id)).toBe('no_candidates');
    expect(await dispatchBooking(id)).toBe('no_candidates');
    expect((await bookingOf(id)).status).toBe('SEARCHING');
    expect(await prisma.notification.count({ where: { type: 'NO_TECHNICIAN_YET' } })).toBe(1);
  });

  it('skips technicians already busy in the same time window', async () => {
    const busy = await tech('+919000000101', { dLat: 0.005 });
    const free = await tech('+919000000102', { dLat: 0.04 });
    const first = await newBooking();
    await dispatchBooking(first);
    expect((await bookingOf(first)).technicianId).toBe(busy.techId);

    const second = await newBooking('16-18');
    await dispatchBooking(second);
    expect((await bookingOf(second)).technicianId).toBe(free.techId);
  });

  it('stops auto-offering after the max attempts', async () => {
    await prisma.setting.create({ data: { key: 'dispatch.maxAttempts', value: 1 } });
    clearSettingsCache();
    const a = await tech('+919000000101', { dLat: 0.01 });
    await tech('+919000000102', { dLat: 0.02 });
    const id = await newBooking();
    await dispatchBooking(id);
    await request().post(`${API}/technician/jobs/${id}/reject`).set(bearer(a.token)).send({}).expect(200);
    expect((await bookingOf(id)).status).toBe('SEARCHING');
    expect(await dispatchBooking(id)).toBe('max_attempts');
  });

  it('admin can assign manually and reassign an accepted job (audited)', async () => {
    const t1 = await tech('+919000000101', { dLat: 0.01 });
    const t2 = await tech('+919000000102', { dLat: 0.2, online: false }); // far + offline: admin may still choose
    const ops = await createStaff('OPERATIONS');
    const id = await newBooking();

    const cands = await request().get(`${API}/admin/bookings/${id}/candidates`).set(bearer(ops.token)).expect(200);
    expect(cands.body.data.map((c: { technicianId: string; eligible: boolean }) => [c.technicianId, c.eligible])).toEqual([
      [t1.techId, true],
      [t2.techId, false],
    ]);

    await request().post(`${API}/admin/bookings/${id}/assign`).set(bearer(ops.token)).send({ technicianId: t1.techId }).expect(200);
    await request().post(`${API}/technician/jobs/${id}/accept`).set(bearer(t1.token)).send({}).expect(200);

    await request().post(`${API}/admin/bookings/${id}/assign`).set(bearer(ops.token)).send({ technicianId: t2.techId }).expect(200);
    const b = await bookingOf(id);
    expect(b).toMatchObject({ status: 'TECHNICIAN_ASSIGNED', technicianId: t2.techId });
    expect(b.assignments.find((a) => a.technicianId === t1.techId)?.status).toBe('REASSIGNED');
    expect(b.assignments.find((a) => a.technicianId === t2.techId)).toMatchObject({ status: 'OFFERED', isManual: true });
    expect(await prisma.auditLog.count({ where: { action: 'BOOKING_REASSIGNED', entityId: id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: t1.userId, type: 'JOB_REASSIGNED' } })).toBe(1);
  });

  it('SUPPORT and FINANCE cannot assign', async () => {
    const t1 = await tech('+919000000101');
    const id = await newBooking();
    for (const role of ['SUPPORT', 'FINANCE'] as const) {
      const s = await createStaff(role);
      await request().post(`${API}/admin/bookings/${id}/assign`).set(bearer(s.token)).send({ technicianId: t1.techId }).expect(403);
    }
  });
});
