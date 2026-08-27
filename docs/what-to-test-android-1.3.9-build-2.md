# What to test - Android 1.3.9 (versionCode 2)

The first MileClear build on Android. It is in a Google Play closed test as
of 27 Aug 2026 (release "2 (1.3.9)"), submitted to Google review today, and
internal testers can install now. It is the same 1.3.9 code as the iPhone
app, so the features are the same; **what has never been done is running it
on real Android phones.** That is the whole job of this round.

Google will not let the app into production until the closed test has had
**12 opted-in testers for 14 days**, so installing it and keeping it on the
phone is itself useful, even if you only drive once.

Join link: [JOIN LINK]

## 1. Install and sign in  ⭐ start here

1. Open the join link on the phone, opt in, then install from Google Play.
2. Confirm the version reads 1.3.9 (2) in Settings > About.
3. Sign in with **Google** (new on Android), or with email and password.
   There is no Apple Sign-In on Android; if your MileClear account was
   created with Apple on an iPhone, say so and Anthony will sort it.
4. Go through onboarding and grant location. Pick **"Allow all the time"**
   when Android asks, or automatic recording cannot work. Android usually
   asks in two steps: "While using the app" first, then a second prompt for
   "all the time". If you only see the first one, Settings > Apps > MileClear
   > Permissions > Location > "Allow all the time".

If the app crashes on launch, or sign-in loops, stop there and report it.
Include the phone make, model and Android version.

## 2. Expect "basic tracking" mode

The native recording engine used on iPhone needs a licence we have not bought
for Android yet, so this build records with the JS engine. You will see a
note about basic tracking; that is expected, not a fault. Automatic recording
still works, but it is the part of the app we have the least evidence for on
Android, so section 3 matters most.

## 3. Automatic trip recording  ⭐ the headline

Drive somewhere with the app closed (swiped away, not just backgrounded),
stop for 10 minutes, then drive back.

Expect: a trip for each leg, appearing within a minute of opening the app,
with a route drawn on the map (Google Maps on Android).

Then the harder one: leave the app closed overnight and drive the next
morning. Android phones vary a lot in how hard they kill background apps
(Samsung, Xiaomi, Huawei and OnePlus are the strict ones). If a drive is
missed, tell us the phone model and whether battery optimisation is on for
MileClear (Settings > Apps > MileClear > Battery).

If a drive is missing, use **Missing a trip you made?** in the app. The
diagnostic it attaches is what we fix from.

## 4. Start Trip and shifts

1. Tap **Start Trip** on the dashboard map, drive, tap **I've Arrived**, save.
2. Start a shift, drive two legs with a stop between, end the shift. Expect
   both trips grouped under the shift and a scorecard at the end.

## 5. Manual trip

Add a past trip by typing a start and end address. Expect the road route to
draw on the map and a sensible mileage, not a straight line.

## 6. Money and tax screens (quick pass)

- Classify a trip as business and check the dashboard HMRC figure moves
  (55p per mile for the first 10,000 business miles, 25p after; motorbike 24p).
- Fuel tab: nearby prices load for your area.
- Add an earning and an expense. Both should sync (check Sync status).
- Open the Self Assessment wizard and page through it.

## 7. Not on Android (do not report these)

- Live Activities and Dynamic Island, Siri, CarPlay and home screen widgets.
  These are Apple-only.
- Apple Sign-In.
- **Pro purchase.** Google Play Billing is still being set up, so Pro cannot
  be bought in this build. If you want Pro features to test, ask Anthony and
  it will be switched on for your account.

## 8. Everything else

Anything that works on the iPhone app should work here: trip list and
filters, vehicles with DVLA lookup, saved locations, achievements and recaps,
Work and Personal modes. If something looks wrong, out of place, or cut off
on your screen size, a screenshot is enough.

## How to give feedback

- **support@mileclear.com**, or
- the in-app **Feedback** screen (Profile menu > Feedback).

For a missed drive, always use "Missing a trip you made?" rather than
Feedback, because it attaches the diagnostic.
