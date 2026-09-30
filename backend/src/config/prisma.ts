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
/** DATABASE_URL → driver settings (an object, so `initSql` reaches the driver intact). */
function poolConfig(url: string) {
  const u = new URL(url);
  // Extra ?options in the URL (e.g. connectTimeout=10000, ssl=true) still apply.
  const extra = Object.fromEntries(
    [...u.searchParams].map(([k, v]) => [k, v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v]),
  );
  return {
    host: decodeURIComponent(u.hostname),
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)),
    connectionLimit: env.DB_POOL_SIZE,
    minimumIdle: 1,
    idleTimeout: env.DB_IDLE_TIMEOUT,
    // Match the tables (utf8mb4_unicode_ci). MariaDB 11 (Hostinger) defaults utf8mb4 to
    // uca1400 and tags prepared-statement values differently, so Prisma's `contains`
    // (LIKE CONCAT('%', ?, '%')) fails with "Illegal mix of collations … for operation 'like'".
    initSql: 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci',
    ...extra,
  };
}

const adapter = new PrismaMariaDb(poolConfig(env.DATABASE_URL));

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
