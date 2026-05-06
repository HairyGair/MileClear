# MileClear 1.1.4 (build 60) - App Store Connect texts

Drop-in copy for the App Store Connect submission. Cumulative for users coming from 1.1.1 (the current public version) - covers everything in 1.1.2, 1.1.3, and 1.1.4 because TestFlight builds may not have reached every public user. British English, no em dashes, within Apple's character limits.

---

## Promotional Text (170 char limit)

```
Now reads your employer's mileage rate so reimbursed drivers can claim the HMRC gap. Plus tighter auto-trip detection, faster sync, and reliability fixes throughout.
```

(166 characters)

---

## What's New in This Version (4000 char limit)

```
Big update covering everything since 1.1.1. Reliability and polish across the whole app, plus a new feature for drivers reimbursed by an employer.

For employees who claim mileage from work
- New custom rates in Settings. Set the pence-per-mile your employer pays you (and an optional after-10,000-miles tier). Every total in the app now reflects your actual claim, not the HMRC default. Helpful if your employer pays 40p, 35p, 30p or any other rate, because your tax exports will match what you submit on your P87 or self-assessment.

Auto-trip detection
- Detection now waits until you're properly driving before showing the Live Activity. No more "0 mi" notifications firing when you're parked, walking past your car, or sitting at a junction with patchy GPS.
- Drives that begin with slow residential streets now record from the actual departure point, not from when you join the main road. The first 15 minutes of your school run, depot pull-out or estate drive are no longer chopped off.
- Driving past a saved location (a school, depot or shop you've saved) no longer ends your trip. The app now waits to see if you actually stop before deciding it's a real arrival, so a single drive through multiple saved spots stays as one continuous trip.
- A new server-side watchdog finds and finalises any trip that ever gets stuck recording. You no longer need to open the app to wake up a recording that iOS suspended in the background.
- Phantom walking trips (the rare 0.4-mile slow-pace ghosts that occasionally appeared after a long indoor walk) are now caught locally before they ever sync.

Saved-location trips
- Trips between two of your saved places (Home to Work, depot to home, etc) now sync to the cloud properly. A handful of users had local-only "Pending sync" trips that never reached the server. This update auto-recovers them on first launch.

Faster, more polished feel
- Six of the most-used screens (Dashboard, Trips, Active Recording, Fuel, Earnings, Profile) now load with a skeleton placeholder instead of a generic spinner. The shape of the screen appears instantly while data fills in.
- Dashboard cards animate in one after another as they load, instead of all-at-once.
- Sign in is smoother. The blocking spinner that occasionally upstaged the dashboard is gone.
- The "End trip" button now requires a press-and-hold instead of a single tap, so an accidental bounce of your phone in the car cradle can't end a trip by mistake.
- Subtle haptic and visual tick at every whole-mile mark while recording, so you feel and see progress without having to look.
- The Live Activity / Dynamic Island shows real distance and time the moment a recording starts, instead of jumping to 0.0 mi / 0:00 first.

New ways to slice your trips
- Filter trips by platform (Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart, Gophr, Yodel) alongside All / Inbox / Business / Personal.
- "This tax year" and "Last tax year" presets in the date filter, lined up to the UK 6 April boundary so you can pull up your full HMRC year in one tap.

Smaller wins
- Tighter copy across notifications and empty states. The app reads more like a human wrote it.
- The "items pending sync" banner across the top of every screen is gone. Pending counts moved into the trips list where they're more useful.
- Faster community fuel-price and pickup insights. What used to take 15+ seconds now responds instantly for most queries.
- New shortcut in Profile to rate MileClear. The in-app rating prompt is calmer too: ask once, dismiss for 14 days, dismiss again for 30, dismiss a third time and we never ask again.
- Subscription plan switcher (monthly / annual) is more reliable. The plan you have highlighted at the moment you tap Subscribe is the plan you get, even if you tapped between options just before.
```

(3,860 characters - under the 4,000 cap)

---

## App Review Information / Notes for Reviewer

```
MileClear is a UK mileage-tracking app for gig drivers, delivery drivers, employees who drive for work, and self-employed motorists. Auto-trip detection requires real driving and live GPS movement, so for testing purposes we recommend the manual "Start Trip" or "Start Shift" controls on the dashboard, both of which exercise the same recording pipeline as auto-detection.

Subscription disclosure (already addressed in metadata):
- Privacy Policy: https://mileclear.com/privacy
- Terms of Use: https://mileclear.com/terms
- Auto-renewable subscription terms are visible inside the app on the Pro upgrade screen, with functional links to the Privacy Policy and Terms of Use, alongside the standard Apple-provided EULA.

Demo account for Pro features:
  Email: demo@mileclear.com
  Password: MileClear2026!
This account has indefinite Pro access enabled, so the reviewer can exercise HMRC exports, Self-Assessment wizard, accountant invites, CSV import, business insights, and the new employer mileage rate without a sandbox subscription purchase.

If anything is unclear, the support contact is support@mileclear.com.
```

---

## What to Test (TestFlight)

```
Headline change is the new Employer Mileage Rate setting, plus a fix for trips that started mid-A1 instead of at home. Help us check the following actually feels right:

Employer mileage rate (the new feature)
- Settings → Work type → Employee using own vehicle (or Both). Set a rate (try 40p first 10,000 miles, 25p after - matches HMRC's own structure but with a 40p first tier).
- Open Tax / Exports / Dashboard. Every mileage deduction figure should reflect the rate you set, not 45p.
- Switch to Self-employed work type. Figures should switch back to HMRC AMAP (45p / 25p).

Auto-trip detection (the watch-mode coord fix)
- Drive away from home through residential streets for 10+ minutes before joining a fast road. Open Trips. The trip should start at your actual departure address, NOT mid-A1 / mid-motorway. If the start is wrong, screenshot the trip card and the route map.
- Drive past a saved location at speed (don't stop). The trip should NOT split in two at that point. If you have Home, School, Work all saved and you drive Home → past School → Work, you should see one trip.
- Park at a saved location for 90+ seconds, then drive off. The inbound trip should finalise correctly, and the outbound trip should be a separate, second trip.

Reliability spot-checks
- Walk somewhere with patchy GPS for ten minutes or more. No phantom walking trip should appear.
- Force-quit, reopen, sign in. Dashboard should fade in cleanly with no upstaging spinner.
- Try to subscribe to Pro, switch monthly ↔ annual just before tapping Subscribe. Whichever plan was highlighted at the moment of the tap should be the one you get.

Reporting bugs: Facebook group or gair@mileclear.com. Screenshot + rough time of day. For trip-specific bugs, include the trip ID (visible in trip detail).
```

---

## Build differences from 1.1.3 (build 58) and 1.1.4 (build 59)

For internal reference only - the public store text covers all of these as one cumulative release.

| Build | Version | Carries |
|------|---------|---------|
| 57 | 1.1.2 | Saved-location ghost-trip recovery, platform / tax-year trip filters |
| 58 | 1.1.3 | Watch-and-wait detection rewrite, server watchdog, hold-to-end-trip, whole-mile haptics, dashboard cascading fade-in, three top-traffic screens migrated to design system, voice tightening |
| 59 | 1.1.4 | Phantom-trip guard (CALC_SPEED_MIN_DIST_M 30→100m + finalize-shape check), rating cadence tightening + Profile → Rate MileClear deep link, whole-mile distance pulse, LA buffered-state seed, auth-loading skeleton, fuel / earnings / profile migrated to design system, four rules-of-hooks bugs, two stale-closure bugs (PaywallModal plan/user.id, trip-form anomaly answers) |
| 60 | 1.1.4 | Watch-mode coord preservation (Norman's missing-15-mins fix), geofence drive-through fix (school-run fix), employer mileage rate Phase A (Simon's 40p/25p) |
