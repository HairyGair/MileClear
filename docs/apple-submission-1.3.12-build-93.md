# App Store submission: 1.3.12 (build 93)

Cut 29 Sep 2026 from main @ af13e88a (plus the build bump). Runtime `1.3.12-build93`.
Submitted 29 Sep 2026 ~21:20 BST, release automatically after approval. Description rewritten (below). Rules:
no Android / Google Play mention anywhere in App Store metadata (2.3.10, build 87),
and never an adjective about our product next to "HMRC" (23 Sep).

Native reason for a binary: the first-open update switch (570b9940) only works
from inside the shipped app. Everything else also went to 1.3.11 phones by OTA
on 28 Sep, so App Review sees what the fleet already runs.

## What's New in This Version

```
Automatic trips, your way
• An Automatic trips switch on the home screen. Turn it off and the app stops recording drives on its own; shifts and Start Trip still record.
• Trips recorded during a shift are saved as Business.

Battery
• Automatic tracking sleeps while recording is paused and while a shift or Start Trip is running, and signing out always stops it.

Fixes
• A drive is no longer saved twice when a shift or Start Trip recorded it too.
• One trip or place that can't be uploaded no longer holds up every trip behind it.
• Journeys to check older than 14 days drop off the list, and adding one asks when you really set off.
• "Missing a trip you made?" asks for your real set-off time.
• Trip reminders open your Inbox, where the trips to sort are.
• A Start Trip that got stuck after the app closed now recovers.
• After an App Store update, the app moves straight to the latest version the first time you open it.
• Saving while offline says "No connection, try again".
• Signing in again no longer takes you back through the setup screens.
```

## Notes for Reviewer

```
Demo account: demo@mileclear.com (password in the App Review Information section, unchanged).

New in this version: an "Automatic trips" switch on the Dashboard, under the Work/Personal toggle. Switching it off stops the app recording drives automatically in the background; shifts and "Start Trip" still record when the user starts them. Location use is unchanged from the previous version: background location is used only to record the user's drives for their mileage log.
```

## What to Test (TestFlight)

```
Build 93 (1.3.12)
• Automatic trips switch on the home screen: turn it off, drive, and nothing should record; turn it on and drives record again.
• Start a shift, drive, end it: the trip should be saved as Business, once.
• Start Trip, drive, Arrive and save: one trip, no second copy appearing afterwards.
• Pause until 6am, don't open the app, drive next morning: the drive should record on its own.

Found a problem? Post in the MileClear Facebook group or email gair@mileclear.com.
```

## Description (REWRITTEN 29 Sep for 1.3.12, 3,973 chars)

Fixed: the false "TripLog stops you at 40" and stale "Driversnote 20" (now 15) claims, now unnamed as
"Some mileage apps stop free users at 15 or 40 drives a month"; Self Assessment wizard is FREE (PDF is Pro);
receipt scanning is free (no gate in the app); Automatic trips switch added; Pro list brought up to date;
"HMRC-deductible mileage" softened to "business mileage".

```
The UK mileage tracker that does not cap your tracking.

MileClear automatically tracks every mile you drive for UK gig work or your day job, applies HMRC mileage rates, and gets your Self Assessment figures together as you go. Tracking is unlimited and free, forever. Some mileage apps stop free users at 15 or 40 drives a month. MileClear never does.

Built for UK self-employed drivers - Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, DPD, Evri, Gophr - and for employees who use their personal car for work and claim mileage back from their employer.

WHAT IT DOES

- Unlimited automatic GPS tracking. MileClear records every business mile in the background, including the dead miles between deliveries that platforms do not pay for but HMRC does. No monthly drive cap, ever.
- Automatic trips switch. Turn automatic recording off from the home screen whenever you like; shifts and Start Trip still record when you start them.
- HMRC rates built in. 55p per mile for the first 10,000 business miles, 25p after (the car/van rate rose from 45p to 55p on 6 April 2026). Mopeds and motorbikes claim 24p flat. The right rate is applied per trip date automatically.
- Tax Readiness card. Live tax + NI estimate, suggested weekly set-aside, and a countdown to the 31 January deadline. Free.
- Self Assessment wizard. Step-by-step guide mapping your data to the SA103 form boxes, with a full income tax + NI breakdown. Free; the printable PDF is Pro.
- HMRC Reconciliation. Enter the figures HMRC has from each platform's Digital Platform Reporting and see the gap against MileClear's tracked total.
- Anonymous Benchmarking. Compare your weekly miles, trips and earnings against the median of UK MileClear drivers. Privacy floor never exposes individual data.
- Activity Heatmap. 7 by 24 grid of when you actually drive and earn most across the last 12 weeks.
- Pickup wait timer. Tap "Wait at pickup" when you arrive at a restaurant or depot. The stopwatch survives app suspension.
- MOT and tax expiry reminders. Add a vehicle by registration plate and MileClear refreshes DVLA data weekly. Push notification 14 days before expiry, plus full DVSA MOT history.
- Receipt scanning. Point the camera at parking, fuel and toll receipts. On-device only.
- Real-time fuel prices. 8,300+ UK stations from the government-mandated reporting database.
- Saved locations. Home, work, depot, and any place you visit often.
- Personal and Work modes. Everyday driving goals in Personal, business mileage and tax tools in Work.
- Exports (Pro). CSV and PDF mileage logs per tax year, per vehicle, per platform, and a Self Assessment PDF with a signed cover sheet declaring your log a contemporaneous record.
- Accountant Portal (Pro). Invite your accountant by email to a read-only dashboard.

PRICING

Free, with no drive cap: full mileage tracking, HMRC rate calculation, the Self Assessment wizard, Tax Readiness, HMRC Reconciliation, manual earnings and expenses, receipt scanning, fuel prices, all achievements and recaps, Anonymous Benchmarking, MOT history, Activity Heatmap, one vehicle and two saved locations.

Pro at £4.99 per month: all exports (CSV, PDF trip report, Self Assessment PDF), CSV earnings import, bank import, auto-classify rules, Business Insights, Driving Analytics, Journey Map, Accountant Portal, pickup-wait community insights, unlimited vehicles and saved locations. Pro never gates the tracker itself.

PRIVACY

Trip data lives on your phone first. We sync to UK servers only what is needed to back up across devices. Receipt scanning is on-device only.

Subscription terms:
MileClear Pro is £4.99/month, auto-renewing. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. You can manage and cancel subscriptions in your iTunes & App Store account settings after purchase.

Privacy Policy: https://mileclear.com/privacy
Terms of Use (EULA): https://mileclear.com/terms

Support: support@mileclear.com
```

## Unchanged from 1.3.11
- Promotional text (1.3.12 started blank in ASC; the 1.3.11 text was copied in), keywords, screenshots, support + privacy URLs.
- Release: automatically after approval.
