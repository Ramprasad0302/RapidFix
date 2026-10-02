import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { dispatchBooking } from '../src/services/assignment.service';
import { expireUnpaidBookings, UNPAID_BOOKING_TTL_MS } from '../src/services/payment.service';
import { signAccessToken } from '../src/services/token.service';
import { API, bearer, otpLogin, request, resetDb, sampleAddress, seedCatalog } from './helpers';

/** Automatic payments: pay online at booking, QR/link collection at the door, refunds, expiry. */

let serviceId: string;
let categoryId: string;
let customer: { token: string; user: { id: string } };
let tech: { userId: string; techId: string; token: string };

const sign = (s: string, secret: string) => createHmac('sha256', secret).update(s).digest('hex');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A fake Razorpay: answers by path and records every call. */
function fakeRazorpay(routes: Record<string, unknown>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/v1', '') + url.search;
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k));
    return key ? json(routes[key]) : json({ error: { description: `unmocked ${method} ${path}` } }, 404);
  });
  return calls;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
  const c = await seedCatalog();
  serviceId = c.service.id;
  categoryId = c.category.id;
  customer = await otpLogin('9000000001');
  const u = await prisma.user.create({
    data: {
      role: 'TECHNICIAN',
      phone: '+919000000101',
      name: 'Ravi Test',
      technician: {
        create: {
          languages: [],
          villageTown: 'Tanuku',
          district: 'West Godavari',
          state: 'Andhra Pradesh',
          pincode: '534211',
          verificationStatus: 'VERIFIED',
          isOnline: true,
          lastLatitude: 16.765,
          lastLongitude: 81.6818,
          skills: { create: { categoryId } },
          wallet: { create: {} },
        },
      },
    },
    include: { technician: true },
  });
  tech = { userId: u.id, techId: u.technician!.id, token: signAccessToken(u.id, 'TECHNICIAN').token };
});
afterAll(() => prisma.$disconnect());

const book = (paymentMethod: 'CASH' | 'RAZORPAY') =>
  request().post(`${API}/customer/bookings`).set(bearer(customer.token)).send({ serviceId, scheduleType: 'NOW', address: sampleAddress, paymentMethod }).expect(201).then((r) => r.body.data);
const booking = (id: string) => request().get(`${API}/customer/bookings/${id}`).set(bearer(customer.token)).expect(200).then((r) => r.body.data);
const tAct = (id: string, action: string) => request().post(`${API}/technician/jobs/${id}/${action}`).set(bearer(tech.token)).send({}).expect(200);
const job = (id: string) => request().get(`${API}/technician/jobs/${id}`).set(bearer(tech.token)).expect(200).then((r) => r.body.data);
const wallet = () => request().get(`${API}/technician/wallet`).set(bearer(tech.token)).expect(200).then((r) => r.body.data);

async function payAtBooking(id: string, orderId = 'order_PRE1', paymentId = 'pay_PRE1') {
  fakeRazorpay({ 'POST /orders': { id: orderId } });
  const order = await request().post(`${API}/customer/bookings/${id}/payment/razorpay-order`).set(bearer(customer.token)).send({}).expect(200);
  expect(order.body.data.amount).toBe(39_900);
  return request()
    .post(`${API}/customer/bookings/${id}/payment/razorpay-verify`)
    .set(bearer(customer.token))
    .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(`${orderId}|${paymentId}`, 'test_key_secret_123') })
    .expect(200)
    .then((r) => r.body.data);
}

async function workTheJob(id: string) {
  expect(await dispatchBooking(id)).toBe('offered');
  for (const a of ['accept', 'en-route', 'arrived', 'start', 'complete']) await tAct(id, a);
}

describe('pay online at booking', () => {
  it('waits for payment, then dispatches; completing the job settles it with no collection', async () => {
    const b = await book('RAZORPAY');
    expect(b).toMatchObject({ status: 'PENDING', amountDue: 39_900 });
    expect(await dispatchBooking(b.id)).toBe('skipped'); // not sent to technicians before payment

    const paid = await payAtBooking(b.id);
    expect(paid).toMatchObject({ status: 'SEARCHING', paymentStatus: 'SUCCESS', amountDue: 0 });
    expect(paid.payment).toMatchObject({ paidOnline: 39_900 });

    await workTheJob(b.id);
    const done = await booking(b.id);
    expect(done.status).toBe('PAYMENT_COMPLETED');
    expect(done.payment).toMatchObject({ method: 'RAZORPAY', status: 'SUCCESS', amount: 39_900 });
    expect(done.payment.invoiceNumber).toMatch(/^INV-/);
    expect((await wallet()).balance).toBe(33_915); // technician's 85% credited
  });

  it('extra work after paying in advance: only the balance is due, collected by QR / link', async () => {
    const b = await book('RAZORPAY');
    await payAtBooking(b.id);
    expect(await dispatchBooking(b.id)).toBe('offered');
    for (const a of ['accept', 'en-route', 'arrived', 'start']) await tAct(b.id, a);
    const charge = await request().post(`${API}/technician/jobs/${b.id}/additional-charges`).set(bearer(tech.token)).send({ title: 'Capacitor', amount: 20_000 }).expect(201);
    const chargeId = charge.body.data.additionalChargeItems[0].id;
    await request().post(`${API}/customer/bookings/${b.id}/additional-charges/${chargeId}/approve`).set(bearer(customer.token)).send({}).expect(200);
    await tAct(b.id, 'complete');

    const j = await job(b.id);
    expect(j).toMatchObject({ status: 'PAYMENT_PENDING', amountDue: 20_000, canCollectPayment: true });

    const calls = fakeRazorpay({
      'GET /payment_links?': { payment_links: [] },
      'POST /payment_links': { id: 'plink_1', short_url: 'https://rzp.io/i/abc', status: 'created', amount: 20_000, expire_by: 2_000_000_000, notes: { bookingId: b.id } },
    });
    const link = await request().post(`${API}/technician/jobs/${b.id}/payment-link`).set(bearer(tech.token)).send({}).expect(200);
    expect(link.body.data).toMatchObject({ linkId: 'plink_1', shortUrl: 'https://rzp.io/i/abc', amount: 20_000 });
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ amount: 20_000, notify: { sms: true }, notes: { bookingId: b.id } });

    fakeRazorpay({ 'GET /payment_links/plink_1': { id: 'plink_1', short_url: '', status: 'created', amount: 20_000, notes: { bookingId: b.id } } });
    expect((await request().get(`${API}/technician/jobs/${b.id}/payment-link/plink_1`).set(bearer(tech.token)).expect(200)).body.data).toEqual({ paid: false });

    fakeRazorpay({
      'GET /payment_links/plink_1': { id: 'plink_1', short_url: '', status: 'paid', amount: 20_000, notes: { bookingId: b.id }, payments: [{ payment_id: 'pay_BAL1', amount: 20_000, status: 'captured' }] },
    });
    expect((await request().get(`${API}/technician/jobs/${b.id}/payment-link/plink_1`).set(bearer(tech.token)).expect(200)).body.data).toEqual({ paid: true });
    const done = await booking(b.id);
    expect(done).toMatchObject({ status: 'PAYMENT_COMPLETED', amountDue: 0 });
    expect(done.payment).toMatchObject({ method: 'RAZORPAY', amount: 59_900 });
    expect((await wallet()).balance).toBe(Math.round(59_900 * 0.85));
  });

  it('customer can switch to paying after the service', async () => {
    const b = await book('RAZORPAY');
    const r = await request().post(`${API}/customer/bookings/${b.id}/payment/pay-later`).set(bearer(customer.token)).send({}).expect(200);
    expect(r.body.data).toMatchObject({ status: 'SEARCHING', paymentMethod: 'CASH' });
  });

  it('cancelling a prepaid booking refunds it automatically', async () => {
    const b = await book('RAZORPAY');
    await payAtBooking(b.id);
    const calls = fakeRazorpay({ 'POST /payments/pay_PRE1/refund': { id: 'rfnd_1' } });
    await request().post(`${API}/customer/bookings/${b.id}/cancel`).set(bearer(customer.token)).send({ reason: 'Plans changed' }).expect(200);
    expect(calls).toEqual([expect.objectContaining({ method: 'POST', path: '/payments/pay_PRE1/refund', body: expect.objectContaining({ amount: 39_900 }) })]);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id }, include: { payment: true } });
    expect(after.status).toBe('REFUNDED');
    expect(after.payment).toMatchObject({ status: 'REFUNDED', refundedAmount: 39_900 });
    expect(await prisma.notification.count({ where: { userId: customer.user.id, title: 'Refund started' } })).toBe(1);
  });

  it('an unpaid online booking expires; a payment Razorpay did take is honoured instead', async () => {
    const unpaid = await book('RAZORPAY');
    fakeRazorpay({ 'POST /orders': { id: 'order_X' } });
    await request().post(`${API}/customer/bookings/${unpaid.id}/payment/razorpay-order`).set(bearer(customer.token)).send({}).expect(200);
    await prisma.booking.update({ where: { id: unpaid.id }, data: { createdAt: new Date(Date.now() - UNPAID_BOOKING_TTL_MS - 60_000) } });

    // Razorpay says the customer did pay (the app closed before confirming): the booking goes ahead.
    fakeRazorpay({ 'GET /orders/order_X/payments': { items: [{ id: 'pay_LATE', amount: 39_900, status: 'captured' }] } });
    await expireUnpaidBookings();
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: unpaid.id } })).status).toBe('SEARCHING');

    // Never paid (no order even opened) → cancelled so it doesn't hold the slot.
    const second = await book('RAZORPAY');
    await prisma.booking.update({ where: { id: second.id }, data: { createdAt: new Date(Date.now() - UNPAID_BOOKING_TTL_MS - 60_000) } });
    await expireUnpaidBookings();
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ status: 'ADMIN_CANCELLED', cancellationReason: 'Online payment was not completed' });
  });
});

describe('cash booking, paid online at the door', () => {
  it('payment_link.paid webhook settles the job; a second payment is refunded automatically', async () => {
    const b = await book('CASH');
    await workTheJob(b.id);
    expect(await job(b.id)).toMatchObject({ amountDue: 39_900, onlinePaymentAvailable: true });

    const event = (pid: string) =>
      JSON.stringify({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: 'plink_9', notes: { bookingId: b.id } } }, payment: { entity: { id: pid, order_id: 'order_L', amount: 39_900, status: 'captured' } } } });
    const hook = (body: string) =>
      request().post(`${API}/payments/razorpay/webhook`).set('Content-Type', 'application/json').set('X-Razorpay-Signature', sign(body, 'test_webhook_secret_123')).send(body).expect(200);

    await hook(event('pay_DOOR1'));
    await hook(event('pay_DOOR1')); // duplicate delivery: no effect
    const done = await booking(b.id);
    expect(done.status).toBe('PAYMENT_COMPLETED');
    expect(done.payment.method).toBe('RAZORPAY');
    expect((await wallet()).balance).toBe(33_915);

    // The customer also paid in their app by mistake → refunded automatically.
    const calls = fakeRazorpay({ 'POST /payments/pay_DOOR2/refund': { id: 'rfnd_2' } });
    await hook(event('pay_DOOR2'));
    expect(calls).toEqual([expect.objectContaining({ path: '/payments/pay_DOOR2/refund' })]);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('PAYMENT_COMPLETED');
  });

  it('cash is still accepted and only the commission is owed', async () => {
    const b = await book('CASH');
    await workTheJob(b.id);
    await request().post(`${API}/technician/jobs/${b.id}/collect-payment`).set(bearer(tech.token)).send({ method: 'CASH' }).expect(200);
    expect((await booking(b.id)).payment).toMatchObject({ method: 'CASH', status: 'SUCCESS' });
    expect((await wallet()).balance).toBe(-(39_900 - 33_915));
  });
});

describe('technician background location (Android app on-duty service)', () => {
  it('location key posts GPS only while online, and is never accepted as a login', async () => {
    const key = (await request().post(`${API}/technician/location-key`).set(bearer(tech.token)).send({}).expect(200)).body.data.token as string;
    const ping = () => request().post(`${API}/technician/device/location`).set(bearer(key)).send({ lat: 16.7601, lng: 81.6802 });

    expect((await ping().expect(200)).body.data).toMatchObject({ accepted: true, online: true });
    const row = await prisma.technician.findUniqueOrThrow({ where: { id: tech.techId } });
    expect(row).toMatchObject({ lastLatitude: 16.7601, lastLongitude: 81.6802 });

    // The key can't open any normal screen.
    await request().get(`${API}/technician/profile`).set(bearer(key)).expect(401);
    // Without a key / with a login token instead of a key: refused.
    await request().post(`${API}/technician/device/location`).send({ lat: 1, lng: 1 }).expect(401);
    await request().post(`${API}/technician/device/location`).set(bearer(tech.token)).send({ lat: 1, lng: 1 }).expect(401);

    // Gone offline → the app is told to stop its service.
    await prisma.technician.update({ where: { id: tech.techId }, data: { isOnline: false } });
    expect((await ping().expect(200)).body.data).toMatchObject({ accepted: false, online: false });
  });
});
