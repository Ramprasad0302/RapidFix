import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import { env } from './env';

/**
 * Small, mostly on-demand pool: hosted MySQL/MariaDB plans (e.g. Hostinger)
 * cap new connections per hour (500). The driver's default opens every slot at
 * start-up and reopens them each time the server drops idle ones
 * (wait_timeout = 300 s there), and the host restarts idle apps — that burns
 * the hourly allowance with no traffic at all. So: keep one connection warm
 * (0 would never open any — a driver quirk), open more only under load, and
 * release idle extras before the server would kill them.
 */
function withPoolSize(url: string) {
  const u = new URL(url);
  const defaults = { connectionLimit: env.DB_POOL_SIZE, minimumIdle: 1, idleTimeout: env.DB_IDLE_TIMEOUT };
  for (const [key, value] of Object.entries(defaults)) if (!u.searchParams.has(key)) u.searchParams.set(key, String(value));
  return u.toString();
}

const adapter = new PrismaMariaDb(withPoolSize(env.DATABASE_URL));

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
