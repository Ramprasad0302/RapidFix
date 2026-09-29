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

## Conventions

- Money is integer **paise** everywhere (DB, API, math). Format only at display time.
- Every response is `{ success: true, data }` or `{ success: false, message, code }`.
- Booking status changes go through the state machine in `packages/shared-types/src/bookingStateMachine.ts`.
- Pricing is computed server-side; frontends may preview only.
