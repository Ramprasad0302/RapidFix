import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { API, bearer, createStaff, otpLogin, request, resetDb, sampleAddress, seedCatalog } from './helpers';

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
});
afterAll(() => prisma.$disconnect());

const changeRole = (token: string, userId: string, role: string) =>
  request().patch(`${API}/admin/users/${userId}/role`).set(bearer(token)).send({ role });

describe('admin role management', () => {
  it('SUPER_ADMIN turns a customer into a technician: profile created, sessions revoked, audited', async () => {
    const admin = await createStaff('SUPER_ADMIN');
    const customer = await otpLogin('9000000001');

    await changeRole(admin.token, customer.user.id, 'TECHNICIAN').expect(200);

    const tech = await prisma.technician.findUniqueOrThrow({ where: { userId: customer.user.id } });
    expect(tech.verificationStatus).toBe('PENDING');
    // Old session is dead — they must sign in again and land in the technician area.
    await request().post(`${API}/auth/refresh`).set('Cookie', customer.cookie).expect(401);
    expect((await otpLogin('9000000001')).user.role).toBe('TECHNICIAN');

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ROLE_CHANGED' } });
    expect(log).toMatchObject({ actorId: admin.user.id, entityId: customer.user.id, oldValue: { role: 'CUSTOMER' }, newValue: { role: 'TECHNICIAN' } });
  });

  it('SUPER_ADMIN can grant staff roles; the new admin signs in to the admin area', async () => {
    const admin = await createStaff('SUPER_ADMIN');
    const person = await otpLogin('9000000002');
    await changeRole(admin.token, person.user.id, 'OPERATIONS').expect(200);
    const again = await otpLogin('9000000002');
    expect(again.user.role).toBe('OPERATIONS');
    await request().get(`${API}/admin/dashboard`).set(bearer(again.token)).expect(200);
  });

  it('ADMIN may switch customer ↔ technician but not grant admin roles', async () => {
    const admin = await createStaff('ADMIN');
    const person = await otpLogin('9000000003');
    await changeRole(admin.token, person.user.id, 'TECHNICIAN').expect(200);
    expect((await changeRole(admin.token, person.user.id, 'ADMIN').expect(403)).body.code).toBe('SUPER_ADMIN_REQUIRED');
  });

  it('OPERATIONS / SUPPORT / FINANCE cannot change roles at all', async () => {
    const person = await otpLogin('9000000004');
    for (const role of ['OPERATIONS', 'SUPPORT', 'FINANCE'] as const) {
      const staff = await createStaff(role);
      await changeRole(staff.token, person.user.id, 'TECHNICIAN').expect(403);
    }
  });

  it('nobody changes their own role, and the last Super Admin cannot be demoted', async () => {
    const a = await createStaff('SUPER_ADMIN');
    expect((await changeRole(a.token, a.user.id, 'ADMIN').expect(400)).body.code).toBe('SELF_ROLE_CHANGE');
    const b = await createStaff('SUPER_ADMIN');
    await changeRole(b.token, a.user.id, 'ADMIN').expect(200);
    const c = await createStaff('ADMIN');
    await prisma.user.update({ where: { id: c.user.id }, data: { role: 'SUPER_ADMIN' } });
    // b is now the only other SUPER_ADMIN besides c; demote c, then b is last.
    await changeRole(b.token, c.user.id, 'ADMIN').expect(200);
    const d = await createStaff('SUPER_ADMIN');
    await prisma.user.update({ where: { id: d.user.id }, data: { status: 'SUSPENDED' } });
    expect((await changeRole(d.token, b.user.id, 'ADMIN').expect(409)).body.code).toBe('LAST_SUPER_ADMIN');
  });

  it('blocks role changes while the user has bookings in progress', async () => {
    const { service } = await seedCatalog();
    const admin = await createStaff('SUPER_ADMIN');
    const customer = await otpLogin('9000000005');
    await request()
      .post(`${API}/customer/bookings`)
      .set(bearer(customer.token))
      .send({ serviceId: service.id, scheduleType: 'NOW', address: sampleAddress })
      .expect(201);
    expect((await changeRole(admin.token, customer.user.id, 'TECHNICIAN').expect(409)).body.code).toBe('ACTIVE_BOOKINGS');
  });

  it('lists and searches users', async () => {
    const admin = await createStaff('SUPER_ADMIN');
    await otpLogin('9000000006');
    await prisma.user.updateMany({ where: { phone: '+919000000006' }, data: { name: 'Priya Sharma' } });
    const res = await request().get(`${API}/admin/users?q=Priya`).set(bearer(admin.token)).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });
});
