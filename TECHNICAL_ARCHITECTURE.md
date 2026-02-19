# MileClear - Technical Architecture

## Guiding Principles

- **Solo developer friendly.** Every choice optimises for one person building and maintaining the entire product.
- **Zero hosting costs.** Self-hosted on Pixelish server. No third-party platform fees for infrastructure.
- **One language.** JavaScript/TypeScript across the entire stack. No context-switching between languages.
- **Reliability first.** The offline-first architecture means trip data is never lost, regardless of connection state.
- **Full ownership.** No dependency on Supabase, Vercel, or any platform that can change pricing or shut down.

---

## Stack Overview

| Layer | Technology | Why |
|-------|-----------|-----|
| Mobile app | React Native + Expo | Cross-platform from one codebase. Leverages existing React skills. Expo simplifies builds, OTA updates, and push notifications. |
| Web dashboard | Next.js | React-based, SSR for the landing page (SEO). Hosted on Pixelish server. |
| Backend API | Node.js + Fastify | Faster than Express, modern, excellent TypeScript support. Runs on Pixelish via PM2. |
| ORM | Prisma | Type-safe database queries, auto-generated TypeScript types, migration management. Works with MySQL. |
| Database | MySQL (Pixelish server) | Already available via cPanel/PHPMyAdmin. Zero cost, managed by hosting. |
| Cache | Redis (ask James) | Fuel price caching, rate limiting, session management. If unavailable, fall back to in-memory cache. |
| Local database | Expo SQLite | On-device trip storage for offline-first. Fast, reliable, works without a connection. |
| Auth | Custom (JWT + bcrypt) | Apple Sign-In, Google Sign-In, email/password with verification. Full control, no third-party auth dependency. |
| Push notifications | Expo Notifications | Free. Handles iOS and Android push from one API. |
| Maps | MapLibre + OpenStreetMap | Free and open-source. No per-request charges. |
| OCR (screenshots) | Google ML Kit (on-device) | Free. Runs on the phone — no API calls, no cost, works offline. |
| Email | Resend (free tier) or Nodemailer | Email verification, password resets, tax year reminders. Resend: 3,000 emails/month free. |
| File storage | Pixelish server filesystem | CSV uploads, exported reports. Served via the API. |
| Process manager | PM2 | Keeps Node.js processes alive, auto-restarts on crash, log management. |

---

## Cost Breakdown

| Item | Cost |
|------|------|
| Pixelish server | £0 (provided by James) |
| MySQL / PHPMyAdmin | £0 (included with server) |
| Expo / EAS Build (free tier) | £0/month |
| Resend email (free tier) | £0/month (3,000 emails/month) |
| Google Cloud (OCR fallback) | £0–5/month (1,000 requests/month free) |
| Apple Developer Account | £79/year (required for iOS App Store) |
| Google Play Developer | ~£20 one-time (required for Play Store) |
| Domain (mileclear) | Already owned |
| **Total to launch** | **~£100 upfront, £0/month ongoing** |

**When you scale:**
- Redis: Free if James installs it. Otherwise ~£0 (use in-memory caching).
- Resend: $20/month if you exceed 3,000 emails/month.
- Background location library: ~$300 one-time if Expo's built-in isn't reliable enough.
- TrueLayer (Open Banking): Pay-per-connection at scale, free to integrate.
- Server resources: If Pixelish server hits limits, discuss with James or move to a VPS (~£5-10/month).

---

## Server Architecture (Pixelish)

### What to ask James to install

**Essential:**
- **Node.js (LTS v20+)** — runs the API and web dashboard.
- **PM2** — process manager. Keeps everything alive, auto-restarts on crash.

**Strongly recommended:**
- **Redis** — caching and rate limiting. Tiny footprint, huge performance benefit.

**Nice to have (ask once):**
- **PostgreSQL + PostGIS** — if available alongside MySQL, gives us geospatial queries (nearest fuel station, route distance calculations) at the database level. If not, we handle this in application code with the Haversine formula. No blocker.

### Server Layout

```
Pixelish Server
├── /var/www/mileclear/
│   ├── api/                 # Fastify API server (Node.js)
│   ├── web/                 # Next.js web dashboard
│   └── uploads/             # User file uploads (CSVs, exports)
├── MySQL                    # Via cPanel / PHPMyAdmin
├── Redis                    # If installed
├── Nginx                    # Reverse proxy (likely already present)
│   ├── api.mileclear.com → localhost:3001 (API)
│   └── mileclear.com → localhost:3000 (Web)
└── PM2                      # Process manager
    ├── mileclear-api         # API process
    └── mileclear-web         # Next.js process
```

### Domains / Subdomains

| Domain | Points to | Purpose |
|--------|-----------|---------|
| mileclear.com | Next.js app (port 3000) | Landing page + web dashboard |
| api.mileclear.com | Fastify API (port 3001) | REST API for mobile and web |

SSL via cPanel AutoSSL or Let's Encrypt (likely already configured).

---

## Mobile App Architecture

### Expo + React Native

Using Expo with **development builds** (not the limited Expo Go). This gives you:
- Full native module access (needed for background location).
- EAS Build for compiling iOS and Android binaries in the cloud.
- OTA updates — push bug fixes without going through the app store.
- Expo Router for file-based navigation (similar to Next.js).

### Project Structure

```
mileclear-app/
├── app/                    # Expo Router screens
│   ├── (tabs)/             # Tab navigation (main app)
│   │   ├── dashboard.tsx   # Home / shift controls / daily scorecard
│   │   ├── trips.tsx       # Trip history
│   │   ├── fuel.tsx        # Fuel prices
│   │   ├── earnings.tsx    # Earnings (optional feature)
│   │   └── profile.tsx     # Vehicle, account, settings
│   ├── (auth)/             # Auth screens
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── verify.tsx
│   └── _layout.tsx         # Root layout
├── components/             # Reusable UI components
├── lib/                    # Core logic
│   ├── tracking/           # GPS and trip detection
│   ├── sync/               # Offline sync engine
│   ├── db/                 # Local SQLite operations
│   ├── api/                # API client (talks to Fastify backend)
│   ├── auth/               # Auth logic (JWT storage, refresh)
│   ├── ocr/                # Screenshot OCR processing
│   └── gamification/       # Streaks, milestones, scoring
├── hooks/                  # Custom React hooks
├── constants/              # App constants, config
├── types/                  # TypeScript type definitions
└── assets/                 # Images, fonts
```

### Background Location Tracking

This is the hardest technical problem in the app. Two options:

**Option A: expo-location + expo-task-manager (Recommended to start)**
- Free, built into Expo.
- Supports background location on both iOS and Android.
- Uses `startLocationUpdatesAsync` with a background task.
- iOS: Works via "significant location changes" + deferred updates.
- Android: Uses a foreground service with a persistent notification ("MileClear is tracking your shift").
- Limitation: iOS throttles background location aggressively. Accuracy may drop when the app is backgrounded for long periods.

**Option B: react-native-background-geolocation (transistorsoft)**
- The gold-standard library for background location in React Native.
- Handles all the platform-specific battery optimisation, motion detection, and activity recognition.
- Significantly more reliable on iOS than expo-location alone.
- Cost: ~$300 one-time licence for production use.
- Recommendation: Start with Option A. If iOS reliability isn't good enough, invest in Option B.

**Tracking flow:**

```
Shift started
  → Start background location updates (high accuracy, 10-50m intervals)
  → Log coordinates to local SQLite
  → Detect stops (speed = 0 for > 2 minutes) to segment individual trips within a shift
  → On shift end, process raw coordinates into trips (route, distance, duration)
  → Sync to API when online

Outside shift (trip detection)
  → Monitor for significant location changes (low power)
  → If movement detected at driving speed (>15mph sustained)
    → Send push notification: "Looks like you're driving. Start recording?"
    → If user taps yes → start shift and begin tracking
    → If user ignores → do nothing, don't drain battery
```

### Offline-First Sync Strategy

```
LOCAL (SQLite)                    REMOTE (MySQL on Pixelish)
┌─────────────────┐              ┌─────────────────┐
│ trips            │    sync →   │ trips            │
│ coordinates      │    sync →   │ trip_coordinates │
│ shifts           │    sync →   │ shifts           │
│ fuel_logs        │    sync →   │ fuel_logs        │
│ earnings         │    sync →   │ earnings         │
│ sync_queue       │             │                  │
└─────────────────┘              └─────────────────┘
```

- **All data writes go to local SQLite first.** The app never writes directly to the server.
- A **sync queue** table tracks what needs to be pushed to the API.
- When connectivity is available, the sync engine processes the queue in order.
- Conflict resolution: for trip data, **never overwrite or delete** — always keep both versions and flag for review.
- Sync status is visible in the UI: a small indicator showing "All synced" or "3 trips pending sync."
- The app is **fully functional offline.** Every feature except fuel prices and Open Banking works without a connection.

---

## Backend API (Fastify)

### Project Structure

```
mileclear-api/
├── src/
│   ├── server.ts              # Fastify server setup
│   ├── routes/
│   │   ├── auth/              # Login, register, verify, OAuth callbacks
│   │   ├── shifts/            # CRUD for shifts
│   │   ├── trips/             # CRUD for trips, sync endpoint
│   │   ├── vehicles/          # CRUD for vehicles
│   │   ├── fuel/              # Fuel prices, fuel logs
│   │   ├── earnings/          # Earnings CRUD, CSV upload, OCR
│   │   ├── gamification/      # Achievements, streaks, stats
│   │   ├── exports/           # Tax reports, accounting integrations
│   │   ├── billing/           # Stripe webhooks, subscription management
│   │   └── sync/              # Batch sync endpoint for offline data
│   ├── middleware/
│   │   ├── auth.ts            # JWT verification middleware
│   │   ├── rateLimit.ts       # Rate limiting (Redis-backed or in-memory)
│   │   └── premium.ts         # Premium feature gating
│   ├── services/
│   │   ├── auth.ts            # Password hashing, JWT generation, OAuth
│   │   ├── mileage.ts         # HMRC rate calculations, distance computation
│   │   ├── fuel.ts            # Fuel price API fetching and caching
│   │   ├── ocr.ts             # Screenshot processing (server-side fallback)
│   │   ├── openBanking.ts     # TrueLayer integration
│   │   ├── email.ts           # Resend / Nodemailer
│   │   ├── export.ts          # PDF/CSV generation
│   │   └── gamification.ts    # Achievement logic, streak tracking
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client instance
│   │   ├── redis.ts           # Redis client (with in-memory fallback)
│   │   └── haversine.ts       # Distance calculation between coordinates
│   └── types/                 # Shared TypeScript types
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Migration files
└── package.json
```

### API Endpoints Overview

```
Authentication
  POST   /auth/register          # Email + password registration
  POST   /auth/login             # Email + password login
  POST   /auth/verify            # Email verification
  POST   /auth/forgot-password   # Password reset request
  POST   /auth/reset-password    # Password reset
  POST   /auth/apple             # Apple Sign-In callback
  POST   /auth/google            # Google Sign-In callback
  POST   /auth/refresh           # Refresh JWT token

Shifts
  POST   /shifts                 # Start a shift
  PATCH  /shifts/:id             # End a shift
  GET    /shifts                 # List shifts (paginated)
  GET    /shifts/:id             # Get shift detail

Trips
  GET    /trips                  # List trips (paginated, filterable)
  GET    /trips/:id              # Get trip detail with coordinates
  POST   /trips                  # Manual trip entry
  PATCH  /trips/:id              # Update classification, notes, platform tag
  DELETE /trips/:id              # Delete a trip

Sync
  POST   /sync/push              # Batch upload offline data (trips, coordinates, shifts)
  GET    /sync/status             # Check what needs syncing

Vehicles
  POST   /vehicles               # Add a vehicle
  GET    /vehicles               # List user's vehicles
  PATCH  /vehicles/:id           # Update vehicle
  DELETE /vehicles/:id           # Remove vehicle
  GET    /vehicles/lookup        # MPG lookup by make/model/year

Fuel
  GET    /fuel/prices            # Nearby fuel prices (lat, lng, radius, fuel type, brand)
  POST   /fuel/logs              # Log a fuel fill-up
  GET    /fuel/logs              # Fuel fill-up history

Earnings
  POST   /earnings               # Manual entry
  POST   /earnings/csv           # CSV upload + parse
  POST   /earnings/ocr           # Screenshot upload + OCR
  GET    /earnings               # Earnings history
  POST   /earnings/open-banking  # Connect TrueLayer
  GET    /earnings/open-banking  # Fetch latest transactions

Gamification
  GET    /gamification/stats     # Current streaks, milestones, totals
  GET    /gamification/achievements # All achievements
  GET    /gamification/scorecard # Daily/weekly scorecard

Exports (Premium)
  GET    /exports/self-assessment # Generate HMRC Self Assessment report
  GET    /exports/csv            # Export trips as CSV
  GET    /exports/pdf            # Export trips as PDF
  POST   /exports/xero           # Push to Xero
  POST   /exports/freeagent      # Push to FreeAgent
  POST   /exports/quickbooks     # Push to QuickBooks

Billing
  POST   /billing/webhook        # Stripe webhook receiver
  GET    /billing/status         # Current subscription status
  POST   /billing/checkout       # Create Stripe checkout session
  POST   /billing/cancel         # Cancel subscription

User
  GET    /user/profile           # Get user profile
  PATCH  /user/profile           # Update profile
  GET    /user/export            # GDPR data export
  DELETE /user/account           # GDPR account deletion
```

---

## Authentication System

### How It Works

```
┌──────────────┐     POST /auth/register      ┌──────────────┐
│  Mobile App  │  ──────────────────────────→  │  Fastify API │
│  or Web App  │                               │              │
│              │  ←──────────────────────────  │  bcrypt hash │
│              │     { accessToken, refresh }   │  store in DB │
└──────────────┘                               └──────────────┘
       │
       │  All subsequent requests include:
       │  Authorization: Bearer <accessToken>
       │
       ▼
  API verifies JWT → extracts user_id → queries only that user's data
```

| Component | Implementation |
|-----------|----------------|
| Password hashing | bcrypt (12 salt rounds) |
| Tokens | JWT with short-lived access tokens (15 min) + long-lived refresh tokens (30 days) |
| Token storage (mobile) | Expo SecureStore (encrypted keychain) |
| Token storage (web) | HttpOnly secure cookies |
| Apple Sign-In | Verify Apple identity token server-side, create/link account |
| Google Sign-In | Verify Google ID token server-side, create/link account |
| Email verification | Send verification code via Resend, verify before allowing login |
| Password reset | Time-limited reset token sent via email |
| Rate limiting | 5 login attempts per 15 minutes per IP (Redis or in-memory) |

### Refresh Token Flow

```
Access token expires (15 min)
  → Mobile/web detects 401 response
  → Sends refresh token to POST /auth/refresh
  → API verifies refresh token, issues new access + refresh tokens
  → Original request is retried automatically
  → If refresh token is also expired → redirect to login
```

---

## Database Schema (MySQL)

### Prisma Schema

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id                String    @id @default(uuid())
  email             String    @unique
  passwordHash      String?   // Null for OAuth-only accounts
  displayName       String?
  emailVerified     Boolean   @default(false)
  appleId           String?   @unique
  googleId          String?   @unique
  isPremium         Boolean   @default(false)
  premiumExpiresAt  DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  vehicles       Vehicle[]
  shifts         Shift[]
  trips          Trip[]
  fuelLogs       FuelLog[]
  earnings       Earning[]
  achievements   Achievement[]
  mileageSummary MileageSummary[]
  refreshTokens  RefreshToken[]

  @@map("users")
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique @db.VarChar(500)
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}

model Vehicle {
  id           String  @id @default(uuid())
  userId       String
  make         String
  model        String
  year         Int?
  fuelType     String  // petrol, diesel, electric, hybrid
  vehicleType  String  // car, motorbike, van
  estimatedMpg Float?
  actualMpg    Float?
  isPrimary    Boolean @default(true)
  createdAt    DateTime @default(now())

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  shifts Shift[]
  trips  Trip[]
  fuelLogs FuelLog[]

  @@map("vehicles")
}

model Shift {
  id        String    @id @default(uuid())
  userId    String
  vehicleId String?
  startedAt DateTime
  endedAt   DateTime?
  status    String    @default("active") // active, completed
  createdAt DateTime  @default(now())

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  vehicle Vehicle? @relation(fields: [vehicleId], references: [id])
  trips   Trip[]

  @@map("shifts")
}

model Trip {
  id             String    @id @default(uuid())
  userId         String
  shiftId        String?
  vehicleId      String?
  startLat       Float
  startLng       Float
  endLat         Float?
  endLng         Float?
  startAddress   String?
  endAddress     String?
  distanceMiles  Float
  startedAt      DateTime
  endedAt        DateTime?
  isManualEntry  Boolean   @default(false)
  classification String    @default("business") // business, personal
  platformTag    String?   // uber, deliveroo, just_eat, etc.
  notes          String?   @db.Text
  routePolyline  String?   @db.LongText
  createdAt      DateTime  @default(now())
  syncedAt       DateTime?

  user        User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  shift       Shift?            @relation(fields: [shiftId], references: [id])
  vehicle     Vehicle?          @relation(fields: [vehicleId], references: [id])
  coordinates TripCoordinate[]

  @@index([userId, startedAt])
  @@index([userId, classification])
  @@map("trips")
}

model TripCoordinate {
  id         String   @id @default(uuid())
  tripId     String
  lat        Float
  lng        Float
  speed      Float?
  accuracy   Float?
  recordedAt DateTime

  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)

  @@index([tripId, recordedAt])
  @@map("trip_coordinates")
}

model FuelLog {
  id              String   @id @default(uuid())
  userId          String
  vehicleId       String?
  litres          Float
  costPence       Int
  stationName     String?
  odometerReading Float?
  loggedAt        DateTime @default(now())

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  vehicle Vehicle? @relation(fields: [vehicleId], references: [id])

  @@map("fuel_logs")
}

model Earning {
  id          String   @id @default(uuid())
  userId      String
  platform    String   // uber, deliveroo, just_eat, amazon_flex, etc.
  amountPence Int
  periodStart DateTime @db.Date
  periodEnd   DateTime @db.Date
  source      String   // manual, csv, open_banking, ocr
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, periodStart])
  @@map("earnings")
}

model Achievement {
  id         String   @id @default(uuid())
  userId     String
  type       String   // milestone_1000_miles, streak_30_days, etc.
  achievedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, type])
  @@map("achievements")
}

model MileageSummary {
  id             String   @id @default(uuid())
  userId         String
  taxYear        String   // e.g., '2026-27'
  totalMiles     Float    @default(0)
  businessMiles  Float    @default(0)
  deductionPence Int      @default(0)
  updatedAt      DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, taxYear])
  @@map("mileage_summaries")
}
```

### Database Indexes

Key indexes for performance (defined in schema above plus additional):
- `trips(userId, startedAt)` — fast trip listing sorted by date.
- `trips(userId, classification)` — quick filter for business vs personal.
- `trip_coordinates(tripId, recordedAt)` — fast coordinate retrieval in order.
- `earnings(userId, periodStart)` — earnings date range queries.

### Distance Calculations (Haversine)

Without PostGIS, distance calculations are done in application code:

```typescript
// lib/haversine.ts
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
```

Used for:
- Calculating trip distances from GPS coordinates.
- Finding nearby fuel stations.
- Detecting trip start/stop (distance from last known position).

---

## Web Dashboard Architecture (Next.js)

### Project Structure

```
mileclear-web/
├── app/
│   ├── page.tsx              # Landing page (public)
│   ├── login/page.tsx        # Login page
│   ├── register/page.tsx     # Registration page
│   ├── dashboard/
│   │   ├── page.tsx          # Main dashboard
│   │   ├── trips/page.tsx    # Trip history with map
│   │   ├── earnings/page.tsx # Earnings overview
│   │   ├── exports/page.tsx  # Tax exports and integrations
│   │   └── settings/page.tsx # Account, vehicle, preferences
│   └── layout.tsx            # Root layout with nav
├── components/
│   ├── landing/              # Landing page components
│   ├── dashboard/            # Dashboard components
│   ├── auth/                 # Login/register forms
│   └── ui/                   # Shared UI components
├── lib/
│   ├── api.ts                # API client (talks to Fastify backend)
│   ├── auth.ts               # Auth helpers (cookie management)
│   └── utils.ts              # Helpers
└── public/                   # Static assets
```

### Landing Page

- Public page at mileclear.com.
- Login button top right.
- Dropdown navigation menu top right.
- Mobile app download links (App Store, Google Play).
- Clear value proposition, feature overview.
- Built with Next.js App Router for SEO.

### Dashboard

- Protected routes (redirect to login if not authenticated).
- Calls the same Fastify API as the mobile app.
- Responsive design — works on desktop and mobile browsers.

---

## Third-Party Services

### Fuel Prices

- **Source:** UK government open data (BEIS) and/or third-party APIs.
- Cache prices in Redis (or in-memory) and refresh every few hours.
- Filter by fuel type and driver's preferred brand.

### Vehicle Data (MPG Estimates)

- **Source:** Government fuel economy data / vehicle databases.
- Store a lookup table in MySQL of common makes/models and their rated MPG.
- Update periodically.

### Open Banking

- **Provider:** TrueLayer (UK-based, FCA regulated, good developer experience).
- Free to integrate and test. Pay-per-connection at scale.
- Detects incoming payments from known gig platforms (Uber, Deliveroo, etc.).
- Fully optional — the app works without it.

### OCR (Screenshot Reading)

- **Primary:** Google ML Kit (on-device in mobile app). Free, fast, works offline.
- **Fallback:** Server-side OCR via Google Cloud Vision API (1,000 requests/month free).
- Process screenshots of gig app earnings screens to extract totals.

### Tax/Accounting Exports

- **Self Assessment:** Generate PDF and CSV reports matching HMRC requirements.
- **Xero:** REST API integration.
- **FreeAgent:** REST API integration.
- **QuickBooks:** REST API integration.
- All integrations are premium features.

---

## Payment Processing

- **Stripe** for web subscription management.
- Handles £4.99/month recurring billing.
- Supports Apple Pay, Google Pay, and card payments.
- Webhook endpoint at `POST /billing/webhook` — Stripe events update `isPremium` flag in the database.
- For iOS: Apple In-App Purchases (required by Apple — 30% cut, drops to 15% after year 1).
- For Android: Google Play Billing (required by Google — 15% cut for subscriptions).
- Web users pay via Stripe directly (no platform cut — just Stripe's ~2.5% + 20p).

---

## Security

| Area | Approach |
|------|----------|
| Authentication | Custom JWT with bcrypt password hashing. Short-lived access tokens (15 min) + refresh tokens (30 days). |
| Authorisation | Every API endpoint verifies JWT and scopes queries to `userId`. No user can access another user's data. |
| Data in transit | HTTPS everywhere via SSL/Let's Encrypt on the Pixelish server. |
| Data at rest | MySQL encryption at rest (if available on server). Sensitive fields (Open Banking tokens) encrypted at application level with AES-256. |
| API keys | Stored in environment variables (.env), never committed to source control. |
| Location data | Stored with sufficient precision for route tracking. Not exposed at house-level in any shared/public context. |
| Rate limiting | Redis-backed (or in-memory) rate limiting on auth endpoints and API. |
| CORS | Strict CORS policy — only mileclear.com and the mobile app can call the API. |
| Input validation | Zod schema validation on all API inputs via Fastify. |
| SQL injection | Prisma ORM — parameterised queries by default, no raw SQL unless explicitly needed. |
| File uploads | Validated file types, size limits, virus scanning if feasible. |

---

## Monitoring & Error Tracking

- **Sentry** (free tier) for crash reporting and error tracking on mobile, web, and API.
- **PM2 monitoring** for server process health and logs.
- **UptimeRobot** (free) for uptime monitoring of the API and web dashboard.
- **DBeaver** for database management, inspection, and manual queries (connected directly to the server).

---

## Development Workflow

### Monorepo Structure

```
MileClear/
├── apps/
│   ├── mobile/              # Expo / React Native app
│   ├── web/                 # Next.js web dashboard
│   └── api/                 # Fastify backend API
├── packages/
│   └── shared/              # Shared types, constants, utilities
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── migrations/          # Migration files
├── .env.example             # Environment variable template
├── .gitignore
├── package.json             # Root workspace config (pnpm workspaces)
├── PRODUCT_SPEC.md
└── TECHNICAL_ARCHITECTURE.md
```

Using **pnpm workspaces** so shared types and logic between mobile, web, and API live in one place.

### Development Tools

| Tool | Purpose |
|------|---------|
| TypeScript | Type safety across the entire codebase. |
| ESLint + Prettier | Consistent code formatting. |
| Prisma CLI | Database migrations and schema management. |
| Expo CLI | Mobile app development and builds. |
| pnpm | Fast, disk-efficient package manager with workspace support. |
| Git | Version control. |

### Local Development

```
# Terminal 1: API
cd apps/api && pnpm dev          # Fastify with hot reload (port 3001)

# Terminal 2: Web
cd apps/web && pnpm dev          # Next.js dev server (port 3000)

# Terminal 3: Mobile
cd apps/mobile && pnpm start     # Expo dev server
```

Local MySQL for development (via Docker, MAMP, or connecting to a dev database on the server).

### Deployment

- **API:** SSH to server → git pull → pnpm install → prisma migrate → PM2 restart.
- **Web:** SSH to server → git pull → pnpm install → next build → PM2 restart.
- **Mobile:** Expo EAS Build → TestFlight (iOS) / Internal Testing (Android) → App Store / Play Store.
- **Database:** Prisma migrations via `npx prisma migrate deploy`.

Can be scripted into a simple deploy.sh later.

---

## Scaling Path

| Trigger | Action |
|---------|--------|
| Server resources constrained | Discuss with James, or move API to a VPS (~£5-10/month). |
| Database performance issues | Add indexes, optimise queries, consider read replicas. |
| Coordinate data gets massive | Archive old coordinates (keep trip summaries), or partition the table by date. |
| Background tracking unreliable on iOS | Invest in transistorsoft library (~$300 one-time). |
| Email volume > 3,000/month | Upgrade Resend plan ($20/month). |
| Open Banking at scale | TrueLayer pay-per-use kicks in. |
| 50,000+ users | Consider dedicated server or managed database. |

The architecture scales vertically first (server resources) and horizontally later (read replicas, CDN, separate services) only when needed.
