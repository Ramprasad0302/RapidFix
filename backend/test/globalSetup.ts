import { execSync } from 'node:child_process';
import mariadb from 'mariadb';
import { testDatabaseUrl } from './testDbUrl';

/** Creates the test database if needed and applies migrations (never resets the dev DB). */
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);
  const conn = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    allowPublicKeyRetrieval: true,
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();

  execSync('npx prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
}
