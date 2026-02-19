# MileClear

UK-based mileage tracking app for gig workers, delivery drivers, and professional drivers. Freemium model — free tracking + gamification, £4.99/mo premium for HMRC exports, earnings tracking, and advanced analytics.

**Target:** UK gig workers (Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, Gophr, DPD, Yodel, Evri) and any self-employed driver.

## Monorepo Structure

```
MileClear/
├── apps/
│   ├── api/              # @mileclear/api — Fastify REST API (port 3001)
│   ├── web/              # @mileclear/web — Next.js 15 App Router (port 3000)
│   └── mobile/           # @mileclear/mobile — Expo SDK 52 + React Native
├── packages/
│   └── shared/           # @mileclear/shared — Types, constants, utilities
├── prisma/
│   └── schema.prisma     # MySQL database schema (10 models)
├── .env.example          # All required environment variables
├── pnpm-workspace.yaml   # Workspace config + allowed build deps
└── tsconfig.base.json    # Shared TS config extended by all packages
```

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Language | TypeScript | Everywhere — API, web, mobile, shared |
| Mobile | React Native + Expo (SDK 52) | Expo Router for navigation, development builds (not Expo Go) |
| Web | Next.js 15 | App Router, React 19, SSR for landing page SEO |
| API | Fastify 5 | ESM modules, Zod validation, `tsx watch` for dev |
| ORM | Prisma 6 | MySQL provider, schema lives at `prisma/schema.prisma` |
| Database | MySQL | Via cPanel/PHPMyAdmin on Pixelish server |
| Local DB | expo-sqlite | Offline-first trip storage on mobile |
| Auth | Custom JWT + bcrypt | 15min access tokens, 30-day refresh tokens |
| Cache | In-memory (Redis fallback) | `apps/api/src/lib/redis.ts` — Map-based cache |
| Package manager | pnpm 9+ | Workspaces with `workspace:*` protocol |

## Commands

```bash
# Development (run from repo root)
pnpm dev:api            # Fastify with hot reload via tsx (port 3001)
pnpm dev:web            # Next.js dev server (port 3000)
pnpm dev:mobile         # Expo dev server

# Build
pnpm build:shared       # Must build shared first — other packages depend on it
pnpm build:api          # Compile API TypeScript
pnpm build:web          # Next.js production build

# Database (proxied to apps/api)
pnpm db:generate        # Generate Prisma client from schema
pnpm db:migrate         # Run pending migrations (dev)
pnpm db:studio          # Open Prisma Studio GUI
# Also available: pnpm --filter @mileclear/api db:deploy (production migrations)

# Quality
pnpm typecheck          # Type check all workspaces
pnpm lint               # Lint all workspaces
```

## Database Schema

10 Prisma models mapped to MySQL tables:

| Model | Table | Purpose |
|-------|-------|---------|
| User | `users` | Accounts (email/Apple/Google auth) |
| RefreshToken | `refresh_tokens` | JWT refresh token storage |
| Vehicle | `vehicles` | Driver vehicles (make, model, fuel type, MPG) |
| Shift | `shifts` | Work sessions (start/end tracking periods) |
| Trip | `trips` | Individual journeys within shifts |
| TripCoordinate | `trip_coordinates` | GPS breadcrumbs for route replay |
| FuelLog | `fuel_logs` | Fuel fill-up records |
| Earning | `earnings` | Platform earnings (manual/CSV/OCR/Open Banking) |
| Achievement | `achievements` | Gamification badges and milestones |
| MileageSummary | `mileage_summaries` | Per-tax-year aggregated totals |
| WaitlistEntry | `waitlist` | Pre-launch email signups |

## API Routes

All routes registered in `apps/api/src/server.ts`. Each route module exports an async function taking `FastifyInstance`.

| Prefix | File | Auth | Notes |
|--------|------|------|-------|
| `/auth` | `routes/auth/` | No | Register, login, verify, OAuth, refresh |
| `/shifts` | `routes/shifts/` | Yes | Start/end shifts, list history |
| `/trips` | `routes/trips/` | Yes | CRUD + classification + notes |
| `/vehicles` | `routes/vehicles/` | Yes | CRUD + MPG lookup |
| `/fuel` | `routes/fuel/` | Yes | Prices (nearby) + fill-up logs |
| `/earnings` | `routes/earnings/` | Yes | Manual/CSV/OCR/Open Banking |
| `/gamification` | `routes/gamification/` | Yes | Stats, achievements, scorecard |
| `/exports` | `routes/exports/` | Yes + Premium | PDF/CSV/Xero/FreeAgent/QuickBooks |
| `/billing` | `routes/billing/` | Mixed | Stripe webhooks (no auth), checkout/status (auth) |
| `/sync` | `routes/sync/` | Yes | Batch offline data upload |
| `/user` | `routes/user/` | Yes | Profile, GDPR export, account deletion |
| `/waitlist` | `routes/waitlist/` | No | Email signup (fully implemented) |
| `/health` | inline | No | Returns `{ status: "ok" }` |

## Key Conventions

### Data & Storage
- **Offline-first:** Mobile writes to local SQLite first, syncs to API when online
- **Monetary values:** Always stored as pence (integers), never pounds (floats)
- **Primary keys:** UUIDs everywhere (`@default(uuid())`)
- **Distances:** Stored and calculated in miles using Haversine formula
- **Sync conflicts:** Never overwrite or delete — keep both versions, flag for review

### Auth & Security
- Every API endpoint verifies JWT and scopes all queries to `request.userId`
- Premium features gated via `premiumMiddleware` (`apps/api/src/middleware/premium.ts`)
- Rate limiting: 5 login attempts per 15 min per IP
- Passwords: bcrypt with 12 salt rounds
- Mobile tokens: Expo SecureStore (encrypted keychain)
- Web tokens: HttpOnly secure cookies

### HMRC & Tax
- Car/van: 45p/mi (first 10,000), 25p/mi (after 10,000)
- Motorbike: 24p/mi flat rate
- UK tax year: 6 April to 5 April (utility: `getTaxYear()` in shared)
- Constants defined in `packages/shared/src/constants/index.ts`

### Mobile Tracking
- Background location via `expo-location` + `expo-task-manager`
- High accuracy, 50m distance intervals during shifts
- Stop detection: speed = 0 for >2 minutes segments trips
- Outside shifts: low-power significant location changes detect driving (>15mph)
- Fallback option: `react-native-background-geolocation` (transistorsoft, ~$300) if iOS reliability insufficient

### Shared Package
- **Must be built before other packages:** `pnpm build:shared`
- Exports types, constants, and utilities used across all three apps
- Consumed via `@mileclear/shared` workspace dependency
- Key exports: `haversineDistance()`, `calculateHmrcDeduction()`, `formatPence()`, `getTaxYear()`, `HMRC_RATES`, `GIG_PLATFORMS`, `FUEL_BRANDS`

## Environment

Copy `.env.example` to `.env` at the repo root. Required vars for local dev:
- `DATABASE_URL` — MySQL connection string
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — Token signing secrets
- `API_PORT` (default 3001), `CORS_ORIGIN` (default http://localhost:3000)
- `NEXT_PUBLIC_API_URL` — Web app's API base URL

Optional: `REDIS_URL`, `RESEND_API_KEY`, Stripe keys, OAuth credentials, TrueLayer keys.

## Hosting (Production)

Self-hosted on Pixelish server (provided by James). Zero ongoing infrastructure costs.

| Item | Value |
|------|-------|
| Server IP | `85.234.151.224` |
| cPanel user | `mileclear` |
| Home directory | `/home/mileclear` |
| App directory | `/home/mileclear/mileclear-app` |
| MySQL user | `mileclear_database` |
| MySQL database | `mileclear_database` |
| Shadow database | `mileclear_shadow` |
| Node.js | v22.19.0 |
| PM2 | 6.0.13 |
| MySQL | 8.0.45 |

| Domain | Service | Port |
|--------|---------|------|
| `mileclear.com` | Next.js (PM2) | 3000 |
| `api.mileclear.com` | Fastify (PM2) | 3001 |

Nginx reverse proxy, SSL via cPanel AutoSSL/Let's Encrypt, MySQL via cPanel.

**Access:**
- cPanel Terminal for shell commands (no direct SSH — key auth only, password auth disabled)
- Cyberduck via FTP-SSL (port 21) for file transfer
- DBeaver for database management (Remote MySQL `%` wildcard enabled)
- pnpm not globally installed — use `npx pnpm` on server

### Deploy
```bash
# API: cPanel Terminal → cd ~/mileclear-app → git pull → npx pnpm install → npx pnpm db:generate → prisma migrate deploy → PM2 restart
# Web: cPanel Terminal → cd ~/mileclear-app → git pull → npx pnpm install → npx pnpm build:web → PM2 restart
# Mobile: EAS Build → TestFlight / Play Store internal testing
```

## Spec Documents

- `PRODUCT_SPEC.md` — Full feature spec, freemium model, GDPR requirements
- `TECHNICAL_ARCHITECTURE.md` — Stack decisions, database schema, API design, deployment
- `LANDING_PAGE_SPEC.md` — Pre-launch page copy, sections, waitlist signup
