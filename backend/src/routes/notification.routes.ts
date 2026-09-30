import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import type { NotificationDto } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { authenticate, authOf } from '../middleware/auth';
import { ok } from '../utils/response';

/** In-app notifications for any signed-in role — always the caller's own. */
export const notificationRouter = Router();
notificationRouter.use(authenticate());

/** Register this device for push (FCM token). Re-registering moves the token to the current user. */
notificationRouter.post('/tokens', validate(z.object({ token: z.string().min(20).max(255), platform: z.enum(['WEB', 'ANDROID', 'IOS']).default('WEB') })), async (req, res) => {
  const { userId } = authOf(req);
  await prisma.notificationToken.upsert({
    where: { token: req.body.token },
    update: { userId, platform: req.body.platform, lastSeenAt: new Date() },
    create: { userId, token: req.body.token, platform: req.body.platform },
  });
  ok(res, { registered: true }, 201);
});

notificationRouter.delete('/tokens/:token', async (req, res) => {
  await prisma.notificationToken.deleteMany({ where: { token: String(req.params.token), userId: authOf(req).userId } });
  ok(res, { removed: true });
});

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
