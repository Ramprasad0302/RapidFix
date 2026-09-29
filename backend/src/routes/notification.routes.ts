import { Router } from 'express';
import type { NotificationDto } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { authenticate, authOf } from '../middleware/auth';
import { ok } from '../utils/response';

/** In-app notifications for any signed-in role — always the caller's own. */
export const notificationRouter = Router();
notificationRouter.use(authenticate());

const toNotification = (n: {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  data: (n.data as Record<string, unknown> | null) ?? null,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

notificationRouter.get('/', async (req, res) => {
  const rows = await prisma.notification.findMany({
    where: { userId: authOf(req).userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  ok(res, rows.map(toNotification));
});

notificationRouter.get('/unread-count', async (req, res) => {
  ok(res, { count: await prisma.notification.count({ where: { userId: authOf(req).userId, readAt: null } }) });
});

notificationRouter.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: authOf(req).userId, readAt: null }, data: { readAt: new Date() } });
  ok(res, { ok: true });
});
