# 1.2.0 build 63 — App Store Connect submission

Copy-paste source for App Store Connect. The four sections below map
directly to the fields in the version metadata + TestFlight pages.
Support URL + Privacy Policy URL live in dedicated ASC fields — don't
duplicate them in the Description body.

Version: **1.2.0**
Build: **63**
Target: **TestFlight beta + App Store Review**
Submitted: **<fill in when uploaded>**

---

## Promotional Text (max 170 chars)

Quarterly Self Assessment direct to HMRC. Road-snapped trip maps. Smart auto-classify. Invoice tracker. PAYE-aware tax. The tax-time co-pilot just grew up.

---

## Description (update — keep existing intro, swap the "what's new" feature list)

> Leave the existing app description preamble intact (the "MileClear is the UK mileage tracker built for gig workers..." opener). Replace the lower "Features" bullet list with the version-current set below if you want to refresh it.

**Free, forever:**
- GPS auto-trip tracking, manual trips, and full HMRC AMAP calculation (45p/25p tier)
- Tax Readiness card — real-time tax + NI estimate with PAYE offset for mixed-mode users
- HMRC Reconciliation, MOT + Tax expiry reminders, fuel logs, nearby fuel prices
- Self Assessment SA103 box mapping (PDF is Pro)
- Achievements, streaks, weekly + monthly recaps
- All 18 milestone badges
- 1 vehicle, 2 saved locations, 3 invoices per month

**With Pro (£4.99/mo or £36/year):**
- Quarterly Self Assessment submitted direct to HMRC (MTD ITSA)
- HMRC self-assessment PDF, CSV exports, accounting integrations
- Unlimited invoice tracking with cash/accruals tax basis
- Open Banking auto-import via TrueLayer
- Auto-classify rules driven by your work schedule
- Business Insights, Driving Analytics, Pickup Wait community data
- Journey Map, unlimited saved locations + vehicles
- Accountant Sharing (read-only dashboard for your accountant)

---

## What's New (max ~4000 chars; users see the first paragraph above the fold)

**1.2.0 — the everything release**

The headline: you can now submit your quarterly HMRC Self Assessment directly from MileClear, your trip maps show the actual roads you drove (not GPS jitter), and a brand-new invoice tracker keeps every freelance payment in order ready for your accountant.

**HMRC quarterly submissions (Pro)** — Connect your HMRC account, confirm your trade, preview each quarterly update against your mapped MileClear figures, and submit. Headline figures cross-check against HMRC's own calculation engine so you see the marginal-rate breakdown before it's locked in. Built for the 7 August 2026 first-quarter deadline.

**Road distances that are actually accurate** — Manual trip A→B now uses our self-hosted UK routing engine. The same address pair always returns the same mileage, every time. Auto-tracked trips get road-snapped polylines so the map shows your actual route, not a GPS-jittered approximation.

**Smarter trip classification** — When you've done the same A→B journey three times tagged as Work, the fourth auto-classifies. Stops you tapping the same dropdowns over and over.

**Invoices for freelancers and sole traders** — Track who owes you, when invoices were sent, what's been paid. Free tier covers 3 invoices per month; Pro is unlimited. Cash basis (the default since April 2024) means Tax Readiness only counts income that's actually arrived.

**PAYE deductions counted properly** — If you have a salaried day job alongside gig work, you can now tell MileClear what your employer's already deducted. The "still owed" figure on Tax Readiness becomes honest instead of double-counting.

**Confidence indicator on every trip** — High / medium / low badge with tap-to-expand reasons. HMRC-defence material — every claimed mile is auditable.

**One-tap data-quality recheck** — Settings → Data Quality → Recheck suspicious trips. We scan your history, find anything with sparse GPS or unverified distances, and re-route through the new engine.

**Live Activity context band** — Lock screen during a trip now shows today's total miles, your next mileage milestone, and (for shift workers) today's earnings tally.

**Heartbeat alerts that catch silent failures** — If iOS turns off your background location or background app refresh, the app now pushes you a one-tap fix before you notice trips have stopped recording.

Plus dozens of smaller polish items: post-trip review card, trip-merge suggestion for fuel stops, confidence dots on the trips list, route provenance shown to the user, the public release-notes page at mileclear.com/releases, and the new pre-push CI gate so future builds break before they ship instead of after.

---

## What to Test (TestFlight)

Two big things, plus the polish layer.

**1. HMRC MTD ITSA flow (Pro tier)**
- Settings → Work & Tax → MTD ITSA → Connect to HMRC
- Complete the OAuth handshake in the in-app browser
- Enter your NINO when prompted
- Confirm your self-employment trade
- Tap an open obligation → "Review submission"
- Verify the preview shows reasonable income/mileage/expense breakdown
- DO NOT submit — sandbox-only for now
- Confirm Disconnect works

**2. Manual trip routing**
- Add a manual trip with both start + end (e.g. your usual A→B commute)
- Distance should show "Route distance via road" or "...cached"
- Repeat the same A→B as a second trip — should be the same exact mileage
- Trip detail map should show a clean road-snapped route, not a straight line

**3. Auto-classify pattern learning**
- Save a manual trip tagged "Work" between two addresses you've used before
- After 3+ similar saves, the 4th attempt should pre-fill "Work" automatically
- Toast confirms it: "Auto-classified as Work — based on 5 similar trips"

**4. Invoice tracker**
- Settings → Work & Tax → Sole Trader → Invoices → "+"
- Create an invoice (company name, amount, sent date)
- Mark it paid — Tax Readiness should reflect the new income (cash basis only)
- Free users: try to add a 4th invoice in the current month → should hit the paywall

**5. PAYE tax offset**
- Settings → Work & Tax → "Tax already deducted" (visible only for employee / both work types)
- Enter a figure (e.g. £3,000)
- Tax Readiness "estimated tax" figure should drop by that amount

**6. Confidence + Recheck**
- Open any older trip → confidence badge at bottom (high / medium / low)
- Tap to expand — reasons should be sensible
- Settings → Data Quality → Recheck suspicious trips → should scan + offer to fix

**7. Live Activity**
- Start a manual trip and drive — Lock Screen should show distance + speed
- After a few miles, a context line should appear: "TODAY 14.2 mi" or "NEXT 5.4 mi to 10K Club"

---

## App Review notes (for App Review team)

Demo account: `demo@mileclear.com` / `MileClear2026!`

This build adds HMRC's Making Tax Digital for Income Tax Self Assessment (MTD ITSA) integration. The MTD flow lives behind a Pro paywall and connects to HMRC's official OAuth sandbox. No real tax submissions happen from the demo account — the sandbox returns synthetic data.

The new in-app purchase product is unchanged: monthly subscription at £4.99/mo or yearly at £36/year (StoreKit configured in App Store Connect).

The invoice tracker (free tier: 3 invoices per calendar month) demonstrates how the upgrade path surfaces. Try creating a 4th invoice in the demo account — the paywall fires with a clear upgrade prompt.

Support: support@mileclear.com
Privacy policy: https://mileclear.com/privacy
Terms: https://mileclear.com/terms

---

## Post-approval checklist

When Apple approves:
- [ ] Flip `1.2.0` label in `packages/shared/src/data/releaseNotes.ts` from `"Pending Review"` → `"Latest"`
- [ ] Demote `1.1.4` label from `"App Store"` → `"App Store"` (no change — already correct)
- [ ] Send Product Update email via /admin → Send Update flow (auto-renders from RELEASE_NOTES)
- [ ] Post to Facebook + Instagram (memory: drafts live in `docs/social-posts-X.X.X-build-NN.md`)
- [ ] Reply to Laura confirming her two features shipped (invoice tracker + PAYE tax-paid)
- [ ] Update https://mileclear.com/releases label
