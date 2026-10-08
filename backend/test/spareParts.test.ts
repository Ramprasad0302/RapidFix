import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { dispatchBooking } from '../src/services/assignment.service';
import { signAccessToken } from '../src/services/token.service';
import { API, bearer, otpLogin, request, resetDb, sampleAddress, seedCatalog } from './helpers';

let serviceId: string;
let categoryId: string;
let customer: { token: string; user: { id: string } };
let tech: { userId: string; techId: string; token: string };

async function makeTechnician(phone: string) {
  const u = await prisma.user.create({
    data: {
      role: 'TECHNICIAN',
      phone,
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
          lastLocationAt: new Date(),
          skills: { create: { categoryId } },
          wallet: { create: {} },
        },
      },
    },
    include: { technician: true },
  });
  return { userId: u.id, techId: u.technician!.id, token: signAccessToken(u.id, 'TECHNICIAN').token };
}

beforeEach(async () => {
  await resetDb();
  const c = await seedCatalog();
  serviceId = c.service.id;
  categoryId = c.category.id;
  customer = await otpLogin('9000000001');
  tech = await makeTechnician('+919000000101');
});
afterAll(() => prisma.$disconnect());

async function startedJob() {
  const res = await request().post(`${API}/customer/bookings`).set(bearer(customer.token)).send({ serviceId, scheduleType: 'NOW', address: sampleAddress }).expect(201);
  const id = res.body.data.id as string;
  expect(await dispatchBooking(id)).toBe('offered');
  for (const a of ['accept', 'en-route', 'arrived', 'start']) await request().post(`${API}/technician/jobs/${id}/${a}`).set(bearer(tech.token)).send({}).expect(200);
  return id;
}

const addSpare = (id: string, body: object, token = tech.token) => request().post(`${API}/technician/jobs/${id}/spare-parts`).set(bearer(token)).send(body);
const booking = (id: string) => request().get(`${API}/customer/bookings/${id}`).set(bearer(customer.token)).expect(200).then((r) => r.body.data);

describe('spare parts bought by the technician', () => {
  it('go on the bill, the invoice and the payment — and back to the technician without commission', async () => {
    const id = await startedJob();
    const before = await booking(id); // 299 + 100 visit = 399

    // 2 capacitors at ₹250 + a cable at ₹120 with the shop bill photo.
    const r1 = await addSpare(id, { name: 'Capacitor 2.5 µF', quantity: 2, unitPrice: 25_000 }).expect(201);
    expect(r1.body.data.canEditSpareParts).toBe(true);
    const r2 = await addSpare(id, { name: 'Wire', quantity: 1, unitPrice: 12_000, billPhotoUrl: '/uploads/2026/10/123e4567-e89b-42d3-a456-426614174000.jpg' }).expect(201);
    expect(r2.body.data.price).toMatchObject({ spareParts: 62_000, total: before.price.total + 62_000 });
    expect(r2.body.data.sparePartItems).toHaveLength(2);

    // The customer sees the items (and is told) at once — no approval step.
    const seen = await booking(id);
    expect(seen.price).toMatchObject({ spareParts: 62_000, total: 101_900 });
    expect(seen.sparePartItems.map((p: { name: string; amount: number }) => [p.name, p.amount])).toEqual([
      ['Capacitor 2.5 µF', 50_000],
      ['Wire', 12_000],
    ]);
    expect(seen.sparePartItems[1].billPhotoUrl).toMatch(/^\/uploads\//);
    expect(await prisma.notification.count({ where: { userId: customer.user.id, type: 'SPARE_PART' } })).toBe(2);

    // Approving extra work afterwards keeps the spare parts on the bill.
    await request().post(`${API}/technician/jobs/${id}/additional-charges`).set(bearer(tech.token)).send({ title: 'Gas filling', amount: 70_000 }).expect(201);
    const pending = await booking(id);
    const approved = await request()
      .post(`${API}/customer/bookings/${id}/additional-charges/${pending.additionalChargeItems[0].id}/approve`)
      .set(bearer(customer.token))
      .send({})
      .expect(200);
    expect(approved.body.data.price).toMatchObject({ additionalCharges: 70_000, spareParts: 62_000, total: 171_900 });

    await request().post(`${API}/technician/jobs/${id}/complete`).set(bearer(tech.token)).send({}).expect(200);
    // Still editable while the bill is unpaid (e.g. the receipt was found after finishing).
    const extra = await addSpare(id, { name: 'Screws', quantity: 4, unitPrice: 500 }).expect(201);
    expect(extra.body.data).toMatchObject({ amountDue: 173_900 });
    const screws = extra.body.data.sparePartItems.find((p: { name: string }) => p.name === 'Screws');
    const removed = await request().delete(`${API}/technician/jobs/${id}/spare-parts/${screws.id}`).set(bearer(tech.token)).expect(200);
    expect(removed.body.data).toMatchObject({ amountDue: 171_900 });

    // Paid in cash: the whole bill including spare parts.
    await request().post(`${API}/technician/jobs/${id}/collect-payment`).set(bearer(tech.token)).send({ method: 'CASH' }).expect(200);
    const b = await prisma.booking.findUniqueOrThrow({ where: { id } });
    // Commission 15% of the work only (299 + 100 + 700 = 1,099 → 164.85); spare parts (620) go to the technician in full.
    expect(b).toMatchObject({ totalAmount: 171_900, sparePartsTotal: 62_000, commissionAmount: 16_485, technicianEarning: 93_415 + 62_000 });
    const w = await request().get(`${API}/technician/wallet`).set(bearer(tech.token)).expect(200);
    expect(w.body.data).toMatchObject({ balance: -16_485 });

    // Invoice: one line per spare part, in the subtotal and total, for the customer, technician and staff.
    const inv = await request().get(`${API}/bookings/${id}/invoice`).set(bearer(customer.token)).expect(200);
    expect(inv.body.data).toMatchObject({ status: 'PAID', spareParts: 62_000, subtotal: 171_900, total: 171_900 });
    expect(inv.body.data.items.filter((i: { kind?: string }) => i.kind === 'SPARE_PART').map((i: { name: string; quantity: number; amount: number }) => [i.name, i.quantity, i.amount])).toEqual([
      ['Spare part: Capacitor 2.5 µF', 2, 50_000],
      ['Spare part: Wire', 1, 12_000],
    ]);
    await request().get(`${API}/bookings/${id}/invoice`).set(bearer(tech.token)).expect(200);

    // Locked once paid.
    await addSpare(id, { name: 'Late part', quantity: 1, unitPrice: 10_000 }).expect(409);
  });

  it('only the assigned technician, only during the job, only valid amounts and photos', async () => {
    const res = await request().post(`${API}/customer/bookings`).set(bearer(customer.token)).send({ serviceId, scheduleType: 'NOW', address: sampleAddress }).expect(201);
    const id = res.body.data.id as string;
    await dispatchBooking(id);
    await request().post(`${API}/technician/jobs/${id}/accept`).set(bearer(tech.token)).send({}).expect(200);
    // Not started yet.
    await addSpare(id, { name: 'Capacitor', quantity: 1, unitPrice: 25_000 }).expect(409);

    for (const a of ['en-route', 'arrived', 'start']) await request().post(`${API}/technician/jobs/${id}/${a}`).set(bearer(tech.token)).send({}).expect(200);
    const other = await makeTechnician('+919000000102');
    await addSpare(id, { name: 'Capacitor', quantity: 1, unitPrice: 25_000 }, other.token).expect(404);
    await addSpare(id, { name: 'Capacitor', quantity: 0, unitPrice: 25_000 }).expect(400);
    await addSpare(id, { name: 'Capacitor', quantity: 1, unitPrice: 50 }).expect(400);
    await addSpare(id, { name: 'Capacitor', quantity: 1, unitPrice: 25_000, billPhotoUrl: '/private/2026/10/123e4567-e89b-42d3-a456-426614174000.jpg' }).expect(400);
    // Customers can't add parts.
    await addSpare(id, { name: 'Capacitor', quantity: 1, unitPrice: 25_000 }, customer.token).expect(403);
    expect((await booking(id)).price.spareParts).toBe(0);
  });
});
