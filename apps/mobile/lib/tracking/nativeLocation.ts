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
  shiftSuppressesAutoDetection,
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
  // Fires every heartbeatInterval seconds while the app is kept alive
  // (preventSuspend). Our backstop for finalizing a parked trip when iOS would
  // otherwise have delayed the stationary onMotionChange.
  onHeartbeat: (cb: (e: { location?: NativeLocation }) => void) => void;
  // Runtime config merge — used to toggle preventSuspend on only while recording.
  setConfig: (config: Record<string, unknown>) => Promise<unknown>;
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

// onHeartbeat backstop: if a recording is open but no native fix has arrived for
// this long, the device is parked and the stationary onMotionChange didn't fire
// — finalize anyway. Generous (beyond stopTimeout: 5) so a long traffic light /
// drive-through doesn't split a trip; the trip-merge logic re-joins anything
// that resumes quickly regardless.
const HEARTBEAT_FINALIZE_STALE_MS = 7 * 60 * 1000;

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
    // Heartbeat: fires every 60s, but ONLY while the app is kept alive
    // (preventSuspend). We turn preventSuspend on for the duration of a
    // recording (see openNativeRecording) so the app survives the ~5min
    // stopTimeout window — otherwise iOS suspends RNBG seconds after the last
    // fix, the stationary onMotionChange can't fire until the next wake
    // (~1h background-fetch), and the trip "self-confirms an hour later"
    // (Anthony, 6 Jun). preventSuspend defaults off here and is toggled per
    // recording so the battery cost is bounded to active drives.
    heartbeatInterval: 60,
    preventSuspend: false,
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
// Single-flight guard. startDriveDetection runs on every app foreground, so two
// foregrounds milliseconds apart both called this before `started` was set at
// the end — each ran removeAllListeners + re-registered onLocation/onMotionChange,
// so every event DOUBLE-FIRED (Anthony, 3 June: paired native_engine_started /
// native_force_start_from_speed / native_recording_started events, stray coords,
// gap-trimmed trips). Dedup concurrent starts so listeners register exactly once.
let startPromise: Promise<boolean> | null = null;

/**
 * Start the native engine. Idempotent + re-entrancy-safe. Wires native location
 * + motion events into the EXISTING detection_coordinates buffer +
 * finalizeAutoTrip pipeline, so distance/map-match/phantom-guards/offline-sync
 * all still apply.
 */
export async function startNativeLocationEngine(): Promise<boolean> {
  const BGGeo = loadNativeModule();
  if (!BGGeo) return false;
  if (started) return true;
  if (startPromise) return startPromise; // a start is already in flight

  startPromise = (async () => {
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

      // onHeartbeat: backstop for finalizing a parked trip. While recording,
      // preventSuspend keeps the app alive and this fires every 60s; if fixes
      // have gone stale (device parked) but the stationary onMotionChange hasn't
      // fired, finalize here so the trip confirms within minutes, not ~1h.
      BGGeo.onHeartbeat(() => {
        void handleNativeHeartbeat();
      });

      await BGGeo.ready(buildConfig(BGGeo));
      await BGGeo.start();
      started = true;
      logDetectionEvent("native_engine_started", {}).catch(() => {});
      // Arm the car-audio + CLVisit triggers (dynamic import avoids a cycle).
      import("./carDetection")
        .then((m) => m.startCarAndVisitTriggers())
        .catch(() => {});
      return true;
    } catch (err) {
      logDetectionEvent("native_engine_start_failed", {
        error: err instanceof Error ? err.message.slice(0, 160) : String(err),
      }).catch(() => {});
      return false;
    }
  })();

  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
}

/**
 * Wake RNBG into continuous tracking immediately, bypassing CoreMotion's latency.
 * Called when an external signal says a drive is starting (car audio connected,
 * a CLVisit departure) so the engine captures from the first metre. The recording
 * itself still opens on the first driving-speed fix (the speed backstop), so this
 * never creates a false trip — it just ensures RNBG is awake and delivering.
 */
export async function wakeNativeTracking(reason: string): Promise<void> {
  const BGGeo = loadNativeModule();
  if (!BGGeo || !started) return;
  try {
    await BGGeo.changePace?.(true);
    logDetectionEvent("native_wake", { reason }).catch(() => {});
  } catch {
    // best effort
  }
}

export async function stopNativeLocationEngine(): Promise<void> {
  const BGGeo = loadNativeModule();
  if (!BGGeo || !started) return;
  import("./carDetection")
    .then((m) => m.stopCarAndVisitTriggers())
    .catch(() => {});
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

/** Great-circle distance in metres. */
function metersBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Plant the departure anchor as the trip's first coordinate so the route reads
 * from where the user actually set off — not from wherever the engine woke up.
 * Critical for SHORT trips, where wake latency loses the whole start. finalize
 * reads coords ORDER BY recorded_at and road-matches them, so this synthetic
 * first point gets routed onto real roads with the rest. The JS geofence path
 * does this on Exit; the native path has no geofence, so it must do it here.
 */
async function plantNativeAnchorBackfill(db: DB, seed: NativeLocation): Promise<void> {
  try {
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM tracking_state WHERE key IN ('departure_anchor_lat', 'departure_anchor_lng')"
    );
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    const aLat = parseFloat(map["departure_anchor_lat"] ?? "");
    const aLng = parseFloat(map["departure_anchor_lng"] ?? "");
    if (!Number.isFinite(aLat) || !Number.isFinite(aLng)) return;
    const distM = metersBetween(aLat, aLng, seed.coords.latitude, seed.coords.longitude);
    // Plant only when the device clearly moved away from the parked spot (so
    // the start really was lost) but the anchor isn't a stale faraway location.
    if (distM < 40 || distM > 5000) return;
    const seedMs = new Date(seed.timestamp).getTime();
    const base = Number.isFinite(seedMs) ? seedMs : Date.now();
    const backfillTs = new Date(base - 30_000).toISOString();
    await db.runAsync(
      `INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at)
       VALUES (?, ?, ?, ?, ?)`,
      [aLat, aLng, 0, 50, backfillTs]
    );
    logDetectionEvent("native_anchor_backfill_planted", {
      distMeters: Math.round(distM),
    }).catch(() => {});
  } catch {
    // best effort — a missing backfill is far better than a thrown callback
  }
}

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
  // Start with a clean buffer. A native recording open is always a fresh start
  // (the engine doesn't pre-buffer before recording), so any coords already in
  // the table are stale leftovers from a prior recording that never finalized
  // (app killed mid-drive). Clearing them stops stale coords mixing with this
  // drive and being (mis)gap-trimmed — the buffer hygiene problem affecting
  // ~1 in 5 users in the fleet diagnostics.
  const cleared = await db.runAsync("DELETE FROM detection_coordinates");
  if (cleared.changes > 0) {
    logDetectionEvent("native_buffer_cleared_on_open", {
      droppedCoords: cleared.changes,
    }).catch(() => {});
  }
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
  // Keep the app alive for the duration of the drive so the ~5min stop window
  // survives iOS suspension and the stationary onMotionChange (+ heartbeat
  // backstop) fire promptly. Released after finalize. Bounds the battery cost
  // of preventSuspend to active recordings only.
  await setNativePreventSuspend(true);
  // Recover the lost start: plant the parked departure anchor as the first
  // coord (earlier timestamp) before the seed, so short trips read from where
  // the user actually set off.
  await plantNativeAnchorBackfill(db, seed);
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
      // detection), so we don't re-open something the user/app turned off. Uses
      // the shared helper so an ORPHANED quick-trip lock self-heals instead of
      // muting the native engine forever (philfixit, 22 Jun).
      if (await shiftSuppressesAutoDetection(db)) return;
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
    // shift mode owns GPS; the shared helper self-heals an orphaned quick-trip
    // lock so it can't permanently block native motion-driven recording.
    if (await shiftSuppressesAutoDetection(db)) return;

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
        // finalizeAutoTrip reconciles RNBG's native store itself (12 Jun 2026)
        // so every finalize path sees the full route — no pre-call needed here.
        logDetectionEvent("native_recording_finalizing", {}).catch(() => {});
        await finalizeAutoTrip();
        try {
          await BGGeo?.destroyLocations();
        } catch {}
        // Drive over — release the wake lock until the next recording opens.
        await setNativePreventSuspend(false);
      }
    }
  } catch (err) {
    logDetectionEvent("native_motionchange_error", {
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    }).catch(() => {});
  }
}

/**
 * Toggle RNBG's preventSuspend at runtime. On = the app is kept alive (so the
 * stop window survives and heartbeats fire); off = iOS may suspend as normal.
 * We hold it on only for the duration of a recording. Best-effort + guarded for
 * Expo Go / older module versions without setConfig.
 */
async function setNativePreventSuspend(on: boolean): Promise<void> {
  const BGGeo = loadNativeModule();
  if (!BGGeo?.setConfig) return;
  try {
    await BGGeo.setConfig({ preventSuspend: on });
  } catch {
    // best effort — a failed toggle just falls back to default suspension
  }
}

/**
 * Heartbeat backstop (fires ~every 60s while recording, because preventSuspend
 * keeps the app alive). If a recording is open but no native fix has landed for
 * HEARTBEAT_FINALIZE_STALE_MS, the device is parked and the stationary
 * onMotionChange hasn't fired — so finalize through the same pipeline. This is
 * what turns the old ~1h "self-confirm" into a ~5-7min one.
 */
async function handleNativeHeartbeat(): Promise<void> {
  try {
    if (!(await isDriveDetectionEnabled())) return;
    const db = await getDatabase();
    // shift mode owns GPS; self-heal an orphaned quick-trip lock here too.
    if (await shiftSuppressesAutoDetection(db)) return;
    const recording = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
    );
    if (recording?.value !== "1") {
      // A heartbeat with no active recording means preventSuspend was left on
      // (e.g. the app was force-quit mid-drive and finalized via another path).
      // Release the wake lock so the app suspends normally — self-healing.
      await setNativePreventSuspend(false);
      return;
    }

    const lastLoc = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'last_native_location_at'"
    );
    const lastMs = lastLoc ? Number(lastLoc.value) : 0;
    if (!lastMs) return;
    const idleMs = Date.now() - lastMs;
    if (idleMs <= HEARTBEAT_FINALIZE_STALE_MS) return; // still moving / recently moved

    const BGGeo = loadNativeModule();
    // finalizeAutoTrip reconciles the native store itself (12 Jun 2026).
    logDetectionEvent("native_heartbeat_finalize", { idleMs }).catch(() => {});
    await finalizeAutoTrip();
    try {
      await BGGeo?.destroyLocations();
    } catch {}
    await setNativePreventSuspend(false);
  } catch (err) {
    logDetectionEvent("native_heartbeat_error", {
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
/**
 * Public, self-gating reconcile for finalizeAutoTrip: drains RNBG's native
 * location store into detection_coordinates whenever the native engine owns
 * detection. EVERY finalize path must judge the FULL route — Sharon
 * Mallinson's 11 Jun drive was captured natively, but the stale-recording
 * sweeper finalized it without reconciling: 5 starved JS coords, judged a
 * walking-shape phantom, real trip discarded while RNBG's store held the
 * whole journey. No-ops on the JS engine or when the module is absent.
 */
export async function reconcileNativeBufferBeforeFinalize(): Promise<void> {
  try {
    const { isNativeLocationEngineEnabled } = await import("./nativeEngineFlag");
    if (!(await isNativeLocationEngineEnabled())) return;
    const BGGeo = loadNativeModule();
    if (!BGGeo) return;
    await reconcileNativeBuffer(BGGeo);
  } catch {
    // best-effort — finalize proceeds on the JS buffer
  }
}

/** Clear RNBG's native location store — post-finalize cleanup so a previous
 *  trip's fixes can never leak into the next recording's reconcile. */
export async function destroyNativeLocations(): Promise<void> {
  try {
    const BGGeo = loadNativeModule();
    await BGGeo?.destroyLocations();
  } catch {
    // best effort
  }
}

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
