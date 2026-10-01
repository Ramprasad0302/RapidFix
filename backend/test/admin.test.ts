import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { clearSettingsCache } from '../src/services/settings.service';
import { API, bearer, createStaff, createTechnician, otpLogin, request, resetDb, sampleAddress, seedCatalog } from './helpers';

let serviceId: string;
let categoryId: string;

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
  clearSettingsCache();
  const c = await seedCatalog();
  serviceId = c.service.id;
  categoryId = c.category.id;
});
afterAll(() => prisma.$disconnect());

const get = (path: string, token: string) => request().get(`${API}/admin${path}`).set(bearer(token));
const post = (path: string, token: string, body: object = {}) => request().post(`${API}/admin${path}`).set(bearer(token)).send(body);

async function customerBooking() {
  const customer = await otpLogin('9000000001');
  const res = await request().post(`${API}/customer/bookings`).set(bearer(customer.token)).send({ serviceId, scheduleType: 'NOW', address: sampleAddress }).expect(201);
  return { customer, bookingId: res.body.data.id as string };
}

describe('module permissions', () => {
  it('each staff role reaches only its own modules', async () => {
    const support = await createStaff('SUPPORT');
    const finance = await createStaff('FINANCE');
    const ops = await createStaff('OPERATIONS');

    await get('/payments', support.token).expect(403);
    await get('/payments', finance.token).expect(200);
    await get('/customers', ops.token).expect(403);
    await get('/customers', support.token).expect(200);
    await get('/technicians', ops.token).expect(200);
    await get('/settings', ops.token).expect(403);
    await get('/audit-logs', finance.token).expect(403);
    await get('/reports?from=2026-01-01&to=2026-12-31', finance.token).expect(200);
  });

  it('customers and technicians cannot use the admin API at all', async () => {
    const { customer } = await customerBooking();
    await get('/bookings', customer.token).expect(403);
  });

  it('finance and support can read a booking but only operations can act on it', async () => {
    const { bookingId } = await customerBooking();
    const finance = await createStaff('FINANCE');
    const support = await createStaff('SUPPORT');
    const ops = await createStaff('OPERATIONS');

    await get(`/bookings/${bookingId}`, finance.token).expect(200);
    await get(`/bookings/${bookingId}`, support.token).expect(200);
    await post(`/bookings/${bookingId}/cancel`, finance.token, { reason: 'Not allowed' }).expect(403);

    const res = await post(`/bookings/${bookingId}/cancel`, ops.token, { reason: 'Customer asked by phone' }).expect(200);
    expect(res.body.data.status).toBe('ADMIN_CANCELLED');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'BOOKING_CANCELLED', entityId: bookingId } });
    expect(audit?.actorId).toBe(ops.user.id);
  });
});

describe('account status', () => {
  it('needs the permission that matches the account being changed', async () => {
    const { customer } = await customerBooking();
    const tech = await createTechnician('+919000000101');
    const admin = await createStaff('ADMIN');
    const ops = await createStaff('OPERATIONS');
    const support = await createStaff('SUPPORT');

    // Operations manages technicians, not customers or staff.
    await post(`/users/${customer.user.id}/status`, ops.token, { status: 'SUSPENDED' }).expect(403);
    await post(`/users/${admin.user.id}/status`, ops.token, { status: 'SUSPENDED' }).expect(403);
    await post(`/users/${tech.id}/status`, ops.token, { status: 'SUSPENDED', reason: 'No-shows' }).expect(200);
    // Support manages customers, not technicians.
    await post(`/users/${tech.id}/status`, support.token, { status: 'ACTIVE' }).expect(403);
    await post(`/users/${customer.user.id}/status`, support.token, { status: 'BLOCKED', reason: 'Abuse' }).expect(200);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer.user.id } })).status).toBe('BLOCKED');
    // A blocked customer's sessions are revoked.
    expect(await prisma.refreshToken.count({ where: { userId: customer.user.id, revokedAt: null } })).toBe(0);
  });
});

describe('catalogue, offers and settings', () => {
  it('creates a service with its own commission and audits price changes', async () => {
    const admin = await createStaff('ADMIN');
    const body = {
      categoryId,
      name: 'Gas Refill',
      tagline: 'Top-up',
      description: 'Refrigerant top-up for split ACs',
      basePrice: 150_000,
      visitCharge: 10_000,
      durationMinMinutes: 45,
      durationMaxMinutes: 90,
      inclusions: ['Leak test'],
      exclusions: [],
      warrantyDays: 30,
      isPopular: false,
      isActive: true,
      sortOrder: 3,
      commission: { type: 'PERCENTAGE', value: 12 },
    };
    const created = await post('/services', admin.token, body).expect(201);
    const id = created.body.data.id as string;

    await request().put(`${API}/admin/services/${id}`).set(bearer(admin.token)).send({ ...body, basePrice: 160_000 }).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'PRICE_CHANGED', entityId: id } })).toBe(1);

    const list = await get('/services', admin.token).expect(200);
    const row = list.body.data.find((s: { id: string }) => s.id === id);
    expect(row).toMatchObject({ basePrice: 160_000, commission: { type: 'PERCENTAGE', value: 12 }, slug: 'gas-refill' });
  });

  it('rejects images that were not uploaded to RapidFix', async () => {
    const admin = await createStaff('ADMIN');
    await post('/categories', admin.token, {
      name: 'Solar',
      tagline: 'Panels',
      professionalTitle: 'Solar Technician',
      iconKey: 'electrical',
      imageUrl: 'https://evil.example/tracker.png',
      sortOrder: 5,
      isActive: true,
    }).expect(400);
  });

  it('validates coupon rules on create', async () => {
    const admin = await createStaff('ADMIN');
    const coupon = {
      code: 'MONSOON25',
      title: 'Monsoon offer',
      discountType: 'PERCENTAGE',
      discountValue: 125,
      minOrderAmount: 0,
      startsAt: '2026-09-01T00:00:00+05:30',
      endsAt: '2026-12-31T23:59:59+05:30',
      perCustomerLimit: 1,
      isFirstBookingOnly: false,
      isActive: true,
    };
    await post('/offers', admin.token, coupon).expect(400);
    await post('/offers', admin.token, { ...coupon, discountValue: 25 }).expect(201);
    const list = await get('/offers', admin.token).expect(200);
    expect(list.body.data.map((c: { code: string }) => c.code)).toContain('MONSOON25');
  });

  it('a GST change applies to the next estimate', async () => {
    const admin = await createStaff('ADMIN');
    const before = await request().post(`${API}/bookings/estimate`).send({ serviceId }).expect(200);
    expect(before.body.data).toMatchObject({ taxPercent: 0, tax: 0 });

    await request().put(`${API}/admin/settings/pricing.taxPercent`).set(bearer(admin.token)).send({ value: 12 }).expect(200);
    await request().put(`${API}/admin/settings/pricing.taxPercent`).set(bearer(admin.token)).send({ value: 99 }).expect(400);
    await request().put(`${API}/admin/settings/not.a.setting`).set(bearer(admin.token)).send({ value: 1 }).expect(404);

    const after = await request().post(`${API}/bookings/estimate`).send({ serviceId }).expect(200);
    expect(after.body.data.taxPercent).toBe(12);
    expect(after.body.data.tax).toBe(Math.round((39_900 * 12) / 100));
  });
});

describe('feedback, complaints and announcements', () => {
  it('hiding a review recalculates the technician rating', async () => {
    const { customer, bookingId } = await customerBooking();
    const tech = await createTechnician('+919000000101');
    const cust = await prisma.customer.findUniqueOrThrow({ where: { userId: customer.user.id } });
    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'PAYMENT_COMPLETED', technicianId: tech.technician!.id } });
    const review = await prisma.review.create({ data: { bookingId, customerId: cust.id, technicianId: tech.technician!.id, rating: 1, comment: 'Spam' } });
    await prisma.technician.update({ where: { id: tech.technician!.id }, data: { ratingAvg: 1, ratingCount: 1 } });

    const support = await createStaff('SUPPORT');
    await request().patch(`${API}/admin/reviews/${review.id}`).set(bearer(support.token)).send({ isVisible: false }).expect(200);
    const t = await prisma.technician.findUniqueOrThrow({ where: { id: tech.technician!.id } });
    expect(t).toMatchObject({ ratingAvg: 0, ratingCount: 0 });
  });

  it('customer complaint reaches support, who resolve it', async () => {
    const { customer, bookingId } = await customerBooking();
    const support = await createStaff('SUPPORT');
    await request()
      .post(`${API}/complaints`)
      .set(bearer(customer.token))
      .send({ bookingId, category: 'Delay / no-show', subject: 'Nobody came', description: 'Waited two hours, no call.' })
      .expect(201);
    expect(await prisma.notification.count({ where: { userId: support.user.id, type: 'COMPLAINT' } })).toBe(1);

    const list = await get('/complaints', support.token).expect(200);
    const c = list.body.data.items[0];
    expect(c).toMatchObject({ subject: 'Nobody came', status: 'OPEN', bookingCode: expect.any(String) });

    const res = await request().patch(`${API}/admin/complaints/${c.id}`).set(bearer(support.token)).send({ status: 'RESOLVED', resolution: 'Rescheduled with a new technician', assignToMe: true }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'RESOLVED', assignedTo: { id: support.user.id } });
    const mine = await request().get(`${API}/complaints/mine`).set(bearer(customer.token)).expect(200);
    expect(mine.body.data[0].resolution).toBe('Rescheduled with a new technician');
  });

  it('broadcast reaches only the chosen audience', async () => {
    const { customer } = await customerBooking();
    const tech = await createTechnician('+919000000101');
    const admin = await createStaff('ADMIN');
    await post('/notifications/broadcast', admin.token, { audience: 'CUSTOMERS', title: 'Diwali offer', body: '20% off all AC services' }).expect(201);
    expect(await prisma.notification.count({ where: { userId: customer.user.id, title: 'Diwali offer' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: tech.id, title: 'Diwali offer' } })).toBe(0);
    const history = await get('/notifications/broadcasts', admin.token).expect(200);
    expect(history.body.data[0]).toMatchObject({ audience: 'CUSTOMERS', recipients: 1 });
  });
});

describe('payouts', () => {
  it('cannot pay out more than the wallet balance', async () => {
    const tech = await createTechnician('+919000000101');
    const techId = tech.technician!.id;
    await prisma.technicianWallet.update({ where: { technicianId: techId }, data: { balance: 50_000, totalEarned: 50_000 } });
    const finance = await createStaff('FINANCE');

    await post('/payouts', finance.token, { technicianId: techId, amount: 60_000, method: 'UPI', reference: 'UTR123456' }).expect(400);
    await post('/payouts', finance.token, { technicianId: techId, amount: 30_000, method: 'UPI', reference: 'UTR123456' }).expect(201);

    const w = await prisma.technicianWallet.findUniqueOrThrow({ where: { technicianId: techId } });
    expect(w).toMatchObject({ balance: 20_000, totalPaidOut: 30_000 });
    const wallets = await get('/payouts/wallets', finance.token).expect(200);
    expect(wallets.body.data[0]).toMatchObject({ technicianId: techId, balance: 20_000 });
  });
});

describe('reports & system', () => {
  it('summarises a date range and reports integration health', async () => {
    await customerBooking();
    const admin = await createStaff('ADMIN');
    const now = new Date();
    const from = new Date(now.getTime() - 86_400_000).toISOString();
    const report = await get(`/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(now.toISOString())}`, admin.token).expect(200);
    expect(report.body.data).toMatchObject({ bookings: 1, newCustomers: 1 });

    const system = await get('/system', admin.token).expect(200);
    expect(system.body.data.database.ok).toBe(true);
    expect(JSON.stringify(system.body.data)).not.toMatch(/secret|password/i);
  });
});
