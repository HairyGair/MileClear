# Native Location Engine — bulletproof background trip capture

**Status:** Proposed (29 May 2026). Flagship reliability rebuild. Trip capture is Priority 1.
**Trigger:** Anthony lost ~a week of trips on a device whose iOS geofence silently died; every JS-layer mitigation we tried hit Expo's ceiling.

## 1. The problem, precisely

`expo-location` is the only location API we have in JS, and it cannot reach the iOS primitives that make background trip capture reliable. This week proved each failure mode:

- **Dead geofence, no recovery.** iOS accepted the anchor region (`hasStartedGeofencingAsync → true`) but silently never delivered Exit. Detection went dark for 6+ days.
- **Backstop can't wake.** `pausesUpdatesAutomatically:true` → iOS paused the parked subscription and never resumed it on driving (zero events across an 11-min / 7.7km background drive). Switched to continuous (`false`) as a bridge — but that forces the always-on location indicator we removed on 14 May, and still doesn't survive app termination.
- **Fragile recording hand-off.** Even when a drive was caught, the stop→start to high accuracy left the stream silent → a real 7.7km drive finalized as a 0.1mi phantom and was dropped.
- **No Significant Location Change, no Visit monitoring, no reliable headless relaunch.** These are the exact iOS APIs that wake a *terminated* app on movement with no persistent indicator and ~zero battery. Expo doesn't expose them.

The category leaders (MileIQ, Driversnote, TripLog) all run a **native location engine** for this reason. We've reached the documented end of the reliability ladder (verify-retry → server watchdog → native engine).

## 2. Goal

Background trip capture that:
1. **Wakes on driving even when the app is terminated** (iOS relaunches headless for the location event).
2. **Survives reboots / OS updates / permission toggles** (self-heals).
3. **No always-on location indicator while parked** (motion/SLC-driven, not a held subscription).
4. **Captures dense, accurate routes** through the whole drive.
5. **Feeds the existing pipeline** — SQLite buffer → finalize → sync queue → API — unchanged. We're replacing the *wake + capture* layer, not the trip model.

## 3. The decision: build vs buy

### Recommended: BUY — `react-native-background-geolocation` (Transistor Software)

The industry-standard native location/geofencing engine for RN. It already solves, and has hardened over years, exactly what we've been fighting:
- Motion-activity detection (CMMotionActivity) + Significant Location Change + region monitoring + stationary geofencing.
- **Headless events** — runs our JS handler even when the app is terminated.
- Termination/reboot survival, battery management, debounced start/stop, configurable accuracy.
- A mature JS API + an Android implementation for free when we eventually go Android.

Cost: a one-time per-app license (low hundreds of £ — negligible for the flagship). New native dependency → requires a build (not OTA).

**Why buy:** reliability is the whole point, resources are open, and hand-rolling means re-implementing months of edge-case handling (headless launch, motion fusion, battery heuristics) that this library has already shipped to thousands of apps. For a flagship, buying the proven engine is the lower-risk, faster, more professional path.

### Alternative: hand-roll a Swift `CLLocationManager` module

Full control, no license, fits our existing RN-bridge module pattern (`MileClearLocationModule.swift` + `.m`). But we'd own: headless relaunch wiring, motion-activity fusion, geofence + SLC + visits lifecycle, battery tuning, and the long tail of device-specific quirks. Realistically months to match the library's reliability. Only justified if we refuse a third-party/licensed dep.

## 4. Architecture (with the library)

```
iOS (native, runs even when app terminated)
  react-native-background-geolocation
    ├ motion/SLC/geofence → fires JS headless task on movement
    └ records location stream during motion
        │
JS (our pipeline, mostly unchanged)
  bgGeo.onLocation / onMotionChange / onGeofence
    └ writes coords → detection_coordinates (SQLite)
    └ start/stop "recording" state (reuses enterWatchMode/finalizeAutoTrip)
        └ finalize → trips → sync queue → POST /trips  (UNCHANGED)
```

- The library replaces: the anchor geofence, the backstop subscription, and `startLocationUpdatesAsync` detection.
- We keep: `detection_coordinates`, the finalize/phantom/merge logic, the sync engine, the Live Activity, classification, everything downstream.
- A thin adapter (`lib/tracking/nativeLocation.ts`) maps bgGeo events → our existing buffer + finalize calls, so the trip model and server are untouched.

## 5. Rollout — feature-flagged, no fleet risk

The fleet records fine today via working geofences. We do NOT rip that out until the engine is proven.

- **Phase 0 (done):** `pausesUpdatesAutomatically:false` bridge fix shipped (OTA). Immediate protection while we build.
- **Phase 1:** add the dep + config plugin + entitlements; dev build; wire the adapter behind a `nativeLocationEngine` flag (default OFF). Old JS path stays default.
- **Phase 2:** flag ON for Anthony's device + a handful of TestFlight testers. Soak over real drives; compare capture rate vs the JS path via diagnostics.
- **Phase 3:** ramp the flag across the fleet; once capture is proven superior, delete the JS geofence/backstop path.
- **Rollback:** flip the flag off → instant return to the JS path. Zero migration risk.

## 6. What this needs (and from whom)

- **Anthony:** (a) approve the licensed dependency; (b) run an **EAS dev build** from your machine (native dep can't be OTA'd, and EAS build needs interactive Apple login). Native plugin history shows dev-build-first is our norm.
- **Me:** the adapter, the config plugin, the flagged integration into detection.ts, the diagnostics to measure capture, and the phased rollout. I'll write it so a dev build compiles and we iterate on your device.

## 7. Immediate protection (already live)

`pausesUpdatesAutomatically:false` (commit e9f6683, OTA 33759a4b) makes the current backstop continuous so it wakes on background drives now. Verify with one locked-phone test drive. The native engine is the permanent, no-compromise replacement.
