import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { signAccessToken } from '../src/services/token.service';
import { API, bearer, createTechnician, otpLogin, request, resetDb, sampleAddress, seedCatalog } from './helpers';

let bookingId: string;
let techToken: string;
let customerToken: string;

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
  const { service } = await seedCatalog();
  const customer = await otpLogin('9000000001');
  customerToken = customer.token;
  const res = await request()
    .post(`${API}/customer/bookings`)
    .set(bearer(customer.token))
    .send({ serviceId: service.id, scheduleType: 'NOW', address: sampleAddress })
    .expect(201);
  bookingId = res.body.data.id;
  const tech = await createTechnician('+919000000101');
  techToken = signAccessToken(tech.id, 'TECHNICIAN').token;
  // Stand-in for the assignment engine (Phase 6).
  await prisma.booking.update({ where: { id: bookingId }, data: { technicianId: tech.technician!.id, status: 'TECHNICIAN_ASSIGNED' } });
});
afterAll(() => prisma.$disconnect());

const act = (action: string, token = techToken) =>
  request().post(`${API}/technician/jobs/${bookingId}/${action}`).set(bearer(token)).send({});

describe('technician job lifecycle', () => {
  it('accept → en route → arrived → start → complete, following the state machine', async () => {
    let job = await request().get(`${API}/technician/jobs/${bookingId}`).set(bearer(techToken)).expect(200);
    expect(job.body.data.actions).toEqual(['ACCEPT', 'REJECT']);

    for (const [action, status] of [
      ['accept', 'TECHNICIAN_ACCEPTED'],
      ['en-route', 'TECHNICIAN_EN_ROUTE'],
      ['arrived', 'TECHNICIAN_ARRIVED'],
      ['start', 'SERVICE_STARTED'],
      ['complete', 'PAYMENT_PENDING'],
    ] as const) {
      job = await act(action).expect(200);
      expect(job.body.data.status).toBe(status);
    }
    const customerView = await request().get(`${API}/customer/bookings/${bookingId}`).set(bearer(customerToken)).expect(200);
    expect(customerView.body.data.timeline.every((s: { state: string }) => s.state === 'done')).toBe(true);
    expect(await prisma.notification.count({ where: { type: 'SERVICE_COMPLETED' } })).toBe(1);
  });

  it('refuses out-of-order actions', async () => {
    expect((await act('start').expect(409)).body.code).toBe('INVALID_TRANSITION');
    await act('accept').expect(200);
    await act('complete').expect(409);
  });

  it('reject sends the job back to SEARCHING and removes it from the technician', async () => {
    await act('reject').expect(200);
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b).toMatchObject({ status: 'SEARCHING', technicianId: null });
    await request().get(`${API}/technician/jobs/${bookingId}`).set(bearer(techToken)).expect(404);
  });

  it('another technician can neither see nor act on the job', async () => {
    const other = await createTechnician('+919000000102');
    const token = signAccessToken(other.id, 'TECHNICIAN').token;
    await request().get(`${API}/technician/jobs/${bookingId}`).set(bearer(token)).expect(404);
    await act('accept', token).expect(404);
  });

  it('unverified technicians cannot go online or accept', async () => {
    const pending = await createTechnician('+919000000103', 'PENDING');
    const token = signAccessToken(pending.id, 'TECHNICIAN').token;
    expect((await request().post(`${API}/technician/online`).set(bearer(token)).send({}).expect(403)).body.code).toBe('TECHNICIAN_NOT_VERIFIED');
    await prisma.booking.update({ where: { id: bookingId }, data: { technicianId: pending.technician!.id } });
    await act('accept', token).expect(403);
  });

  it('dashboard and job list reflect assigned work', async () => {
    const dash = await request().get(`${API}/technician/dashboard`).set(bearer(techToken)).expect(200);
    expect(dash.body.data.today.jobs).toBe(1);
    const list = await request().get(`${API}/technician/jobs?tab=upcoming`).set(bearer(techToken)).expect(200);
    expect(list.body.data.counts.upcoming).toBe(1);
    expect(list.body.data.items[0].customerName).toBeDefined();
  });
});
