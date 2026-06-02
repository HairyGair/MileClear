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
import { logDetectionEvent, finalizeAutoTrip, isDriveDetectionEnabled } from "./detection";

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
  DESIRED_ACCURACY_NAVIGATION: number;
  DESIRED_ACCURACY_HIGH: number;
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
    // We do our own persistence (detection_coordinates + the sync queue), so
    // disable the SDK's SQLite store and HTTP layer.
    persistMode: 0,
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

async function handleNativeLocation(loc: NativeLocation): Promise<void> {
  try {
    if (!(await isDriveDetectionEnabled())) return;
    const db = await getDatabase();
    // Only buffer while a recording is active — motionchange(moving) opens it,
    // motionchange(stationary) closes it. This keeps the buffer scoped to the
    // current drive, exactly like the JS path.
    const recording = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
    );
    if (recording?.value !== "1") return;
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
  } catch {
    // never throw out of a native callback
  }
}

async function handleNativeMotionChange(event: NativeMotionEvent): Promise<void> {
  try {
    if (!(await isDriveDetectionEnabled())) return;
    const db = await getDatabase();
    const activeShift = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    if (activeShift) return; // shift mode owns GPS

    if (event.isMoving) {
      // Driving started — open a recording and seed the first coord.
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('auto_recording_active', '1')"
      );
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_driving_speed_at', ?)",
        [Date.now().toString()]
      );
      await handleNativeLocation(event.location);
      logDetectionEvent("native_recording_started", {
        accuracy: Math.round(event.location.coords.accuracy ?? -1),
      }).catch(() => {});
    } else {
      // Stationary — finalize through the existing pipeline (trim, distance,
      // map-match, phantom guards, offline sync all reused).
      const recording = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
      );
      if (recording?.value === "1") {
        logDetectionEvent("native_recording_finalizing", {}).catch(() => {});
        await finalizeAutoTrip();
      }
    }
  } catch (err) {
    logDetectionEvent("native_motionchange_error", {
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    }).catch(() => {});
  }
}
