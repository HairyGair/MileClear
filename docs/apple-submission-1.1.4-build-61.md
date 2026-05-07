# MileClear 1.1.4 (build 61) - App Store Connect texts

Drop-in copy for the App Store Connect resubmission. Build 60 was rejected on 7 May 2026 (guideline 2.1(a) - "Got it" button on the Work mode explainer was unresponsive on iPad Air iPadOS 26.4.2). Build 61 fixes that bug and adds two user-requested features (tax-bracket support and a freelance platform tag). British English, no em dashes, within Apple's character limits.

---

## Promotional Text (170 char limit)

```
Now reads your tax bracket from your other income, plus a Freelance trip tag and a fix for the iPad onboarding tap. Reliability and polish throughout.
```

(150 characters)

---

## What's New in This Version (4000 char limit)

```
Big update covering everything since 1.1.1. Two new features for drivers with extra income or non-platform freelance work, plus reliability and polish throughout.

Tax estimates that reflect your real bracket
- New "Other annual income" setting (Profile > Work settings). Enter the pre-tax income from your main job, pension, rental etc. and the dashboard tax estimate jumps to your real marginal bracket. If you've got a £50k main job, your gig profit now correctly shows the higher-rate set-aside instead of guessing basic rate. Leave it blank and nothing changes.

Freelance / private gig trip tag
- New platform tag for trips that aren't food delivery or rideshare. Photography, consultancy, private bookings, anything self-employed but not on a gig platform - tag it as Freelance instead of having to fall back to "Other".

For employees who claim mileage from work
- Custom rates in Settings. Set the pence-per-mile your employer pays you (and an optional after-10,000-miles tier). Every total in the app now reflects your actual claim, not the HMRC default. Helpful if your employer pays 40p, 35p, 30p or any other rate, because your tax exports will match what you submit on your P87 or self-assessment.

Auto-trip detection
- Detection now waits until you're properly driving before showing the Live Activity. No more "0 mi" notifications firing when you're parked, walking past your car, or sitting at a junction with patchy GPS.
- Drives that begin with slow residential streets now record from the actual departure point, not from when you join the main road. The first 15 minutes of your school run, depot pull-out or estate drive are no longer chopped off.
- Driving past a saved location (a school, depot or shop you've saved) no longer ends your trip. The app now waits to see if you actually stop before deciding it's a real arrival, so a single drive through multiple saved spots stays as one continuous trip.
- A new server-side watchdog finds and finalises any trip that ever gets stuck recording. You no longer need to open the app to wake up a recording that iOS suspended in the background.
- Phantom walking trips (the rare 0.4-mile slow-pace ghosts that occasionally appeared after a long indoor walk) are now caught locally before they ever sync.

Saved-location trips
- Trips between two of your saved places (Home to Work, depot to home, etc) now sync to the cloud properly. A handful of users had local-only "Pending sync" trips that never reached the server. This update auto-recovers them on first launch.

Faster, more polished feel
- Six of the most-used screens now load with a skeleton placeholder instead of a generic spinner. The shape of the screen appears instantly while data fills in.
- Dashboard cards animate in one after another as they load, instead of all-at-once.
- The "End trip" button now requires a press-and-hold instead of a single tap, so an accidental bounce of your phone in the car cradle can't end a trip by mistake.
- Subtle haptic and visual tick at every whole-mile mark while recording.
- The Live Activity / Dynamic Island shows real distance and time the moment a recording starts.
- Filter trips by platform (Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart, Gophr, Yodel, Freelance) alongside All / Inbox / Business / Personal.
- "This tax year" and "Last tax year" date presets, lined up to the UK 6 April boundary.

Smaller wins
- Tighter copy across notifications and empty states.
- The "items pending sync" banner is gone; pending counts moved into the trips list.
- New shortcut in Profile to rate MileClear. The in-app rating prompt is calmer too.
- Subscription plan switcher is more reliable on the Pro upgrade screen.
```

(3,990 characters - under the 4,000 cap)

---

## App Review Information / Notes for Reviewer

```
MileClear is a UK mileage-tracking app for gig drivers, delivery drivers, employees who drive for work, and self-employed motorists. Auto-trip detection requires real driving and live GPS movement, so for testing purposes we recommend the manual "Start Trip" or "Start Shift" controls on the dashboard, both of which exercise the same recording pipeline as auto-detection.

Re: 7 May 2026 rejection (guideline 2.1(a), iPad Air M3, iPadOS 26.4.2) - the "Got it" button on the Work mode explainer modal was unresponsive on iPad. Fixed in this build by setting an explicit presentationStyle on the modal and replacing the animated button with a plain tappable so iPadOS 26 hit-testing always resolves on the CTA. Also verified on iPad Air simulator running iPadOS 26.x.

Subscription disclosure (already addressed in metadata):
- Privacy Policy: https://mileclear.com/privacy
- Terms of Use: https://mileclear.com/terms
- Auto-renewable subscription terms are visible inside the app on the Pro upgrade screen, with functional links to the Privacy Policy and Terms of Use, alongside the standard Apple-provided EULA.

Demo account for Pro features:
  Email: demo@mileclear.com
  Password: MileClear2026!
This account has indefinite Pro access enabled, so the reviewer can exercise HMRC exports, Self-Assessment wizard, accountant invites, CSV import, business insights, the new employer mileage rate, the new other-annual-income tax bracket, and the new Freelance platform tag without a sandbox subscription purchase.

If anything is unclear, the support contact is support@mileclear.com.
```

---

## What to Test (TestFlight)

```
Headline changes are the new Other Annual Income tax-bracket field and the Freelance platform tag, plus the iPad "Got it" fix from build 60.

Other annual income (the new tax-bracket feature)
- Settings > Work settings > Other annual income. Enter your pre-tax salary or other income (e.g. 50000 for a £50k main job).
- Open the dashboard / Tax Readiness card. The set-aside percentage should now reflect your real bracket (40% rather than ~25% if you put in £50k+).
- Clear the field. Set-aside reverts to the basic-rate-style estimate.

Freelance platform tag
- Open any business trip > Edit > Platform. There's a new "Freelance / Private gig" option between Evri and Other.
- Tag a trip as Freelance, save, reopen. The tag persists and shows up in trip filters.

Employer mileage rate (1.1.4 carry-over)
- Settings > Work type > Employee using own vehicle (or Both). Set a rate (try 40p first 10,000 miles, 25p after).
- Open Tax / Exports / Dashboard. Every mileage deduction figure should reflect the rate you set, not 45p.

iPad "Got it" fix
- On any iPad (especially iPad Air on iPadOS 26.x), sign in fresh and tap "Got it" on the Work mode explainer. The modal must dismiss cleanly.

Auto-trip detection (the watch-mode coord fix)
- Drive away from home through residential streets for 10+ minutes before joining a fast road. Trip should start at your actual departure address, NOT mid-A1 / mid-motorway.
- Drive past a saved location at speed (don't stop). Trip should NOT split in two.

Reliability spot-checks
- Walk somewhere with patchy GPS for ten minutes or more. No phantom walking trip should appear.
- Try to subscribe to Pro, switch monthly to annual just before tapping Subscribe. Whichever plan was highlighted at the moment of the tap should be the one you get.

Reporting bugs: Facebook group or gair@mileclear.com. Screenshot + rough time of day. For trip-specific bugs, include the trip ID.
```

---

## Build differences from earlier 1.1.4 builds

For internal reference only - the public store text covers all of these as one cumulative release.

| Build | Version | Carries |
|------|---------|---------|
| 57 | 1.1.2 | Saved-location ghost-trip recovery, platform / tax-year trip filters |
| 58 | 1.1.3 | Watch-and-wait detection rewrite, server watchdog, hold-to-end-trip, whole-mile haptics, dashboard cascading fade-in, three top-traffic screens migrated to design system, voice tightening |
| 59 | 1.1.4 | Phantom-trip guard, rating cadence tightening + Profile -> Rate MileClear deep link, whole-mile distance pulse, LA buffered-state seed, auth-loading skeleton, fuel / earnings / profile migrated to design system, four rules-of-hooks bugs, two stale-closure bugs |
| 60 | 1.1.4 | Watch-mode coord preservation, geofence drive-through fix, employer mileage rate Phase A |
| 61 | 1.1.4 | iPad "Got it" modal hit-testing fix (Apple rejection), Other Annual Income tax-bracket field, Freelance platform tag |
