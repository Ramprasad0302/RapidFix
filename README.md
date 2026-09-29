# FIXORA — Get It Fixed.

On-demand local services marketplace for villages, small towns and Tier-2/3 India.
Developed by **Nirmaan Digital**.

## Monorepo

| Path | What | Dev URL |
|---|---|---|
| `backend/` | Node + Express + TypeScript + Prisma (MySQL) + Socket.IO — REST under `/api/v1` | http://localhost:4000/api/v1 |
| `apps/customer/` | Customer web app (React + Vite + Tailwind), guest-first, mobile-first | http://localhost:5173/customer/ |
| `apps/technician/` | Technician partner app | http://localhost:5174/technician/ |
| `apps/admin/` | Admin panel (desktop-first) | http://localhost:5175/admin/ |
| `packages/shared-types` | Enums, API envelope types, booking state machine, socket event names | |
| `packages/shared-utils` | Pricing/commission math, formatting, geo, Zod validators | |
| `packages/web-core` | Central Axios client factory + TanStack Query defaults | |
| `packages/ui` | FIXORA Tailwind v4 design tokens (`fixora-navy`, `fixora-blue`, `fixora-cyan`) | |

## Prerequisites

- Node 22+ (developed on Node 24), npm 11
- MySQL 8+ running locally (`brew install mysql && brew services start mysql`)

## First-time setup

```bash
npm install
cp .env.example backend/.env        # then fill DATABASE_URL, JWT secrets, SEED_ADMIN_*
npm run db:migrate
npm run db:seed
```

Each app has its own `apps/<app>/.env` (copy from `.env.example`) holding `VITE_API_URL` / `VITE_SOCKET_URL`.

## Run

```bash
npm run dev:api
npm run dev:customer
npm run dev:technician
npm run dev:admin
```

## Quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Development data

`npm run db:seed` creates fictitious data only: 10 categories, 17 services, 5 Andhra Pradesh service
towns, 6 technicians (5 verified), 3 customers, 5 coupons and sample bookings.
Admin login credentials are read from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `backend/.env`.
Seeded customer/technician phones are in the `+91 90000 000xx` range; with `OTP_PROVIDER=console`
the OTP is printed in the API log (never allowed in production).

## Authentication

| App | Login | After logout |
|---|---|---|
| Customer | `+91` mobile → 6-digit OTP (account auto-created on first login). Guests browse freely; private routes redirect to `/login?redirect=…` and return afterwards | Home, as guest |
| Technician | Mobile → OTP; number must already be registered. `SUSPENDED` / `BLOCKED` are refused; `PENDING` / `REJECTED` may sign in to see their status | `/login` |
| Admin | Email + password (bcrypt). Roles: SUPER_ADMIN, ADMIN, OPERATIONS, SUPPORT, FINANCE | `/login` |

- **Access token**: 15 min HS256 JWT `{ sub, role }` held in memory only; sent as `Authorization: Bearer`.
- **Refresh token**: opaque random value in an **httpOnly, SameSite=Lax cookie** scoped to `/api/v1/auth`, one per app
  (`fx_rt_customer` / `fx_rt_technician` / `fx_rt_admin`). Stored server-side as an HMAC hash. Rotated on every use;
  replaying a rotated token revokes the whole session family.
- **OTP**: stored as HMAC(phone|role|code); 5 min expiry, single use, 5 wrong attempts lock the code,
  30 s resend cooldown, max 5 per hour per number, plus per-IP rate limits.
- **Backend authorization**: `authenticate()` → `authorize(...roles)` → `requirePermission(p)` (admin matrix in
  `packages/shared-types/src/permissions.ts`). Customer/technician queries are always keyed by the caller's own id.
- The frontend client (`packages/web-core`) refreshes once on `TOKEN_EXPIRED`, shares that refresh across concurrent
  requests, retries, and drops to guest/login if the session is gone.

Backend integration tests run against a separate `<db>_test` database (created and migrated automatically).

## Conventions

- Money is integer **paise** everywhere (DB, API, math). Format only at display time.
- Every response is `{ success: true, data }` or `{ success: false, message, code }`.
- Booking status changes go through the state machine in `packages/shared-types/src/bookingStateMachine.ts`.
- Pricing is computed server-side; frontends may preview only.
