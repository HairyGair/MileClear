# Google Play Console submission pack

Drafted 26 Aug 2026 from the `android-merge` worktree. Every statement below
is grounded in the code or a doc in this repo; anything that could not be
confirmed is marked `VERIFY:`. Paste sections into the Play Console in order.

Sources used: `docs/app-store-listing.md` (the real App Store copy;
`docs/description.md` is a portfolio blurb, not store copy),
`docs/android-port-status.md`, `docs/android-parity.md`,
`apps/mobile/app.json`, `apps/mobile/eas.json`,
`apps/web/src/app/privacy/page.tsx`, `apps/web/src/app/terms/page.tsx`,
`apps/mobile/lib/tracking/`, `apps/mobile/lib/geofencing/`,
`apps/mobile/lib/permissions/location.ts`, `apps/mobile/app/onboarding.tsx`,
`apps/mobile/lib/iap/index.ts`, `apps/api/src/routes/user/index.ts`,
`apps/api/src/services/{discord,appEvents,email,routing,geocoding,mapMatching,openBanking}.ts`,
`prisma/schema.prisma`.

Package: `com.mileclear.app` (app.json, `android.package`). versionCode 1.
App version 1.3.9. Play Developer account: SOYO Studios Ltd (per
android-port-status.md; VERIFY: account exists and is verified).

---

## 1. Store listing

### App name (max 30 chars)

```
MileClear: HMRC Mileage & Tax
```
(28 chars, same as App Store)

### Short description (max 80 chars)

```
Unlimited free mileage tracking for UK drivers. HMRC rates and tax exports.
```
(75 chars)

### Full description (max 4000 chars, UK English)

```
The UK mileage tracker that does not cap your tracking.

MileClear records the miles you drive for gig work, self-employment or your day job, applies the HMRC mileage rates for the right tax year, and turns the log into Self Assessment-ready exports. Tracking is unlimited and free. There is no monthly drive cap and never will be.

Built for UK self-employed drivers on Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, DPD, Evri and Gophr, and for employees who use their own car for work and claim mileage back from their employer.

WHAT IT DOES

- Automatic trip recording. With "Allow all the time" location access, MileClear detects when you start driving and records the trip in the background, including the dead miles between jobs that platforms do not pay for but HMRC recognises. Or tap Start Shift and every trip in the shift is captured until you tap End Shift.
- Works offline. Trips are saved on your phone first and synced when you have signal.
- HMRC rates built in. 55p per mile for the first 10,000 business miles and 25p after (car and van rate from 6 April 2026; earlier tax years keep 45p). Motorbikes 24p flat. The correct rate is applied by trip date.
- Business or personal. Classify each trip, tag the platform, add notes. Saved locations (home, work, depot) help classify automatically.
- Tax Readiness. Live income tax and National Insurance estimate, a suggested weekly set-aside and a countdown to 31 January. Free.
- HMRC Reconciliation. Enter the figures each platform reports to HMRC and see the gap against your tracked total.
- Anonymous benchmarking. Compare your weekly miles, trips and earnings with the median of other MileClear drivers. A privacy floor means no individual is ever exposed.
- Activity heatmap. See which days and hours you actually drive and earn.
- Shift scorecard. An A to F grade for every shift, with cost and wear factored in.
- Vehicles by registration plate. DVLA lookup, MOT history, and reminders before MOT and tax expire.
- Fuel. Log fill-ups and see nearby prices from the UK government fuel price database.
- Earnings and expenses. Log income by platform and expenses in the 15 categories that map to the SA103 form.
- Self Assessment wizard. Step-by-step mapping of your year to the SA103 boxes, with a tax band breakdown. Free to view.
- Personal and Work modes. Everyday driving goals in Personal; HMRC mileage and tax tools in Work.
- Achievements, streaks and weekly recaps, all free.

PRO

MileClear Pro adds exports (CSV, PDF trip log, Self Assessment PDF), CSV earnings import, Open Banking earnings import, auto-classify rules from your work schedule, business insights (earnings per mile and per hour, platform comparison, golden hours, weekly profit and loss), driving analytics, receipt scanning, an accountant share, the journey map, and unlimited vehicles and saved locations. Pro never gates the tracker itself.

PRICING

Free: unlimited tracking, HMRC rate calculation, one vehicle, two saved locations, manual earnings and expenses, fuel prices, Tax Readiness, benchmarking, reconciliation, MOT history, heatmap, shift scorecards, achievements and recaps.

Pro: £4.99 per month or £44.99 per year, billed through Google Play. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in Google Play > Payments and subscriptions.

PRIVACY

Trip data lives on your phone first. We sync to our UK servers what is needed to back up your records and produce your exports. Location is never sold or used for advertising. You can export all your data or delete your account from inside the app.

Privacy Policy: https://mileclear.com/privacy
Terms of Use: https://mileclear.com/terms
Support: support@mileclear.com
```

The block above is 3,769 characters including line breaks; re-count after
any edit. VERIFY: the exact Google Play base plan prices (£4.99 / £44.99)
match what is configured in Play Console > Monetise > Subscriptions.

Deliberately left out of the Android copy: Live Activities, Siri Shortcuts,
CarPlay, home screen widgets, Apple Sign-In, the HMRC attestation cover sheet
and Dynamic Island. All are iOS-only per `docs/android-parity.md` section 4.
VERIFY: the attestation cover sheet is generated server-side and may work on
Android; add it back if the export route is platform-agnostic.

Competitor names (MileIQ, TripLog, Driversnote) appear in the App Store copy
but are omitted here; Play's metadata policy is stricter on referencing other
apps.

### Category, tags, contact

| Field | Value |
|---|---|
| App or game | App |
| Category | Finance (alternative: Business) |
| Tags | Mileage tracker, Tax, Self-employed, Expense tracker, GPS |
| Contact email | support@mileclear.com |
| Contact website | https://mileclear.com |
| Privacy policy URL | https://mileclear.com/privacy |
| Free or paid | Free (with in-app subscription) |
| Contains ads | No |

VERIFY: Play's tag picker is a fixed list; pick the closest matches.

### Graphics needed (not drafted here)

- App icon 512x512 PNG (source: `apps/mobile/assets/branding/icon-1024.png`).
- Feature graphic 1024x500.
- Phone screenshots: minimum 2, 16:9 or 9:16, taken from an Android build.
  The existing screenshots in `apps/mobile/assets/appstore-screenshots/` are
  iPad-framed and show Apple Sign-In; do not reuse them.

---

## 2. Data safety form

Overall answers:

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all user data encrypted in transit? | Yes (HTTPS to api.mileclear.com; app.json has no cleartext traffic allowance) |
| Do you provide a way for users to request that their data is deleted? | Yes (in-app: Profile > Delete Account; API `DELETE /user/account`; email support@mileclear.com) |
| Independent security review | No |
| Committed to Play Families policy | No (not aimed at children) |

Definitions used below: "Collected" = sent off the device to MileClear's
servers. "Shared" = passed to a third party other than a service provider
acting on our instructions (Play treats processors as not shared). "Required"
= the app does not function for its purpose without it.

### Location

| Data type | Collected | Shared | Ephemeral | Required | Purposes |
|---|---|---|---|---|---|
| Precise location | Yes | No | No | Required for trip recording; the user can decline the permission and enter trips manually, so answer Optional if Play insists on one value | App functionality, Analytics (route distance and trip diagnostics) |
| Approximate location | Yes (derived from precise; also sent to the fuel price endpoint) | No | No | Optional | App functionality |

What the code does: `apps/mobile/lib/tracking/` records GPS breadcrumbs during
shifts and during auto-detected drives (native engine
`react-native-background-geolocation`, distanceFilter 20 m; JS engine via
expo-location + expo-task-manager). Coordinates are stored in SQLite on the
phone, then synced to `trip_coordinates` on the server for route replay,
distance calculation and HMRC evidence. `apps/mobile/lib/geofencing/` registers
one OS geofence (the "departure anchor", 200 m around the last parked spot) so
the app can wake when the user drives away. Saved locations are stored as
lat/lng with a radius. Server-side processors that see coordinates: a
self-hosted GraphHopper instance (map matching and routing,
`services/mapMatching.ts`, `services/routing.ts`), Google Maps Routes API as a
routing fallback when GraphHopper is unreachable (`services/routing.ts`), and
Nominatim (OpenStreetMap) for geocoding and reverse geocoding
(`services/geocoding.ts`). Nearby fuel prices send the current lat/lng to the
UK Government Fuel Finder feed lookup (server-side, `services/fuelFinder.ts`).
Google Maps SDK renders the in-app map on Android (react-native-maps).

Deletable: yes. Individual trips can be deleted in-app; account deletion
cascades (`onDelete: Cascade` on Trip, TripCoordinate, SavedLocation,
DiagnosticDump in schema.prisma).

VERIFY: the privacy policy still names OSRM as the routing processor and does
not mention GraphHopper, Google Routes or Nominatim. Update the policy before
submission; Play checks the form against the policy.

### Personal info

| Data type | Collected | Shared | Ephemeral | Required | Purposes |
|---|---|---|---|---|---|
| Name (display name; optional full name for tax PDFs) | Yes | No | No | Display name required at registration, full name optional | App functionality, Account management |
| Email address | Yes | No (sent to email processor only) | No | Required | Account management, App functionality (verification codes, password reset, receipts), Developer communications (product updates; unsubscribe available) |
| User IDs (MileClear UUID) | Yes | No | No | Required | Account management |
| Address | Not collected as a profile field. Trip start and end addresses are derived from location and stored on trips | | | | App functionality |
| Other info: vehicle registration plate | Yes (optional, sent to DVLA and DVSA for lookup) | No | No | Optional | App functionality |
| Other info: bank details for invoices (sort code, account number), National Insurance number for HMRC MTD | Yes, optional, both encrypted at rest | No (NINO goes to HMRC only when the user connects HMRC) | No | Optional | App functionality |

Email processors: Resend HTTP API when `RESEND_API_KEY` is set, Brevo SMTP
otherwise (`services/email.ts`). The MileClear UUID is passed to Google Play
as `obfuscatedAccountId` on purchase (`lib/iap/index.ts` line 196) and to
Stripe as metadata on web checkout.

Deletable: yes, via account deletion. Name and email are editable in-app.

### Financial info

| Data type | Collected | Shared | Ephemeral | Required | Purposes |
|---|---|---|---|---|---|
| User payment info | No. Card details never reach MileClear; Google Play and Stripe hold them | | | | |
| Purchase history | Yes (Play purchase token, order ID, subscription status and expiry: `User.googlePlayPurchaseToken`, `googlePlayOrderId`; Stripe customer and subscription IDs for web purchases) | No | No | Optional (only if the user buys Pro) | App functionality (unlocking Pro), Account management |
| Credit score | No | | | | |
| Other financial info: earnings, expenses, invoices, fuel spend entered by the user; bank transactions imported via Open Banking (Pro, opt-in) | Yes | No | No | Optional | App functionality, Analytics (anonymous benchmarking medians) |

Open Banking: the live provider is TrueLayer (`apps/api/src/lib/truelayer.ts`,
`services/openBanking.ts`). Read-only transaction access, Pro only, user
initiated, disconnectable in-app. VERIFY: the privacy policy still says Plaid.
Fix before submission.

Purchase validation on Android: `routes/billing/google.ts` verifies the
purchase token with the Google Play Developer API; Real-time developer
notifications arrive via a Pub/Sub push endpoint. Stripe web checkout is the
fallback when the native store is unavailable
(`components/paywall/PaywallModal.tsx`, opened in a browser via
expo-web-browser, host pinned to stripe.com). VERIFY: on a Play-distributed
build the fallback must not be reachable for digital goods, or the Stripe URL
must be hidden on Android, to comply with Play's payments policy.

### Messages, Photos and videos, Audio, Files and docs, Calendar, Contacts

| Data type | Answer |
|---|---|
| Messages | Not collected |
| Photos | Receipt images are processed on-device by Google ML Kit text recognition (`react-native.config.js`, Android-only linking); the image is not uploaded. A user-uploaded business logo for invoices is stored (`POST /user/logo`). Answer: Photos collected, Optional, App functionality, not shared |
| Videos, Audio | Not collected |
| Files and docs | CSV files chosen via expo-document-picker for earnings and trip import are parsed server-side (`earnings.csv_imported`, `trips.csv_imported` events). Answer: Files collected, Optional, App functionality, not shared |
| Calendar, Contacts | Not collected |

### App activity

| Data type | Collected | Shared | Ephemeral | Required | Purposes |
|---|---|---|---|---|---|
| App interactions | Yes | No | No | Required (cannot be switched off in-app) | Analytics, App functionality (fraud and abuse prevention), Diagnostics |
| In-app search history | No | | | | |
| Installed apps | No | | | | |
| Other user-generated content | Yes: feedback posts (title and body, visible to other users on the feedback board), trip notes, invoice text | No | No | Optional | App functionality |
| Other actions | Trip, shift, export, billing and sync events as below | | | | |

What is actually logged: `services/appEvents.ts` writes to the `app_events`
table (type, userId, JSON metadata, app version, build number, timestamp).
Around 200 event types exist, for example `trip.created`, `trip.deleted`,
`shift.started`, `shift.completed`, `export.pdf`, `user.login`,
`auth.login_failed`, `billing.subscription_activated`, `feedback.submitted`,
`notification.weekly_recap`, `watchdog.gave_up`, `perf.slow_request`. The
mobile app can post its own events through `POST /user/event`. No third-party
analytics SDK is present in `apps/mobile/package.json` (no Firebase Analytics,
Sentry, PostHog, Mixpanel or similar). Google Analytics 4 is used on the
website only, behind a cookie banner, not in the app.

Deletable: `AppEvent.userId` is `onDelete: SetNull`, so events become
anonymous on account deletion rather than being removed. The
`account.deleted` event deliberately stores the email in its metadata as a
durable deletion record (`routes/user/index.ts`). State on the form that
activity data is retained in anonymised form.

### App info and performance

| Data type | Collected | Shared | Ephemeral | Required | Purposes |
|---|---|---|---|---|---|
| Crash logs | No third-party crash reporter. `error` events may be logged server-side | No | No | Required | Diagnostics |
| Diagnostics | Yes | No | No | Required | Diagnostics, App functionality (proactive alerts for a broken permission state) |
| Other performance data | Yes (`perf.slow_request` server timing) | No | No | Required | Diagnostics |

Diagnostics detail. Two uploads, both to MileClear only:

1. Heartbeat (`POST /user/heartbeat`, on launch and roughly every 24 h):
   background location permission state, notification permission state,
   whether the tracking task is running, app version, build number, OS
   version, pending sync count and sync failure flags, seconds since the last
   trip post, days since the last trip, free disk bytes, background fetch
   status, auto-recording state, last driving speed timestamp, and an iOS
   Live Activity push-to-start token (iOS only).
2. Diagnostic dump (`POST /user/diagnostics`, table `diagnostic_dumps`, one
   row per user, overwritten): platform, OS version, app version, build
   number, a verdict string, a status JSON and the last detection events
   (timestamp, event name, data string). The privacy policy states no
   coordinates are included. VERIFY: confirm `eventsJson.data` never carries
   lat/lng in the current mobile build (`lib/tracking/detection.ts`
   `logDetectionEvent` call sites).

Both are `onDelete: Cascade` and are removed with the account.

### Device or other IDs

| Data type | Collected | Shared | Ephemeral | Required | Purposes |
|---|---|---|---|---|---|
| Device or other IDs | Yes: Expo push token (`POST /notifications/register`), OS version and device platform | No | No | Optional (push permission can be declined) | App functionality (push notifications), Diagnostics |

Push delivery goes through the Expo Push service (`lib/push.ts`,
`exp.host/--/api/v2/push/send`), which on Android relays to Firebase Cloud
Messaging. No advertising ID is read (no ads SDK; VERIFY: run the Play
Console's manifest check for `com.google.android.gms.permission.AD_ID` after
the first AAB upload, since some Firebase artifacts add it transitively).

### Third parties and where data goes

| Party | Role | Data |
|---|---|---|
| Google Play Billing | Store | purchase token, obfuscated account ID |
| Stripe | Processor (web checkout, subscription cancel on account delete) | customer ID, subscription ID, email |
| Resend, Brevo | Processor (email) | email address, message content |
| Expo Push service, then FCM | Processor (push) | push token, notification text |
| GraphHopper (self-hosted) | Processor (routing, map matching) | coordinate traces, unlinked to identity |
| Google Maps Routes API | Processor (routing fallback) | start and end coordinates |
| Nominatim (OpenStreetMap) | Processor (geocoding) | coordinates or address text |
| Google Maps SDK for Android | On-device map rendering | map tile requests from the device |
| DVLA, DVSA | Lookup | registration plate |
| UK Government Fuel Finder | Lookup | approximate location |
| TrueLayer | Processor (Open Banking, Pro, opt-in) | bank consent, transactions |
| HMRC (MTD, sandbox only today) | Regulator, user-initiated | NINO, business ID, period submissions |
| Xero, QuickBooks | User-connected accounting (Pro) | mileage and expense items |
| Discord (founder and moderation channels) | Internal alerting | see below |

Discord: `services/discord.ts` posts to private channels via webhooks.
`postFounderAlert` attaches the MileClear user ID as an embed field. The
feedback route posts new feedback with the author's display name or email,
Pro status and trip count (`routes/feedback/index.ts` line 108). Billing
alerts post the user email and ID (`services/billingAlerts.ts` lines 157 to
158). Pro signups are announced with `postProSignup` (VERIFY: check whether
that includes a name or email). Since personal data reaches Discord, list
Discord as a processor in the privacy policy (currently absent; the GDPR
audit already flagged this) and treat these posts as "collected, not shared"
on the form, because Discord acts on MileClear's instructions.

### Account deletion

- In-app: Profile tab > Delete Account. Android gets an inline password modal
  (`confirmDeleteAndroid` in `app/(tabs)/profile.tsx`); OAuth-only accounts
  delete without a password.
- API: `DELETE /user/account` in `apps/api/src/routes/user/index.ts`.
  Verifies the password if one is set, cancels any Stripe subscription,
  writes an `account.deleted` event (metadata: deleted user ID, email,
  premium flag, account age), then `prisma.user.delete`, which cascades to
  trips, coordinates, vehicles, shifts, fuel logs, earnings, saved locations,
  diagnostic dumps and the rest.
- Web: Settings > Account > Danger Zone, per the privacy policy.
- Email: support@mileclear.com.
- Data export: `GET /user/export` returns a JSON file with user profile,
  vehicles, shifts, trips (first 10,000, with up to 1,000 coordinates each),
  fuel logs, earnings, achievements, mileage summaries, anomalies, clients,
  invoices and logo. VERIFY: the export omits several newer models (expenses,
  saved locations, diagnostic dumps and others, as noted in the 14 Aug GDPR
  audit); the Data safety form does not need this, but the policy promise of
  "all your personal data" does.
- Play also wants a web URL for deletion requests. Use
  https://mileclear.com/privacy (section 8) or add a dedicated
  https://mileclear.com/delete-account page. VERIFY: no such page exists in
  `apps/web/src/app/` today.

Retention stated in the policy: trips and location 7 tax years; deleted
accounts anonymised. Note the tension: the code hard-deletes on
`DELETE /user/account` while the policy says data may be retained 7 years for
tax compliance. Either answer is defensible on the form ("data deleted on
request") but the policy wording should match.

---

## 3. Background location permission declaration

Play Console > Policy > App content > Location permissions.

**Permissions declared in app.json:** ACCESS_FINE_LOCATION,
ACCESS_COARSE_LOCATION, ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE,
FOREGROUND_SERVICE_LOCATION, ACTIVITY_RECOGNITION, POST_NOTIFICATIONS.
expo-image-picker and ML Kit add CAMERA and media read permissions at build
time; expo-local-authentication adds USE_BIOMETRIC (app lock). VERIFY: read
the merged manifest from the first EAS build for the exact final list.

### Feature that requires background location

Automatic mileage recording. MileClear is a mileage log for UK tax. The
core promise is that a driver does not have to remember to open the app
before every journey. Two flows depend on location while the app is closed:

1. **Auto trip detection.** `lib/tracking/detection.ts` (JS engine) and
   `lib/tracking/nativeLocation.ts` (react-native-background-geolocation)
   watch for driving speed above 15 mph, then record a GPS trace until the
   vehicle has been stationary for the stop timeout (5 minutes native, 2
   minutes in shift), then save the trip as unclassified for the user to
   review. The user is often not touching the phone at all; it is in a pocket
   or a cradle with the screen off.
2. **Departure anchor geofence.** `lib/geofencing/index.ts` registers one OS
   geofence (200 m) around the last parked position. Its Exit event wakes the
   app into watch mode so the trip starts from the actual departure point
   rather than from wherever the user first noticed. Geofence transitions are
   only delivered with background location on Android.
3. **Shift mode.** Start Shift runs a foreground service with a persistent
   notification ("MileClear is tracking your shift", channel
   `com.mileclear.appTSLocationManager`, proven on the 26 Jul emulator run).
   This works with foreground-only permission while the service is alive but
   the geofence wake and detection between shifts do not.

### Why foreground-only is insufficient

With "Allow only while using the app", Android stops delivering location
once the activity is backgrounded. A delivery driver's phone is locked for
most of a shift. Every trip started without the app open on screen would be
lost, which defeats the purpose of a tax mileage log (a missed 20-mile trip
is about £11 of allowance at 55p). The app degrades gracefully: without
background permission the user can still tap Start before each drive or add
trips manually, and the onboarding step says exactly that.

### Where the user is told and asked (in-app prominent disclosure)

- **Onboarding step 4 of 7** (`app/onboarding.tsx` lines 713 to 870).
  Heading "Never miss a mile". Copy: "MileClear logs every business mile
  automatically, even with your screen off. A forgotten 20-mile trip is about
  £11 you can't claim back." A single "Enable Location" button calls
  `requestOrFixBackgroundLocation()`, which requests foreground first and
  then escalates to background. The step then shows one of three states:
  "Always location on, auto-detection is live"; "You allowed location only
  while using the app. Automatic trip detection needs... In Settings:
  Permissions > Location > Allow all the time, and turn Precise location on"
  with an Open Settings button; or a denied state explaining that trips will
  only record when the user taps Start. There is no skip; the user chooses
  at the OS prompt.
- **Android background rationale dialog** shown by the native engine before
  the OS "Allow all the time" screen (`lib/tracking/nativeLocation.ts` line
  171): title "Allow MileClear to record trips in the background?", message
  "MileClear needs location access all the time so it can record your
  business mileage automatically, including when your phone is locked or the
  app is closed. Without it, trips only record while the app is open on
  screen.", buttons 'Change to "Allow all the time"' and "Cancel".
- **Post-capture upsell** (`lib/permissions/location.ts` around line 150):
  after a manually recorded trip, "Make it automatic? Drives like this can
  record by themselves, even with the app closed and your phone in your
  pocket." with "Not now" and "Make it automatic".
- **Settings explainer** (`lib/permissions/location.ts` line 191 onward):
  Android-specific steps "Permissions > Location > Allow all the time > make
  sure Precise location is on", with Open Settings.
- **Drive detection diagnostics screen** repeats the Settings path.
- **expo-location plugin** string (app.json): "MileClear needs location
  access to track your mileage during shifts and detect when you start
  driving." VERIFY: on Android this string is not shown by the OS; the
  in-app screens above are the disclosure. Google requires the disclosure to
  be shown before the runtime prompt; step 4 satisfies that.

### Declaration text (paste into the form)

```
MileClear is a mileage tracking app for UK tax (HMRC mileage allowance). Its core feature is recording the driver's journeys automatically so they can claim the correct tax deduction. Background location is required for (1) automatic trip detection: the app watches for driving speed and records the route while the phone is locked or the app is closed, saving the trip for the user to classify later; and (2) a departure geofence around the last parked position that wakes the app when the user drives away, so the trip starts from the real departure point. Foreground-only access loses every journey that begins while the app is not on screen, which for a delivery driver is nearly all of them. The user is shown an in-app explanation on onboarding step 4 ("Never miss a mile") before any system prompt, and a second rationale dialog immediately before the "Allow all the time" system screen. Users who decline can still record trips by tapping Start or entering them manually. Location data is used only for the user's own mileage records and is never sold or used for advertising.
```

### Demo video (under 30 seconds) shot list and script

Record on a real Android phone (not the emulator: `adb emu geo fix` cannot
set speed, so detection never arms) using a `development` profile build so
the native engine runs without a licence, or a release build after the
licence is bought. Screen record with the OS recorder; no narration needed,
but on-screen captions help.

| Time | Shot | What to show |
|---|---|---|
| 0 to 5 s | Onboarding step 4 | The "Never miss a mile" screen with its explanation, then tap "Enable Location" |
| 5 to 10 s | Rationale + OS prompts | The "Allow MileClear to record trips in the background?" dialog, tap 'Change to "Allow all the time"', then the Android settings screen with "Allow all the time" selected and Precise on |
| 10 to 14 s | Dashboard | Dashboard shows "ClearTrack is on" (auto detection live). Press the home button, then lock the phone or show the app is not in the recents list |
| 14 to 24 s | Driving (time-lapse or cut) | Phone locked on the dashboard of a car pulling away; a caption "app closed, driving 2 minutes". Optional: the ongoing notification "MileClear is tracking" in the shade |
| 24 to 30 s | Result | Unlock, open MileClear, the Trips tab shows the new auto-recorded trip with route map, distance and "Unclassified" tag |

Keep the same account throughout so the reviewer can match it to the App
access demo account. Upload as an unlisted YouTube link or a direct file,
whichever the form offers.

---

## 4. Other App content declarations

### Content rating (IARC questionnaire)

Category: Utility, Productivity, Communication or Other. Likely answers:

| Question | Answer |
|---|---|
| Violence, sexual content, profanity, drugs, gambling, horror | No |
| Simulated gambling | No |
| Users can interact or exchange content with each other | Yes, limited: the feedback board shows other users' feature requests and votes, and admin replies. Trip and financial data are never visible to other users. VERIFY: whether Play's questionnaire treats a moderated feedback board as UGC; if unsure answer Yes and note admin moderation (`routes/feedback` has admin status update, delete and reply) |
| Shares user location with other users | No |
| Allows purchase of digital goods | Yes (Pro subscription) |
| Contains ads | No |
| Web browser or search engine | No |
| Promotes or facilitates real-money gambling, alcohol, tobacco | No |

Expected rating: PEGI 3 / Everyone.

### App access (instructions for reviewers)

```
All features except the paid Pro tier are available after creating a free account with any email address (a 6-digit verification code is emailed). To review without registering, use the demo account:

Email: demo@mileclear.com
Password: supplied in the Play Console credentials field

The demo account is pre-seeded with vehicles, shifts, trips, earnings, fuel logs and achievements so every dashboard renders with data. Location permission must be granted to test Start Shift and automatic detection; manual trips can be added from the Trips tab without any location permission. Pro features are unlocked on the demo account so exports and business insights can be reviewed without a purchase.
```

VERIFY: the demo account has Pro enabled and was reseeded recently
(`apps/api/scripts/reseed-demo.ts`; last reseed noted 26 Jul). VERIFY: the
demo account's email verification is complete so login does not bounce to the
verify screen. VERIFY: Google Sign-In on Android needs the Android OAuth
client and SHA-1 for the Play signing key, otherwise reviewers see a broken
button; email and password login always works.

### Ads

No ads. The app contains no advertising SDK (`apps/mobile/package.json`).

### Target audience and content

Target age group: 18 and over. Not designed for children; no Families
policy. VERIFY: the Terms of Service (`apps/web/src/app/terms/page.tsx` line
91) allow users aged 16 and over with parental consent under 18. Play's
declaration can still be 18+ (the app is a tax tool for working drivers), but
consider aligning the Terms to 18+ to avoid a mismatch question.

### Financial features declaration

Play asks whether the app provides or facilitates financial products.

| Question | Answer |
|---|---|
| Personal loans, buy-now-pay-later, crypto, securities trading | No |
| Banking, money transfer, payments | No (MileClear never moves money) |
| Does the app offer any financial features? | Answer "Yes, other" if the form has it and describe: "Mileage, earnings and expense tracking for UK Self Assessment. Optional read-only Open Banking connection through TrueLayer (an FCA-authorised AISP) to import income transactions for Pro subscribers. The app does not hold funds, make payments, lend, or give regulated financial advice." Otherwise answer "None of the above" and rely on the description |
| Is your app a licensed financial services provider | No; TrueLayer holds the AISP authorisation. VERIFY: whether Play requires the AISP's licence details for apps using an aggregator |

### Health

No health features. ACTIVITY_RECOGNITION is used only to distinguish
driving from walking for trip detection (motion coprocessor via
react-native-background-geolocation); no health or fitness data is stored or
shown. Declare "My app does not have any health features".

### Government apps

No. MileClear is not developed by or on behalf of a government. It connects
to HMRC's Making Tax Digital API only on a user's explicit instruction and
only in sandbox today.

### News, COVID-19, Data safety cross-checks

News: No. COVID: No.

---

## 5. Pre-launch checklist

Items from `docs/android-port-status.md` "Remaining work" that are still
open in this worktree, plus the extras requested.

### External accounts and credentials (critical path)

- [ ] Play Developer account under SOYO Studios Ltd (company 17214932),
      identity verified, D-U-N-S if Play asks for an organisation account.
- [ ] Firebase project `mileclear-495918` exists and
      `apps/mobile/google-services.json` is present in the worktree (the
      port-status doc predates this) and is tracked in git, so EAS picks it
      up. It contains the restricted Maps key (see next two items).
- [ ] **Google Cloud API key restriction (push blocker).** The Android key
      in app.json is restricted to Maps SDK for Android only. Firebase reuses
      it, so FCM registration is refused. Fix: Google Cloud > Credentials >
      that key > API restrictions > add Firebase Installations API and FCM
      Registration API. Symptom if skipped: silent, no push token ever
      registered.
- [ ] The same Maps key is committed in plain text in app.json and the repo
      is public. Restrict it by package name plus the SHA-1 of both the
      upload key and the Play app-signing key. VERIFY: the key was rotated
      after the 26 Jul leak.
- [ ] Android OAuth client for Google Sign-In (Android project, client ID
      `548565204067-...` already in eas.json as
      `EXPO_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID`). Add the Play app-signing
      SHA-1 as well as the upload SHA-1 or sign-in breaks only in production.
- [ ] Play Developer API service account and JSON key
      (`GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY`
      base64), granted "View financial data" and "Manage orders and
      subscriptions" in Play Console > Users and permissions.
- [ ] Pub/Sub topic for Real-time developer notifications with a push
      subscription to `https://api.mileclear.com/billing/google/webhook?secret=...`
      (`routes/billing/google.ts` `POST /webhook`, prefix registered in
      server.ts) and `GOOGLE_PLAY_RTDN_SECRET` set on prod.
- [ ] Subscription product in Play Console: product ID `premium`, base plans
      `monthly` (£4.99) and `annual` (£44.99). These IDs are hard-coded in
      `apps/mobile/lib/iap/index.ts` and `services/googlePlayBilling.ts`.
- [ ] Set `GOOGLE_PLAY_PACKAGE_NAME=com.mileclear.app` on prod (defaults to
      that anyway).

### Code and build

- [ ] **Package name is permanent.** `com.mileclear.app` in app.json. Once
      the first AAB is uploaded to any track it can never change. Build from
      `apps/mobile`, never the repo root: a stray root `app.json` once made
      EAS offer `com.hairygair00.mileclear`. The root `eas.json` still exists
      in this worktree and should be deleted.
- [ ] `versionCode` is 1 in app.json. Fine for the first upload. Every later
      upload must increase it; consider `"autoIncrement": true` under the
      production profile in eas.json, or bump by hand alongside
      `ios.buildNumber`.
- [ ] **RNBG licence.** `react-native-background-geolocation` plugin has
      `"license": ""` in app.json. Release builds refuse to track without a
      licence. Commit `ac27f29` (in this branch) now detects the failure in
      `start()`, marks `licenceFailed`, falls back to the JS engine and tells
      the user, so the "ClearTrack is on" lie described in the port-status
      doc is closed. But shipping without the licence means every Android
      user runs the JS engine. Buy the Android licence (about £150 to £300
      per year) and paste the key before the production build; keep the
      fallback as insurance.
- [ ] Run the Google Play billing migration on prod with the release:
      `prisma/migrations/20260725_google_play_billing/migration.sql`
      (adds `googlePlayPurchaseToken`, `googlePlayOrderId`). Inert until
      `/billing/google` is used.
- [ ] Stripe fallback on Android: `PaywallModal.tsx` opens Stripe Checkout in
      a browser when native IAP is unavailable. On a Play build IAP is
      available, so this should not trigger, but confirm no Android UI path
      links to web checkout for Pro (Play payments policy).
- [ ] Update the privacy policy before submission: TrueLayer not Plaid,
      GraphHopper, Google Routes and Nominatim not OSRM, Resend alongside
      Brevo, Google Play Billing alongside Apple IAP, Discord as an internal
      processor, Google Sign-In no longer "paused". Play reviewers compare
      the Data safety form against the linked policy.
- [ ] Hide or remove iOS-only help topics on Android (Siri, Live Activities,
      widgets). Parity doc says the Siri help topic is already hidden.
- [ ] Generate the signing keystore via EAS on the first
      `eas build -p android --profile production` run, then back it up.
      Enrol in Play App Signing and record the app-signing SHA-1 for the
      Maps key and OAuth client.

### Testing before wide release

- [ ] First build: `eas build -p android --profile development` from
      `apps/mobile`, install on a real phone, prove auto detection on a real
      drive (emulator cannot set speed). This is the single largest unknown
      in the port: OEM battery killers (Samsung, Xiaomi, Huawei) have never
      been observed.
- [ ] Verify push arrives on Android after the API key fix.
- [ ] Verify maps render (Maps key restricted correctly).
- [ ] Verify a real Play sandbox purchase of `premium` monthly activates Pro
      through `/billing/google` and an RTDN cancel event revokes it.
- [ ] Verify Google Sign-In on a Play-signed build (licence testers on the
      internal track use the app-signing key, not the upload key).
- [ ] Upload to the **Internal testing** track first (up to 100 testers, no
      review delay), then Closed testing. Note: new personal developer
      accounts must run a closed test with 12 testers for 14 days before
      production access; organisation accounts are exempt. VERIFY: which
      applies to the SOYO Studios account.
- [ ] Complete Data safety, Location permissions declaration (with video),
      content rating, target audience, App access and Financial features
      before the first production submission; Play blocks release until all
      App content sections are done.
- [ ] After the first AAB upload, read the Play Console's permission and
      SDK warnings (AD_ID, exact permission list) and correct the Data
      safety form if anything unexpected appears.
- [ ] Reseed the demo account (`apps/api/scripts/reseed-demo.ts`) and
      confirm demo@mileclear.com has Pro before submitting for review.

### Deliberately not done for launch

Per-screen UI polish, Android widgets, Android Auto, an Android equivalent
of Live Activities. None are needed for approval.

## 26 Aug 2026: Play Console state (filled in by Claude, unsaved items noted)

Location permissions declaration text (entered, NOT saved: Play requires a
YouTube video URL before it will save).

App purpose (398 chars):
MileClear is a UK mileage log for self-employed and gig drivers. It records journeys by GPS, classifies them as business or personal, and turns business miles into an HMRC mileage allowance figure for Self Assessment. The core promise is that a driver does not have to remember to open the app before every journey: trips are detected and recorded automatically, then reviewed and classified later.

Location feature (494 chars):
Automatic trip recording. With the phone locked in a pocket or cradle, the app detects driving speed, records the route until the vehicle has been stationary for a few minutes, then saves the trip for the driver to classify. A 200 m geofence at the last parked spot wakes the app so the trip starts from the real departure point. Without background location, trips started with the screen off are lost. Disclosed in onboarding and a rationale dialog before the system prompt; users can decline.

Video: needs a <=30 s YouTube video (unlisted is fine) showing onboarding
step 4 "Never miss a mile" -> Enable Location -> rationale dialog -> OS
"Allow all the time" prompt. Record on the emulator with `adb shell
screenrecord`. Anthony uploads to YouTube.

Health apps declaration: BLOCKED. The manifest carries ACTIVITY_RECOGNITION
(app.json android.permissions line 82), so Play offers no "no health
features" option. Fix = remove ACTIVITY_RECOGNITION from app.json and add
`"blockedPermissions": ["android.permission.ACTIVITY_RECOGNITION",
"com.google.android.gms.permission.ACTIVITY_RECOGNITION"]` so the RNBG
plugin manifest merge does not re-add it, then rebuild. RNBG then relies on
its stationary geofence instead of motion-activity to leave the stationary
state (Transistorsoft: set disableMotionActivityUpdates: true).
