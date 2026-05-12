# Build 66 - What to Test (TestFlight)

Paste into the TestFlight "What to Test" field. ~3.6k chars - under the 4k limit. This is the full 1.2.0 cumulative test pass.

---

1.2.0 is the biggest release MileClear has shipped. Below is the focused test list - 7 things that matter, in order of priority.

**1. Auth reliability (the boring critical one)**

Open the app, close it from the app switcher, reopen. Repeat 5 times across different times of day. You should never be asked to log in again. If you ARE logged out, that's the bug we fixed in build 66 - refresh tokens now use replay-detection families instead of hard rotation, so a dropped network response no longer kicks you to the login screen.

**2. HMRC MTD ITSA flow (Pro tier)**

- Avatar -> Work & Tax -> MTD ITSA card
- Beta-banner visible at top
- Tap Connect to HMRC - in-app browser opens to test-www.tax.service.gov.uk
- Sign in with any HMRC sandbox test user (create one at developer.service.hmrc.gov.uk/api-test-user)
- Approve the scopes, browser closes, status flips to Connected
- Enter the test user's NINO when prompted
- Confirm your self-employment trade
- Tap an open obligation -> Review submission. The preview should show reasonable income / mileage / expense numbers
- DO NOT submit - sandbox only

**3. Manual trip routing**

Add the same A->B manual trip twice. Both should return identical mileage. The distance line should say "Route distance via road" or "...cached" or "...via Google Maps" - never silent crow-flies.

**4. Geofence trip Live Activity**

This is the trip-detection premium polish - drive away from a saved location (Home, Work) and back, the Lock Screen / Dynamic Island should:

- Show a "Trip Active" Live Activity with "From Home" (or your departure location name) badge
- Tick up live distance + speed as you drive
- Park at the destination - flip to a frozen Trip Complete summary. For business trips it shows the HMRC pound value you just earned back

Two follow-up checks on the same flow:
- End Shift on the Lock Screen should actually end the shift (not just dismiss the Activity). Verify shift miles cap off at the right number on the dashboard.
- After parking somewhere that isn't a saved location, the Live Activity should stale-dismiss naturally within 8 minutes - no more "pinned to Dynamic Island for hours" bug.

**5. Smart trip classification**

- Save a manual trip tagged Work between addresses you've used a few times before
- After 3+ similar saves, the 4th attempt should pre-fill Work automatically
- For auto-detected geofence trips, the confirmation push should lead with the suggested classification - "Work trip detected" with one-tap Yes Work / Personal / Not me buttons on the Lock Screen

**6. Invoices + My Accountant + PAYE offset**

- Avatar -> Work & Tax -> Sole Trader -> Invoices. Create one, mark it paid. Tax Readiness updates.
- Same menu -> My Accountant. Enter your accountant's annual fee. Set-aside on Tax Readiness card now includes (annualFee / 52) per week.
- If you're a mixed PAYE + gig worker, Settings -> Work & Tax -> Tax already deducted. Enter your payslip tax YTD. The "still owed" figure on Tax Readiness drops accordingly.

**7. Recheck suspicious trips**

Settings -> Data Quality -> Recheck suspicious trips. Should scan recent trips, find any with sparse GPS or unverified distances, offer to re-route through the routing engine.

---

Known sandbox constraints:
- MTD ITSA submissions go to HMRC's sandbox, not production. Accreditation still in HMRC review (ref 2026-IBW598).
- Open Banking is on TrueLayer sandbox credentials.
- Both are wearing a "Sandbox - Beta" banner so users can tell.

Bug reports to support@mileclear.com or the Facebook group.
