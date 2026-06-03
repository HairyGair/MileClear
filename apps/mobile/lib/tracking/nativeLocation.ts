// Native location engine adapter (react-native-background-geolocation / Transistor).
//
// WHY: expo-location's background delivery is non-deterministic on some iOS
// devices — a recording starts, the app backgrounds, and iOS silently stops
// feeding GPS, leaving trips stuck at a few coords (Anthony, 2 June: a drive
// captured 3 coords / 0.07mi then nothing for 7 min). The native engine uses
// CLLocationManager + native motion detection, which iOS keeps delivering to
// even when backgrounded or terminated. This replaces ONLY the wake + capture
// layer; the existing finalize → distance/map-match → offline sync pipeline is
// reused untouched.
//
// SAFETY / ROLLOUT:
//   - Behind a feature flag (isNativeLocationEngineEnabled), default OFF. The
//     fleet runs the existing expo-location path unchanged until a device
//     explicitly opts in.
//   - The native module is loaded via require() in a try/catch so this file
//     compiles and runs even when the dependency isn't installed (Expo Go,
//     OTA-only builds, before the first dev build). isNativeEngineAvailable()
//     reports whether the native binary is actually present.
//   - iOS needs NO licence (Transistor's iOS release builds are free); Android
//     would need a licence later. DEBUG builds are free on both.
//
// STATUS: scaffolding. The event→pipeline wiring is in place and reuses the
// real finalize path; config values are sensible defaults to tune on-device.

import { getDatabase } from "../db/index";
import {
  logDetectionEvent,
  finalizeAutoTrip,
  isDriveDetectionEnabled,
  startNativeAutoTripLiveActivity,
} from "./detection";

// ─── Lazy, crash-safe native module load ────────────────────────────────────
// Never a static import: the module is native-only (crashes in Expo Go, absent
// until a dev build installs it), and a static import would break typecheck and
// the JS-only/OTA paths. Typed `any` deliberately — no types without the dep.
type BgGeo = {
  ready: (config: Record<string, unknown>) => Promise<unknown>;
  start: () => Promise<unknown>;
  stop: () => Promise<unknown>;
  onLocation: (cb: (loc: NativeLocation) => void, err?: (e: unknown) => void) => void;
  onMotionChange: (cb: (e: NativeMotionEvent) => void) => void;
  removeAllListeners: () => Promise<unknown>;
  // Native location store (survives JS-runtime suspension). getLocations()
  // returns every fix RNBG persisted natively; destroyLocations() clears them.
  getLocations: () => Promise<Array<{ coords?: NativeLocation["coords"]; timestamp: string }>>;
  destroyLocations: () => Promise<unknown>;
  // Force RNBG into continuous-tracking (moving) state immediately, bypassing
  // CoreMotion's slow "automotive" classification — the short-journey backstop.
  changePace?: (isMoving: boolean) => Promise<unknown>;
  DESIRED_ACCURACY_NAVIGATION: number;
  DESIRED_ACCURACY_HIGH: number;
  PERSIST_MODE_LOCATION: number;
  [key: string]: unknown;
};

interface NativeLocation {
  coords: { latitude: number; longitude: number; speed: number | null; accuracy: number | null };
  timestamp: string;
  is_moving?: boolean;
}
interface NativeMotionEvent {
  isMoving: boolean;
  location: NativeLocation;
}

// Short-journey backstop thresholds. A single confident driving-speed fix
// force-starts a recording, so the native engine doesn't depend solely on
// CoreMotion's automotive classification (which is latent by design — 20s to
// ~2min — and loses the start of short 1-2 mile trips).
const FORCE_START_SPEED_MS = 12 * 0.44704; // ~12 mph — clearly automotive, above run pace
const FORCE_START_ACCURACY_M = 30; // require a tight fix to avoid GPS-spike false starts

let bgGeo: BgGeo | null = null;
let loadAttempted = false;

function loadNativeModule(): BgGeo | null {
  if (loadAttempted) return bgGeo;
  loadAttempted = true;
  try {
    const mod = require("react-native-background-geolocation");
    bgGeo = (mod?.default ?? mod) as BgGeo;
  } catch {
    bgGeo = null; // not installed / Expo Go — caller falls back to JS engine
  }
  return bgGeo;
}

/** True only when the native binary is actually present (a dev/production build
 *  that bundled the module). False in Expo Go and OTA-only builds. */
export function isNativeEngineAvailable(): boolean {
  return loadNativeModule() !== null;
}

// ─── Configuration (tune on-device) ─────────────────────────────────────────
function buildConfig(BGGeo: BgGeo): Record<string, unknown> {
  return {
    // Capture
    desiredAccuracy: BGGeo.DESIRED_ACCURACY_NAVIGATION,
    distanceFilter: 20, // metres between recorded fixes while moving
    // Motion detection — the native engine decides moving/stationary from the
    // motion coprocessor, which is what makes wake reliable.
    stopTimeout: 5, // minutes of stillness before it declares the trip stopped
    stationaryRadius: 25,
    // Lifecycle — the whole point: survive background + termination.
    stopOnTerminate: false,
    startOnBoot: true,
    enableHeadless: true,
    // iOS background behaviour
    pausesLocationUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
    // CRITICAL: persist every fix in RNBG's OWN native SQLite store. The JS
    // onLocation callback writes to detection_coordinates, but iOS suspends the
    // JS runtime on a long backgrounded drive — so those callbacks stop firing
    // and the route is lost (Anthony, 3 June: a 14.6mi drive saved only 2
    // coords). Native persistence survives suspension; we drain it on finalize
    // via getLocations() and rebuild the buffer if JS missed fixes. autoSync
    // stays off — we upload through our own offline sync queue, not RNBG's HTTP.
    persistMode: BGGeo.PERSIST_MODE_LOCATION ?? 1,
    autoSync: false,
    // Quieter logs in production.
    debug: false,
    logLevel: 0,
    foregroundService: true,
  };
}

let started = false;

/**
 * Start the native engine. Idempotent. Wires native location + motion events
 * into the EXISTING detection_coordinates buffer + finalizeAutoTrip pipeline,
 * so distance/map-match/phantom-guards/offline-sync all still apply.
 */
export async function startNativeLocationEngine(): Promise<boolean> {
  const BGGeo = loadNativeModule();
  if (!BGGeo) return false;
  if (started) return true;

  try {
    await BGGeo.removeAllListeners();

    // onLocation: buffer every fix into the same table the JS task uses. The
    // finalize path reads detection_coordinates ordered by recorded_at.
    BGGeo.onLocation(
      (loc: NativeLocation) => {
        void handleNativeLocation(loc);
      },
      (err: unknown) => {
        logDetectionEvent("native_location_error", {
          error: err instanceof Error ? err.message.slice(0, 120) : String(err),
        }).catch(() => {});
      }
    );

    // onMotionChange: the reliable driving signal. moving → mark recording
    // active; stationary → finalize the trip through the existing pipeline.
    BGGeo.onMotionChange((event: NativeMotionEvent) => {
      void handleNativeMotionChange(event);
    });

    await BGGeo.ready(buildConfig(BGGeo));
    await BGGeo.start();
    started = true;
    logDetectionEvent("native_engine_started", {}).catch(() => {});
    return true;
  } catch (err) {
    logDetectionEvent("native_engine_start_failed", {
      error: err instanceof Error ? err.message.slice(0, 160) : String(err),
    }).catch(() => {});
    return false;
  }
}

export async function stopNativeLocationEngine(): Promise<void> {
  const BGGeo = loadNativeModule();
  if (!BGGeo || !started) return;
  try {
    await BGGeo.stop();
    await BGGeo.removeAllListeners();
  } catch {
    // best effort
  }
  started = false;
  logDetectionEvent("native_engine_stopped", {}).catch(() => {});
}

// ─── Event → existing pipeline ──────────────────────────────────────────────

type DB = Awaited<ReturnType<typeof getDatabase>>;

/** Append a fix to the recording buffer + stamp the last-driving-speed time. */
async function bufferCoord(db: DB, loc: NativeLocation): Promise<void> {
  await db.runAsync(
    `INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      loc.coords.latitude,
      loc.coords.longitude,
      loc.coords.speed ?? null,
      loc.coords.accuracy ?? null,
      loc.timestamp,
    ]
  );
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_driving_speed_at', ?)",
    [Date.now().toString()]
  );
}

/**
 * Open a recording: clean the native store, mark recording active, seed the
 * first coord, and fire the Live Activity. reason="speed" also forces RNBG into
 * continuous tracking via changePace (the backstop path), since CoreMotion
 * hasn't classified "moving" yet.
 */
async function openNativeRecording(
  seed: NativeLocation,
  reason: "motion" | "speed"
): Promise<void> {
  const db = await getDatabase();
  const BGGeo = loadNativeModule();
  if (reason === "speed") {
    try {
      await BGGeo?.changePace?.(true);
    } catch {}
  }
  try {
    await BGGeo?.destroyLocations();
  } catch {}
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('auto_recording_active', '1')"
  );
  await bufferCoord(db, seed);
  logDetectionEvent("native_recording_started", {
    accuracy: Math.round(seed.coords.accuracy ?? -1),
    reason,
  }).catch(() => {});
  startNativeAutoTripLiveActivity().catch(() => {});
}

async function handleNativeLocation(loc: NativeLocation): Promise<void> {
  try {
    if (!(await isDriveDetectionEnabled())) return;
    const db = await getDatabase();
    // Heartbeat: stamp every native fix (recording or not) so the diagnostics
    // screen can positively confirm the native engine is alive and delivering
    // locations, instead of only inferring it from the enabled flag.
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_native_location_at', ?)",
      [Date.now().toString()]
    );

    const recording = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
    );
    if (recording?.value === "1") {
      await bufferCoord(db, loc);
      return;
    }

    // Short-journey backstop: a single confident driving-speed fix force-starts
    // a recording so we don't wait on CoreMotion's slow "automotive" verdict.
    const speed = loc.coords.speed;
    const acc = loc.coords.accuracy;
    if (
      speed != null &&
      speed >= FORCE_START_SPEED_MS &&
      acc != null &&
      acc <= FORCE_START_ACCURACY_M
    ) {
      // Respect an active shift and the "not driving" cooldown (a dismissed
      // detection), so we don't re-open something the user/app turned off.
      const shift = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
      );
      if (shift) return;
      const ndu = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'not_driving_until'"
      );
      if (ndu && Date.now() < Number(ndu.value)) return;
      logDetectionEvent("native_force_start_from_speed", {
        speedMph: Math.round(speed * 2.23694),
        accuracy: Math.round(acc),
      }).catch(() => {});
      await openNativeRecording(loc, "speed");
    }
  } catch {
    // never throw out of a native callback
  }
}

async function handleNativeMotionChange(event: NativeMotionEvent): Promise<void> {
  try {
    if (!(await isDriveDetectionEnabled())) return;
    // Log every motion-state change (low volume, high diagnostic value) so a
    // dump shows whether RNBG actually fired "moving" when a drive started.
    logDetectionEvent("native_motionchange", {
      isMoving: event.isMoving,
      speed: Math.round((event.location?.coords?.speed ?? -1) * 10) / 10,
    }).catch(() => {});

    const db = await getDatabase();
    const activeShift = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    if (activeShift) return; // shift mode owns GPS

    const BGGeo = loadNativeModule();

    if (event.isMoving) {
      // Driving started (CoreMotion classified it) — open the recording. If the
      // backstop already opened it from a speed fix, this is a harmless no-op.
      const already = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
      );
      if (already?.value !== "1") {
        await openNativeRecording(event.location, "motion");
      }
    } else {
      // Stationary — finalize through the existing pipeline (trim, distance,
      // map-match, phantom guards, offline sync all reused).
      const recording = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
      );
      if (recording?.value === "1") {
        // Rebuild the buffer from RNBG's native store if the JS callbacks were
        // suspended mid-drive and missed fixes, so finalize sees the full route.
        if (BGGeo) await reconcileNativeBuffer(BGGeo);
        logDetectionEvent("native_recording_finalizing", {}).catch(() => {});
        await finalizeAutoTrip();
        try {
          await BGGeo?.destroyLocations();
        } catch {}
      }
    }
  } catch (err) {
    logDetectionEvent("native_motionchange_error", {
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    }).catch(() => {});
  }
}

/**
 * Rebuild detection_coordinates from RNBG's native location store when the JS
 * onLocation callbacks were suspended mid-drive and missed fixes. The native
 * store is authoritative — iOS keeps delivering to RNBG natively even when the
 * JS runtime is asleep — so if it holds more points than the JS buffer, replace
 * the buffer with it so finalize runs on the complete route instead of a
 * 2-point straight line.
 */
async function reconcileNativeBuffer(BGGeo: BgGeo): Promise<void> {
  try {
    const native = await BGGeo.getLocations();
    if (!Array.isArray(native) || native.length === 0) return;
    const db = await getDatabase();
    const jsCount =
      (await db.getFirstAsync<{ c: number }>(
        "SELECT COUNT(*) AS c FROM detection_coordinates"
      ))?.c ?? 0;
    if (native.length <= jsCount) return; // JS buffer already has everything
    await db.runAsync("DELETE FROM detection_coordinates");
    for (const loc of native) {
      const c = loc.coords;
      if (!c) continue;
      await db.runAsync(
        `INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at)
         VALUES (?, ?, ?, ?, ?)`,
        [c.latitude, c.longitude, c.speed ?? null, c.accuracy ?? null, loc.timestamp]
      );
    }
    logDetectionEvent("native_buffer_reconciled", {
      jsCount,
      nativeCount: native.length,
    }).catch(() => {});
  } catch (err) {
    logDetectionEvent("native_reconcile_error", {
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    }).catch(() => {});
  }
}
