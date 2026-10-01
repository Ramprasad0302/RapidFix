/**
 * One-time cleanup of the demo data created by the development seed on a LIVE database.
 *
 *   node prisma/remove-demo-data.mjs            → dry run: prints what would be removed
 *   node prisma/remove-demo-data.mjs --apply    → backs up every table to a JSON file, then removes
 *
 * Removes: demo accounts (phones +91 90000 xxxxx), every booking with its payments, reviews,
 * chats, wallet entries and history, and the demo profile data on the owner accounts.
 * Keeps: the owner accounts (OWNER_PHONES), real sign-ups, services, categories, offers,
 * locations, settings and commission rules.
 *
 * Needs DATABASE_URL (the backend .env is loaded if present).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mariadb from 'mariadb';

try {
  process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'));
} catch {
  /* env from the shell */
}

const APPLY = process.argv.includes('--apply');
const OWNER_PHONES = ['+919491963366', '+919505582333', '+919363939199'];
const DEMO_PHONE = /^\+9190000\d{5}$/;

const url = new URL(process.env.DATABASE_URL);
const conn = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  allowPublicKeyRetrieval: true,
  initSql: 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci',
});

const q = (sql, params = []) => conn.query(sql, params);
const ids = (rows, key = 'id') => rows.map((r) => r[key]);
const inList = (arr) => (arr.length ? arr : ['__none__']);

try {
  const users = await q('SELECT id, phone, role, name FROM users');
  const demoUsers = users.filter((u) => u.phone && DEMO_PHONE.test(u.phone) && !OWNER_PHONES.includes(u.phone));
  const owners = users.filter((u) => OWNER_PHONES.includes(u.phone));
  const real = users.filter((u) => !demoUsers.includes(u) && !owners.includes(u));
  const bookings = await q('SELECT COUNT(*) n FROM bookings');

  console.log(`Demo accounts to remove: ${demoUsers.length}`);
  console.log(`Owner accounts kept (demo history cleared): ${owners.map((u) => `${u.phone} ${u.role}`).join(', ')}`);
  console.log(`Other real accounts kept untouched: ${real.length} (${real.map((u) => u.phone ?? u.id).join(', ')})`);
  console.log(`Bookings to remove (all demo/test): ${bookings[0].n}`);
  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to back up and remove.');
    process.exit(0);
  }

  // ── Backup: every table to one JSON file (private) ──
  const tables = ids(await q('SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'), 't');
  const backup = {};
  for (const t of tables) backup[t] = await q(`SELECT * FROM \`${t}\``);
  const dir = path.join(os.homedir(), 'Desktop', 'RapidFix-backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rapidfix-live-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)), { mode: 0o600 });
  console.log(`Backup written: ${file}`);

  const demoIds = ids(demoUsers);
  const ownerCustomer = owners.find((u) => u.phone === '+919363939199');
  const ownerTech = owners.find((u) => u.phone === '+919505582333');

  await conn.beginTransaction();
  // Everything that hangs off bookings — all bookings are demo/test data.
  for (const t of ['booking_status_history', 'booking_assignments', 'booking_items', 'booking_additional_charges', 'payment_transactions', 'payments', 'coupon_usage', 'reviews', 'messages', 'complaints', 'wallet_transactions', 'payouts']) {
    await q(`DELETE FROM \`${t}\``);
  }
  await q('DELETE FROM bookings');
  await q('UPDATE coupons SET usedCount = 0');

  // Demo accounts and everything they own.
  const demoCustomers = ids(await q('SELECT id FROM customers WHERE userId IN (?)', [inList(demoIds)]));
  const demoTechs = ids(await q('SELECT id FROM technicians WHERE userId IN (?)', [inList(demoIds)]));
  await q('DELETE FROM addresses WHERE customerId IN (?)', [inList(demoCustomers)]);
  await q('DELETE FROM technician_skills WHERE technicianId IN (?)', [inList(demoTechs)]);
  await q('DELETE FROM technician_documents WHERE technicianId IN (?)', [inList(demoTechs)]);
  await q('DELETE FROM technician_wallets WHERE technicianId IN (?)', [inList(demoTechs)]);
  await q('DELETE FROM commissions WHERE technicianId IN (?)', [inList(demoTechs)]);
  await q('DELETE FROM technicians WHERE id IN (?)', [inList(demoTechs)]);
  await q('UPDATE customers SET referredById = NULL WHERE referredById IN (?)', [inList(demoCustomers)]);
  await q('DELETE FROM customers WHERE id IN (?)', [inList(demoCustomers)]);
  await q('DELETE FROM admin_users WHERE userId IN (?)', [inList(demoIds)]);
  await q('UPDATE audit_logs SET actorId = NULL WHERE actorId IN (?)', [inList(demoIds)]);
  for (const t of ['notifications', 'notification_tokens', 'refresh_tokens']) await q(`DELETE FROM \`${t}\` WHERE userId IN (?)`, [inList(demoIds)]);
  await q('DELETE FROM users WHERE id IN (?)', [inList(demoIds)]);

  // Owner accounts: keep the login, clear the demo history.
  const ownerIds = ids(owners);
  await q('DELETE FROM notifications WHERE userId IN (?)', [inList(ownerIds)]);
  if (ownerCustomer) {
    // Demo name/email/addresses → the owner completes their real profile on next login.
    await q('UPDATE users SET name = NULL, email = NULL, dateOfBirth = NULL WHERE id = ?', [ownerCustomer.id]);
    await q('DELETE a FROM addresses a JOIN customers c ON c.id = a.customerId WHERE c.userId = ?', [ownerCustomer.id]);
  }
  if (ownerTech) {
    await q('UPDATE technicians SET ratingAvg = 0, ratingCount = 0, completedJobs = 0, activeJobCount = 0, isOnline = 0 WHERE userId = ?', [ownerTech.id]);
    await q('UPDATE technician_wallets w JOIN technicians t ON t.id = w.technicianId SET w.balance = 0, w.totalEarned = 0, w.totalPaidOut = 0 WHERE t.userId = ?', [ownerTech.id]);
  }
  await q('DELETE FROM otp_codes');
  await conn.commit();

  const after = {};
  for (const t of ['users', 'customers', 'technicians', 'admin_users', 'bookings', 'payments', 'reviews', 'wallet_transactions', 'addresses', 'notifications', 'coupons', 'services', 'service_categories', 'locations', 'settings']) {
    after[t] = Number((await q(`SELECT COUNT(*) n FROM \`${t}\``))[0].n);
  }
  console.log('Done. Rows now:', JSON.stringify(after));
} catch (err) {
  await conn.rollback().catch(() => undefined);
  console.error('FAILED — nothing was changed (rolled back):', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
