# MileClear 1.3.0 (build 73) - App Store Connect texts

Drop-in copy for the App Store Connect submission. Paste-ready, no em dashes, British English, within Apple's character limits.

> ⚠️ **Before you submit: reseed the demo account.** It was last reseeded 7 May (over 30 days ago) and I deleted two stray test trips from it during debugging. App Review logs in as `demo@mileclear.com`, so it needs fresh, complete data. Reseed script: `apps/api/scripts/reseed-demo.ts`. I can run it for you in one go - just say so.

---

## Promotional Text (170 char limit)

Updateable any time without resubmitting. New headline for 1.3.0: reliable automatic tracking.

```
Powered by ClearTrack: automatic tracking that catches every drive, even the short ones. Built for UK gig drivers and the self-employed. HMRC-ready exports.
```

(154 characters)

---

## What's New in This Version (4000 char limit)

Covers everything since 1.2.1 (build 69) reached the App Store. Plain language, focuses on what users will actually notice. Around 1,500 characters.

```
This is our biggest reliability release yet. The whole focus: capture every mile automatically, so your tax return looks after itself.

Introducing ClearTrack - more reliable automatic tracking
- ClearTrack, our rebuilt trip detection, catches more of your drives on its own, including the short ones (the quick shop run, the school drop) that used to slip through.
- A stop partway through no longer splits a journey in two. Pull over for a coffee, carry on, and MileClear keeps it as one trip from start to finish.
- Trips start where you actually set off and end where you park, with the full route in between.

See your trip as it happens
- A Live Activity and Dynamic Island show your trip recording in real time, with distance and duration, so you can glance down and know it is working without opening the app.

Never lose or mis-save a trip
- Gentle check-ins when you save: if a trip has no distance, or no vehicle picked, MileClear asks first (you can always save anyway).
- Cannot calculate a distance? You can now type the miles in yourself instead of being stuck.
- Assigned to the wrong vehicle? Fix it on any saved trip in a tap.

Always know what the app is doing
- Clear banners tell you when a trip is recording, when something has not synced, or when a permission that tracking needs has been switched off, each with a one-tap fix.

Under the hood
- Faster, steadier, and a long list of fixes to make the core job, recording your miles, boringly dependable.

As always, your figures and HMRC calculations are worked out for you and ready to export at tax time.
```

---

## App Review Information / Notes for Reviewer

Paste into "App Review Information > Notes". The Motion & Fitness section is important: it is a new permission this version and pre-empts a reviewer question.

```
MileClear is a UK mileage-tracking app for gig drivers, delivery drivers, and self-employed motorists. It records business miles for HMRC self-assessment.

Testing trip recording:
Automatic trip detection requires real driving and live GPS movement, which is not practical in a review environment. To exercise the same recording pipeline, please use the manual "Start Trip" or "Start Shift" controls on the dashboard. Both record, save, and display a trip exactly as auto-detection does.

Permissions in this version:
- Location (Always): required so trips record while the app is in the background, which is the app's core function. The app explains this on first run and still works in foreground-only mode if declined.
- Motion & Fitness: used only to detect when the device begins moving by car, which makes automatic trip detection faster and more reliable for short journeys. It is NOT used for health, fitness, or workout data. The app functions without it; detection is simply less responsive.

Demo account for Pro features:
  Email: demo@mileclear.com
  Password: MileClear2026!
This account has Pro access enabled, so the reviewer can exercise HMRC exports, the Self-Assessment wizard, CSV import, and business insights without a sandbox subscription purchase.

Subscription disclosure:
- Privacy Policy: https://mileclear.com/privacy
- Terms of Use: https://mileclear.com/terms
- Auto-renewable subscription terms appear on the in-app Pro upgrade screen with functional links to the Privacy Policy and Terms of Use, alongside the Apple-provided EULA.

Support: support@mileclear.com
```

---

## What to Test (TestFlight)

Full version in `docs/what-to-test-1.3.0-build-73.md`. Short version for the TestFlight box:

```
Update, then force-quit once so it starts fresh. If it had been crashing on open, this build fixes that.

1. Short trips - drive normally, short hops included; afterwards open Trips and they should be there on their own. Don't open the app while driving.
2. Say yes to Motion & Fitness when prompted - it's what catches short trips (motion only, no health data).
3. New "are you sure?" prompts when saving (no distance / no vehicle / two recordings at once) - tell me if any feel annoying.
4. Open any trip to change a wrong vehicle, or type the miles in manually if the distance couldn't be calculated.
5. If a drive does NOT record: avatar > Drive Detection Diagnostics > Share, and tell me when/where and whether it was a short trip.
```

---

## Submission checklist

- [ ] Reseed demo account (see warning at top)
- [ ] Promotional Text pasted
- [ ] What's New pasted
- [ ] App Review notes pasted (incl. Motion & Fitness rationale)
- [ ] Build 73 (1.3.0) selected
- [ ] Screenshots current (no change needed unless UI shifted)
- [ ] Submit for review
