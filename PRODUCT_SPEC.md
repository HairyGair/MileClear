# MileClear - Product Specification

## Implementation Status

> Last updated: 19 Feb 2026

### Fully Implemented
- **Shift Mode** — Start/end shifts, one-at-a-time enforcement, vehicle selection (API + mobile)
- **Trip Tracking** — Full CRUD with Haversine distance calculation, classification, platform tagging, notes, pagination, filtering (API + mobile)
- **Vehicle Profiles** — Full CRUD with make/model/year, fuel type, vehicle type, primary toggle, multi-vehicle (API + mobile)
- **Earnings Tracking (Manual)** — Create/edit/delete earnings, platform tagging, paginated history (API + mobile)
- **Tax Exports (Premium)** — CSV trip download, PDF trip report, Self-Assessment PDF with HMRC rate tiers and vehicle breakdown (API + web + mobile)
- **Accounting Previews** — Xero, FreeAgent, QuickBooks formatted data previews (coming_soon status, OAuth deferred) (API + web + mobile)
- **Authentication** — Email/password register, login, JWT refresh/logout, rate limiting (API + mobile)
- **User Profile** — Edit profile, GDPR data export, account deletion with password confirmation (API + mobile)
- **Waitlist** — Email signup with driver type, duplicate handling (API + web landing page)
- **Landing Page** — Full 9-section page: hero, problem, features, who it's for, pricing, early access signup, FAQ, footer (web)
- **Shared Package** — All types, HMRC constants, Haversine, tax year utilities, formatters
- **Premium Middleware** — Feature gating via `isPremium` flag + expiry check
- **Database** — 10-model MySQL schema deployed via Prisma, all indexes

### Partially Implemented
- **Auth** — Email verify, forgot/reset password, Apple Sign-In, Google Sign-In all stubbed (501)
- **Dashboard (Mobile)** — Shift controls work, but stats cards show hardcoded "0.0 mi" (not wired to real trip data)
- **Earnings** — CSV upload, OCR, Open Banking all stubbed (501)

### Not Yet Started (Stubbed / Placeholder)
- **Fuel Prices** — All routes return 501, service returns empty array, mobile screen is placeholder
- **Gamification** — All routes return 501, service is a no-op, no achievement logic
- **Billing / Stripe** — All routes return 501, no Stripe integration
- **Offline Sync** — All routes return 501, no sync engine
- **Background Location Tracking** — expo-location/expo-task-manager not wired up
- **Smart Trip Detection** — No push notification for unrecorded driving
- **Reminders & Nudges** — Not started
- **Email Service** — Resend not wired (verification, password reset, waitlist confirmation all no-ops)
- **Web Dashboard Pages** — Dashboard, trips, earnings, settings, login, register are all placeholders (just h1 tags)
- **Mobile Email Verify Screen** — Placeholder

---

## Overview

MileClear is a UK-based mileage tracking app for gig workers, delivery drivers, and professional drivers. The core value proposition is **trust through reliability** — bulletproof trip tracking that never misses a mile, with smart insights that make driving more rewarding.

**Target audience (Phase 1):** UK gig workers and delivery drivers (Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, Gophr, DPD, Yodel, Evri). Broad enough to serve any professional driver, not limited to gig platforms.

**Supported vehicles (Phase 1):** Cars, motorbikes, and vans. Bicycle and e-bike support deferred to a later phase.

---

## Platforms

| Platform | Scope |
|----------|-------|
| iOS | Full-featured mobile app |
| Android | Full-featured mobile app |
| Web | Dashboard with landing page, login (top right), dropdown navigation menu, full trip/analytics access |

All three platforms at launch. Mobile is the primary experience; web is for reviewing data, exports, and account management.

---

## Core Features

### 1. Shift Mode (Primary Tracking)

**How it works:**
- Driver taps **"Start Shift"** to begin recording. All trips within the shift are tracked automatically with no further interaction required.
- Driver taps **"End Shift"** to stop recording.
- GPS tracking runs continuously during a shift, logging routes, distances, timestamps, and stop durations.

**Outside of shift — Smart Trip Detection:**
- When the app detects vehicle movement outside of an active shift, it sends a push notification: *"Looks like you're driving. Start recording?"*
- Tapping the notification starts a shift immediately.
- This catches forgotten shift starts without requiring always-on tracking (better for battery and GDPR compliance).

**Offline Support (Critical):**
- All trip data is recorded and stored locally on-device first.
- Data syncs to the cloud when a connection is available.
- No trip data is ever lost due to poor signal. The app must function fully offline.
- Sync status is visible to the driver — they can see exactly which trips have synced and which are pending.

### 2. Vehicle Profile

**Onboarding:**
- Driver registers their vehicle: make, model, year, fuel type (petrol, diesel, electric, hybrid), and vehicle category (car, motorbike, van).
- App pulls estimated MPG/fuel economy from government/manufacturer data based on make and model.

**Over time:**
- As the driver logs fuel fill-ups, the app calculates their **actual MPG** from real trip data + fuel inputs.
- Shows comparison: estimated vs actual efficiency.
- Supports **multi-vehicle profiles** — drivers who switch between a car and a van, or share with a partner.

### 3. Fuel Prices

- Display local fuel prices using UK fuel price data (government sources / third-party APIs).
- Show nearest stations with current prices.
- Suggest the cheapest station near the driver's current location or route.
- **Fuel brand preference:** Driver can set a preferred brand (Shell, BP, Esso, Tesco, etc.) and the app prioritises those stations.
- **Fuel type filtering:** Results filtered to the driver's vehicle fuel type (petrol, diesel, etc.).

### 4. Earnings Tracking (Optional)

Drivers can opt in to earnings tracking. The app must be **fully functional and appealing** even if the driver chooses not to use this feature.

**Input methods (all optional, driver chooses what suits them):**

| Method | Description |
|--------|-------------|
| **Manual CSV upload** | Driver exports earnings from their gig platform and uploads to MileClear. Available at launch. |
| **Open Banking** | Integration via TrueLayer or similar UK provider. Auto-detects payments from gig platforms hitting the driver's bank account. Fully optional — the app works completely without it. |
| **Screenshot OCR** | Driver takes a screenshot of their earnings screen in any gig app. MileClear reads and extracts the data. |

**Privacy-first approach:**
- Open Banking is entirely opt-in with clear explanation of what data is accessed.
- Driver can revoke access at any time.
- Earnings data can be deleted independently of trip data.
- The app must never feel like it's pressuring the driver to connect their bank.

**Insights (for drivers who opt in):**
- Real hourly rate (earnings minus fuel, mileage costs, and vehicle wear).
- Profitability per platform (if multi-apping).
- Dead miles tracking (miles driving to a pickup vs miles on a delivery).
- Daily/weekly/monthly earnings breakdown.

### 5. Gamification

Available to **all users (free tier).**

| Feature | Description |
|---------|-------------|
| **Streaks** | Consecutive days/weeks with all trips logged. |
| **Milestones** | 1,000 miles, 5,000 miles, 10,000 miles, etc. Visual badges. |
| **Daily scorecard** | End-of-shift summary: trips completed, miles driven, estimated deductions saved. |
| **Weekly/monthly recaps** | "Wrapped" style summaries. Total miles, busiest day, longest trip, total tax savings. Shareable. |
| **Tax savings counter** | Running total always visible: "You've saved an estimated X in deductions this year." |
| **Personal records** | Most miles in a day, most trips in a shift, longest streak, most efficient shift. |

### 6. Trip Classification & Audit Protection (Premium)

**HMRC compliance:**
- Every trip is logged with: date, start time, end time, start location, end location, distance, route taken, vehicle used.
- Trips are automatically classified as business or personal based on whether they occurred during a shift.
- Drivers can add **trip notes** (voice or text): e.g., "Tesco delivery run, 14 parcels" or "Client meeting in Birmingham."

**Audit shield:**
- Dashboard shows which trips were auto-captured vs manually entered.
- Platform tagging: which gig app was active during the trip (if driver has enabled this).
- Evidence export: full HMRC-compliant report with trip-level detail, ready for Self Assessment.
- Data is tamper-evident — logged trips cannot be retroactively edited without a visible audit trail.

**Anti-abuse measures:**
- GPS route data is recorded, not just start/end points. Trips must have a plausible route.
- Anomaly detection: flag trips with impossible speeds, duplicate routes at the same time, or patterns that suggest fabrication.
- Manual entries are clearly marked as manual and held to the same evidence standards.

### 7. Tax & Accounting

**HMRC simplified mileage rates (auto-calculated):**
- Cars/vans: 45p per mile (first 10,000 miles), 25p per mile (after 10,000).
- Motorbikes: 24p per mile.
- Running total tracks where the driver is relative to the 10,000-mile threshold.

**Simplified vs actual costs comparison (Premium):**
- For drivers who log fuel and vehicle expenses, show which method (simplified mileage rate vs actual costs) would save them more on their Self Assessment.

**Exports and integrations (Premium):**
- Self Assessment-ready PDF and CSV export.
- Xero integration.
- FreeAgent integration.
- QuickBooks integration.
- Making Tax Digital (MTD) compatible.

### 8. Reminders & Nudges

- "You haven't started a shift today" (configurable time, e.g., 9am on weekdays).
- "You drove 3 times this week without recording" (if trip detection noticed unrecorded drives).
- "Tax year ends in 30 days — export your records."
- All reminders are configurable and can be turned off entirely.

---

## Freemium Model

### Free Tier
- Mileage tracking (shift mode + trip auto-detection prompts)
- Offline support and cloud sync
- Manual trip entry
- Basic trip history and dashboard
- Gamification (streaks, milestones, daily scorecards, tax savings counter, personal records, shareable recaps)
- Vehicle profile with estimated MPG
- Reminders and nudges

### Premium Tier (Subscription)
- HMRC-compliant export (Self Assessment-ready PDF/CSV)
- Xero / FreeAgent / QuickBooks integration
- MTD compatibility
- Earnings tracking (CSV upload, Open Banking, Screenshot OCR)
- Real hourly rate and profitability analytics
- Dead miles tracking
- Fuel price finder with brand preference
- Cost-per-trip calculation
- Simplified mileage vs actual costs comparison
- Audit protection (trip classification, evidence export, anti-abuse, trip notes)
- Advanced analytics (weekly/monthly deep reports, profitability by platform)
- Actual MPG tracking (from fuel fill-up logging)
- Multi-vehicle support

### Conversion Strategy
- Free users get hooked on reliable tracking and gamification.
- Tax season (January-March) is the primary conversion window — drivers need exports and compliance features.
- The tax savings counter on the free tier constantly reminds them what they'd claim if they upgrade.

---

## Web Dashboard

### Landing Page (Public)
- Clear value proposition: "The mileage tracker that actually works."
- Feature overview.
- Testimonials/social proof (post-launch).
- Download links (App Store, Google Play).
- **Login button** in the top right corner.
- **Dropdown navigation menu** in the top right (accessible pre and post login).

### Logged-In Dashboard
- Trip history with map view.
- Mileage totals and deduction estimates.
- Gamification stats and achievements.
- Earnings overview (if opted in).
- Export and integration management.
- Vehicle profile management.
- Account settings, data export, and account deletion.

---

## GDPR & Privacy

| Requirement | Implementation |
|-------------|----------------|
| **Consent** | Explicit opt-in for location tracking, Open Banking, and earnings data. No pre-ticked boxes. |
| **Data minimisation** | Location tracked only during shifts or when prompted. No always-on surveillance. |
| **Right to access** | Full data export available from account settings. |
| **Right to deletion** | Account and all associated data can be permanently deleted. |
| **Data storage** | UK or EU-based cloud infrastructure. No data stored in US regions. |
| **Transparency** | Clear, plain-English privacy policy. In-app explanations of what each feature accesses and why. |
| **Third-party data** | Open Banking data access can be revoked at any time. Earnings data deletable independently. |
| **Retention** | Trip data retained for 7 years (HMRC requirement for tax records) unless the driver requests deletion. |

---

## Key Metrics to Track

| Metric | Why It Matters |
|--------|----------------|
| Trip capture rate | % of detected trips that are successfully logged. This is the core reliability metric. |
| Shift start consistency | How often drivers remember to start shifts vs relying on auto-detection prompts. |
| Daily active users | Engagement and stickiness. |
| Free to premium conversion | Revenue health. |
| Tax season conversion spike | Effectiveness of the upsell strategy. |
| Churn rate (premium) | Are drivers staying after tax season? |
| NPS / app store rating | Trust and satisfaction — the brand depends on this. |

---

## Out of Scope (Phase 1)

- Bicycle and e-bike courier support.
- Direct API integration with gig platforms for earnings.
- Fleet management or employer features.
- International markets (UK only).
- In-app navigation or turn-by-turn directions.
- Social features (leaderboards, community).

---

## Pricing

- **Premium subscription:** £4.99/month (monthly only, no annual plan until reliability is proven).
- No free trial. App is free for all users during the beta/testing phase.
- Undercuts MileIQ while offering significantly more value.

## Authentication

- **Apple Sign-In** (required for iOS).
- **Google Sign-In.**
- **Email + password** with full email verification. Secure account creation flow with strong password requirements.

## Branding & Design

- To be developed iteratively during build.

## Beta Programme

- Recruit gig drivers for early testing once the app is built.
- Target communities: Reddit (r/deliveroos, r/UberEatsDrivers, r/couriersofreddit), X/Twitter, UK gig worker Facebook groups, TikTok/YouTube driver creators.

## Partnerships

- To explore post-launch: fuel brands, gig platforms, accounting software providers.
