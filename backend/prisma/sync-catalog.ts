/**
 * Adds new categories and services from prisma/catalog.ts to a database that is
 * already live. Existing ones are left exactly as they are (admin edits are kept).
 *
 *   npm run db:catalog -w @fixora/backend
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client';
import { syncCatalog } from './catalog';

const url = new URL(process.env.DATABASE_URL!);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 1,
    // Same as the API: MariaDB 11 needs an explicit collation for text comparisons.
    initSql: 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci',
  }),
});

syncCatalog(prisma)
  .then(({ createdCategories, createdServices }) => console.log(`Catalogue synced: ${createdCategories} new categories, ${createdServices} new services.`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
