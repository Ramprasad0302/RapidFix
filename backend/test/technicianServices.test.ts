import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { clearSettingsCache } from '../src/services/settings.service';
import { applyIdempotent, removeDiscontinuedCategories, runStartupTasks, startupSql } from '../src/services/startupTasks';
import { signAccessToken } from '../src/services/token.service';
import { API, bearer, createTechnician, otpLogin, partnerPayout, request, resetDb, seedCatalog } from './helpers';

const svc = (categoryId: string, name: string, slug: string) =>
  prisma.service.create({ data: { categoryId, name, slug, description: 'x', basePrice: 29_900, durationMinMinutes: 30, durationMaxMinutes: 60, inclusions: [], exclusions: [] } });

describe('Services a technician does', () => {
  let categoryId: string;
  let tv: string;
  let washer: string;
  let fridge: string;

  beforeEach(async () => {
    await resetDb();
    clearSettingsCache();
    const cat = await prisma.serviceCategory.create({ data: { name: 'Appliance Repair', slug: 'appliance-repair', iconKey: 'appliance', professionalTitle: 'Appliance Technician' } });
    categoryId = cat.id;
    tv = (await svc(categoryId, 'TV Repair', 'tv-repair')).id;
    washer = (await svc(categoryId, 'Washing Machine Repair', 'washing-machine-repair')).id;
    fridge = (await svc(categoryId, 'Refrigerator Repair', 'refrigerator-repair')).id;
    await svc(categoryId, 'Appliance Technician Visit', 'appliance-repair-technician-visit');
  });

  it('partner onboarding saves the picked services (TV + washing machine only)', async () => {
    const fresh = await otpLogin('9000000070');
    await request()
      .post(`${API}/partner/register`)
      .set(bearer(fresh.token))
      .send({
        name: 'Appliance Partner',
        email: 'appliance@example.com',
        dateOfBirth: '1990-01-01',
        experienceYears: 5,
        languages: ['Telugu'],
        hasOwnTools: true,
        hasVehicle: true,
        serviceRadiusKm: 10,
        addressLine: '1-2, Main Road',
        villageTown: 'Tanuku',
        district: 'West Godavari',
        state: 'Andhra Pradesh',
        pincode: '534211',
        skills: [categoryId],
        serviceIds: [tv, washer],
        ...partnerPayout,
      })
      .expect(201);
    const tech = await prisma.technician.findFirstOrThrow({ where: { user: { phone: '+919000000070' } }, include: { services: true } });
    expect(tech.services.map((s) => s.serviceId).sort()).toEqual([tv, washer].sort());
  });

  it('"Services I do": all ticked by default, untick to narrow, everything ticked = whole category', async () => {
    const u = await createTechnician('+919000000071');
    await prisma.technicianSkill.create({ data: { technicianId: u.technician!.id, categoryId } });
    const auth = bearer(signAccessToken(u.id, 'TECHNICIAN').token);

    const start = await request().get(`${API}/technician/services`).set(auth).expect(200);
    const names = start.body.data.categories[0].services.map((s: { name: string }) => s.name);
    expect(names).not.toContain('Appliance Technician Visit'); // every technician does the visit
    expect(start.body.data.categories[0].services.every((s: { selected: boolean }) => s.selected)).toBe(true);

    const narrowed = await request().put(`${API}/technician/services`).set(auth).send({ serviceIds: [tv] }).expect(200);
    expect(narrowed.body.data.categories[0].services.filter((s: { selected: boolean }) => s.selected).map((s: { id: string }) => s.id)).toEqual([tv]);

    await request().put(`${API}/technician/services`).set(auth).send({ serviceIds: [] }).expect(400);

    await request().put(`${API}/technician/services`).set(auth).send({ serviceIds: [tv, washer, fridge] }).expect(200);
    expect(await prisma.technicianService.count({ where: { technicianId: u.technician!.id } })).toBe(0); // stored as "all"
  });
});

describe('Start-up catalogue upkeep', () => {
  beforeEach(async () => {
    await resetDb();
    clearSettingsCache();
  });

  it('switches off Salon at Home and Car & Bike Care once (an admin can switch them back on)', async () => {
    await seedCatalog();
    await prisma.serviceCategory.createMany({
      data: [
        { name: 'Salon at Home', slug: 'salon-at-home', iconKey: 'salon' },
        { name: 'Car & Bike Care', slug: 'vehicle-care', iconKey: 'vehicle' },
      ],
    });
    await runStartupTasks();
    const off = await prisma.serviceCategory.findMany({ where: { slug: { in: ['salon-at-home', 'vehicle-care'] } } });
    expect(off.every((c) => !c.isActive)).toBe(true);
    expect(await prisma.service.count({ where: { slug: { endsWith: '-technician-visit' } } })).toBe(1); // only the active AC category
    expect(await prisma.service.findFirstOrThrow({ where: { slug: 'ac-cooling-technician-visit' } })).toMatchObject({ basePrice: 19_900 });

    const cats = await request().get(`${API}/services/categories`).expect(200);
    expect(cats.body.data.map((c: { slug: string }) => c.slug)).toEqual(['ac-cooling']);

    await prisma.serviceCategory.update({ where: { slug: 'salon-at-home' }, data: { isActive: true } });
    clearSettingsCache();
    expect(await removeDiscontinuedCategories()).toBe(0);
    expect((await prisma.serviceCategory.findUniqueOrThrow({ where: { slug: 'salon-at-home' } })).isActive).toBe(true);
  });

  it('creates the start-up tables with the same SQL as their migrations', () => {
    const norm = (s: string) => s.replace(/--.*$/gm, '').replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
    const migration = (dir: string) => readFileSync(new URL(`../prisma/migrations/${dir}/migration.sql`, import.meta.url), 'utf8');
    expect(norm(migration('20261006060555_technician_services'))).toBe(norm(startupSql.technicianServices));
    expect(norm(migration('20261007040000_chat_blocks'))).toBe(norm(startupSql.chatBlocks));
    expect(norm(migration('20261007120000_franchises'))).toBe(norm(startupSql.franchises));
    expect(norm(migration('20261007150000_technician_kyc'))).toBe(norm(startupSql.technicianKyc));
    expect(norm(migration('20261008090000_spare_parts'))).toBe(norm(startupSql.spareParts));
  });

  it('adds the franchise schema to a database that does not have it yet (like production)', async () => {
    const drop = [
      'ALTER TABLE `customers` DROP FOREIGN KEY `customers_franchiseId_fkey`',
      'ALTER TABLE `locations` DROP FOREIGN KEY `locations_franchiseId_fkey`',
      'ALTER TABLE `technicians` DROP FOREIGN KEY `technicians_franchiseId_fkey`',
      'ALTER TABLE `bookings` DROP FOREIGN KEY `bookings_franchiseId_fkey`',
      'DROP TABLE `franchises`',
      'ALTER TABLE `bookings` DROP INDEX `bookings_franchiseId_createdAt_idx`, DROP COLUMN `franchiseId`',
      'ALTER TABLE `customers` DROP INDEX `customers_franchiseId_idx`, DROP COLUMN `franchiseId`',
      'ALTER TABLE `locations` DROP INDEX `locations_franchiseId_idx`, DROP COLUMN `franchiseId`',
      'ALTER TABLE `technicians` DROP INDEX `technicians_franchiseId_idx`, DROP COLUMN `franchiseId`',
    ];
    for (const sql of drop) await prisma.$executeRawUnsafe(sql);
    expect(await applyIdempotent(startupSql.franchises)).toBe(17); // every statement in the migration
    const cols = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'franchiseId' AND TABLE_NAME IN ('bookings','customers','locations','technicians')",
    );
    expect(Number(cols[0]!.n)).toBe(4);
    await expect(prisma.franchise.count()).resolves.toBe(0);
  });

  it('adds the technician KYC columns once, then skips them', async () => {
    await prisma.$executeRawUnsafe('ALTER TABLE `technicians` DROP COLUMN `panNumber`');
    expect(await applyIdempotent(startupSql.technicianKyc)).toBe(1);
    expect(await applyIdempotent(startupSql.technicianKyc)).toBe(0);
  });

  it('adds the spare parts table and column to a database without them (like production), once', async () => {
    await prisma.$executeRawUnsafe('DROP TABLE `booking_spare_parts`');
    await prisma.$executeRawUnsafe('ALTER TABLE `bookings` DROP COLUMN `sparePartsTotal`');
    expect(await applyIdempotent(startupSql.spareParts)).toBe(4);
    expect(await applyIdempotent(startupSql.spareParts)).toBe(0);
  });

  it('re-running the franchises schema on an up-to-date database is a no-op', async () => {
    // Up to date: only the (harmless, repeatable) enum MODIFY statements run.
    await expect(applyIdempotent(startupSql.franchises)).resolves.toBe(2);
    await expect(applyIdempotent(startupSql.franchises)).resolves.toBe(2);
  });
});
