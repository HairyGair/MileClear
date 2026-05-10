# Geofencing redesign — Phase A tech spec

**Author:** drafted with Claude, 10 May 2026
**Status:** ready to implement
**Targets:** mobile (`apps/mobile/lib/geofencing/index.ts`, `apps/mobile/lib/tracking/detection.ts`), API (telemetry only)
**Estimated effort:** 10–14 working days
**Ships in:** mobile build TBD (probably 1.1.6 or folded into 1.2.0)
**Pro-gated:** yes — entire saved-location auto-trip detection layer

---

## 1. Goals

1. Eliminate cell-tower / cached-fix phantom Enters at the source instead of patching them downstream.
2. Reduce drive-through false-positives to near-zero without the current 90-second dwell delay on real arrivals.
3. Make every Enter event explainable — every fired Enter logs the signals that confirmed it, every suppressed Enter logs why.
4. Move the entire saved-location auto-trip layer behind the Pro paywall, where it belongs given the engineering cost and the per-user benefit.

## 2. Non-goals (explicitly out of scope for Phase A)

- Adaptive radii (Phase B).
- Pattern learning (Phase D).
- Polygonal geofences (deferred indefinitely).
- Replacing iOS native geofencing entirely (we keep it as the wake-the-app trigger).
- Any change to the watch-and-wait detection layer that runs independently of saved locations. That layer keeps working for free users.

## 3. Current architecture — what we're replacing

The current Enter flow:

1. iOS native `Location.startGeofencingAsync` registers up to 20 saved-location regions
2. iOS fires Enter via `TaskManager` background task
3. `handleSavedLocationEnter(regionId)` runs:
   - Position-verify against `Location.getLastKnownPositionAsync()` with `tolerance = radius_meters * 2 + 100`
   - Accuracy gate (build 62): rejects if `pos.coords.accuracy > 100`
   - Sets `geofence_tentative_arrival = regionId`
4. After 90 seconds, three resolution paths:
   - Exit fires inside dwell window → drive-through, discard
   - Exit fires after dwell window → real arrival, finalise inbound trip
   - Dwell elapses with user still inside → real arrival via timer or location-tick

The position-verify and accuracy gate together suppress most cell-tower phantoms. They don't suppress drive-through Enters (rolling at 30 mph through a 100m radius takes ~7 seconds — well under the 90s dwell, so the dwell catches them). They do leave a 90-second latency on every real arrival.

Failure modes still observed:

- iOS occasionally serves a freshly-cached fix that is both *near* the saved location AND has accuracy <100m, but is genuinely from a cell tower not GPS. Both gates pass. Phantom Enter fires.
- Real arrivals always wait 90 seconds before a trip is finalised. Slow on a busy day for a delivery driver doing 30 drops.

## 4. Phase A design — two components

### 4.1 Movement-state classifier

Replaces the unconditional 90-second dwell with a kinematic classifier that decides on the **first** Enter event whether to:

- **Reject immediately** as a drive-through (no tentative state set, no notification)
- **Confirm immediately** as a real arrival (no dwell wait, finalise inbound trip)
- **Tentatively hold** for further confirmation (current behaviour, but now with shorter dwell)

#### Inputs

At Enter time, gather (in parallel):

```ts
const [pos, motion, recent] = await Promise.all([
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
  Pedometer.getStepCountAsync(now - 30s, now),  // optional
  db.getAllAsync(`
    SELECT lat, lng, speed, accuracy, recorded_at
    FROM detection_coordinates
    WHERE recorded_at > ?
    ORDER BY recorded_at DESC
    LIMIT 5
  `, [now - 60s]),
]);
```

`pos` is fresh, not cached — `getCurrentPositionAsync` blocks for a real fix (with timeout). The `recent` history gives us 60 seconds of pre-Enter motion context.

#### Classification rules (in priority order)

```
if pos.coords.accuracy > 100 → REJECT (cell-tower fix; existing accuracy gate)
if recent.length >= 2:
    speed_now = pos.coords.speed (m/s, from CoreLocation Kalman)
    speed_30s_avg = mean of recent speeds within last 30s
    distance_30s = haversine over recent coords

    if speed_now > 6.7  (15 mph)        → DRIVE_THROUGH (immediate reject)
    if speed_30s_avg > 6.7               → DRIVE_THROUGH
    if distance_30s > 200m && speed_now > 2.2 (5 mph) → DRIVE_THROUGH

    if speed_now < 0.5 && distance_30s < 30m → CONFIRMED_ARRIVAL (immediate, no dwell)
    if speed_now < 2.2 && decelerating       → APPROACHING (tentative, 30s dwell)
    if step_count > 15 in last 30s            → CONFIRMED_ARRIVAL (user is walking)

if no recent history (cold start, first Enter of session):
    → APPROACHING (tentative, 30s dwell — safe default)
```

The current 90s dwell becomes 30s, only used for the genuinely ambiguous "approaching" state. Drive-throughs get rejected in milliseconds. Confirmed arrivals fire instantly.

`speed` is iOS-CoreLocation-Kalman-filtered. We already trust it for the watch-and-wait layer. Calculated speed (haversine over 30s) is a sanity check.

#### Telemetry

Every Enter logs `geofence_enter_classified` with:

```ts
{
  locationId,
  outcome: "DRIVE_THROUGH" | "CONFIRMED_ARRIVAL" | "APPROACHING" | "REJECTED_ACCURACY",
  speedNow,
  speed30sAvg,
  distance30s,
  pedometerSteps,
  recentCoordCount,
  durationMs: <classifier execution time>,
}
```

When `outcome=APPROACHING`, the existing `geofence_tentative_arrival` event still fires for backward compat with the diagnostics screen.

### 4.2 Multi-signal Enter confirmation

Rather than one signal (iOS geofence Enter) gated downstream, we require **a confidence score above threshold** built from multiple independent signals.

#### Signals + weights

| Signal | Weight | How it's read |
|---|---|---|
| iOS native geofence Enter | 0.4 | The trigger itself |
| `getCurrentPositionAsync` shows position inside radius with accuracy ≤ 50m | 0.4 | Fresh GPS fix |
| `getCurrentPositionAsync` shows position inside radius with accuracy 50–100m | 0.2 | Lower confidence GPS |
| Recent location updates (within 60s) show approach trajectory toward saved location | 0.3 | History of `detection_coordinates` |
| Pedometer detected walking activity in last 30s (`Pedometer.getStepCountAsync` > 15) | 0.2 | Indicates user got out of the car |
| Time-of-day matches saved-location's most-frequent arrival time (±90 min) | 0.2 | Per-user pattern (Phase D once present; for Phase A: skip this signal) |
| WiFi SSID change matching a known network | 0.3 | iOS exposes via `NEHotspotNetwork` (foreground only — background is more limited; treat as bonus signal when available) |

**Threshold for arrival confirmation: ≥ 0.6 cumulative weight.**

For Phase A we ship signals 1–5 (the WiFi signal is iOS-restricted and complex; defer to Phase B+). Phase D adds the time-of-day pattern signal.

#### Logic

```
score = 0
score += 0.4  // iOS Enter is given
if pos.accuracy <= 50: score += 0.4
elif pos.accuracy <= 100: score += 0.2
if approach_trajectory_detected: score += 0.3
if pedometer_steps_in_last_30s > 15: score += 0.2

if score >= 0.6 → confidence sufficient for Enter
elif score >= 0.4 → APPROACHING (tentative, 30s dwell)
else → SUPPRESSED (log + ignore)
```

#### Telemetry

`geofence_enter_confidence` event with the full score breakdown:

```ts
{
  locationId,
  scoreTotal,
  components: {
    iosEnter: 0.4,
    freshGpsAccuracy: 0.4,
    approachTrajectory: 0.3,
    pedometer: 0,    // 0 if not detected, weight if detected
  },
  outcome: "FIRED" | "TENTATIVE" | "SUPPRESSED",
}
```

## 5. State machine

```
                           ┌─────────────────┐
                           │   IDLE          │
                           │ (no tentative,  │
                           │  no recording)  │
                           └────────┬────────┘
                                    │
                                    │ iOS geofence Enter fires
                                    ▼
                           ┌─────────────────┐
                           │   CLASSIFY      │
                           │ Movement state  │
                           │ Multi-signal    │
                           │ confidence      │
                           └────┬──┬──┬──────┘
                                │  │  │
        ┌───────────────────────┘  │  └──────────────────────┐
        │                          │                         │
        │ confidence < 0.4         │ 0.4 ≤ conf < 0.6        │ confidence ≥ 0.6
        │ OR drive-through         │ OR APPROACHING           │ OR confirmed-stop
        ▼                          ▼                         ▼
  ┌──────────┐            ┌──────────────┐         ┌──────────────────┐
  │ SUPPRESS │            │ TENTATIVE    │         │ CONFIRMED ARRIVAL│
  │ (log)    │            │ (30s dwell,  │         │ (finalise        │
  │          │            │  not 90s)    │         │  inbound trip)   │
  └──────────┘            └──────┬───────┘         └──────────────────┘
                                 │
                  ┌──────────────┼──────────────┐
                  │              │              │
                  │ Exit fires   │ 30s elapsed  │ Confidence
                  │ within 30s   │ + still      │ rises to ≥0.6
                  │              │ inside       │ during dwell
                  ▼              ▼              ▼
              SUPPRESS    CONFIRMED          CONFIRMED
              (drive-     ARRIVAL            ARRIVAL
               through)
```

Compared to the current state machine: same shape, two new gates (`CLASSIFY` outcome can short-circuit straight to `SUPPRESS` or `CONFIRMED ARRIVAL`), shorter dwell window (30s, not 90s).

## 6. Data model

### New tracking_state keys

```
geofence_classify_in_flight    -- locationId currently being classified (debounce)
geofence_last_classify_at_<id> -- ISO timestamp of last classify for this location (debounce window: 30s)
```

### Existing keys (reused)

```
geofence_tentative_arrival       -- still set when state == TENTATIVE
geofence_tentative_arrival_at    -- now means dwell-window start
```

### New `detection_events` event types

- `geofence_enter_classified` — the classifier outcome (per Enter event)
- `geofence_enter_confidence` — the multi-signal score breakdown (per Enter event)
- `geofence_drive_through_classified` — when classifier rejects without dwell
- `geofence_arrival_confirmed_immediate` — when classifier confirms without dwell
- `geofence_classify_suppressed_low_confidence` — when score < 0.4

Existing events (`geofence_tentative_arrival`, `geofence_drive_through`, `geofence_real_arrival`, `geofence_tentative_supplanted`, `geofence_tentative_cleared`) all stay for diagnostic-screen backward-compat.

## 7. Pro gating

The entire saved-location auto-trip detection layer becomes Pro.

### What this means concretely

| Action | Free | Pro |
|---|---|---|
| Save up to 2 locations as map points (existing behaviour) | ✓ | ✓ (unlimited per existing audit) |
| iOS geofence registration for those locations | ✗ (skipped) | ✓ |
| Enter/Exit handlers | ✗ (early-return) | ✓ |
| Auto-trip creation from saved locations | ✗ | ✓ |
| Watch-and-wait auto detection (the speed-based detection that runs independently of saved locations) | ✓ | ✓ |
| Manual trip creation | ✓ | ✓ |
| Manual shift start | ✓ | ✓ |

Free users still get the watch-and-wait detection layer. They just don't get the geofence layer on top.

### Implementation

- `registerGeofences()` early-returns when `user.isPremium === false`
- `unregisterGeofences()` is called when a user's premium expires (subscription lifecycle hook)
- `handleSavedLocationEnter()` early-returns if user is no longer Pro at trigger time (defence in depth — they could downgrade between registration and Enter firing)
- Mobile UI: saved-location form shows "Auto-trip detection (Pro)" badge under the geofence-radius slider; tapping the badge opens the paywall
- Server-side: `/saved-locations` POST + PUT continue to accept geofence-related fields from free users (forward-compat for when they upgrade) but the mobile registration path is the actual gate

### Migration

Existing free users with saved locations and active geofence registrations:

- On next app launch, detect `user.isPremium === false` AND `registered geofences > 0`
- Call `unregisterGeofences()` for those users
- Their saved locations remain in the DB; just become inactive
- Surface a one-shot in-app message: "Saved-location auto-trips are now a Pro feature. Your saved locations are still here as map points; upgrade to re-enable auto-trip detection."

This is a paywall change with user-visible impact. Apple App Review may flag a "removed feature." Mitigations:
- Frame in release notes as "improved geofencing behind Pro" not "removed feature"
- Preserve free-tier saved-location storage (so users can still see + edit their locations)
- Existing trips already created via geofence are unaffected
- The watch-and-wait auto-detection (the bigger trip-capture mechanism) stays free

### Compliance with `paywall_philosophy.md`

The philosophy says "fighting your corner" tax tooling stays free; per-user-cost or community-aggregated features go Pro. Geofence-driven auto-trip detection is genuine engineering complexity with real per-user maintenance burden (multi-signal logic, adaptive radii, pattern learning eventually) — fits the second bucket. Existing Pro tier already gates Pickup Wait Insights, Business Insights, Open Banking, etc. on the same logic. Geofencing is consistent with that tier.

## 8. Test plan

### Unit tests

`apps/mobile/lib/geofencing/__tests__/movementStateClassifier.test.ts`:

- Drive-through at 30 mph (fast iOS speed) → DRIVE_THROUGH
- Drive-through at 30 mph (calculated speed only) → DRIVE_THROUGH
- Stationary at radius edge → CONFIRMED_ARRIVAL
- Approaching at 10 mph decelerating → APPROACHING
- Cold start (no recent history) → APPROACHING
- Cell-tower accuracy fix → REJECTED_ACCURACY (via existing gate)
- Calculated speed > iOS speed (drift) → fall back to iOS speed
- Pedometer steps > 15 + speed < 1 m/s → CONFIRMED_ARRIVAL

`apps/mobile/lib/geofencing/__tests__/multiSignalConfidence.test.ts`:

- Single-signal (iOS Enter only) → 0.4 (suppressed)
- iOS Enter + accurate GPS (≤50m) → 0.8 (fired)
- iOS Enter + medium GPS (75m) + approach trajectory → 0.9 (fired)
- iOS Enter + medium GPS only → 0.6 (fired, on the boundary)
- iOS Enter + drift coords (no approach) + cell-tower fix → 0.4 (suppressed)
- All signals at maximum → 1.0+ (clamped, fired)

`apps/mobile/lib/geofencing/__tests__/proGating.test.ts`:

- Free user → `registerGeofences` returns early
- Pro user → `registerGeofences` registers all
- User downgrades between registration and Enter → `handleSavedLocationEnter` rejects with telemetry
- Existing geofences cleaned up on subscription expiry hook

### Integration / live tests

Anthony's morning drive sequence (the case that exposed today's bug):

- Drive past Kath's at 30+ mph → Enter fires → classifier rejects as drive-through, no notification
- Drive past Mams (in different village, cell-tower phantom case) → accuracy gate rejects, never reaches classifier
- Park at a real saved location, walk inside → CONFIRMED_ARRIVAL fires within seconds, not 90s

To capture: live diagnostic-event log of these test drives, posted to memory `session_test_log_phase_a.md` for future reference.

### Performance / battery

- Movement-state classifier adds ~200-500ms to Enter handler (parallel reads + computation). Acceptable — Enter is rare (<10/day per user).
- `getCurrentPositionAsync` battery cost: one fix per Enter. Already incurred by current position-verify; we're upgrading from cached to fresh.
- No background-task changes; same iOS subsystem hooks.

## 9. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `getCurrentPositionAsync` blocks longer than expected on poor signal | Medium | 5-second timeout. If timeout, fall back to cached position with `cachedFallbackUsed: true` in telemetry. |
| Pedometer permission not granted | High (some users decline motion permission) | Pedometer signal is optional. Score is still functional without it; CONFIRMED arrivals just need the other signals to clear threshold. |
| Multi-signal threshold too tight (real arrivals get suppressed) | Medium | Threshold (0.6) is tunable via constant. Telemetry catches false-suppressions. Hot-fix is one constant change + build. |
| Multi-signal threshold too loose (phantoms get through) | Lower with this design than current | Telemetry distinguishes the suppression vs fire path. Tunable. |
| Pro gating breaks existing free users mid-flow | Medium | Migration path documented (section 7). One-shot user message + saved-locations preserved. |
| iOS edge cases we haven't seen yet | Always | Telemetry-first design. Every classifier outcome logs the inputs. We learn from real data. |

## 10. Rollout plan

### Pre-flight

1. Land Phase A code on `main` behind a feature flag (`EXPO_PUBLIC_GEOFENCE_PHASE_A`, default `false`).
2. Build mobile internally; smoke-test on Anthony's phone.
3. Run his morning routine 2-3 times, verify telemetry tells the right story for each Enter.

### TestFlight

4. Flip flag to `true` for a TestFlight build (1.1.6 likely).
5. Watch admin diagnostic dashboard for `geofence_enter_classified` event distribution. Goal: drive-through count goes up dramatically (we now correctly identify them); phantom rate drops to ~0.

### Production

6. After 1-2 weeks of TestFlight clean, ship to production.
7. Pro gating goes live in the same release.
8. Existing free users hit the migration path (one-shot in-app message).

### Post-flight

9. Track `recording_started` from saved-location path vs from watch-and-wait path. Saved-location path should be Pro-only post-rollout. If we see free-tier saved-location-path starts, paywall gating has a hole.
10. Compare phantom-trip server-side count before/after. Should drop substantially.

## 11. What this spec doesn't cover

- Phase B (adaptive radii) — separate spec, builds on the telemetry from this Phase to learn each location's optimal radius.
- Phase D (pattern learning) — separate spec. Adds the time-of-day signal as the 5th input to the multi-signal score.
- Polygon geofences — out of scope.
- Replacing iOS native geofencing — out of scope; we keep it as the wake trigger.
- Carplay-based "user is in their car" detection — separate workstream, no overlap with this.

## 12. Files touched (estimated)

- `apps/mobile/lib/geofencing/index.ts` — bulk of changes (classifier, multi-signal, pro gating)
- `apps/mobile/lib/geofencing/__tests__/*.ts` — three new test files
- `apps/mobile/lib/tracking/detection.ts` — minor (new event-type constants)
- `apps/mobile/lib/api/savedLocations.ts` — Pro-gating check before registration
- `apps/mobile/components/PremiumGate.tsx` — possibly new "saved-location auto-trip" feature label
- `apps/mobile/app/saved-location-form.tsx` — UI badge "Auto-trip detection (Pro)"
- `apps/api/src/routes/savedLocations/index.ts` — no breaking changes; possibly add a new `autoTripEnabled` field returned in the response

## 13. Open questions for Anthony

1. **Migration UX:** when a free user's geofences get unregistered, do we proactively tell them once ("Saved-location auto-trips are now Pro") or just let it silently stop firing? Strong-recommend the proactive message.
2. **App Review framing:** worth pre-empting Apple's "removed feature" reviewer concern by explicitly noting in the release notes that watch-and-wait auto-detection (the bigger feature) stays free.
3. **Phase A only or A+B together?** Phase B (adaptive radii) builds directly on Phase A's telemetry. Could ship them together; could ship A first and let real-world data inform B's exact threshold tuning. My instinct: ship A standalone first.
4. **Effort estimate:** I've called this 10–14 days. Honest range. If we want it faster, we cut the multi-signal piece and ship just the movement-state classifier first — that's ~5 days and already a significant improvement.

If you want to start coding, the right opening move is: write the unit tests for the movement-state classifier first (TDD), then implement the classifier itself, then wire it into `handleSavedLocationEnter` behind the feature flag. The multi-signal layer is a second pass on top of that foundation.
