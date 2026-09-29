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

With `OTP_PROVIDER=console` the OTP is shown on the verify screen and printed in the API log (development only;
production refuses to start until an SMS provider is added).

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

## Integrations

| Feature | Without keys (dev) | With keys |
|---|---|---|
| OTP | shown on screen / API log | add an SMS provider in `backend/src/services/otp` |
| Maps | distance + ETA panel; GPS "current location" works | `VITE_GOOGLE_MAPS_API_KEY` enables live tracking map and "Choose on Map" |
| Uploads | stored in `backend/uploads`, served at `/uploads` (type sniffed from file bytes) | S3-compatible driver (planned) |

## Conventions

- Money is integer **paise** everywhere. Format only at display time. Dates are shown in IST.
- Every response is `{ success: true, data }` or `{ success: false, message, code }`.
- API shapes live in `packages/shared-types/src/dto.ts` and are used by both backend and web app.
