# App Store submission — 1.3.8 (build 84)

Build `d1bffbfb-b6cd-478a-beba-195f67478ae7`, commit `a88a93c`, runtime
`1.3.8-build84`. The 1.3.8 version record already exists in App Store Connect
(`PREPARE_FOR_SUBMISSION`, created 17 Aug by the auto-submit upload) with
**Promotional Text and What's New both empty** — these two fields are what this
doc fills.

⚠️ **2.3.7 RULE, learned by rejection on 11 Aug 2026: no price references in the
app name, subtitle, screenshots or promotional text — and Apple counts the word
"free" as a price reference.** Prices belong in the Description only. Every
option below is price-free. (The 1.3.7-build-82 doc in this repo still shows the
old "track every mile free" promo text; that is the wording that was rejected.
Do not copy it forward.)

---

## 1. Promotional Text (170 char limit)

**Recommended — leave exactly as it is.** This is what is live against 1.3.7, it
went through review after the 2.3.7 fix, and promotional text is meant to stay
evergreen across maintenance releases:

```
500+ UK drivers track every mile with MileClear - automatic trip detection, no monthly drive caps, and your HMRC mileage figure ready for Self Assessment.
```

(154 characters. The claim is conservative: 691 registered, 486 have recorded at
least one trip, 334 recorded one in the last 30 days.)

**Variant A — reliability-led, matches what this release actually is:**

```
Every mile counted, even the short ones. MileClear spots your drives on its own and keeps your HMRC mileage figure ready for Self Assessment.
```

(141 characters.)

**Variant B — aimed at multi-drop drivers, the cohort these fixes came from:**

```
Twenty drops a day? MileClear records every leg automatically, however short, and adds them all up into your HMRC mileage for Self Assessment.
```

(142 characters.)

---

## 2. App Store Description (4000 char limit)

**Unchanged.** 1.3.8 is a maintenance release, so the listing body carries over
from 1.3.7 untouched.

⚠️ Before submitting, confirm this block is still present in the Description —
builds 57 and 58 were both rejected under 3.1.2(c) for its absence, and it must
be in the public Description body, not the reviewer notes:

```
Subscription terms:
MileClear Pro is £4.99/month, auto-renewing. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. You can manage and cancel subscriptions in your iTunes & App Store account settings after purchase.

Privacy Policy: https://mileclear.com/privacy
Terms of Use (EULA): https://mileclear.com/terms
```

---

## 3. What's New in This Version (4000 char limit)

```
Another reliability release. Nine fixes, and every one of them started with a driver telling us a drive had gone wrong.

Short hops are no longer dropped from a busy day. On a day of several stops, a leg of under half a mile could produce so few GPS points that MileClear treated it as stray data and threw it away, while keeping the longer legs either side of it. Short legs are now judged on the distance they actually covered, so a real journey survives however few points it produced.

A journey that starts recording late no longer loses its opening miles. If your phone shut MileClear down as you set off, recording could pick up well into the drive, and because the trip still showed the right start place and the right start time, the missing miles were invisible. MileClear now fills that gap with the real road distance between where you set off and where recording began, and says on the trip that it has done so.

A merged journey keeps its whole route. When one drive was joined onto the one before it, the mileage was added but the second half of the route was not stored, so the map drew only part of the journey and splitting it at a stop could not find the stop. The full route now comes across with it.

An unfinished Start Trip is recovered instead of discarded. If you tapped Start Trip and your phone closed the app before you finished, the recorded route was eventually deleted. It now becomes a trip, split at the stops along the way.

You decide when a stop ends a journey. In Settings, then Tracking, choose anything from 5 minutes to an hour. Long waits at a depot or a site no longer split one job into several trips, and sitting in traffic still keeps the journey whole.

Also in this build: a brief server problem can no longer cost you an earning, fuel entry or shift you have just saved; reporting a missing trip now checks whether it is still saving first and shows it to you if it appears; and signing in as someone else on a shared phone starts clean.

If a drive ever does go missing, report it from the Trips tab under "Missing a trip you made?". The diagnostic that comes with it is exactly what we build these fixes from, and it goes straight to the person writing the code.
```

⚠️ Note the last paragraph says **Trips tab**. 1.3.7's What's New said "Profile >
Report a missing trip", which is wrong — `MissingTripReporter` is rendered only
in `app/(tabs)/trips.tsx`, and it is hidden on the "unclassified" filter.

---

## 4. What to Test (TestFlight)

See `docs/what-to-test-1.3.8-build-84.txt` (1,924 characters, paste-ready) and
`docs/what-to-test-1.3.8-build-84.md` for the reasoning behind each step.

---

## Before submitting for review

- [ ] Reseed the demo account (`apps/api/scripts/reseed-demo.ts`) — last done 26 Jul
- [ ] Clear the demo account's sandbox HMRC connection
- [ ] Confirm export compliance answered (`usesNonExemptEncryption: false`)
- [ ] Flip the releaseNotes.ts 1.3.8 entry from "In Testing" to "Pending Review", then deploy web
- [ ] **The on-device drive test** — items 1 to 3 of the what-to-test are the point of this build
