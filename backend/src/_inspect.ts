import { prisma } from './config/prisma';
const REAL = ['+919398791979', '+919491265090', '+919182217096', '+918897649088', '+919390673813'];
(async () => {
  const b = await prisma.booking.findMany({ where: { customer: { user: { phone: { in: REAL } } } }, select: { code: true, status: true, createdAt: true, customer: { select: { user: { select: { phone: true } } } }, technician: { select: { user: { select: { phone: true } } } } } });
  console.log('real-customer bookings', b.length); for (const x of b) console.log(' ', x.code, x.status, x.customer.user.phone, '→ tech', x.technician?.user.phone ?? '-', x.createdAt.toISOString().slice(0, 16));
  const owners = ['+919363939199', '+919505582333', '+919491963366'];
  const ob = await prisma.booking.groupBy({ by: ['status'], where: { OR: [{ customer: { user: { phone: owners[0] } } }, { technician: { user: { phone: owners[1] } } }] }, _count: true });
  console.log('owner-linked bookings', JSON.stringify(ob));
  const recent = await prisma.booking.findMany({ where: { createdAt: { gte: new Date('2026-09-30T05:00:00Z') } }, select: { code: true, status: true, createdAt: true, customer: { select: { user: { select: { phone: true } } } } } });
  console.log('bookings created since seed run', recent.map((r) => `${r.code} ${r.status} ${r.customer.user.phone}`).join(' | '));
})().finally(() => prisma.$disconnect());
