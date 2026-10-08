import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { clearSettingsCache } from '../src/services/settings.service';
import { ensureVisitServices } from '../src/services/visitServices';
import { API, request, resetDb, seedCatalog } from './helpers';

describe('Technician Visit service in every category', () => {
  beforeEach(async () => {
    await resetDb();
    clearSettingsCache();
  });

  it('adds one ₹199 visit per category, listed first, and is bookable from the catalogue', async () => {
    const { category } = await seedCatalog();
    expect(await ensureVisitServices()).toBe(1);

    const visit = await prisma.service.findUniqueOrThrow({ where: { slug: 'ac-cooling-technician-visit' } });
    expect(visit).toMatchObject({ name: 'AC Technician Visit', basePrice: 19_900, visitCharge: 0, categoryId: category.id, isActive: true });

    const list = await request().get(`${API}/services`).query({ category: 'ac-cooling' }).expect(200);
    expect(list.body.data[0].slug).toBe('ac-cooling-technician-visit');
  });

  it('runs once per category: edits or a switched-off visit are left alone, new categories get one', async () => {
    await seedCatalog();
    await ensureVisitServices();
    await prisma.service.update({ where: { slug: 'ac-cooling-technician-visit' }, data: { isActive: false, basePrice: 14_900 } });

    await prisma.serviceCategory.create({ data: { name: 'Plumbing', slug: 'plumbing', iconKey: 'plumbing', professionalTitle: 'Plumber' } });
    clearSettingsCache();
    expect(await ensureVisitServices()).toBe(1);

    expect(await prisma.service.findUniqueOrThrow({ where: { slug: 'ac-cooling-technician-visit' } })).toMatchObject({ isActive: false, basePrice: 14_900 });
    expect(await prisma.service.findUniqueOrThrow({ where: { slug: 'plumbing-technician-visit' } })).toMatchObject({ name: 'Plumber Visit' });
    clearSettingsCache();
    expect(await ensureVisitServices()).toBe(0);
  });
});
