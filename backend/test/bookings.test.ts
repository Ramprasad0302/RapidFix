import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { API, bearer, createTechnician, otpLogin, request, resetDb, sampleAddress, seedCatalog } from './helpers';

let serviceId: string;
let categoryId: string;

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
  const { service, category } = await seedCatalog();
  serviceId = service.id;
  categoryId = category.id;
});
afterAll(() => prisma.$disconnect());

const tomorrow = () => {
  const d = new Date(Date.now() + 330 * 60_000 + 86_400_000);
  return d.toISOString().slice(0, 10);
};

const book = (token: string, body: Record<string, unknown> = {}) =>
  request()
    .post(`${API}/customer/bookings`)
    .set(bearer(token))
    .send({ serviceId, scheduleType: 'SCHEDULED', date: tomorrow(), timeSlot: '14-16', address: sampleAddress, ...body });

async function coupon(overrides: Record<string, unknown> = {}) {
  return prisma.coupon.create({
    data: {
      code: 'FIXAC20',
      title: 'AC Service Offer',
      terms: [],
      discountType: 'PERCENTAGE',
      discountValue: 20,
      minOrderAmount: 0,
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000),
      categoryId,
      ...overrides,
    },
  });
}

describe('public catalogue & estimate', () => {
  it('guests can browse, search and price', async () => {
    expect((await request().get(`${API}/services/categories`).expect(200)).body.data[0]).toMatchObject({ name: 'AC & Cooling', serviceCount: 1 });
    expect((await request().get(`${API}/services?q=AC Tech`).expect(200)).body.data).toHaveLength(1);
    const est = await request().post(`${API}/bookings/estimate`).send({ serviceId }).expect(200);
    expect(est.body.data).toMatchObject({ subtotal: 39_900, tax: 7182, total: 47_082 });
  });

  it('applies valid coupons and explains invalid ones', async () => {
    await coupon();
    const ok = await request().post(`${API}/bookings/estimate`).send({ serviceId, couponCode: 'fixac20' }).expect(200);
    expect(ok.body.data.discount).toBe(7980);
    await prisma.coupon.update({ where: { code: 'FIXAC20' }, data: { endsAt: new Date(Date.now() - 1000) } });
    const expired = await request().post(`${API}/bookings/estimate`).send({ serviceId, couponCode: 'FIXAC20' }).expect(200);
    expect(expired.body.data.coupon).toMatchObject({ valid: false, message: 'This offer has expired.' });
  });
});

describe('customer bookings', () => {
  it('guests cannot create a booking', async () => {
    await request().post(`${API}/customer/bookings`).send({}).expect(401);
  });

  it('creates a booking priced on the server, moves it to SEARCHING and notifies the customer', async () => {
    const { token, user } = await otpLogin('9000000001');
    const res = await book(token, { totalAmount: 1, serviceCharge: 1 }).expect(201);
    expect(res.body.data).toMatchObject({ status: 'SEARCHING', locality: 'Tanuku, AP', totalAmount: 47_082 });
    expect(res.body.data.code).toMatch(/^FX-\d{4}-\d{6}$/);
    const history = await prisma.bookingStatusHistory.findMany({ where: { bookingId: res.body.data.id }, orderBy: { createdAt: 'asc' } });
    expect(history.map((h) => h.toStatus)).toEqual(['PENDING', 'SEARCHING']);
    expect(await prisma.notification.count({ where: { userId: user.id, type: 'BOOKING_CONFIRMED' } })).toBe(1);
    // Address saved by default.
    expect((await request().get(`${API}/customer/addresses`).set(bearer(token)).expect(200)).body.data).toHaveLength(1);
  });

  it('a double-submitted booking is created once', async () => {
    const { token } = await otpLogin('9000000001');
    const a = await book(token).expect(201);
    const b = await book(token).expect(201);
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(await prisma.booking.count()).toBe(1);
  });

  it('rejects slots in the past and attachments that are not our uploads', async () => {
    const { token } = await otpLogin('9000000001');
    expect((await book(token, { date: '2020-01-01' }).expect(400)).body.code).toBe('SLOT_IN_PAST');
    expect((await book(token, { photos: ['https://evil.example/x.jpg'] }).expect(400)).body.code).toBe('INVALID_ATTACHMENT');
  });

  it('customer A can never see or cancel customer B’s booking', async () => {
    const a = await otpLogin('9000000001');
    const b = await otpLogin('9000000002');
    const booking = await book(a.token).expect(201);
    await request().get(`${API}/customer/bookings/${booking.body.data.id}`).set(bearer(b.token)).expect(404);
    await request().post(`${API}/customer/bookings/${booking.body.data.id}/cancel`).set(bearer(b.token)).send({}).expect(404);
    expect((await request().get(`${API}/customer/bookings`).set(bearer(b.token)).expect(200)).body.data).toHaveLength(0);
  });

  it('cancelling returns the coupon; a cancelled booking cannot be cancelled again', async () => {
    await coupon();
    const { token } = await otpLogin('9000000001');
    const booking = await book(token, { couponCode: 'FIXAC20' }).expect(201);
    expect(booking.body.data.price.discount).toBe(7980);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code: 'FIXAC20' } })).usedCount).toBe(1);

    await request().post(`${API}/customer/bookings/${booking.body.data.id}/cancel`).set(bearer(token)).send({ reason: 'Plans changed' }).expect(200);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code: 'FIXAC20' } })).usedCount).toBe(0);
    expect((await request().post(`${API}/customer/bookings/${booking.body.data.id}/cancel`).set(bearer(token)).send({}).expect(409)).body.code).toBe('NOT_CANCELLABLE');
  });

  it('first-booking coupons are refused once the customer has booked before', async () => {
    await coupon({ code: 'WELCOME100', categoryId: null, discountType: 'FIXED', discountValue: 10_000, isFirstBookingOnly: true });
    const { token } = await otpLogin('9000000001');
    await book(token, { couponCode: 'WELCOME100' }).expect(201);
    const second = await book(token, { couponCode: 'WELCOME100', timeSlot: '16-18' }).expect(400);
    expect(second.body.code).toBe('COUPON_INVALID');
  });

  it('shows the technician phone only after they accept', async () => {
    const { token } = await otpLogin('9000000001');
    const booking = await book(token).expect(201);
    const tech = await createTechnician('+919000000101');
    await prisma.booking.update({ where: { id: booking.body.data.id }, data: { technicianId: tech.technician!.id, status: 'TECHNICIAN_ASSIGNED' } });
    let detail = await request().get(`${API}/customer/bookings/${booking.body.data.id}`).set(bearer(token)).expect(200);
    expect(detail.body.data.technician.phone).toBeNull();
    await prisma.booking.update({ where: { id: booking.body.data.id }, data: { status: 'TECHNICIAN_ACCEPTED' } });
    detail = await request().get(`${API}/customer/bookings/${booking.body.data.id}`).set(bearer(token)).expect(200);
    expect(detail.body.data.technician.phone).toBe('+919000000101');
  });
});
