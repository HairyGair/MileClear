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
4. **ML Kit OCR**: Apple Vision is iOS-only. `parseReceiptText` is reusable, so
   this is the smaller half of the work.
5. **Android permission flows**: Android 13+ POST_NOTIFICATIONS runtime
   request, ACTIVITY_RECOGNITION, and the two-step background location grant.
6. **Play Console submission**: Data Safety form and the background-location
   declaration with demo video — the most common rejection reason for
   tracking apps.

## Deliberately deferred

Per-screen UI polish. Doing it now means doing it twice, once against the
current skin and again after UI 2.0. Get the build green and answer the
capture question first.
