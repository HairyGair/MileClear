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

## Confirmed runtime gaps (build passes, these fail at runtime)

Both were checked in the green build's log:

- **No `google-services.json`** — Android push registration will fail. Needs
  the Firebase project.
- **No Maps SDK key** in the manifest — maps render blank. Needs the Google
  Cloud key restricted by package + SHA-1.
- **RNBG licence injected as empty** (`Adding license-keys to
  AndroidManifest: { license: '' }`). Harmless in debug, which is why
  capture will work in a `development` build and silently will not in a
  release one.

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
