import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { clearSettingsCache } from '../src/services/settings.service';
import { API, bearer, createStaff, request, resetDb } from './helpers';

beforeEach(async () => {
  await resetDb();
  clearSettingsCache();
});
afterAll(() => prisma.$disconnect());

const config = () => request().get(`${API}/app-config`).expect(200).then((r) => r.body.data.launch);

describe('launch event mode', () => {
  it('only the Super Admin switches the opening screen on and off; every visitor sees it through app-config', async () => {
    expect(await config()).toMatchObject({ enabled: false, headline: 'RapidFix is ready to launch' });

    const admin = await createStaff('ADMIN');
    await request().put(`${API}/admin/launch`).set(bearer(admin.token)).send({ enabled: true }).expect(403);
    await request().put(`${API}/admin/launch`).send({ enabled: true }).expect(401);

    const sa = await createStaff('SUPER_ADMIN');
    const on = await request().put(`${API}/admin/launch`).set(bearer(sa.token)).send({ enabled: true, headline: 'RapidFix launches today', subline: 'Inaugurated at Tanuku' }).expect(200);
    expect(on.body.data).toMatchObject({ enabled: true, headline: 'RapidFix launches today', subline: 'Inaugurated at Tanuku' });
    expect(on.body.data.id).toBeTruthy();
    expect(await config()).toMatchObject({ enabled: true, headline: 'RapidFix launches today', id: on.body.data.id });

    // Off: the website opens normally again; the text is kept for next time.
    await request().put(`${API}/admin/launch`).set(bearer(sa.token)).send({ enabled: false }).expect(200);
    expect(await config()).toMatchObject({ enabled: false, headline: 'RapidFix launches today' });

    // Switching on again is a new launch (devices that pressed "Open now" see it again).
    const again = await request().put(`${API}/admin/launch`).set(bearer(sa.token)).send({ enabled: true }).expect(200);
    expect(again.body.data.id).not.toBe(on.body.data.id);
    expect(await prisma.auditLog.count({ where: { action: { in: ['LAUNCH_MODE_ON', 'LAUNCH_MODE_OFF'] } } })).toBe(3);
  });
});
