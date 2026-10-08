import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { API, bearer, createStaff, otpLogin, partnerPayout, request, resetDb, seedCatalog } from './helpers';

const png = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a60000000049454e44ae426082',
  'hex',
);

let categoryId: string;
beforeEach(async () => {
  await resetDb();
  categoryId = (await seedCatalog()).category.id;
});
afterAll(() => prisma.$disconnect());

const partner = () => ({
  name: 'Suresh Kumar',
  email: 'suresh@example.com',
  dateOfBirth: '1990-01-15',
  experienceYears: 5,
  languages: ['Telugu'],
  hasOwnTools: true,
  hasVehicle: true,
  serviceRadiusKm: 10,
  addressLine: '2-45, Market Street',
  villageTown: 'Tanuku',
  district: 'West Godavari',
  state: 'Andhra Pradesh',
  pincode: '534211',
  skills: [categoryId],
  ...partnerPayout,
  panNumber: 'ABCDE1234F',
});

const uploadPrivate = async (token: string) =>
  (await request().post(`${API}/uploads?private=1`).set(bearer(token)).attach('file', png, 'card.png').expect(201)).body.data.path as string;

describe('technician ID proofs', () => {
  it('uploaded at sign-up, seen and verified by admin, visible to the technician', async () => {
    const fresh = await otpLogin('9000000060');
    const front = await uploadPrivate(fresh.token);
    const pan = await uploadPrivate(fresh.token);
    const reg = await request()
      .post(`${API}/partner/register`)
      .set(bearer(fresh.token))
      .send({ ...partner(), kycDocuments: [{ type: 'AADHAAR', fileUrl: front }, { type: 'PAN', fileUrl: pan }] })
      .expect(201);
    const techToken = reg.body.data.accessToken as string;
    const tech = await prisma.technician.findFirstOrThrow({ where: { user: { phone: '+919000000060' } } });

    // The technician sees their documents and ID numbers (Aadhaar masked) and can open the files.
    const mine = await request().get(`${API}/technician/documents`).set(bearer(techToken)).expect(200);
    expect(mine.body.data.map((d: { type: string; status: string }) => [d.type, d.status]).sort()).toEqual([
      ['AADHAAR', 'PENDING'],
      ['PAN', 'PENDING'],
    ]);
    const details = await request().get(`${API}/technician/profile/details`).set(bearer(techToken)).expect(200);
    expect(details.body.data.kyc).toEqual({ aadhaarLast4: '0124', panNumber: 'ABCDE1234F' });
    await request().get(`${API}/files${front}`).set(bearer(techToken)).expect(200);

    // Admin: list shows proofs waiting, detail shows numbers + files; full Aadhaar only through the audited reveal.
    const ops = await createStaff('OPERATIONS');
    const list = await request().get(`${API}/admin/technicians?verification=PENDING`).set(bearer(ops.token)).expect(200);
    expect(list.body.data.items[0]).toMatchObject({ id: tech.id, pendingDocuments: 2 });
    const detail = await request().get(`${API}/admin/technicians/${tech.id}`).set(bearer(ops.token)).expect(200);
    expect(detail.body.data.kyc).toEqual({ aadhaarLast4: '0124', panNumber: 'ABCDE1234F' });
    expect(detail.body.data.documents).toHaveLength(2);
    expect(JSON.stringify(detail.body.data)).not.toContain('234567890124');
    await request().get(`${API}/files${front}`).set(bearer(ops.token)).expect(200);

    const revealed = await request().post(`${API}/admin/technicians/${tech.id}/aadhaar`).set(bearer(ops.token)).expect(200);
    expect(revealed.body.data).toEqual({ aadhaar: '2345 6789 0124' });
    expect(await prisma.auditLog.count({ where: { action: 'TECHNICIAN_AADHAAR_VIEWED', entityId: tech.id, actorId: ops.user.id } })).toBe(1);
    // Customers and support can't.
    const support = await createStaff('SUPPORT');
    await request().post(`${API}/admin/technicians/${tech.id}/aadhaar`).set(bearer(support.token)).expect(403);

    // Approve one, reject the other with a reason: the technician is told either way.
    const [a, p] = [detail.body.data.documents.find((d: { type: string }) => d.type === 'AADHAAR'), detail.body.data.documents.find((d: { type: string }) => d.type === 'PAN')];
    await request().post(`${API}/admin/technicians/documents/${a.id}`).set(bearer(ops.token)).send({ status: 'APPROVED' }).expect(200);
    await request().post(`${API}/admin/technicians/documents/${p.id}`).set(bearer(ops.token)).send({ status: 'REJECTED', remarks: 'Photo is blurred' }).expect(200);
    const notes = await prisma.notification.findMany({ where: { userId: tech.userId, type: 'VERIFICATION' }, orderBy: { createdAt: 'asc' } });
    expect(notes.map((n) => n.title)).toEqual(['Document approved', 'Document needs attention']);
    expect(notes[1]!.body).toContain('Photo is blurred');
    const after = await request().get(`${API}/admin/technicians?verification=PENDING`).set(bearer(ops.token)).expect(200);
    expect(after.body.data.items[0].pendingDocuments).toBe(0);
  });

  it("can't attach a file that already belongs to someone", async () => {
    const first = await otpLogin('9000000061');
    const file = await uploadPrivate(first.token);
    await request().post(`${API}/partner/register`).set(bearer(first.token)).send({ ...partner(), kycDocuments: [{ type: 'AADHAAR', fileUrl: file }] }).expect(201);

    const second = await otpLogin('9000000062');
    await request()
      .post(`${API}/partner/register`)
      .set(bearer(second.token))
      .send({ ...partner(), email: 'second@example.com', kycDocuments: [{ type: 'AADHAAR', fileUrl: file }] })
      .expect(400);
    await request().post(`${API}/partner/register`).set(bearer(second.token)).send({ ...partner(), email: 'second@example.com', kycDocuments: [{ type: 'AADHAAR', fileUrl: '/uploads/2026/10/x.jpg' }] }).expect(400);
  });
});
