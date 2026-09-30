# FIXORA — Get It Fixed.

On-demand local services marketplace for villages, small towns and Tier-2/3 India.
Developed by **Nirmaan Digital**.

## Monorepo

| Path | What | Dev URL |
|---|---|---|
| `backend/` | Node + Express + TypeScript + Prisma (MySQL) + Socket.IO — REST under `/api/v1` | http://localhost:4000/api/v1 |
| `apps/web/` | One React app with three lazy-loaded areas: customer (`/`), technician (`/technician`), admin (`/admin`) and a **common login** (`/login`) | http://localhost:5173 |
| `packages/shared-types` | Enums, DTOs (API contracts), booking state machine, permission matrix | |
| `packages/shared-utils` | Pricing/commission math, formatting, geo, Zod validators | |
| `packages/web-core` | Central Axios client (refresh + retry) and auth store | |
| `packages/ui` | FIXORA design tokens (Tailwind v4) and base components (Logo, Button, TextField, OtpInput…) | |

### Why one web app?

Everyone — customers, technicians and staff — signs in on the same login page, and an admin can
change a person's role. A single app with one session makes that seamless: after login the account's
role decides where the user lands. Each area is a separate code-split bundle, so customers never
download admin code (the chart library lives only in the admin chunk). `/customer/*` URLs redirect
to the customer area.

## Prerequisites

- Node 22+ (developed on Node 24), npm 11
- MySQL 8+ running locally (`brew install mysql && brew services start mysql`)

## First-time setup

```bash
npm install
cp .env.example backend/.env        # fill DATABASE_URL, JWT secrets, SEED_ADMIN_*
cp apps/web/.env.example apps/web/.env
npm run db:migrate
npm run db:seed
```

## Run

```bash
npm run dev:api
npm run dev:web
```

Open http://localhost:5173 — the app goes straight to Home (brief splash while any saved session is restored).

API reference (Swagger UI, development only by default): http://localhost:4000/api/docs/ — the raw
OpenAPI 3.1 document is at `/api/docs/openapi.json`. A test fails if a route is added without documenting it.

## Quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Development data

`npm run db:seed` creates fictitious data only: 10 categories, 19 services, 6 service towns, 8 technicians
(7 verified), 20 customers, 4 staff accounts, the offers shown in the app, and ~2 months of booking history
so the admin charts are meaningful. Re-running it replaces the demo bookings of the demo accounts only.

| Who | How to sign in |
|---|---|
| Customer "Ram Kumar" | phone `90000 00001` + OTP |
| Technician "Ravi Kumar" | phone `90000 00101` + OTP |
| Super Admin | phone `90000 00900` + OTP, **or** "FIXORA staff? Sign in with email" with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `backend/.env` |

With `OTP_PROVIDER=console` the OTP is shown on the verify screen and printed in the API log (development only —
production refuses `console`; use `OTP_PROVIDER=msg91`).

Tip: the whole app shares one session per browser. To act as customer, technician and admin at the same
time, use separate browser profiles (or one private window per role).

## Authentication & roles

- **One login** (`/login`): phone + 6-digit OTP for everyone; staff may alternatively use email + password.
  New numbers become customers. The role returned by the server routes the user:
  `CUSTOMER → /`, `TECHNICIAN → /technician`, `SUPER_ADMIN | ADMIN | OPERATIONS | SUPPORT | FINANCE → /admin`.
- **One account per phone number.** Admins change roles in **Admin → Users & Roles**:
  - ADMIN and SUPER_ADMIN can switch customers ↔ technicians (a new technician starts *Pending verification*).
  - Only SUPER_ADMIN can grant or remove staff roles. Nobody changes their own role; the last Super Admin
    can't be demoted; users with bookings in progress can't be switched.
  - The user's sessions are revoked and the change is written to the audit log.
- **Tokens**: 15-min JWT access token in memory; opaque refresh token in an httpOnly `SameSite=Lax` cookie
  scoped to `/api/v1/auth`, rotated on use with reuse detection.
- **OTP**: HMAC-hashed, 5-min expiry, single use, 5 wrong attempts lock the code, 30 s resend cooldown,
  5 per hour per number, plus per-IP rate limits.
- **Backend authorization**: `authenticate()` → `authorize(...roles)` → `requirePermission(p)`.
  Customer and technician data is always queried by the caller's own id.

## Booking flow

Guests browse, search and price everything. Booking steps: service → describe problem (photos/video) →
address → Book Now / schedule → review. Login happens only at "Continue to Booking"; the draft (Zustand,
persisted) survives the OTP detour, and photos are uploaded at confirm time. The price is always computed
server-side (service + visit − coupon + GST). Every status change goes through the shared state machine
with optimistic locking and a status-history row.

## Real-time (Socket.IO)

One authenticated socket per session. Users join their own room; screens that show a booking join
`booking:{id}` (the server checks access). Events refresh or patch the affected React Query caches:

- **Live tracking** — while online, the technician app streams GPS (≈ every 15 s, throttled server-side).
  Customers of an en-route job get the position + ETA; staff see the fleet on **Admin → Technicians → Live map**.
- **Chat** — customer ↔ assigned technician per booking (text + photos, read receipts). Staff can read the
  transcript from the booking drawer but not write. Chat closes when the job is paid or cancelled.
- **Notifications** — every notification row goes through an outbox worker: socket `notification` event
  (toast + badge) and, with `PUSH_PROVIDER=fcm`, a Firebase push to registered devices.

## Payments, invoices & wallet

- **Online**: Razorpay order → Checkout → server verifies the HMAC signature; the webhook
  (`POST /api/v1/payments/razorpay/webhook`, raw body, signature checked) is idempotent by event id.
- **Cash / UPI**: the technician records the money received; the job closes immediately.
- **Extra work**: the technician requests it during the job; nothing is billed until the customer approves.
  GST is recalculated on approval.
- **Commission** (technician → service → category → location → global rule). Online payments *credit* the
  technician's share to their wallet; cash/UPI jobs *debit* FIXORA's commission + GST (the technician holds
  the money). Every wallet movement is an idempotent ledger row with the running balance.
- **Invoices** `INV-YYYY-000123`, printable (Save as PDF) for customer and technician.
- **Refunds** (full or partial, Finance) go back through Razorpay or are recorded as offline; the technician's
  share is clawed back proportionally.
- Technician bank account numbers are encrypted at rest (AES-256-GCM, `DATA_ENCRYPTION_KEY`); only the
  last 4 digits are ever returned. KYC documents are stored outside the public folder and served only to
  staff or their owner.

## Admin modules

Dashboard · Bookings (search, assign/reassign, cancel, disputes, refunds, chat transcript) · Customers ·
Technicians (verification, skills, KYC review, live map) · Services · Categories · Offers & Coupons ·
Payments · Payouts · Reviews (hide → rating recalculated) · Complaints · Notifications (broadcast) ·
Reports (date range, charts, CSV) · Settings (GST, commission, dispatch) · Users & Roles · Audit Logs ·
System Settings (integration health, never secrets).

| Role | Modules |
|---|---|
| SUPER_ADMIN | everything, including staff roles |
| ADMIN | everything except staff roles |
| OPERATIONS | dashboard, bookings, technicians, reviews, reports |
| SUPPORT | dashboard, customers, complaints, reviews |
| FINANCE | dashboard, payments, payouts, reports |

Every module checks its permission on the server (the menu only hides what the API would refuse).
Suspending an account needs the permission for that kind of account (support → customers,
operations → technicians, super admin → staff). Every sensitive action is written to the audit log.

## Integrations

| Feature | Without keys (dev) | With keys |
|---|---|---|
| OTP | shown on screen / API log | `OTP_PROVIDER=msg91`, `OTP_API_KEY`, `OTP_TEMPLATE_ID` (DLT template with `##otp##`) |
| Payments | Cash / UPI collected by the technician | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| Push | in-app + socket notifications | `PUSH_PROVIDER=fcm` + `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Geocoding | OpenStreetMap Nominatim (low volume) | `GOOGLE_MAPS_API_KEY` (server) |
| Maps | distance + ETA panel; GPS "current location" works | `VITE_GOOGLE_MAPS_API_KEY` enables live tracking map and "Choose on Map" |
| Uploads | `UPLOAD_DIR` (default `backend/uploads`), served at `/uploads`; KYC in `PRIVATE_UPLOAD_DIR` (type sniffed from file bytes) | S3-compatible driver (planned) |

## Conventions

- Money is integer **paise** everywhere. Format only at display time. Dates are shown in IST.
- Every response is `{ success: true, data }` or `{ success: false, message, code }`.
- API shapes live in `packages/shared-types/src/dto.ts` and are used by both backend and web app.

## Deployment

`docker-compose.yml` runs MySQL, the API and the web app (nginx serving the SPA and proxying `/api`,
`/socket.io` and `/uploads` to the API on one origin):

```bash
cp .env.docker.example .env.docker     # fill in secrets — never commit it
docker compose --env-file .env.docker up -d --build
docker compose exec api npx prisma db seed   # optional demo data
```

The API container applies pending migrations (`prisma migrate deploy`, never a reset) before starting.
Production refuses to boot without a real OTP provider and a `DATA_ENCRYPTION_KEY`.

For a managed setup: build `backend/Dockerfile` and `apps/web/Dockerfile` (pass `PUBLIC_URL` as a build arg),
put both behind HTTPS, set `CORS_ORIGINS` / `WEB_APP_URL` to the public origin and point the Razorpay
webhook at `https://<your-domain>/api/v1/payments/razorpay/webhook`.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, all tests against a MySQL service and both builds on
every push and pull request, with throwaway secrets generated per run.

## Tests

- `packages/shared-utils` — pricing, commission split, validation, formatting, geo.
- `packages/web-core` — API client refresh/retry and auth store.
- `backend/test` — API integration tests against a real MySQL test database (`<db>_test`, created and
  migrated automatically): auth & OTP, roles, bookings, technician flow, dispatch engine, the full
  customer ↔ technician journey (extra work, cash + Razorpay payment, webhook idempotency, invoice,
  review, refund, encrypted bank details, private KYC files), admin module permissions and actions,
  OTP provider, and OpenAPI coverage.
