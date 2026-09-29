import { testDatabaseUrl } from './testDbUrl';

// Must run before any src/ module reads `env`.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
