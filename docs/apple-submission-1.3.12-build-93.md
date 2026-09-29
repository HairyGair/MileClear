# App Store submission: 1.3.12 (build 93)

Cut 29 Sep 2026 from main @ af13e88a (plus the build bump). Runtime `1.3.12-build93`.
Maintenance release: promotional text and description unchanged from 1.3.11. Rules:
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

## Unchanged from 1.3.11
- Promotional text, description (including the Subscription terms / Terms of Use (EULA) block), keywords, screenshots, support + privacy URLs.
- Release: automatically after approval.
