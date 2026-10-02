import { testDatabaseUrl } from './testDbUrl';

// Must run before any src/ module reads `env`.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
// Tests never depend on the developer's .env choices (Firebase OTP, push); suites that need them set them.
process.env.OTP_PROVIDER = 'console';
process.env.PUSH_PROVIDER = 'none';
// Most suites book and dispatch straight away; the advance flow is tested in autopay.test.ts.
process.env.BOOKING_ADVANCE_RUPEES = '0';

// Deterministic fake gateway credentials — outbound calls are mocked in tests.
process.env.RAZORPAY_KEY_ID = 'rzp_test_fixora';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_123';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_123';
