import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { dispatchBooking } from '../src/services/assignment.service';
import { signAccessToken } from '../src/services/token.service';
import { API, bearer, createStaff, otpLogin, partnerPayout, request, resetDb, sampleAddress, seedCatalog } from './helpers';

let serviceId: string;
let categoryId: string;
let customer: { token: string; user: { id: string } };
let tech: { userId: string; techId: string; token: string };

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

async function bookAndAssign() {
  const res = await request().post(`${API}/customer/bookings`).set(bearer(customer.token)).send({ serviceId, scheduleType: 'NOW', address: sampleAddress }).expect(201);
  const id = res.body.data.id as string;
  expect(await dispatchBooking(id)).toBe('offered');
  return id;
}

const tAct = (id: string, action: string) => request().post(`${API}/technician/jobs/${id}/${action}`).set(bearer(tech.token)).send({});
const booking = (id: string) => request().get(`${API}/customer/bookings/${id}`).set(bearer(customer.token)).expect(200).then((r) => r.body.data);

async function toServiceStarted(id: string) {
  for (const a of ['accept', 'en-route', 'arrived', 'start']) await tAct(id, a).expect(200);
}

describe('starting the trip', () => {
  it('notifies the customer with an ETA and shows the technician on the live map at once', async () => {
    const id = await bookAndAssign();
    await tAct(id, 'accept').expect(200);
    // The app sends its GPS position with "Start travel" (~2.2 km from the Tanuku address).
    await request().post(`${API}/technician/jobs/${id}/en-route`).set(bearer(tech.token)).send({ lat: 16.7547 + 0.02, lng: 81.6818 }).expect(200);

    const b = await booking(id);
    expect(b.status).toBe('TECHNICIAN_EN_ROUTE');
    expect(b.technician.location).toEqual({ lat: 16.7747, lng: 81.6818 });
    expect(b.technician.etaMinutes).toBeGreaterThan(0);
    const notice = await prisma.notification.findFirstOrThrow({ where: { userId: customer.user.id, type: 'TECHNICIAN_EN_ROUTE' } });
    expect(notice.title).toBe('Technician on the way');
    expect(notice.body).toMatch(/is on the way — arriving in about \d+ min\. Tap to track live\./);
  });
});

describe('full customer ↔ technician journey', () => {
  it('book → assign → travel → extra work approved → complete → cash → invoice → review', async () => {
    const id = await bookAndAssign();
    await tAct(id, 'accept').expect(200);
    await tAct(id, 'en-route').expect(200);

    // Live location while travelling.
    await request().post(`${API}/technician/location`).set(bearer(tech.token)).send({ lat: 16.76, lng: 81.682 }).expect(200);
    const travelling = await booking(id);
    expect(travelling.technician.location).toEqual({ lat: 16.76, lng: 81.682 });
    expect(travelling.technician.etaMinutes).toBeGreaterThan(0);

    await tAct(id, 'arrived').expect(200);
    await tAct(id, 'start').expect(200);

    // The technician can't change the price silently — extra work needs the customer's approval.
    const before = await booking(id);
    const req = await request().post(`${API}/technician/jobs/${id}/additional-charges`).set(bearer(tech.token)).send({ title: 'Gas filling', amount: 70_000 }).expect(201);
    expect(req.body.data.status).toBe('ADDITIONAL_CHARGE_REQUESTED');
    await tAct(id, 'complete').expect(409);

    const pending = await booking(id);
    expect(pending.price.total).toBe(before.price.total);
    const charge = pending.additionalChargeItems[0];
    const approved = await request().post(`${API}/customer/bookings/${id}/additional-charges/${charge.id}/approve`).set(bearer(customer.token)).send({}).expect(200);
    // 299 + 100 + 700, no GST
    expect(approved.body.data.price).toMatchObject({ additionalCharges: 70_000, tax: 0, total: 109_900 });
    await tAct(id, 'complete').expect(200);

    const done = await booking(id);
    expect(done.status).toBe('PAYMENT_PENDING');

    // Cash collected by the technician.
    const paid = await request().post(`${API}/technician/jobs/${id}/collect-payment`).set(bearer(tech.token)).send({ method: 'CASH' }).expect(200);
    expect(paid.body.data.status).toBe('PAYMENT_COMPLETED');
    // Idempotent: a second tap does nothing.
    await request().post(`${API}/technician/jobs/${id}/collect-payment`).set(bearer(tech.token)).send({ method: 'CASH' }).expect(409);

    // Commission 15% of 1,09,900 = 16,485 ; technician keeps cash so owes commission + GST (19,782).
    const b = await prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(b).toMatchObject({ commissionAmount: 16_485, technicianEarning: 93_415, paymentStatus: 'SUCCESS' });
    const w = await request().get(`${API}/technician/wallet`).set(bearer(tech.token)).expect(200);
    expect(w.body.data).toMatchObject({ balance: -16_485, totalEarned: 93_415 });

    const inv = await request().get(`${API}/bookings/${id}/invoice`).set(bearer(customer.token)).expect(200);
    expect(inv.body.data).toMatchObject({ status: 'PAID', total: 109_900, paymentMethod: 'CASH' });
    expect(inv.body.data.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(inv.body.data.items.map((i: { name: string }) => i.name)).toEqual(['AC Repair', 'Visit charge', 'Gas filling']);

    await request().post(`${API}/customer/bookings/${id}/review`).set(bearer(customer.token)).send({ rating: 4, comment: 'Good' }).expect(201);
    await request().post(`${API}/customer/bookings/${id}/review`).set(bearer(customer.token)).send({ rating: 5 }).expect(409);
    expect((await prisma.technician.findUniqueOrThrow({ where: { id: tech.techId } })).ratingAvg).toBe(4);
  });

  it('customer can reject extra work and the job continues at the original price', async () => {
    const id = await bookAndAssign();
    await toServiceStarted(id);
    await request().post(`${API}/technician/jobs/${id}/additional-charges`).set(bearer(tech.token)).send({ title: 'New part', amount: 50_000 }).expect(201);
    const pending = await booking(id);
    await request().post(`${API}/customer/bookings/${id}/additional-charges/${pending.additionalChargeItems[0].id}/reject`).set(bearer(customer.token)).send({}).expect(200);
    const after = await booking(id);
    expect(after).toMatchObject({ status: 'SERVICE_STARTED' });
    expect(after.price.total).toBe(pending.price.total);
  });
});

describe('chat', () => {
  it('participants chat; other customers cannot see it; staff read-only', async () => {
    const id = await bookAndAssign();
    await tAct(id, 'accept').expect(200);
    await request().post(`${API}/bookings/${id}/messages`).set(bearer(customer.token)).send({ body: 'Please bring a ladder' }).expect(201);
    await request().post(`${API}/bookings/${id}/messages`).set(bearer(tech.token)).send({ body: 'Sure' }).expect(201);
    const list = await request().get(`${API}/bookings/${id}/messages`).set(bearer(tech.token)).expect(200);
    expect(list.body.data.map((m: { body: string }) => m.body)).toEqual(['Please bring a ladder', 'Sure']);
    expect(await prisma.notification.count({ where: { userId: tech.userId, type: 'NEW_MESSAGE' } })).toBe(1);

    await request().post(`${API}/bookings/${id}/messages/read`).set(bearer(tech.token)).send({}).expect(200);
    expect((await prisma.message.findFirstOrThrow({ where: { body: 'Please bring a ladder' } })).readAt).not.toBeNull();

    const stranger = await otpLogin('9000000002');
    await request().get(`${API}/bookings/${id}/messages`).set(bearer(stranger.token)).expect(404);
    const support = await createStaff('SUPPORT');
    await request().get(`${API}/bookings/${id}/messages`).set(bearer(support.token)).expect(200);
    await request().post(`${API}/bookings/${id}/messages`).set(bearer(support.token)).send({ body: 'hi' }).expect(403);
  });

  it('report & block: support gets a complaint with the messages; the chat closes and hides the blocked person', async () => {
    const id = await bookAndAssign();
    await tAct(id, 'accept').expect(200);
    await request().post(`${API}/bookings/${id}/messages`).set(bearer(tech.token)).send({ body: 'rude message' }).expect(201);
    await request().post(`${API}/bookings/${id}/messages`).set(bearer(customer.token)).send({ body: 'hello' }).expect(201);

    const r = await request().post(`${API}/bookings/${id}/chat/report`).set(bearer(customer.token)).send({ reason: 'Abusive or rude' }).expect(200);
    expect(r.body.data).toMatchObject({ blockedBy: 'me', canSend: false, counterpart: { phone: null } });
    const complaint = await prisma.complaint.findFirstOrThrow({ where: { bookingId: id } });
    expect(complaint).toMatchObject({ category: 'Chat message', raisedById: customer.user.id });
    expect(complaint.description).toContain('rude message');

    // The blocker no longer sees their messages; neither side can send.
    const mine = await request().get(`${API}/bookings/${id}/messages`).set(bearer(customer.token)).expect(200);
    expect(mine.body.data.map((m: { body: string }) => m.body)).toEqual(['hello']);
    await request().post(`${API}/bookings/${id}/messages`).set(bearer(tech.token)).send({ body: 'again' }).expect(409);
    const theirs = await request().get(`${API}/bookings/${id}/chat`).set(bearer(tech.token)).expect(200);
    expect(theirs.body.data).toMatchObject({ blockedBy: 'them', canSend: false });

    const un = await request().delete(`${API}/bookings/${id}/chat/block`).set(bearer(customer.token)).expect(200);
    expect(un.body.data).toMatchObject({ blockedBy: null, canSend: true });
  });
});

describe('App Store review account', () => {
  it('books without payment and goes to the demo technician (never a real one)', async () => {
    const reviewer = await otpLogin('9000012345');
    const res = await request()
      .post(`${API}/customer/bookings`)
      .set(bearer(reviewer.token))
      .send({ serviceId, scheduleType: 'NOW', address: { ...sampleAddress, latitude: 37.33, longitude: -122.03 } }) // Cupertino: outside the area
      .expect(201);
    expect(res.body.data).toMatchObject({ status: 'TECHNICIAN_ACCEPTED', payNow: 0 });
    const chat = await request().get(`${API}/bookings/${res.body.data.id}/messages`).set(bearer(reviewer.token)).expect(200);
    expect(chat.body.data[0].body).toContain('demo technician');
    expect(await prisma.notification.count({ where: { userId: tech.userId } })).toBe(0);
    const demo = await prisma.technician.findFirstOrThrow({ where: { user: { phone: '+919000099999' } } });
    expect(demo.isOnline).toBe(false);
  });
});

describe('Razorpay', () => {
  async function payable() {
    const id = await bookAndAssign();
    await toServiceStarted(id);
    await tAct(id, 'complete').expect(200);
    return id;
  }
  const sign = (s: string, secret: string) => createHmac('sha256', secret).update(s).digest('hex');

  it('order → verified checkout credits the technician; forged signatures are rejected', async () => {
    const id = await payable();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'order_TEST123' }), { status: 200 }));
    const order = await request().post(`${API}/customer/bookings/${id}/payment/razorpay-order`).set(bearer(customer.token)).send({}).expect(200);
    expect(order.body.data).toMatchObject({ orderId: 'order_TEST123', keyId: 'rzp_test_fixora', amount: 39_900 });
    expect(fetchMock).toHaveBeenCalledOnce();

    await request()
      .post(`${API}/customer/bookings/${id}/payment/razorpay-verify`)
      .set(bearer(customer.token))
      .send({ razorpay_order_id: 'order_TEST123', razorpay_payment_id: 'pay_FAKE001', razorpay_signature: 'f'.repeat(64) })
      .expect(400);

    const ok = await request()
      .post(`${API}/customer/bookings/${id}/payment/razorpay-verify`)
      .set(bearer(customer.token))
      .send({ razorpay_order_id: 'order_TEST123', razorpay_payment_id: 'pay_REAL001', razorpay_signature: sign('order_TEST123|pay_REAL001', 'test_key_secret_123') })
      .expect(200);
    expect(ok.body.data.status).toBe('PAYMENT_COMPLETED');
    const w = await request().get(`${API}/technician/wallet`).set(bearer(tech.token)).expect(200);
    expect(w.body.data.balance).toBe(33_915); // 85% of 39,900
  });

  it('webhook is signature-checked and idempotent', async () => {
    const id = await payable();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'order_WH1' }), { status: 200 }));
    await request().post(`${API}/customer/bookings/${id}/payment/razorpay-order`).set(bearer(customer.token)).send({}).expect(200);

    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_WH1', order_id: 'order_WH1', amount: 39_900, status: 'captured' } } } });
    await request().post(`${API}/payments/razorpay/webhook`).set('Content-Type', 'application/json').set('X-Razorpay-Signature', 'bad').send(body).expect(401);
    for (let i = 0; i < 2; i++) {
      await request()
        .post(`${API}/payments/razorpay/webhook`)
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', sign(body, 'test_webhook_secret_123'))
        .send(body)
        .expect(200);
    }
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('PAYMENT_COMPLETED');
    expect(await prisma.paymentTransaction.count({ where: { type: 'CHARGE' } })).toBe(1);
    expect(await prisma.walletTransaction.count()).toBe(1);
  });

  it('admin refund of a cash payment marks it refunded and audits it', async () => {
    const id = await payable();
    await request().post(`${API}/technician/jobs/${id}/collect-payment`).set(bearer(tech.token)).send({ method: 'UPI' }).expect(200);
    const fin = await createStaff('FINANCE');
    await request().post(`${API}/admin/payments/${id}/refund`).set(bearer(fin.token)).send({ reason: 'Service not satisfactory' }).expect(200);
    const b = await prisma.booking.findUniqueOrThrow({ where: { id }, include: { payment: true } });
    expect(b.status).toBe('REFUNDED');
    expect(b.payment).toMatchObject({ status: 'REFUNDED', refundedAmount: 39_900 });
    expect(await prisma.auditLog.count({ where: { action: 'REFUND', entityId: id } })).toBe(1);
  });
});

describe('technician account', () => {
  it('bank account number is encrypted at rest; only last 4 are returned', async () => {
    const res = await request()
      .put(`${API}/technician/payout-details`)
      .set(bearer(tech.token))
      .send({ payoutUpiId: 'ravi@okaxis', bankAccountHolder: 'Ravi Test', bankIfsc: 'SBIN0001234', bankAccountNumber: '123456789012' })
      .expect(200);
    expect(res.body.data).toEqual({ payoutUpiId: 'ravi@okaxis', bankAccountHolder: 'Ravi Test', bankIfsc: 'SBIN0001234', bankAccountLast4: '9012' });
    const row = await prisma.technician.findUniqueOrThrow({ where: { id: tech.techId } });
    expect(row.bankAccountEnc).not.toContain('123456789012');
    expect(row.bankAccountEnc).toMatch(/^v1:/);
  });

  it('KYC files are private: owner and staff only', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a60000000049454e44ae426082', 'hex');
    const up = await request().post(`${API}/uploads?private=1`).set(bearer(tech.token)).attach('file', png, 'id.png').expect(201);
    const path = up.body.data.path as string;
    expect(path).toMatch(/^\/private\//);
    await request().post(`${API}/technician/documents`).set(bearer(tech.token)).send({ type: 'AADHAAR', fileUrl: path }).expect(201);

    await request().get(`${API}/files${path}`).set(bearer(tech.token)).expect(200);
    await request().get(`${API}/files${path}`).set(bearer((await createStaff('OPERATIONS')).token)).expect(200);
    await request().get(`${API}/files${path}`).set(bearer(customer.token)).expect(404);
    await request().get(`/uploads${path.replace('/private', '')}`).expect(404);
  });

  it('a new phone account can register as a partner (pending verification)', async () => {
    const fresh = await otpLogin('9000000050');
    const partner = {
      name: 'New Partner',
      email: 'new.partner@example.com',
      dateOfBirth: '1992-04-10',
      alternatePhone: '9000000051',
      experienceYears: 3,
      languages: ['Telugu'],
      hasOwnTools: true,
      hasVehicle: false,
      serviceRadiusKm: 10,
      addressLine: '4-12, Main Road',
      villageTown: 'Tanuku',
      district: 'West Godavari',
      state: 'Andhra Pradesh',
      pincode: '534211',
      skills: [categoryId],
      ...partnerPayout,
    };
    // Onboarding needs the details used for verification — and bank details for payouts.
    const { bankAccountNumber: _acc, ...noBank } = partner;
    await request().post(`${API}/partner/register`).set(bearer(fresh.token)).send(noBank).expect(400);
    await request().post(`${API}/partner/register`).set(bearer(fresh.token)).send({ ...partner, bankIfsc: 'SBI123' }).expect(400);
    await request().post(`${API}/partner/register`).set(bearer(fresh.token)).send({ ...partner, aadhaarNumber: '234567890123' }).expect(400);
    const { dateOfBirth: _dob, ...noDob } = partner;
    await request().post(`${API}/partner/register`).set(bearer(fresh.token)).send(noDob).expect(400);
    await request().post(`${API}/partner/register`).set(bearer(fresh.token)).send({ ...partner, dateOfBirth: '2015-01-01' }).expect(400);
    await request().post(`${API}/partner/register`).set(bearer(fresh.token)).send({ ...partner, email: '' }).expect(400);
    // The alternate number is optional (the app sends null when it's left blank).
    const other = await otpLogin('9000000052');
    await request().post(`${API}/partner/register`).set(bearer(other.token)).send({ ...partner, email: 'other@example.com', alternatePhone: null }).expect(201);

    const res = await request().post(`${API}/partner/register`).set(bearer(fresh.token)).send(partner).expect(201);
    expect(res.body.data.user).toMatchObject({ role: 'TECHNICIAN', technician: { verificationStatus: 'PENDING' } });
    const details = await request().get(`${API}/technician/profile/details`).set(bearer(res.body.data.accessToken)).expect(200);
    expect(details.body.data).toMatchObject({ dateOfBirth: '1992-04-10', alternatePhone: '+919000000051', hasOwnTools: true, hasVehicle: false });
    const tech = await prisma.technician.findFirstOrThrow({ where: { user: { phone: '+919000000050' } } });
    expect(tech).toMatchObject({ bankAccountHolder: 'Test Partner', bankIfsc: 'SBIN0001234', bankAccountLast4: '9012', payoutUpiId: 'partner@okaxis', aadhaarLast4: '0124' });
    expect(tech.bankAccountEnc).not.toContain('123456789012'); // encrypted at rest
    expect(tech.aadhaarEnc).not.toContain('234567890124');
    await request().post(`${API}/auth/refresh`).set('Cookie', fresh.cookie).expect(401);
    await request().post(`${API}/technician/online`).set(bearer(res.body.data.accessToken)).send({}).expect(403);
  });
});
