# Facebook release notes post - 25 April 2026

**Angle:** Build 50 / v1.0.10 release announcement. Aimed at the page audience (beta testers, prospects, followers). Picks 8-10 user-facing items from the 21-item full release notes - skips internal/dev plumbing.

**Notes for tuning:**
- 4 sections (tax tools / recording confidence / tracking quality / smaller wins). Each has the 1-3 items that matter to the audience.
- TestFlight link is prominent at the end.
- No em dashes, no emojis.
- ~400 words, longer than usual but fine for an engaged page audience reading an update post.

---

## Draft

Build 50 is live on TestFlight today. This is the second build of version 1.0.10, and it's the biggest update we've shipped this year.

**New tools for tax**

- **Self Assessment wizard** - a step-by-step guide that maps your MileClear data to the actual HMRC SA103 form boxes. Shows exactly which numbers go where, with a full income tax and National Insurance breakdown.
- **Accountant sharing** - invite your accountant to a read-only dashboard with your trips, expenses, and earnings. They can download CSV and PDF exports without needing a MileClear account.
- **Receipt scanning** - point your camera at a fuel receipt, parking ticket, or toll. MileClear extracts the amount, date, and vendor automatically. On-device processing - your images never leave your phone.
- **Siri Shortcuts** - "Hey Siri, start my shift", "How many miles today?", "Log expense", "Weekly goal progress". Hands-free while driving.

**Always knowing it's recording**

- New **Active Recording screen** reachable from the Live Activity, Dynamic Island, persistent notification, or a new amber banner on the dashboard. iOS sometimes silently drops Live Activities; now you can never lose track.
- A **persistent lock-screen notification** stays for the full duration of every auto-detected trip. Tap to view live distance, or to end the trip.
- **Every push notification now opens the right screen.** Tax-deadline reminders open Exports. Unclassified-trip nudges open the trips list pre-filtered. No more tap, navigate, find it manually.

**Tracking quality**

- **Trip distances are noticeably more accurate.** We filter out GPS noise (the random spikes that used to inflate your mileage) and snap routes to actual roads using OpenStreetMap. Expect roughly 5-10% better accuracy on winding country lanes.
- **Stuck-recording watchdog** - if iOS stops delivering location updates mid-trip, a repeating timer now detects it and saves the trip instead of leaving it stuck indefinitely.
- **Auto-detection no longer triggers when parked at a saved location.** Setting Home or Work blocks the false "you started driving" notification when GPS drift makes you briefly look like you're moving at 15mph indoors.

**A few smaller wins**

- Change your password in-app or on the web dashboard, no reset email required.
- Smarter rating prompts - shorter cooldown, plus a new dashboard trigger.
- Fixed an Apple In-App Purchase webhook bug so Pro purchases activate immediately again.

Available now on TestFlight: https://testflight.apple.com/join/SGrmnaaH

If you've been holding off because something felt unreliable, this is the build to update to.
