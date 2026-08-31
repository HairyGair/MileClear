# Android port — build status

Branch: `android` (off `main`, deliberately not `ui-2.0` so the port doesn't
entangle with the reskin).

Everything here was built without an Android device, an emulator, or any paid
licence. It is inert on iOS: no iOS code path changed behaviour.

## Done

| Area | State |
|---|---|
| Build config | eas.json Android profiles + app.json permissions (`fe50464`) |
| Google Play Billing — server | `services/googlePlayBilling.ts`, `routes/billing/google.ts` (`e0fe3ea`) |
| Google Play Billing — mobile | `lib/iap` handles both stores, `lib/api/billingGoogle.ts` (`e0fe3ea`) |
| Schema | `User.googlePlayPurchaseToken` + `googlePlayOrderId`, migration written |
| **Dependency fixes** | reanimated → ~3.19.5, three SDK-55 packages pinned to SDK 54 (`32cf3b9`) |
| **🟢 First green Android build** | 25 Jul 2026, `assembleDebug`, 9m 52s, build `1dadac3c-bc65-493a-a527-4b2094e5c75d` |

The app compiles for Android. That was the open question; it is now answered.

### Two traps found getting there

1. **Run `eas build` from `apps/mobile`, never the repo root.** A stray
   gitignored `app.json` at the root made EAS treat the root as the project
   and offer `com.hairygair00.mileclear` as the Android package. Android
   package names are permanent once published to Play. The stray file was
   renamed to `app.json.stray-bak`; the tracked root `eas.json` is the other
   half of the same trap and should be deleted.
2. **Do not follow expo-doctor's reanimated advice.** It suggests `~4.1.1`.
   Reanimated 4 is New Architecture only and this app is `newArchEnabled:
   false`. The 3.x line supports both; 3.19.x carries the RN 0.81 patch.

## Not applied yet

`prisma/migrations/20260725_google_play_billing/migration.sql` has **not** been
run against production. The columns are inert until `/billing/google` is live,
so run it with the Android release rather than before it.

## Environment variables needed before /billing/google works

Not added to `.env.example` because that file currently holds parked
monetisation changes.

```
GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL   # Play Developer API service account
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY     # its PEM private key, base64-encoded
GOOGLE_PLAY_PACKAGE_NAME            # defaults to com.mileclear.app
GOOGLE_PLAY_RTDN_SECRET             # shared secret appended to the Pub/Sub push URL
```

RTDN messages are not signed the way Apple's JWS payloads are, so authenticity
comes from the transport. The webhook requires `?secret=` on the push endpoint
URL configured in Google Cloud.

## Play Console setup this assumes

The code expects one subscription product with two base plans:

- Subscription ID `premium`
- Base plan `monthly`
- Base plan `annual`

This differs from the App Store, which uses a separate product per duration
(`com.mileclear.premium.monthly` / `.annual`). If the Play Console is set up
differently, the constants at the top of `lib/iap/index.ts` and
`services/googlePlayBilling.ts` are the only places to change.

## Emulator session, 26 Jul — what running it actually proved

Rig: Pixel 8 emulator (API 34, Play Store image), Metro on 8081 via `adb
reverse`, production API reached through an `ssh -L 3002` tunnel because
Anthony's home IP is WAF-blocked from api.mileclear.com. Logged in as
demo@mileclear.com.

**Proven working on Android:**

| Area | Evidence |
|---|---|
| Login against production | Real address suggestions, real dashboard data |
| All 4 runtime permissions | notifications, precise location, activity recognition, background location ("Allow all the time") |
| Google Maps rendering | Live map tiles + route polyline drawn on the shift screen |
| Native engine (RNBG) | Foreground service on channel `com.mileclear.appTSLocationManager`, flags ONGOING_EVENT / NO_CLEAR / FOREGROUND_SERVICE, notification "MileClear is tracking your shift" |
| Trip capture during a shift | 2.5 mi trip recorded, synced to prod, dashboard 19 → 20 trips, classify nudge fired |
| Dashboard with live data | Benchmarking vs 147 UK drivers, working calendar £562.85 / 12 days |

**NOT proven, and the emulator cannot prove it:**

- **Auto-detection (ClearTrack).** `adb emu geo fix <lon> <lat>` sets position
  but not speed, so detection - which gates on
  DRIVING_SPEED_THRESHOLD_MPH (15) read from the fix - correctly declined to
  start a trip for a phone that kept teleporting while stationary. `geo fix`
  does accept a 5th `<velocity>` argument in knots; retry with that.
- **OEM battery killers.** Samsung/Xiaomi/Huawei Doze behaviour. Needs real
  hardware. This remains the single largest unknown in the port.

## 🔴 LAUNCH BLOCKER: "ClearTrack is on" can lie in a release build

Found while reasoning about the licence, not yet fixed.

RNBG is free in DEBUG builds and licensed for RELEASE. But
`isNativeEngineAvailable()` (nativeLocation.ts:123) only checks
`loadNativeModule() !== null` - i.e. "is the native code present", not "will it
track". In an unlicensed release build the module still loads, so:

- `isNativeEngineAvailable()` returns true
- the engine flag defaults on (nativeEngineFlag.ts: missing flag = on)
- the dashboard says **"ClearTrack is on — drives record automatically"**
- RNBG records nothing

Silent failure, the same shape as the stranded-cohort incident. And the
self-heal won't rescue it quickly: `SELF_HEAL_MIN_ENGINE_AGE_MS` is **3 days**
of no recordings before it falls back to JS, so a new Android user would lose
their first three days.

Options, in preference order:
1. Detect the licence failure on `ready()` and fall back immediately. Robust,
   and also protects against a lapsed or misconfigured licence later.
2. Default Android to the JS engine (one line in nativeEngineFlag.ts) until
   the licence is bought. Ships free today.
3. Buy the licence.

Whichever is chosen, the UI must not be able to claim ClearTrack is on when
tracking cannot happen.

## ⚠️ API key restriction will block push notifications

The Android API key (`AIzaSy...P5sQuY`) is restricted to **Maps SDK for
Android only**. Firebase reused that same key in `google-services.json`, so
push registration will be refused: Android FCM registration also calls

- `firebaseinstallations.googleapis.com` (Firebase Installations API)
- `fcmregistrations.googleapis.com` (FCM Registration API)

Both are outside the allowed list. Evidence: probing the key against Identity
Toolkit returns `403 Requests to this API ... are blocked`, which is the API
restriction rejecting it, not an app restriction.

**Fix:** Google Cloud → Credentials → open the key → API restrictions → add
those two APIs alongside Maps SDK for Android. Symptom if skipped is silent:
no push token, no error the user ever sees.

## Confirmed runtime gaps — ALL RESOLVED (updated 1 Sep 2026)

The three gaps below were real on 26 Jul and are all closed; kept for history.
(The API-key/FCM warning further up is also stale: the key was widened to
Maps + FCM on 26 Aug, and Expo received FCM V1 credentials on 30 Aug.)

- ~~No `google-services.json`~~ — committed since 26 Aug; FCM V1 service
  account uploaded to EAS 30 Aug. Push works once the user grants the
  notification permission (primer shipped by OTA 1 Sep).
- ~~No Maps SDK key~~ — Android-restricted key live; maps confirmed rendering
  on real devices (tester screenshots, 31 Aug).
- ~~RNBG licence empty~~ — licence purchased 27 Aug (order #17198, expires
  27 Aug 2027); key in app.json since versionCode 3. Real-device capture
  confirmed 30 Aug (two auto trips, Swansea).

One genuinely open Android auth item: Google sign-in was broken on ALL
Play-delivered builds until 31 Aug (DEVELOPER_ERROR — Play App Signing
SHA-1 was on no OAuth client; fixed by the "MileClear Android (Play App
Signing)" client in mileclear-495918). Awaiting first successful
Google-method login as confirmation.

## Remaining work, in dependency order

1. **External accounts** (the critical path, all have lead times):
   Play Developer account under SOYO Studios Ltd (17214932), Firebase project
   for FCM, Google Cloud Maps SDK key restricted by package + SHA-1, Android
   OAuth client, Play Developer API service account, Pub/Sub topic for RTDN.
2. **RNBG Android licence** (~£150-300/yr). Note: the Android module works in
   DEBUG builds without a licence, so a `development`-profile build can test
   capture on real hardware before any spend. The `preview` profile builds a
   RELEASE APK, where RNBG will silently refuse to track — do not capture-test
   on preview and conclude Android tracking is broken.
3. **First build**: `eas build -p android --profile development`. Needs a
   keystore, which EAS generates interactively on first run.
4. **Play Console submission**: Data Safety form and the background-location
   declaration with demo video — the most common rejection reason for
   tracking apps.

ML Kit OCR is **done** (`d17493c`) and Android-only via `react-native.config.js`,
so the iOS build is unaffected. Platform-correct permission and biometric
guidance is **done** (`5c2e849`). Both are compile-verified only; neither has
run on a device.

## Deliberately deferred

Per-screen UI polish. Doing it now means doing it twice, once against the
current skin and again after UI 2.0. Get the build green and answer the
capture question first.
