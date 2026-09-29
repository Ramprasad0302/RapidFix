import 'dotenv/config';

/** Same server/credentials as development, but always the `<db>_test` database. */
export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL missing — create backend/.env first');
  const url = new URL(base);
  const db = url.pathname.replace(/^\//, '') || 'fixora';
  url.pathname = `/${db.endsWith('_test') ? db : `${db}_test`}`;
  return url.toString();
}
