import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import { env } from './env';

/**
 * Small, long-lived pool: hosted MySQL/MariaDB plans (e.g. Hostinger) cap new
 * connections per hour, so we keep a few connections open and reuse them.
 */
function withPoolSize(url: string) {
  const u = new URL(url);
  if (!u.searchParams.has('connectionLimit')) u.searchParams.set('connectionLimit', String(env.DB_POOL_SIZE));
  return u.toString();
}

const adapter = new PrismaMariaDb(withPoolSize(env.DATABASE_URL));

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
