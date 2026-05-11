# 1.2.0 build 64 — App Store Connect submission

Copy-paste source for App Store Connect. The four sections below map
directly to the fields in the version metadata + TestFlight pages.
Support URL + Privacy Policy URL live in dedicated ASC fields — don't
duplicate them in the Description body.

Version: **1.2.0**
Build: **64**
Target: **TestFlight beta**
Submitted: **<fill in when uploaded>**

Build 64 replaces build 63 of the same 1.2.0 version. Six tightly
scoped fixes that surfaced during the 1.2.0 smoke test on build 63.

---

## Promotional Text (max 170 chars)

Quarterly Self Assessment direct to HMRC. Road-snapped trip maps. Smart auto-classify. Invoice tracker. PAYE-aware tax. The tax-time co-pilot just grew up.

---

## Description

> 1.2.0 build 64 carries the same description as build 63. Leave the
> ASC Description field intact from the 63 submission. Update only
> What's New and What to Test for this build.

---

## What's New (max ~4000 chars)

> Keep the 1.2.0 build-63 "What's New" copy intact in App Store
> Connect. Builds 63 and 64 are the same 1.2.0 release; users only
> see one What's New entry per version. If you want to acknowledge
> the fixes, append the short paragraph below to the bottom.

**Build 64 fixes (TestFlight only):**

A handful of fixes from the 1.2.0 smoke test:

- **HMRC Connect button now works.** The 1.2.0 build opened the wrong
  URL and bounced you to a "Missing or invalid token" error. Fixed.
- **No more upsell modal for existing Pro members.** Pro users tracking
  their 5th trip were seeing a "Subscribe to Pro" pitch. Embarrassing.
  Won't happen again.
- **Paywall copy cleaned up.** Removed an outdated "Google account"
  reference, switched the deduction estimate to count only business
  miles (not personal), and dropped a marketing claim that wasn't
  defensible.
- **Lock Screen context band lights up.** When you've driven today and
  start a new shift, the Lock Screen Live Activity now shows TODAY's
  total miles, distance to the next mileage milestone, and (for shift
  workers) today's earnings tally. Swift code was in 1.2.0 but the
  data layer wasn't piping it through.
- **Beta · Sandbox banner on in-progress features.** The MTD ITSA and
  Open Banking screens now wear an honest "this is still in sandbox"
  marker so it's clear what's production-ready versus pre-launch.
- **Work & Tax shortcut in the avatar dropdown.** No more
  Profile -> Settings -> Work & Tax. One tap from any screen.

---

## What to Test (TestFlight)

**1. HMRC Connect (Pro)**
- Profile menu / avatar -> Work & Tax -> MTD ITSA card
- BetaBanner should be visible at the top ("Sandbox · Beta")
- Tap Connect to HMRC
- The in-app browser should open HMRC's sandbox login (URL contains
  `test-www.tax.service.gov.uk`) — not the api.mileclear.com error
- Sign in with any HMRC sandbox test user, approve the scopes
- Browser should close automatically, status should flip to Connected

**2. Pro paywall behaviour**
- As an existing Pro member, track or save your 5th trip
- The "Try risk-free" modal should NOT appear
- Free users should still see it once at 5 trips (one-time event)

**3. Paywall copy (free users only — Pro skips this entirely)**
- Sign in as a free account
- Force the paywall (Profile -> Pro features, or hit the 4th invoice cap)
- Slide 1 (Trust): the subheading should say "Apple ID settings" — no
  mention of Google
- Slide 2 (Value): the deduction figure should match your BUSINESS
  miles only (not your total miles)
- Slide 2: no "10x" claim in the footer copy

**4. Live Activity context band**
- Drive a manual or auto-tracked trip earlier in the day
- Then start a fresh shift from the dashboard
- Lock the phone
- Lock Screen Live Activity should show:
  - Top row: shift duration / 0.0 mi / 0 trips
  - Below it, a context band with TODAY · X.X mi and (if applicable)
    NEXT MILESTONE · Y mi and EARNED · £X.XX

**5. Avatar dropdown shortcut**
- Tap your avatar in the top-right of any tab
- Dropdown should include a "WORK & TAX" group: Work & Tax settings /
  Invoices / Work Schedule
- Each option deep-links straight into the right screen

---

## App Review notes (for App Review team)

Demo account: `demo@mileclear.com` / `MileClear2026!`

This is a maintenance / bug-fix release on top of 1.2.0. No new
features, no new in-app purchases, no new permission requests.

HMRC MTD ITSA is still in sandbox mode (we're awaiting HMRC's
production accreditation, ref 2026-IBW598). The "Sandbox · Beta"
banner on the MTD ITSA screen makes this explicit to users.

Support: support@mileclear.com
Privacy policy: https://mileclear.com/privacy
Terms: https://mileclear.com/terms

---

## Post-approval checklist

When Apple approves 1.2.0 (carried by build 64):
- [ ] Flip `1.2.0` label in `packages/shared/src/data/releaseNotes.ts`
      from `"Pending Review"` -> `"Latest"`
- [ ] Demote `1.1.4` label from `"Latest"` -> `"App Store"`
- [ ] Update https://mileclear.com/releases (auto-renders from
      RELEASE_NOTES, no code change)
- [ ] Send Product Update email via /admin -> Send Update flow
- [ ] Post to Facebook + Instagram (drafts in `docs/social-posts-1.2.0.md`)
- [ ] Reply to Laura confirming her two features shipped
      (invoice tracker + PAYE tax-paid)
