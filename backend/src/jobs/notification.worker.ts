import { SocketEvent, type Role } from '@fixora/shared-types';
import { notificationLink } from '@fixora/shared-utils';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { pushToUser } from '../services/push.service';
import { emitToUser } from '../services/realtime.service';

/**
 * Notification outbox. Business code only inserts `notifications` rows (inside
 * its own transactions); this worker fans each new row out once — Socket.IO to
 * the user's open apps and FCM push to their devices — then stamps `pushedAt`.
 * A crash between insert and delivery never loses a notification.
 */
export async function deliverPendingNotifications(limit = 100): Promise<number> {
  const pending = await prisma.notification.findMany({
    where: { pushedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { user: { select: { role: true } } },
  });
  for (const n of pending) {
    // Claim first so a second worker/instance can't double-send.
    const { count } = await prisma.notification.updateMany({ where: { id: n.id, pushedAt: null }, data: { pushedAt: new Date() } });
    if (!count) continue;
    emitToUser(n.userId, SocketEvent.NOTIFICATION, { id: n.id, type: n.type, title: n.title, body: n.body, data: n.data ?? null });
    const data = Object.fromEntries(Object.entries((n.data as Record<string, unknown> | null) ?? {}).map(([k, v]) => [k, String(v)]));
    const url = notificationLink(n.user.role as Role, n.type, n.data as Record<string, unknown> | null);
    await pushToUser(n.userId, { title: n.title, body: n.body, data: { type: n.type, url, notificationId: n.id, ...data } }).catch((err) =>
      logger.warn({ err: (err as Error).message }, 'push delivery failed'),
    );
  }
  return pending.length;
}

export function startNotificationWorker(intervalMs = 1000) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    deliverPendingNotifications()
      .catch((err) => logger.error({ err }, 'notification tick failed'))
      .finally(() => (running = false));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
