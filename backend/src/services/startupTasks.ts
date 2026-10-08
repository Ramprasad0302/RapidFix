import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { getSetting } from './settings.service';
import { ensureVisitServices } from './visitServices';

/**
 * Small catalogue / schema upkeep run when the API starts, so the live database
 * (where migrations aren't run by hand) picks up changes on the next deploy.
 * Every step is idempotent and safe to repeat.
 */

/** Same SQL as prisma/migrations/20261006060555_technician_services (CREATE TABLE IF NOT EXISTS). */
const TECHNICIAN_SERVICES_TABLE = `CREATE TABLE IF NOT EXISTS \`technician_services\` (
    \`technicianId\` CHAR(36) NOT NULL,
    \`serviceId\` CHAR(36) NOT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX \`technician_services_serviceId_idx\`(\`serviceId\`),
    PRIMARY KEY (\`technicianId\`, \`serviceId\`),
    CONSTRAINT \`technician_services_technicianId_fkey\` FOREIGN KEY (\`technicianId\`) REFERENCES \`technicians\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT \`technician_services_serviceId_fkey\` FOREIGN KEY (\`serviceId\`) REFERENCES \`services\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;

/** Same SQL as prisma/migrations/20261007040000_chat_blocks (CREATE TABLE IF NOT EXISTS). */
const CHAT_BLOCKS_TABLE = `CREATE TABLE IF NOT EXISTS \`chat_blocks\` (
    \`bookingId\` CHAR(36) NOT NULL,
    \`blockerId\` CHAR(36) NOT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX \`chat_blocks_blockerId_idx\`(\`blockerId\`),
    PRIMARY KEY (\`bookingId\`, \`blockerId\`),
    CONSTRAINT \`chat_blocks_bookingId_fkey\` FOREIGN KEY (\`bookingId\`) REFERENCES \`bookings\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT \`chat_blocks_blockerId_fkey\` FOREIGN KEY (\`blockerId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;

/** Same SQL as prisma/migrations/20261007120000_franchises (one statement per line group). */
const FRANCHISES_SQL = `-- AlterTable
ALTER TABLE \`audit_logs\` MODIFY \`actorRole\` ENUM('CUSTOMER', 'TECHNICIAN', 'ADMIN', 'SUPER_ADMIN', 'OPERATIONS', 'SUPPORT', 'FINANCE', 'FRANCHISE_ADMIN') NULL;
-- AlterTable
ALTER TABLE \`bookings\` ADD COLUMN \`franchiseId\` CHAR(36) NULL;
-- AlterTable
ALTER TABLE \`customers\` ADD COLUMN \`franchiseId\` CHAR(36) NULL;
-- AlterTable
ALTER TABLE \`locations\` ADD COLUMN \`franchiseId\` CHAR(36) NULL;
-- AlterTable
ALTER TABLE \`technicians\` ADD COLUMN \`franchiseId\` CHAR(36) NULL;
-- AlterTable
ALTER TABLE \`users\` MODIFY \`role\` ENUM('CUSTOMER', 'TECHNICIAN', 'ADMIN', 'SUPER_ADMIN', 'OPERATIONS', 'SUPPORT', 'FINANCE', 'FRANCHISE_ADMIN') NOT NULL;
-- CreateTable
CREATE TABLE \`franchises\` (
    \`id\` CHAR(36) NOT NULL,
    \`code\` VARCHAR(16) NOT NULL,
    \`name\` VARCHAR(120) NOT NULL,
    \`town\` VARCHAR(120) NOT NULL,
    \`district\` VARCHAR(120) NOT NULL,
    \`state\` VARCHAR(80) NOT NULL,
    \`status\` ENUM('ACTIVE', 'SUSPENDED', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
    \`userId\` CHAR(36) NOT NULL,
    \`ownerName\` VARCHAR(120) NOT NULL,
    \`ownerPhone\` VARCHAR(16) NOT NULL,
    \`ownerEmail\` VARCHAR(191) NULL,
    \`ownerDateOfBirth\` DATE NULL,
    \`ownerAddress\` VARCHAR(500) NOT NULL,
    \`ownerPincode\` VARCHAR(6) NOT NULL,
    \`aadhaarEnc\` VARCHAR(512) NOT NULL,
    \`aadhaarLast4\` VARCHAR(4) NOT NULL,
    \`aadhaarFrontUrl\` VARCHAR(512) NOT NULL,
    \`aadhaarBackUrl\` VARCHAR(512) NULL,
    \`panNumber\` VARCHAR(10) NULL,
    \`panPhotoUrl\` VARCHAR(512) NULL,
    \`gstin\` VARCHAR(15) NULL,
    \`businessName\` VARCHAR(160) NULL,
    \`commissionPercent\` DECIMAL(5, 2) NOT NULL,
    \`agreementStart\` DATE NOT NULL,
    \`agreementEnd\` DATE NULL,
    \`agreementUrl\` VARCHAR(512) NULL,
    \`depositAmount\` INTEGER NOT NULL DEFAULT 0,
    \`bankAccountHolder\` VARCHAR(120) NULL,
    \`bankIfsc\` VARCHAR(11) NULL,
    \`bankAccountEnc\` VARCHAR(512) NULL,
    \`bankAccountLast4\` VARCHAR(4) NULL,
    \`upiId\` VARCHAR(80) NULL,
    \`emergencyContact\` VARCHAR(16) NULL,
    \`notes\` TEXT NULL,
    \`createdById\` CHAR(36) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,
    UNIQUE INDEX \`franchises_code_key\`(\`code\`),
    UNIQUE INDEX \`franchises_userId_key\`(\`userId\`),
    INDEX \`franchises_status_idx\`(\`status\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateIndex
CREATE INDEX \`bookings_franchiseId_createdAt_idx\` ON \`bookings\`(\`franchiseId\`, \`createdAt\`);
-- CreateIndex
CREATE INDEX \`customers_franchiseId_idx\` ON \`customers\`(\`franchiseId\`);
-- CreateIndex
CREATE INDEX \`locations_franchiseId_idx\` ON \`locations\`(\`franchiseId\`);
-- CreateIndex
CREATE INDEX \`technicians_franchiseId_idx\` ON \`technicians\`(\`franchiseId\`);
-- AddForeignKey
ALTER TABLE \`customers\` ADD CONSTRAINT \`customers_franchiseId_fkey\` FOREIGN KEY (\`franchiseId\`) REFERENCES \`franchises\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE \`locations\` ADD CONSTRAINT \`locations_franchiseId_fkey\` FOREIGN KEY (\`franchiseId\`) REFERENCES \`franchises\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE \`technicians\` ADD CONSTRAINT \`technicians_franchiseId_fkey\` FOREIGN KEY (\`franchiseId\`) REFERENCES \`franchises\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE \`bookings\` ADD CONSTRAINT \`bookings_franchiseId_fkey\` FOREIGN KEY (\`franchiseId\`) REFERENCES \`franchises\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE \`franchises\` ADD CONSTRAINT \`franchises_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE \`franchises\` ADD CONSTRAINT \`franchises_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;
`;

/** Same SQL as prisma/migrations/20261007150000_technician_kyc. */
const TECHNICIAN_KYC_SQL = `-- Technician KYC for payouts: Aadhaar (encrypted, last 4 readable) and PAN.
-- One column per statement so the start-up upgrade (applyIdempotent) can skip each one already present.
ALTER TABLE \`technicians\` ADD COLUMN \`aadhaarEnc\` VARCHAR(512) NULL;
ALTER TABLE \`technicians\` ADD COLUMN \`aadhaarLast4\` VARCHAR(4) NULL;
ALTER TABLE \`technicians\` ADD COLUMN \`panNumber\` VARCHAR(10) NULL;
`;

/** Same SQL as prisma/migrations/20261008090000_spare_parts. */
const SPARE_PARTS_SQL = `-- Spare parts the technician bought for a job: itemised on the bill and invoice, reimbursed to the technician.
-- AlterTable
ALTER TABLE \`bookings\` ADD COLUMN \`sparePartsTotal\` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE \`booking_spare_parts\` (
    \`id\` CHAR(36) NOT NULL,
    \`bookingId\` CHAR(36) NOT NULL,
    \`technicianId\` CHAR(36) NOT NULL,
    \`name\` VARCHAR(160) NOT NULL,
    \`quantity\` INTEGER NOT NULL DEFAULT 1,
    \`unitPrice\` INTEGER NOT NULL,
    \`amount\` INTEGER NOT NULL,
    \`billPhotoUrl\` VARCHAR(512) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX \`booking_spare_parts_bookingId_idx\`(\`bookingId\`),
    INDEX \`booking_spare_parts_technicianId_idx\`(\`technicianId\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE \`booking_spare_parts\` ADD CONSTRAINT \`booking_spare_parts_bookingId_fkey\` FOREIGN KEY (\`bookingId\`) REFERENCES \`bookings\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE \`booking_spare_parts\` ADD CONSTRAINT \`booking_spare_parts_technicianId_fkey\` FOREIGN KEY (\`technicianId\`) REFERENCES \`technicians\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE;
`;

/** MySQL errors that mean "this part is already there": duplicate column / key / table / foreign key. */
const ALREADY_APPLIED = new Set([1050, 1060, 1061, 1826, 1022]);

/** Is this statement's change already in the database? (Works on MySQL and MariaDB.) */
async function alreadyApplied(statement: string): Promise<boolean> {
  const one = async (sql: string, ...args: string[]) => Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql, ...args))[0]?.n ?? 0) > 0;
  const db = 'TABLE_SCHEMA = DATABASE()';
  let m = /^CREATE TABLE `(\w+)`/i.exec(statement);
  if (m) return one(`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE ${db} AND TABLE_NAME = ?`, m[1]!);
  m = /^ALTER TABLE `(\w+)` ADD COLUMN `(\w+)`/i.exec(statement);
  if (m) return one(`SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE ${db} AND TABLE_NAME = ? AND COLUMN_NAME = ?`, m[1]!, m[2]!);
  m = /^CREATE (?:UNIQUE )?INDEX `(\w+)` ON `(\w+)`/i.exec(statement);
  if (m) return one(`SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE ${db} AND TABLE_NAME = ? AND INDEX_NAME = ?`, m[2]!, m[1]!);
  m = /^ALTER TABLE `(\w+)` ADD CONSTRAINT `(\w+)`/i.exec(statement);
  if (m) return one(`SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS WHERE ${db} AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`, m[1]!, m[2]!);
  return false; // e.g. MODIFY ENUM: safe to run again
}

/** Runs a migration's statements one by one, skipping the ones already applied (safe on every start). */
export async function applyIdempotent(sql: string) {
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim().replace(/;$/, ''))
    .filter(Boolean);
  let applied = 0;
  for (const statement of statements) {
    if (await alreadyApplied(statement)) continue;
    try {
      await prisma.$executeRawUnsafe(statement);
      applied++;
    } catch (err) {
      const code = Number((err as { meta?: { code?: string } }).meta?.code ?? /\b(10\d\d|18\d\d)\b/.exec(String(err))?.[1]);
      if (!ALREADY_APPLIED.has(code)) throw err;
    }
  }
  return applied;
}

/** Categories RapidFix stopped offering. Switched off once; an admin can switch one back on. */
const REMOVED_CATEGORIES = ['salon-at-home', 'vehicle-care'];
const REMOVED_KEY = 'catalog.removedCategories';

export async function removeDiscontinuedCategories(): Promise<number> {
  const done = new Set(await getSetting<string[]>(REMOVED_KEY, []));
  const todo = REMOVED_CATEGORIES.filter((s) => !done.has(s));
  if (!todo.length) return 0;
  const { count } = await prisma.serviceCategory.updateMany({ where: { slug: { in: todo } }, data: { isActive: false } });
  await prisma.setting.upsert({
    where: { key: REMOVED_KEY },
    create: { key: REMOVED_KEY, value: [...done, ...todo], description: 'Categories switched off as discontinued' },
    update: { value: [...done, ...todo] },
  });
  if (count) logger.info({ categories: todo }, 'Switched off discontinued categories');
  return count;
}

/**
 * Earlier versions copied the home address into the technician's live position at sign-up, so
 * technicians who never shared GPS looked like they were at home. Positions that never came from
 * a GPS ping (no lastLocationAt) are cleared; they're matched by town / district until the app
 * sends a real one. Safe to repeat.
 */
export function clearNonGpsPositions() {
  return prisma.technician.updateMany({ where: { lastLocationAt: null, lastLatitude: { not: null } }, data: { lastLatitude: null, lastLongitude: null } });
}

export async function runStartupTasks() {
  const steps: [string, () => Promise<unknown>][] = [
    ['technician_services table', () => prisma.$executeRawUnsafe(TECHNICIAN_SERVICES_TABLE)],
    ['chat_blocks table', () => prisma.$executeRawUnsafe(CHAT_BLOCKS_TABLE)],
    ['franchises schema', () => applyIdempotent(FRANCHISES_SQL)],
    ['technician KYC columns', () => applyIdempotent(TECHNICIAN_KYC_SQL)],
    ['spare parts schema', () => applyIdempotent(SPARE_PARTS_SQL)],
    ['home address is not a live position', clearNonGpsPositions],
    ['discontinued categories', removeDiscontinuedCategories],
    ['Technician Visit services', ensureVisitServices],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (err) {
      logger.error({ err }, `Start-up task failed: ${name}`);
    }
  }
}

/** For tests: the start-up SQL must match the migration files. */
export const startupSql = { technicianServices: TECHNICIAN_SERVICES_TABLE, chatBlocks: CHAT_BLOCKS_TABLE, franchises: FRANCHISES_SQL, technicianKyc: TECHNICIAN_KYC_SQL, spareParts: SPARE_PARTS_SQL };
