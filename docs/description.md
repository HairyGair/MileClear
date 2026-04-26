## MileClear

**Tagline:** Smart mileage tracking for UK drivers — from gig workers to everyday commuters.

**Description:**
MileClear is a full-stack mileage tracking platform I built for UK gig workers (Uber, Deliveroo, Amazon Flex, etc.), self-employed drivers, and personal drivers. It automatically tracks journeys via GPS, calculates HMRC tax deductions, and makes self-assessment effortless. Freemium model — free tracking with gamification, £4.99/mo premium for HMRC exports, earnings tracking, and analytics.

**Key Features:**
- Automatic GPS trip tracking with background location and stop detection
- HMRC-compliant mileage deduction calculations (45p/25p car rates, 24p motorbike)
- Work and Personal driving modes
- Shift management for gig workers with per-shift scorecards
- Earnings tracking with CSV import and Open Banking (Plaid) integration
- Real-time UK fuel prices from 13 government retailer feeds
- DVLA vehicle registration lookup
- PDF/CSV tax exports and HMRC self-assessment reports
- Gamification system with 18 achievements, streaks, personal records, and weekly recaps
- Stripe subscription billing
- Full admin dashboard with analytics
- Offline-first architecture — works without signal, syncs when back online
- Apple Sign-In and Google Sign-In
- GDPR-compliant data export and account deletion

**Tech Stack:**
- **Mobile:** React Native + Expo SDK 54, Expo Router v6, expo-sqlite (offline-first), expo-location + expo-task-manager (background GPS)
- **Web:** Next.js 15 (App Router), React 19, pure CSS design system
- **API:** Fastify 5, Prisma 6, MySQL, Zod validation
- **Auth:** Custom JWT + bcrypt + Apple/Google OAuth
- **Payments:** Stripe (Checkout Sessions + webhooks)
- **Exports:** PDFKit for PDF generation, custom CSV builder
- **Infrastructure:** TypeScript monorepo (pnpm workspaces), shared types/utils package, self-hosted on Linux (PM2 + Apache reverse proxy)
- **Other:** Brevo SMTP email, Expo Push API, Plaid Open Banking, UK Gov fuel data feeds

**Links:**
- **Live site:** https://mileclear.com
- **API:** https://api.mileclear.com

**Branding & Colour Scheme:**
- Primary accent: Amber `#f5a623` (logo, CTAs, highlights)
- Background: Dark navy `#030712`
- Amber gradient range: `#fcd34d` → `#eab308`
- Success: Emerald `#10b981`
- Danger: Red `#ef4444`
- The logo is a hand-brushed "M" with a road/dashed-line motif running through it, amber on dark navy. The wordmark reads "Mile" (white) + "Clear" (amber).

**Branding assets (pick the ones that suit the portfolio layout):**

| Asset | Path | Use for |
|-------|------|---------|
| App icon (square) | `apps/mobile/assets/branding/icon.png` | Project card thumbnail |
| Logo (original, large) | `apps/mobile/assets/branding/logo-original.png` | Hero/detail section |
| Wordmark (dark bg) | `apps/mobile/assets/branding/wordmark-dark.png` | On dark portfolio sections |
| Wordmark (light bg) | `apps/mobile/assets/branding/wordmark-light.png` | On light portfolio sections |
| Small icon (120x120) | `apps/mobile/assets/branding/logo-120x120.png` | Inline/small displays |

**App screenshots (iPad Pro mockups, 2752x1536):**

| Screenshot | Path | Shows |
|------------|------|-------|
| Dashboard | `apps/mobile/assets/appstore-screenshots/01-dashboard.png` | Main dashboard with map, stats, achievements |
| Trips | `apps/mobile/assets/appstore-screenshots/02-trips.png` | Trip list with business/personal tags |
| Fuel | `apps/mobile/assets/appstore-screenshots/03-fuel.png` | Fuel tracking |
| Earnings | `apps/mobile/assets/appstore-screenshots/04-earnings.png` | Earnings by platform |
| Profile | `apps/mobile/assets/appstore-screenshots/05-profile.png` | Profile with avatar picker |
| Sign In | `apps/mobile/assets/appstore-screenshots/06-signin.png` | Auth screen with Apple/Google |
