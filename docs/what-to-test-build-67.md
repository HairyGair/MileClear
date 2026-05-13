# Build 67 - What to Test (TestFlight)

Paste into the TestFlight "What to Test" field. ~3.6k chars - under the 4k limit.

---

Build 67 carries everything in build 66 plus a first-launch tour, an in-app help centre, contextual info buttons throughout the app, and two reliability fixes that matter a lot.

**1. First-launch Quick Start (new install only)**

Uninstall and reinstall, complete login. A 5-card swipeable tour should slide up from the bottom of the dashboard ~1 second in. Topics: trip tracking, classification, Tax Readiness, MTD ITSA, get-started. Skippable from the top right. Should only fire once per install.

**2. Help & Tutorials**

Avatar menu - Help & Tutorials. Categorised FAQ (Getting started / Tax & HMRC / Trips / Money / Troubleshooting). Top has a "Replay the Quick Start" card. Tap to expand FAQ rows; topics with deep-links jump to the relevant screen.

**3. Contextual (i) icons**

Small info buttons next to the Tax Readiness card header, several Work & Tax settings rows, and the Accountant intro. Tap one - a bottom sheet slides up with a focused explainer plus a "See all help topics" link to the full Help screen.

**4. Auth reliability**

Close MileClear from the app switcher, reopen, repeat 5 times across different times of day. You should never be asked to log in again. Refresh-token rotation now keeps old tokens linked rather than deleting them, so a dropped network response can no longer kick you to the login screen.

**5. No phantom trip on app launch**

Open MileClear while sitting still (at home, at a desk, anywhere you have not been driving). Do NOT start a shift. Wait 60 seconds. A Live Activity should NOT appear and no trip should start in the background. Build 67 demands a fresh high-accuracy GPS fix before accepting any geofence Exit fired in the first 30 seconds after app open.

**6. Trips with brief stops merge correctly**

Drive 5 minutes, park for under 60 seconds, drive another 10 minutes. The two segments should appear as ONE trip in your trips list, not two. (Fix shipped after a 108-mile drive saved as 5.7 + 103 separate trips with the same petrol-station-stop signature.)

**7. HMRC MTD ITSA flow (Pro tier)**

Avatar menu - Work & Tax - MTD ITSA card. Sandbox banner visible. Tap Connect to HMRC, in-app browser opens test-www.tax.service.gov.uk. Sign in with any HMRC sandbox test user (create one at developer.service.hmrc.gov.uk/api-test-user), approve scopes. Browser closes, status flips to Connected. Enter NINO, confirm trade, review an open obligation. DO NOT submit - sandbox only.

**8. Manual trip routing accuracy**

Add the same A to B trip twice. Both should return identical mileage. The distance line should say "Route distance via road" or "...cached" - never silent crow-flies.

**9. Geofence trip Live Activity**

Drive from a saved location to another saved location. The Lock Screen should show a "Trip Active" Live Activity with a "From Home" (or similar) badge. Distance and speed tick up live. Park at the destination, the Activity flips to a Trip Complete summary. End Shift from the Lock Screen actually ends the shift, not just the Activity.

---

Known sandbox constraints: MTD ITSA submissions go to HMRC sandbox (production accreditation in review, ref 2026-IBW598). Open Banking still on TrueLayer sandbox credentials. Both wear a Sandbox - Beta banner.

Bug reports to support@mileclear.com or in the Facebook group.
