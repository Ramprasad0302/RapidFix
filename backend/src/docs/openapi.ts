import { z } from 'zod';
import { addressSchema, adminLoginSchema, sendOtpSchema, verifyOtpSchema } from '@fixora/shared-utils';

/**
 * OpenAPI 3.1 description of /api/v1. Every route is listed here —
 * test/openapi.test.ts fails when a route is added without documenting it.
 * Request bodies come from the same Zod schemas the server validates with.
 */

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Access = 'public' | 'user' | 'customer' | 'technician' | `staff:${string}`;

interface RouteDoc {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  access: Access;
  body?: z.ZodType | Record<string, unknown>;
  query?: string[];
  description?: string;
}

const json = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({ type: 'object', properties, required });
const str = { type: 'string' };
const paise = { type: 'integer', description: 'Amount in paise (₹1 = 100)' };
const bool = { type: 'boolean' };
const reason = obj({ reason: { type: 'string', minLength: 3, maxLength: 300 } });

const R = (method: Method, path: string, tag: string, summary: string, access: Access, extra: Partial<RouteDoc> = {}): RouteDoc => ({ method, path, tag, summary, access, ...extra });

export const ROUTES: RouteDoc[] = [
  // Health & auth
  R('get', '/health', 'System', 'Liveness + database check', 'public'),
  R('post', '/auth/send-otp', 'Auth', 'Send a login OTP (rate limited, 30 s resend cooldown)', 'public', { body: sendOtpSchema }),
  R('post', '/auth/verify-otp', 'Auth', 'Verify OTP → access token + httpOnly refresh cookie. New numbers become customers.', 'public', { body: verifyOtpSchema }),
  R('post', '/auth/firebase', 'Auth', 'Exchange a Firebase phone-auth ID token (OTP_PROVIDER=firebase) for a session', 'public', { body: obj({ idToken: str }) }),
  R('post', '/auth/login', 'Auth', 'Staff email + password login', 'public', { body: adminLoginSchema }),
  R('post', '/auth/refresh', 'Auth', 'Rotate the refresh cookie and issue a new access token (reuse is detected and revokes the family)', 'public'),
  R('post', '/auth/logout', 'Auth', 'Revoke the current refresh token', 'public'),
  R('get', '/auth/me', 'Auth', 'Current user', 'user'),
  R('delete', '/auth/account', 'Auth', 'Delete my account (personal data erased; bookings kept anonymised)', 'user', { body: obj({ confirm: str }) }),

  // Public catalogue
  R('get', '/services/categories', 'Catalogue', 'Active categories with subcategories', 'public'),
  R('get', '/services', 'Catalogue', 'Services (filter by category, popular, search)', 'public', { query: ['category', 'popular', 'q', 'limit'] }),
  R('get', '/services/{idOrSlug}', 'Catalogue', 'Service detail with inclusions and price', 'public'),
  R('get', '/locations', 'Catalogue', 'Serviceable towns', 'public'),
  R('get', '/technicians/nearby', 'Catalogue', 'Verified online technicians near a point (no contact details)', 'public', { query: ['lat', 'lng'] }),
  R('get', '/stats/public', 'Catalogue', 'Trust numbers for the home page', 'public'),
  R('get', '/service-area', 'Catalogue', 'Is a map point inside the service area?', 'public'),
  R('post', '/service-area/interest', 'Catalogue', "\"I'm interested\" from outside the service area", 'public', { body: obj({ name: str, phone: str, label: str }, []) }),
  R('get', '/app-config', 'Catalogue', 'Public support phone and email (from admin settings)', 'public'),
  R('get', '/reviews/featured', 'Catalogue', 'Recent 4–5★ reviews', 'public'),
  R('get', '/offers', 'Catalogue', 'Live offers', 'public', { query: ['category'] }),
  R('get', '/offers/{code}', 'Catalogue', 'Offer detail', 'public'),
  R('post', '/bookings/estimate', 'Catalogue', 'Server-side price estimate incl. coupon and GST', 'public', { body: obj({ serviceId: str, couponCode: str }, ['serviceId']) }),
  R('get', '/geo/reverse', 'Geo', 'Reverse-geocode a GPS point into a street address (Google or OpenStreetMap)', 'public', { query: ['lat', 'lng'] }),
  R('get', '/geo/search', 'Geo', 'Search places', 'public', { query: ['q', 'lat', 'lng'] }),

  // Uploads & files
  R('post', '/uploads', 'Files', 'Upload an image/video (multipart `file`). `?kind=image` restricts to images; `?private=1` stores a KYC document privately.', 'user'),
  R('get', '/files/private/{path}', 'Files', 'Download a private KYC document (staff, or the technician who owns it)', 'user'),

  // Customer
  R('get', '/customer/profile', 'Customer', 'My profile', 'customer'),
  R('put', '/customer/profile', 'Customer', 'Update my profile', 'customer', { body: obj({ name: str, email: str, dateOfBirth: str, city: str, language: str, notificationsEnabled: bool, marketingOptIn: bool, avatarUrl: str }, ['name', 'email']) }),
  R('post', '/customer/onboarding', 'Customer', 'Finish sign-up (name, email, date of birth, first address)', 'customer', { body: obj({ name: str, email: str, dateOfBirth: str, address: obj({}) }, ['name', 'email', 'dateOfBirth']) }),
  R('get', '/customer/bookings/stats', 'Customer', 'Counts per tab', 'customer'),
  R('get', '/customer/bookings', 'Customer', 'My bookings', 'customer', { query: ['tab', 'page', 'pageSize'] }),
  R('post', '/customer/bookings', 'Customer', 'Create a booking (price, coupon and schedule re-validated on the server; dispatch starts immediately)', 'customer', {
    body: obj(
      {
        serviceId: str,
        description: str,
        photos: { type: 'array', items: str },
        addressId: str,
        address: json(addressSchema),
        saveAddress: bool,
        scheduleType: { enum: ['NOW', 'SCHEDULED'] },
        date: { type: 'string', format: 'date' },
        timeSlot: str,
        couponCode: str,
        paymentMethod: { enum: ['CASH', 'UPI', 'RAZORPAY'] },
      },
      ['serviceId', 'scheduleType', 'paymentMethod'],
    ),
  }),
  R('get', '/customer/bookings/{id}', 'Customer', 'Booking detail with timeline, technician, live location, charges, payment and review', 'customer'),
  R('post', '/customer/bookings/{id}/cancel', 'Customer', 'Cancel (allowed until the technician arrives)', 'customer', { body: obj({ reason: str }, []) }),
  R('post', '/customer/bookings/{id}/reschedule', 'Customer', 'Reschedule before the technician starts travelling', 'customer'),
  R('post', '/customer/bookings/{id}/payment/razorpay-order', 'Payments', 'Create a Razorpay order for the amount due (at booking for "pay online", or the balance after the job)', 'customer'),
  R('post', '/customer/bookings/{id}/payment/pay-later', 'Payments', 'Switch an unpaid "pay online" booking to pay after service; dispatch starts', 'customer'),
  R('post', '/customer/bookings/{id}/payment/razorpay-verify', 'Payments', 'Verify the Checkout signature (HMAC) and settle the booking', 'customer', {
    body: obj({ razorpay_order_id: str, razorpay_payment_id: str, razorpay_signature: str }),
  }),
  R('post', '/customer/bookings/{id}/additional-charges/{chargeId}/{decision}', 'Customer', 'Approve or reject extra work (`decision` = approve | reject); GST is recalculated', 'customer'),
  R('post', '/customer/bookings/{id}/review', 'Customer', 'Rate the technician after payment', 'customer', { body: obj({ rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: str }, ['rating']) }),
  R('get', '/customer/addresses', 'Customer', 'Saved addresses', 'customer'),
  R('post', '/customer/addresses', 'Customer', 'Add an address', 'customer', { body: json(addressSchema) }),
  R('put', '/customer/addresses/{id}', 'Customer', 'Edit an address', 'customer', { body: json(addressSchema) }),
  R('delete', '/customer/addresses/{id}', 'Customer', 'Delete an address', 'customer'),

  // Shared booking resources
  R('get', '/bookings/{id}/chat', 'Chat', 'Chat header: counterpart and whether sending is allowed', 'user'),
  R('get', '/bookings/{id}/messages', 'Chat', 'Last 100 messages (staff: read-only)', 'user', { query: ['before'] }),
  R('post', '/bookings/{id}/messages', 'Chat', 'Send a text or photo message', 'user', { body: obj({ body: str, imageUrl: str }, []) }),
  R('post', '/bookings/{id}/messages/read', 'Chat', "Mark the other side's messages read", 'user'),
  R('get', '/bookings/{id}/invoice', 'Payments', 'Invoice / bill (after the service is completed)', 'user'),
  R('post', '/complaints', 'Complaints', 'Raise a complaint (optionally about one of my bookings)', 'user', { body: obj({ bookingId: str, category: str, subject: str, description: str }, ['category', 'subject', 'description']) }),
  R('get', '/complaints/mine', 'Complaints', 'My complaints and their resolution', 'user'),
  R('post', '/partner/register', 'Technician', 'Register the signed-in customer account as a technician (pending verification); returns a new session', 'customer'),

  // Notifications
  R('get', '/notifications', 'Notifications', 'My last 50 notifications', 'user'),
  R('get', '/notifications/unread-count', 'Notifications', 'Unread badge count', 'user'),
  R('post', '/notifications/read-all', 'Notifications', 'Mark all read', 'user'),
  R('post', '/notifications/tokens', 'Notifications', 'Register an FCM push token for this device', 'user', { body: obj({ token: str, platform: { enum: ['WEB', 'ANDROID', 'IOS'] } }, ['token']) }),
  R('delete', '/notifications/tokens/{token}', 'Notifications', 'Remove a push token', 'user'),

  // Technician
  R('get', '/technician/dashboard', 'Technician', "Today's jobs, earnings and schedule", 'technician'),
  R('get', '/technician/profile', 'Technician', 'Profile summary', 'technician'),
  R('get', '/technician/profile/details', 'Technician', 'Editable profile + service area', 'technician'),
  R('put', '/technician/profile', 'Technician', 'Update profile and service area', 'technician'),
  R('post', '/technician/online', 'Technician', 'Go online (verified partners only)', 'technician', { body: obj({ lat: { type: 'number' }, lng: { type: 'number' } }, []) }),
  R('post', '/technician/offline', 'Technician', 'Go offline', 'technician'),
  R('post', '/technician/location', 'Technician', 'Location ping (throttled); forwarded live to customers of en-route jobs', 'technician', { body: obj({ lat: { type: 'number' }, lng: { type: 'number' } }) }),
  R('get', '/technician/requests', 'Technician', 'Open job offers with countdown', 'technician'),
  R('get', '/technician/jobs', 'Technician', 'My jobs by tab', 'technician', { query: ['tab'] }),
  R('get', '/technician/jobs/{id}', 'Technician', 'Job detail', 'technician'),
  ...(['accept', 'reject', 'en-route', 'arrived', 'start', 'complete'] as const).map((a) =>
    R('post', `/technician/jobs/{id}/${a}`, 'Technician', `Job action: ${a} (state machine enforced)`, 'technician', { body: obj({ reason: str }, []) }),
  ),
  R('put', '/technician/jobs/{id}/notes', 'Technician', 'Save private job notes', 'technician', { body: obj({ notes: str }) }),
  R('post', '/technician/jobs/{id}/additional-charges', 'Technician', 'Request approval for extra work', 'technician', { body: obj({ title: str, description: str, amount: paise }, ['title', 'amount']) }),
  R('post', '/technician/location-key', 'Technician', 'Background-location key for the Android app (location pings only; 7 days)', 'technician'),
  R('post', '/technician/device/location', 'Technician', 'GPS ping from the app background service (Bearer location key); online:false means stop', 'public', { body: obj({ lat: { type: 'number' }, lng: { type: 'number' } }) }),
  R('post', '/technician/jobs/{id}/payment-link', 'Payments', 'Razorpay payment link (shown as QR, texted to the customer) for the amount due', 'technician'),
  R('get', '/technician/jobs/{id}/payment-link/{linkId}', 'Payments', 'Check the payment link; settles the job once paid', 'technician'),
  R('post', '/technician/jobs/{id}/collect-payment', 'Payments', 'Record cash / UPI received; closes the job and posts commission', 'technician', { body: obj({ method: { enum: ['CASH', 'UPI'] } }) }),
  R('get', '/technician/earnings', 'Technician', 'Earnings summary and ledger', 'technician', { query: ['month'] }),
  R('get', '/technician/wallet', 'Technician', 'Wallet balance and transactions', 'technician'),
  R('get', '/technician/payout-details', 'Technician', 'UPI / bank details (account number masked)', 'technician'),
  R('put', '/technician/payout-details', 'Technician', 'Save UPI / bank details (account number encrypted at rest)', 'technician'),
  R('get', '/technician/documents', 'Technician', 'My KYC documents', 'technician'),
  R('post', '/technician/documents', 'Technician', 'Attach an uploaded private document', 'technician', { body: obj({ type: { enum: ['AADHAAR', 'PAN', 'DRIVING_LICENSE', 'CERTIFICATE', 'PROFILE_PHOTO', 'OTHER'] }, fileUrl: str }) }),
  R('delete', '/technician/documents/{id}', 'Technician', 'Delete a document that is not yet approved', 'technician'),
  R('get', '/technician/reviews', 'Technician', 'Reviews about me', 'technician'),
  R('get', '/technician/performance', 'Technician', 'Acceptance rate, completion and rating breakdown', 'technician'),

  // Admin
  R('get', '/admin/dashboard', 'Admin', 'KPIs and charts', 'staff:dashboard:view', { query: ['range'] }),
  R('get', '/admin/users', 'Admin · Users', 'All users with roles', 'staff:users:manage', { query: ['q', 'role', 'page', 'pageSize'] }),
  R('patch', '/admin/users/{id}/role', 'Admin · Users', 'Change role (staff roles need Super Admin)', 'staff:users:manage', { body: obj({ role: str }) }),
  R('post', '/admin/users/{id}/status', 'Admin · Users', 'Suspend / block / reactivate (permission follows the target: customers → support, technicians → operations, staff → super admin)', 'staff:*', {
    body: obj({ status: { enum: ['ACTIVE', 'SUSPENDED', 'BLOCKED'] }, reason: str }, ['status']),
  }),
  R('get', '/admin/bookings', 'Admin · Bookings', 'Search bookings', 'staff:bookings:manage', { query: ['q', 'group', 'from', 'to', 'page', 'pageSize'] }),
  R('get', '/admin/bookings/{id}', 'Admin · Bookings', 'Booking detail (also readable by payments, complaints and customer staff)', 'staff:bookings:manage'),
  R('get', '/admin/bookings/{id}/candidates', 'Admin · Bookings', 'Ranked technicians for manual assignment', 'staff:bookings:manage'),
  R('post', '/admin/bookings/{id}/assign', 'Admin · Bookings', 'Assign / reassign a technician', 'staff:bookings:manage', { body: obj({ technicianId: str }) }),
  R('post', '/admin/bookings/{id}/cancel', 'Admin · Bookings', 'Cancel an unpaid booking', 'staff:bookings:manage', { body: reason }),
  R('post', '/admin/bookings/{id}/dispute', 'Admin · Bookings', 'Open a dispute', 'staff:bookings:manage', { body: obj({ note: str }) }),
  R('post', '/admin/bookings/{id}/dispute/resolve', 'Admin · Bookings', 'Resolve a dispute', 'staff:bookings:manage', { body: obj({ resolution: { enum: ['PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'REFUND', 'CANCEL'] }, note: str }) }),
  R('get', '/admin/customers', 'Admin · People', 'Customers', 'staff:customers:manage', { query: ['q', 'status', 'page', 'pageSize'] }),
  R('get', '/admin/customers/{id}', 'Admin · People', 'Customer detail', 'staff:customers:manage'),
  R('get', '/admin/technicians', 'Admin · People', 'Technicians', 'staff:technicians:manage', { query: ['q', 'verification', 'online', 'categoryId', 'page', 'pageSize'] }),
  R('get', '/admin/technicians/live', 'Admin · People', 'Online technicians with last location', 'staff:technicians:manage'),
  R('get', '/admin/technicians/{id}', 'Admin · People', 'Technician detail', 'staff:technicians:manage'),
  R('post', '/admin/technicians/{id}/verification', 'Admin · People', 'Verify / reject / suspend a partner', 'staff:technicians:manage', { body: obj({ status: str, reason: str }, ['status']) }),
  R('put', '/admin/technicians/{id}/skills', 'Admin · People', 'Set skills', 'staff:technicians:manage', { body: obj({ categoryIds: { type: 'array', items: str } }) }),
  R('post', '/admin/technicians/documents/{id}', 'Admin · People', 'Approve / reject a KYC document', 'staff:technicians:manage', { body: obj({ status: { enum: ['APPROVED', 'REJECTED'] }, remarks: str }, ['status']) }),
  R('get', '/admin/categories', 'Admin · Catalogue', 'Categories', 'staff:catalog:manage'),
  R('post', '/admin/categories', 'Admin · Catalogue', 'Create category', 'staff:catalog:manage'),
  R('put', '/admin/categories/{id}', 'Admin · Catalogue', 'Update category', 'staff:catalog:manage'),
  R('get', '/admin/services', 'Admin · Catalogue', 'Services', 'staff:catalog:manage', { query: ['categoryId', 'q'] }),
  R('post', '/admin/services', 'Admin · Catalogue', 'Create service', 'staff:catalog:manage'),
  R('put', '/admin/services/{id}', 'Admin · Catalogue', 'Update service (price changes audited)', 'staff:catalog:manage'),
  R('get', '/admin/offers', 'Admin · Catalogue', 'Coupons', 'staff:offers:manage'),
  R('post', '/admin/offers', 'Admin · Catalogue', 'Create coupon', 'staff:offers:manage'),
  R('put', '/admin/offers/{id}', 'Admin · Catalogue', 'Update coupon', 'staff:offers:manage'),
  R('get', '/admin/payments', 'Admin · Finance', 'Payment summary and transactions', 'staff:payments:manage', { query: ['from', 'to', 'method', 'status', 'page', 'pageSize'] }),
  R('post', '/admin/payments/{id}/refund', 'Admin · Finance', 'Full or partial refund (Razorpay or offline) with commission clawback', 'staff:payments:manage', { body: obj({ amount: paise, reason: str }, ['reason']) }),
  R('get', '/admin/payouts/wallets', 'Admin · Finance', 'Technician wallet balances', 'staff:payouts:manage', { query: ['q'] }),
  R('get', '/admin/payouts', 'Admin · Finance', 'Payout history', 'staff:payouts:manage'),
  R('post', '/admin/payouts', 'Admin · Finance', 'Record a payout (debits the wallet)', 'staff:payouts:manage', { body: obj({ technicianId: str, amount: paise, method: { enum: ['UPI', 'BANK_TRANSFER', 'CASH'] }, reference: str }) }),
  R('get', '/admin/reviews', 'Admin · Feedback', 'Reviews', 'staff:reviews:manage', { query: ['rating', 'visible', 'page', 'pageSize'] }),
  R('patch', '/admin/reviews/{id}', 'Admin · Feedback', 'Hide / show a review (rating recalculated)', 'staff:reviews:manage', { body: obj({ isVisible: bool }) }),
  R('get', '/admin/complaints', 'Admin · Feedback', 'Complaints', 'staff:complaints:manage', { query: ['status', 'page', 'pageSize'] }),
  R('patch', '/admin/complaints/{id}', 'Admin · Feedback', 'Assign / update / resolve a complaint', 'staff:complaints:manage'),
  R('get', '/admin/notifications/broadcasts', 'Admin · Feedback', 'Sent announcements', 'staff:notifications:manage'),
  R('post', '/admin/notifications/broadcast', 'Admin · Feedback', 'Send an announcement', 'staff:notifications:manage', { body: obj({ audience: { enum: ['CUSTOMERS', 'TECHNICIANS', 'ALL'] }, title: str, body: str }) }),
  R('get', '/admin/reports', 'Admin · Platform', 'Report for a date range', 'staff:reports:view', { query: ['from', 'to'] }),
  R('get', '/admin/settings', 'Admin · Platform', 'Platform settings', 'staff:settings:manage'),
  R('get', '/admin/service-area', 'Admin · Platform', 'Towns served and interest requests', 'staff:settings:manage'),
  R('patch', '/admin/service-area/{id}', 'Admin · Platform', 'Turn a town on/off or change its radius', 'staff:settings:manage', { body: obj({ isActive: bool }, []) }),
  R('put', '/admin/settings/{key}', 'Admin · Platform', 'Update one setting (validated per key)', 'staff:settings:manage', { body: obj({ value: {} }) }),
  R('get', '/admin/audit-logs', 'Admin · Platform', 'Audit log', 'staff:audit:view', { query: ['action', 'entity', 'q', 'page', 'pageSize'] }),
  R('get', '/admin/audit-logs/actions', 'Admin · Platform', 'Distinct audit actions', 'staff:audit:view'),
  R('get', '/admin/system', 'Admin · Platform', 'Integration and worker health (no secrets)', 'staff:settings:manage'),

  // Webhooks
  R('post', '/payments/razorpay/webhook', 'Payments', 'Razorpay webhook (raw body, `X-Razorpay-Signature` HMAC verified, idempotent by event id)', 'public'),
];

const ACCESS_TEXT: Record<string, string> = {
  public: 'Public',
  user: 'Any signed-in user',
  customer: 'Customer',
  technician: 'Technician',
};

export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of ROUTES) {
    const params = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: str }));
    const query = (r.query ?? []).map((name) => ({ name, in: 'query', required: false, schema: str }));
    const access = r.access.startsWith('staff:') ? `Staff with \`${r.access.slice(6)}\` permission` : ACCESS_TEXT[r.access];
    paths[r.path] ??= {};
    paths[r.path]![r.method] = {
      tags: [r.tag],
      summary: r.summary,
      description: `**Access:** ${access}${r.description ? `\n\n${r.description}` : ''}`,
      ...(r.access === 'public' ? { security: [] } : {}),
      ...(params.length || query.length ? { parameters: [...params, ...query] } : {}),
      ...(r.body ? { requestBody: { required: true, content: { 'application/json': { schema: r.body instanceof z.ZodType ? json(r.body) : r.body } } } } : {}),
      responses: {
        '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
        ...(r.access === 'public' ? {} : { '401': { $ref: '#/components/responses/Error' }, '403': { $ref: '#/components/responses/Error' } }),
        '400': { $ref: '#/components/responses/Error' },
        '404': { $ref: '#/components/responses/Error' },
        '429': { $ref: '#/components/responses/Error' },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'RapidFix API',
      version: '1.0.0',
      description:
        'On-demand local services marketplace — GET IT FIXED. Developed by Nirmaan Digital.\n\n' +
        'Responses use `{ success: true, data, meta? }` or `{ success: false, message, code, errors? }`. Money is in **paise**; dates are ISO-8601 (bookings are scheduled in IST).\n\n' +
        'Authenticate with `Authorization: Bearer <accessToken>` (15-minute JWT). The refresh token is an httpOnly cookie scoped to `/api/v1/auth`.\n\n' +
        'Real-time events (Socket.IO, same origin): `booking_request`, `booking_accepted`, `technician_location_updated`, `new_message`, `payment_updated`, `notification` and more — see `SocketEvent` in `@fixora/shared-types`.',
    },
    servers: [{ url: serverUrl }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Success: obj({ success: { const: true }, data: {}, meta: { type: 'object' } }, ['success', 'data']),
        Error: obj({ success: { const: false }, message: str, code: str, errors: { type: 'array', items: obj({ path: str, message: str }) } }, ['success', 'message', 'code']),
      },
      responses: { Error: { description: 'Error envelope', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
    },
    paths,
  };
}

export type { Method, RouteDoc };
