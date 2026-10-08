import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { getSetting } from './settings.service';

/**
 * Every category gets a "Technician Visit" service: the technician comes home,
 * inspects and diagnoses the problem, and quotes before any work — for customers
 * who aren't sure what's wrong. Runs at server start, once per category: a visit
 * the admin later edits, re-prices or switches off is left as it is, and new
 * categories get theirs on the next start.
 */
const DONE_KEY = 'catalog.visitServiceCategories';
const PRICE_KEY = 'pricing.visitServiceRupees';

export const visitSlug = (categorySlug: string) => `${categorySlug}-technician-visit`;

export async function ensureVisitServices(): Promise<number> {
  const done = new Set(await getSetting<string[]>(DONE_KEY, []));
  const categories = await prisma.serviceCategory.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true, professionalTitle: true } });
  const todo = categories.filter((c) => !done.has(c.id));
  if (!todo.length) return 0;

  const price = Math.round(Number(await getSetting<number>(PRICE_KEY, 199)) * 100);
  let created = 0;
  for (const c of todo) {
    const slug = visitSlug(c.slug);
    const exists = await prisma.service.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) {
      // First in the category's list: "not sure what's wrong? book a visit".
      const first = await prisma.service.aggregate({ where: { categoryId: c.id }, _min: { sortOrder: true } });
      const title = c.professionalTitle && c.professionalTitle !== 'Technician' ? c.professionalTitle : `${c.name} Technician`;
      await prisma.service.create({
        data: {
          categoryId: c.id,
          name: `${title} Visit`,
          slug,
          tagline: 'Inspection & diagnosis at home — exact quote before any work',
          description: `Not sure what's wrong? A verified ${title.toLowerCase()} visits your home, inspects the problem and tells you exactly what needs to be done and what it will cost. Nothing is repaired or charged extra without your approval in the app.`,
          basePrice: price,
          visitCharge: 0,
          durationMinMinutes: 30,
          durationMaxMinutes: 45,
          inclusions: ['Technician visit to your home', 'Inspection and diagnosis of the problem', 'Exact repair quote before any work starts'],
          exclusions: ['Repair work, spare parts and materials (quoted separately, only with your approval)'],
          warrantyDays: 0,
          sortOrder: (first._min.sortOrder ?? 0) - 1,
        },
      });
      created++;
    }
    done.add(c.id);
  }
  await prisma.setting.upsert({
    where: { key: DONE_KEY },
    create: { key: DONE_KEY, value: [...done], description: 'Categories that already got their "Technician Visit" service' },
    update: { value: [...done] },
  });
  if (created) logger.info({ created }, 'Added Technician Visit services');
  return created;
}
