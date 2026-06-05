# Spec: Push-to-Start Live Activity (auto Dynamic Island on drive start)

**Status:** proposed (target 1.3.1, after 1.3.0 ships)
**Goal:** the Live Activity / Dynamic Island appears **on its own** the moment ClearTrack detects a drive in the background - the "glance at your phone and see it recording without opening the app" experience.

## Why this is the only path

iOS refuses `Activity.request()` from the background. Confirmed on Anthony's build-75 drive (5 Jun), the exact error:

> `native_la_start_blocked {"error":"The operation couldn't be completed. Target is not foreground"}`

This is a hard Apple restriction (iOS 16.2+, unchanged through 26). The **only** sanctioned way to start a Live Activity when the app isn't in the foreground is **push-to-start**: a remote APNs push of type `liveactivity` with `event: "start"`. There is no on-device workaround. The foreground catch-up (start the LA when the user opens the app mid-drive) stays as the fallback for users who don't get the push.

## The flow

```
ClearTrack detects drive (background)
   → app POSTs "trip started" to our API (it has background runtime; it's already recording)
   → API sends an APNs push-to-start to the device's push-to-start token
   → iOS starts the Live Activity (~2-5s after the drive begins)
   → the APP updates the LA's distance/time as it records (Activity.update IS allowed from background)
   → on trip end, the app ends the LA on-device
```

Key simplification: **only the START needs a push.** Updating and ending a *running* Live Activity is allowed from the background, and we already do it (`updateLiveActivity` / `endLiveActivity`). So the server only ever sends the start push - no ongoing push stream.

## What we already have (reuse)

- **Widget + attributes:** `MileClearAttributes` + `LiveActivityView` (`plugins/with-live-activities/widget/`). The LA renders perfectly (proven). `NSSupportsLiveActivities` is set.
- **Native start/update/end:** `LiveActivityModule.swift` (`startActivity`/`updateActivity`/`endActivity`). The foreground path works.
- **On-device LA plumbing:** `lib/liveActivity/index.ts` (start/update/end/recover) + the `startNativeAutoTripLiveActivity` call in `nativeLocation.ts` openNativeRecording.
- **Push token registration shape:** `lib/notifications/index.ts` already registers an Expo push token to the user; `/notifications` route + `user.pushToken` storage exist. We mirror that for the LA token.
- **`jose`** is already a server dependency (used for JWKS) - reuse it to sign the APNs ES256 JWT, so no new crypto lib.

## What's genuinely new

### 1. Native (Swift) - `LiveActivityModule.swift`
- Observe `Activity<MileClearAttributes>.pushToStartTokenUpdates` (iOS 17.2+) and surface the token to JS via an event/promise. This token is per-device, fairly stable, can rotate.
- (Optional, later) expose each started activity's `pushTokenUpdates` if we ever want server-driven updates - **not needed for v1**, the app self-updates.
- Guard for iOS < 17.2: no push-to-start token, so those devices fall back to the foreground catch-up.

### 2. Mobile (JS)
- On launch / token change: read the push-to-start token and `POST /notifications/la-token` to store it on the user (next to `pushToken`).
- In `openNativeRecording` (the background drive-start path): fire a lightweight `POST /trips/signal-start` so the server knows to push. Best-effort, never blocks recording. Include the initial content (vehicle, business mode, started-at) so the push has accurate first state.
- Keep the foreground catch-up as the fallback (already shipped).

### 3. Server (API) - the real work
- **Storage:** `liveActivityPushToStartToken` column on `users` (or a small device table if multi-device matters).
- **APNs client (new):** sign an ES256 JWT with the APNs Auth Key (`jose`), HTTP/2 POST to `api.push.apple.com` (prod) / `api.sandbox.push.apple.com` (dev). Reusable for future LA pushes.
- **`POST /trips/signal-start`:** auth'd; builds and sends the push-to-start to that user's token.
- **Push-to-start payload:**
  - headers: `apns-push-type: liveactivity`, `apns-topic: com.mileclear.app.push-type.liveactivity`, `apns-priority: 10`
  - body: `aps.timestamp`, `aps.event: "start"`, `aps.attributes-type: "MileClearAttributes"`, `aps.attributes: {...}`, `aps.content-state: {...}`, optional `aps.alert` (so the user also gets a subtle "Recording your trip" banner).
- Cooldown / idempotency so a flaky double-signal doesn't start two activities.

## The one hard dependency

**An APNs Auth Key (.p8) from the Apple Developer account.** We have no APNs credentials today (everything goes through Expo). James (account holder) generates it: Apple Developer → Keys → new key with **Apple Push Notifications service (APNs)** enabled. We then need:
- the `.p8` file (stored as a server secret, never committed)
- Key ID, Team ID, Bundle ID (`com.mileclear.app`)

**Nothing else can proceed past native/mobile token plumbing until this key exists.** Worth requesting from James now so it's ready.

## Phases

1. **Native token plumbing** - observe `pushToStartTokenUpdates`, expose to JS. (~0.5 day) *Native build needed.*
2. **Mobile** - register the LA token, fire the trip-start signal. (~0.5 day) *Ships in the same native build.*
3. **Server APNs** - JWT signer (jose) + HTTP/2 sender + `/signal-start` + payload + token storage + migration. (~1.5 days) *Gated on the APNs key.*
4. **End-to-end + edges** - latency tuning, token rotation, iOS-version floor, idempotency, sandbox vs prod APNs. (~1 day)

**Total ~3-4 days of work, gated on the APNs key.** Native + server, **not OTA** (the native token observation must be in a binary - so it lands in a build, e.g. 1.3.1).

## Interim option (OTA, cheap) - if you want *any* feedback before push-to-start

Fire a quiet **local notification** when ClearTrack starts a recording in the background ("MileClear is recording your trip"). Local notifications *can* be shown from a background task (the old engine did it). JS-only, OTA-able. Downside: a notification on every drive is more intrusive than the silent Live Activity. Recommend this only as a stopgap; the Live Activity is the better UX.

## Honest scope note

This is a real feature, not a patch. It does not block 1.3.0 - the core (trips recording reliably) is proven. Push-to-start is the headline of 1.3.1. The single blocker to starting the server half is the APNs Auth Key from James.
