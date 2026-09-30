import { testDatabaseUrl } from './testDbUrl';

// Must run before any src/ module reads `env`.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';

// Deterministic fake gateway credentials — outbound calls are mocked in tests.
process.env.RAZORPAY_KEY_ID = 'rzp_test_fixora';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_123';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_123';
