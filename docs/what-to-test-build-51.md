# MileClear 1.0.10 (Build 51) - App Store submission text

## Promotional Text (170 char limit, App Store listing top)

Pick one. Apple lets you edit this anytime without a new build.

**Recommended (160 chars):**
> Auto mileage tracking for UK gig drivers - HMRC rates built in. New in 1.0.10: Self Assessment wizard, accountant portal, receipt scanning, Siri Shortcuts.

**Variant A - benefit-led with savings number (154 chars):**
> Track every gig mile, save up to £8,250 in HMRC tax. New: Self Assessment wizard, accountant portal, receipt scanning, Siri voice commands. UK drivers.

**Variant B - timeliness hook (158 chars):**
> Auto mileage for UK couriers, drivers and ODFs. HMRC rates built in. New: Self Assessment wizard, accountant portal, receipt scanning, Siri Shortcuts.

## App Store Description (4000 char limit, main listing body)

The first 2-3 lines are what users see on the listing card before tapping "more". Lead has been written for that.

---

MileClear automatically tracks every mile you drive for UK gig work, applies HMRC mileage rates, and exports a Self Assessment-ready PDF in one tap.

Built for UK self-employed drivers - Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, DPD, Evri, and anyone else who needs a contemporaneous mileage log for their tax return.

WHAT IT DOES

- Automatic GPS tracking. Start a shift and forget about it. MileClear records every mile from log-on to log-off, including the dead miles between deliveries that platforms do not pay for but HMRC does.
- HMRC rates built in. 45p per mile for the first 10,000 business miles in a tax year, 25p after that. Mopeds and motorbikes claim 24p flat. The app applies the right rate for your vehicle automatically.
- Self Assessment-ready exports. CSV and PDF mileage logs in HMRC-accepted formats. Per tax year (6 April to 5 April), per vehicle, per platform.
- Self Assessment wizard (Pro). Step-by-step guide mapping your data to actual HMRC SA103 form boxes, with a full income tax and National Insurance breakdown.
- Accountant Portal (Pro). Invite your accountant by email to a read-only dashboard. They download CSV and PDF exports without needing an account.
- Receipt scanning (Pro). Camera capture for parking tickets, fuel receipts, tolls. Runs entirely on your phone.
- Siri Shortcuts. "Hey Siri, start my shift", "How many miles today?", "Log expense". Hands-free while driving.
- Earnings tracking (Pro). Manual entry or CSV import from Uber, Deliveroo, Just Eat platform statements.
- Real-time fuel prices. 8,300+ UK stations from the government-mandated reporting database. Find the cheapest fuel near you.
- Per-platform performance insights. Earnings per mile, earnings per hour, shift grading, golden-hour analysis. Know which platforms actually pay.
- Saved locations. Set Home, Work, or your depot. The app stops auto-detecting trips when you are parked there.
- Personal and Work modes. Everyday driving goals and recaps in Personal mode, HMRC-deductible mileage and tax tools in Work mode.

PRICING

Free: full mileage tracking, HMRC rate calculation, manual earnings entry, fuel prices, gamification, two saved locations.

Pro at £4.99 per month: all exports (CSV, PDF, Self Assessment), Self Assessment wizard, Accountant Portal, receipt scanning, CSV earnings import, unlimited saved locations.

PRIVACY

Your trip data lives on your phone first. We sync to our UK servers only what is needed to back up your data across devices. We do not share your location or driving patterns with third parties. Receipt scanning is on-device only.

Support: support@mileclear.com
Privacy policy: mileclear.com/privacy

---

## What's New in This Version (App Store, per-version notes, 4000 char limit)

Biggest update since launch. Highlights:

- Self Assessment wizard - step-by-step guide that maps your MileClear data to the actual HMRC SA103 form boxes, with full income tax and National Insurance breakdown.
- Accountant Portal - invite your accountant by email to a read-only dashboard with your trips, expenses and earnings. They can download CSV and PDF exports without needing a MileClear account.
- Receipt scanning - point your camera at a parking ticket, fuel receipt or toll. MileClear extracts the amount, date and vendor automatically. Runs entirely on your phone, your images never leave the device.
- Siri Shortcuts - "Hey Siri, start my shift", "How many miles today?", "Log expense", "Weekly goal progress". Hands-free while driving.
- Active Recording screen - reachable from the Live Activity, the Dynamic Island, the persistent notification or a new amber banner on the dashboard. You always know when MileClear is recording, even if iOS quietly drops the Live Activity.
- More accurate trip distances. We filter out GPS noise and snap routes to actual roads using OpenStreetMap. Roughly 5-10% better accuracy on winding country lanes, and a clean polyline on the map instead of jagged jumps.
- Auto-detection no longer triggers when you're parked at a saved location. Setting Home, Work, or your depot now blocks the false "you started driving" notification when GPS drift makes you briefly look like you are moving indoors.
- Change your password from inside the app or on the web dashboard, no reset email required.
- Stuck-recording watchdog - if iOS stops delivering location updates mid-trip, a repeating timer detects and saves the trip instead of leaving it stuck.
- Apple In-App Purchase webhooks now process subscription events correctly across both Sandbox and Production environments.
- Many smaller fixes and reliability improvements.

---

# What to Test (TestFlight, 4000 char limit)

Build 51 builds on Build 49/50 and fixes a sparse-GPS-trace bug. If you're short on time, try these three things first:

- **Drive an auto-detected trip and check the map.** Drive for 5+ minutes, then open the trip. The route should follow the actual roads with dozens of GPS points - not a sparse zig-zag with big straight lines between widely-spaced points. If it renders as a straight line or looks unrealistically angular, that's the bug we just fixed; screenshot the map and the GPS-points count from the Active Recording screen.

- **Tap the Active Recording screen while a trip is running.** Reachable from four places: the Live Activity, the Dynamic Island, the persistent ongoing notification, and a new amber banner on the dashboard. All four should open the same screen with live distance, duration, and a one-tap End Trip. If one doesn't open it, screenshot which one.

- **Set a saved location.** Set Home, Work, or your depot. Sit there for half an hour - you shouldn't get a "you started driving" notification. If you do, screenshot it and the location.

## Other things worth trying

- **Persistent lock-screen notification during a trip.** Lock screen shows an ongoing notification for the duration. Tap to view live stats or end the trip. Safety net when iOS silently drops the Live Activity.

- **Every push notification deep-links somewhere useful.** Tax-deadline reminders open Exports. Unclassified-trip nudges open the trips list. Stuck-recording alerts open the Active Recording screen. Payment-failed alerts open Settings. If a tap lands on the wrong screen, tell me which notification.

- **Change your password.** Profile → Change Password. Needs your current password. Other devices will be signed out.

- **Receipt scanning (Pro).** Camera at a parking ticket, fuel receipt, or toll. Runs entirely on your phone, nothing uploaded.

- **Siri Shortcuts.** "Hey Siri, start my shift", "How many miles today?", "Log expense".

- **Self Assessment wizard (Pro).** Exports tab. Walks you through which MileClear numbers go in which HMRC SA103 boxes.

- **Accountant Portal (Pro).** Invite by email from Settings. Read-only access to trips, expenses, earnings without an account.

- **App Store rating prompt.** Appears after a successful trip on day 3+. "Maybe Later" or "Already Rated" both fine.

## Under the hood (Build 51)

- **Recording-mode upgrade verify and retry.** When auto-detection promotes a trip to active recording, the app now verifies the GPS task switched to high-accuracy mode and retries after 500ms if iOS suspended JS mid-switch. Fixes the sparse-trace bug.

- **Apple subscription handling.** TestFlight purchases auto-link to your account.

- **Stuck-recording watchdog.** Prevents trips left in a recording state when iOS stops delivering updates.

- **Background-location permission detection.** Spots when iOS has silently revoked permission.

## Reporting bugs

Message me on the MileClear Facebook group or email gair@mileclear.com. Screenshot + rough time-of-day appreciated. Include the trip ID (in the trip detail view) if you can.
