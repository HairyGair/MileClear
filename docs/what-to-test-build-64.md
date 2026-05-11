# Build 64 - What to Test (TestFlight)

Paste this into the TestFlight "What to Test" field. Must stay under
4000 characters - currently around 2400.

---

Build 64 fixes six small things from the build 63 smoke test. Same
1.2.0 feature set, no new permissions, no new in-app purchases.

**1. HMRC Connect actually works**

In build 63, tapping "Connect to HMRC" opened a broken page that said
"Missing or invalid token". Fixed in 64.

Test:
- Avatar -> Work & Tax -> MTD ITSA card
- "Sandbox - Beta" banner should be visible at the top
- Tap Connect to HMRC
- The in-app browser should load HMRC's sandbox page (URL contains
  test-www.tax.service.gov.uk)
- Sign in with any HMRC sandbox test user, approve scopes
- Browser closes, status flips to Connected

**2. No Pro upsell for existing Pro members**

Build 63 showed a "Try risk-free" modal to Pro users on their 5th
saved trip. Embarrassing. Fixed.

Test (Pro account):
- Save or track your 5th trip
- The paywall should NOT appear
- Free users still see it once at 5 trips (one-time)

**3. Paywall copy cleaned up**

For free users only:
- Open the paywall (Profile -> Pro features, or hit a Pro feature)
- Slide 1: subheading should say "Apple ID settings" - no Google
  reference (we don't have Google Sign-In)
- Slide 2: deduction figure should match your business miles only
  (was using total miles, including personal)
- Slide 2: footer copy should no longer claim "Most drivers save 10x"

**4. Lock Screen context band**

Build 63 added the band in native code but never wired it up for
shift activities. Fixed.

Test:
- Drive a few miles today (manual or auto-tracked)
- Then start a fresh shift from the dashboard
- Lock the phone
- Live Activity should show duration / miles / trips on the top row
- Below it, a context band with at least TODAY (your daily total) and
  potentially NEXT MILESTONE (if you're near one) or EARNED (if you've
  logged earnings today)

**5. Work & Tax avatar shortcut**

Test:
- Tap your avatar in the top-right of any tab
- Dropdown should include a "WORK & TAX" group
- Options: Work & Tax settings / Invoices / Work Schedule
- Each deep-links straight into the right screen (no Profile hop)

**6. BetaBanner on sandbox screens**

Test:
- MTD ITSA screen should show "Sandbox - Beta" banner up top
- Open Banking screen should show "Coming Soon" framing
- Both should be clearly marked as not-yet-production

---

Known issues:
- HMRC MTD ITSA submissions still go to HMRC's sandbox, not
  production. We're awaiting accreditation (ref 2026-IBW598).
- Open Banking is still on TrueLayer sandbox credentials.

Report bugs to support@mileclear.com or in the Facebook group.
