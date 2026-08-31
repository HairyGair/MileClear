# App Store submission: MileClear 1.3.9 (build 87)

Cut 28 Aug 2026 at 0b41ab5. Public App Store is 1.3.8 (build 84). Paste-ready copy for App Store Connect.

## Promotional Text (170 char limit)

Recommended (social proof + free-first; "800+" is the verified user count as of 28 Aug 2026):

```
800+ UK drivers track every mile free with MileClear - automatic trip detection, no monthly caps, and your HMRC mileage figure ready for Self Assessment.
```

(153 characters)

Variant (reliability-led, matches this release):

```
Every stop, every drive, captured on its own. Automatic trip detection with no monthly caps and your HMRC figure ready for Self Assessment. Free for UK drivers.
```

(160 characters)

Variant (Dynamic Island hook):

```
Park, and classify the trip from your lock screen. MileClear tracks every mile automatically, free, with no caps, and keeps your HMRC figure ready.
```

(147 characters)

---

## What's New in This Version (4000 char limit)

```
Stops between drives are now separate trips
- Drive somewhere, park for ten minutes, drive on: you get two trips, each ending where you actually stopped. Previously a visit could weld both drives into one long journey. This is the main change in 1.3.9 and it came straight from drivers' reports.
- A poor-signal stop is handled the same way. The app now asks whether the car had stopped before the phone went quiet, not how far it had moved by the time it woke up.
- Tunnels and long blackspots at speed stay one trip.

Classify from the Dynamic Island
- When you park, Business and Personal are right there on the lock screen. Tap one and the trip is done before you have opened the app.

Trips start where you left from
- Leaving home or any saved place, the trip now starts there rather than a few hundred metres down the road. You can also correct where a trip started.

Short drives
- A hop too short to record now says so on the lock screen instead of vanishing. Slightly longer short drives are offered back to you under Missed Journeys, so nothing quietly disappears.

The "Not driving" button
- Tapping Not driving now pauses detection until the car parks, not for a fixed twenty minutes that could swallow your next journey.

Places you stop at often
- MileClear notices the places you keep stopping at and offers to save them, so trips there start and end cleanly.

A menu you can actually scroll
- The menu is regrouped into Tracking, Tax, Money, Insights and More, and it scrolls. Quick links to Tax, Invoices, Expenses and Insights on the dashboard, and an Open Self Assessment button on the HMRC card.

Also
- The Live Activity timer counts from when the drive started.

If a drive ever goes missing, report it from the app (Profile > Report a missing trip). The diagnostic that comes with it is what these fixes were built from.
```

(~1929 characters)

⚠️ REJECTED 31 Aug 2026, Guideline 2.3.10: the What's New MUST NOT mention Android (or any other platform). The Android bullet was removed via the ASC API on 1 Sep; never put cross-platform references in ASC metadata again.

Not claimed above, deliberately: the route map above Business/Personal when opening an existing trip (`a56e9a9`) is NOT in build 87; it ships in build 88. Build 87 only shows the route on the save screen after a Start Trip drive.

---

## Mandatory subscription-disclosure block (App Description body)

Both 1.1.2 and 1.1.3 were rejected on 3.1.2(c) without this. It must be in the public App Description, not Notes for Reviewer:

```
Subscription terms:
MileClear Pro is £4.99/month or £44.99/year, auto-renewing. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. You can manage and cancel subscriptions in your iTunes & App Store account settings after purchase.
Privacy Policy: https://mileclear.com/privacy
Terms of Use (EULA): https://mileclear.com/terms
```

## Before submitting

- Reseed the demo account: `cd apps/api && npx tsx --env-file=../../.env scripts/reseed-demo.ts` (last reseed 26 Jul).
- Notes for Reviewer: demo@mileclear.com (password in the ASC notes as before); the Dynamic Island items need a real drive and cannot be reviewed on a simulator.
