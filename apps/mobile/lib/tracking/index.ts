// GPS tracking and trip detection logic
// Uses expo-location + expo-task-manager for background location
// Stores coordinates in SQLite, segments into trips on shift end

import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getDatabase } from "../db/index";
import { syncCreateTrip } from "../sync/actions";
import {
  startDriveDetection,
  stopDriveDetection,
  cancelAutoRecording,
  clearNotDrivingCooldown,
  shiftSuppressesAutoDetection,
  getJourneyEndMinutes,
  logDetectionEvent,
} from "./detection";
import { reverseGeocode } from "../location/geocoding";
import { getScheduleClassification } from "../schedule/index";
import { setDepartureAnchor } from "../geofencing/index";
import { bestTraceDistance, computeSustainedSpeedMph, computeTripQuality, filterTraceOutliers } from "@mileclear/shared";
import { segmentsToSave } from "./shiftSegments";
import { lastDrivingFixMs, type ShiftFix } from "./staleShiftRule";
import { cancelParkedReminder, reconcileParkedReminder } from "./parkedReminder";
import { shiftTripClassification } from "./shiftClassificationRule";
import { journeyBoundaryMs } from "./journeyBoundary";
import {
  ARRIVED_PENDING_SHIFT_ID,
  PENDING_ARRIVED_KEY,
  buildDiscardReport,
  parsePendingArrived,
  pendingArrivedAction,
  type PendingArrivedCrumb,
  type PendingArrivedFacts,
} from "./arrivedRecovery";

const LOCATION_TASK_NAME = "mileclear-background-location";
const QUICK_TRIP_SHIFT_ID = "__quick_trip__";
const MIN_TRIP_DISTANCE_MILES = 0.1;

export interface StoredCoordinate {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recorded_at: string;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Drop RNBG's native location store. Best effort; a missing module is fine. */
async function discardNativeStore(): Promise<void> {
  try {
    const { destroyNativeLocations } = await import("./nativeLocation");
    await destroyNativeLocations();
  } catch {
    // best effort
  }
}

/**
 * Re-apply the native engine's power mode after the shift lock changes. A
 * shift or a Start Trip records with its own GPS task, so the automatic
 * engine drops to low power for its duration and comes back after
 * (enginePowerRule.ts, 26 Sep 2026: 9,390 navigation fixes taken and skipped
 * in 48 h because both ran at once). Never throws.
 */
async function applyNativeEnginePower(source: string): Promise<void> {
  try {
    const { applyEnginePower } = await import("./nativeLocation");
    await applyEnginePower(source);
  } catch {
    // best effort: the next wake or foreground re-applies it
  }
}

/**
 * iPhone with Automatic trips switched off: start the automatic engine for a
 * shift or Start Trip anyway (5 Oct 2026). On iOS the engine at full power is
 * what keeps the app awake in the background for the shift's own GPS task
 * (see enginePowerRule.ts). With the switch off the engine is stopped, so the
 * shift recorder dozed between fixes: iPhone shifts with under 10 GPS points
 * a mile were 14% for drivers with the switch off against 1% with it on,
 * before 28 Sep, and about a third since. The engine's own fixes are still
 * ignored while the switch is off (handleNativeLocation returns before
 * buffering), and the shift's end stops it again (startDriveDetection ->
 * enforceDriveDetectionOff). Never throws.
 */
async function keepEngineAwakeForLock(source: string): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const { isDriveDetectionSwitchOn } = await import("./detection");
    if (await isDriveDetectionSwitchOn()) return; // on, or only paused: the engine is already handled
    const { isNativeEngineAvailable, startNativeLocationEngine, applyEnginePower } = await import("./nativeLocation");
    if (!isNativeEngineAvailable()) return;
    await startNativeLocationEngine();
    await applyEnginePower(source);
  } catch {
    // best effort: the shift still records with its own task
  }
}

export async function requestLocationPermissions(): Promise<boolean> {
  // Foreground permission is sufficient - background is best-effort
  // (Expo Go can't grant background permission at all)
  try {
    const { status: foreground } =
      await Location.requestForegroundPermissionsAsync();
    if (foreground !== "granted") return false;
  } catch {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== "granted") return false;
    } catch {
      return false;
    }
  }

  // Try background permission but don't require it
  try {
    await Location.requestBackgroundPermissionsAsync();
  } catch {
    // Expected in Expo Go - foreground-only is fine
  }

  // Request Motion & Fitness too. The native engine's CoreMotion start-detection
  // needs it to catch the moment a drive begins (especially short trips);
  // without it, detection falls back to the slower geofence path. Best-effort.
  try {
    const { requestMotionPermission } = await import("./motionPermission");
    await requestMotionPermission();
  } catch {
    // no-op on builds without expo-sensors
  }

  return true;
}

export async function isTrackingActive(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
}

/**
 * Stop the background location task WITHOUT the rest of the quick-trip teardown
 * (no coord read, no detection restart, no anchor).
 *
 * For the self-heal paths in detection.ts, which release a stranded
 * __quick_trip__ lock themselves and must not call stopQuickTripTracking() —
 * that restarts drive detection, which re-enters shiftSuppressesAutoDetection.
 * Leaving the task running is not harmless: it goes on delivering fixes, and
 * the moment anything re-sets active_shift_id those land under the stale id
 * again. On Android it also keeps the tracking foreground notification up.
 */
export async function stopQuickTripLocationTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {
    // best-effort: the caller has already released the lock
  }
  // The deadman reminder belongs to this Start Trip; it ends with it.
  await cancelParkedReminder("lock_released");
  // Every caller has just released the __quick_trip__ lock (the self-heals in
  // detection.ts, the trip form's save), so the automatic engine can leave
  // low power. Reads the lock fresh, so a lock still held keeps it low.
  await applyNativeEnginePower("quick_trip_lock_released");
}

export async function startShiftTracking(shiftId: string): Promise<void> {
  // Starting a shift is an explicit "I am driving" signal. Clear any
  // pending not-driving cooldown so the shift records normally.
  await clearNotDrivingCooldown();
  await stopDriveDetection();
  await cancelAutoRecording();

  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('active_shift_id', ?)",
    [shiftId]
  );
  // Stamp when the lock was taken. The staleness check reads the local
  // shifts row for started_at, but that row can be absent (a reinstall, a
  // create that never landed), and a lock with no age can never be judged
  // stale — it then suppresses auto-detection forever. One user sat in
  // exactly that state for six weeks. See shiftSuppressesAutoDetection.
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('active_shift_started_at', ?)",
    [String(Date.now())]
  );
  await applyNativeEnginePower("shift_started");
  await keepEngineAwakeForLock("shift_started_switch_off");

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 50,
      deferredUpdatesInterval: 10000,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: "MileClear is tracking your shift",
        notificationBody: "Tap to open the app",
        killServiceOnDestroy: false,
      },
    });
  } catch {
    // Background location updates not available (e.g. Expo Go) -
    // shift still runs, GPS just won't record in background
    console.warn("Background location updates unavailable - foreground only");
  }
}

export async function stopShiftTracking(): Promise<void> {
  const isTracking = await TaskManager.isTaskRegisteredAsync(
    LOCATION_TASK_NAME
  );
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  const db = await getDatabase();
  await db.runAsync("DELETE FROM tracking_state WHERE key IN ('active_shift_id', 'active_shift_started_at')");
  await applyNativeEnginePower("shift_ended");

  // Clear any leftover detection coordinates and auto-recording state so the
  // detection system cannot finalize a duplicate trip for the same journey.
  await cancelAutoRecording(true);
  // The native engine kept its own copy of every fix while the shift ran;
  // left in place, the next app open's orphan sweep saves the same journey
  // again (Lohitha, 5-8 Sep 2026: 85, 33 and 32 duplicate miles).
  await discardNativeStore();

  await startDriveDetection();

  // Set departure anchor at the shift end point - if iOS terminates the app,
  // the geofence will reliably wake it when the user starts driving again
  setDepartureAnchor().catch(() => {});
}

// ── Quick trip background tracking ──────────────────────────────────────────
// Uses the same background location task as shift tracking, but with a
// pseudo-shift ID. Ensures GPS breadcrumbs continue when the app is backgrounded.

export async function startQuickTripTracking(): Promise<void> {
  await stopDriveDetection();
  await cancelAutoRecording();

  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('active_shift_id', ?)",
    [QUICK_TRIP_SHIFT_ID]
  );
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('active_shift_started_at', ?)",
    [String(Date.now())]
  );

  // Cancel again AFTER the lock is set. The cancelAutoRecording() above runs
  // before anything suppresses detection, so a driving-speed fix landing in
  // between re-arms auto_recording_active and leaves two recorders on the same
  // journey. The auto one then finalizes independently — the stale sweeper
  // fires up to 40 minutes later — producing a fragment trip the user does not
  // recognise and stranding this lock, because that path never calls
  // stopQuickTripTracking(). Freja Bounds, 27 Jul 2026. Once the lock is set
  // the suppression check holds, so this second cancel closes the window.
  await cancelAutoRecording();
  // After the cancel, so the pace-down that comes with low power never lands
  // on an open recording. Before the early return below, so a resumed Start
  // Trip is covered too.
  await applyNativeEnginePower("quick_trip_started");
  await keepEngineAwakeForLock("quick_trip_started_switch_off");

  const isRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRunning) return; // Already running (e.g. resumed after background)

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 50,
      deferredUpdatesInterval: 10000,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: "MileClear is tracking your trip",
        notificationBody: "Tap to open the app",
        killServiceOnDestroy: false,
      },
    });
  } catch {
    console.warn("Background location updates unavailable - foreground only");
  }
}

export async function stopQuickTripTracking(): Promise<StoredCoordinate[]> {
  // Form Arrived / discard: the deadman reminder ends with the trip.
  await cancelParkedReminder("arrived");
  // Stopping the OS subscription is best-effort and MUST NOT be able to skip
  // the cleanup below. It used to throw straight out of this function, so a
  // rejection left active_shift_id in place — a lock nobody could see and
  // nothing would clear, silently muting auto-detection (14 Sep 2026).
  // Failing to stop listening is survivable; failing to drop the lock is not.
  try {
    const isTracking = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {
    // fall through to the deletes
  }

  const db = await getDatabase();

  // Read all coordinates collected during the quick trip
  const coords = await db.getAllAsync<StoredCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM shift_coordinates WHERE shift_id = ? ORDER BY recorded_at ASC",
    [QUICK_TRIP_SHIFT_ID]
  );

  // Clear the automatic engine's copy of this drive BEFORE the lock goes. The
  // lock is what keeps every other path off these fixes; dropped first, the
  // next fix can open a native recording whose app-open rescue saves the
  // leftovers as trips while this Start Trip is still being saved. Kada
  // (46996a27), 29 Sep 2026: lock released 10:52:27, rescue saved 1.2 + 16.2
  // mi from the buffer the same second, his 34.1 mi Start Trip landed 16 s
  // later, so the drive counted twice.
  await cancelAutoRecording(true);
  await discardNativeStore();
  // cancelAutoRecording(true) arms the 20-minute "Not driving" cooldown, which
  // is for "that drive wasn't mine". Nobody said that at Arrive, and it stopped
  // the next drives recording: Samantha Birch tapped Arrive at 17:47 BST on
  // 30 Sep and drove at 17:50, 17:56 and 18:04, none recorded, so she typed
  // them in (Kada's log shows the cooldown set the same second his Start Trip
  // ended). End Shift had the same bug, fixed 23 Sep (shiftEnd.finishShift).
  await clearNotDrivingCooldown().catch(() => {});

  // Clean up
  await db.runAsync("DELETE FROM shift_coordinates WHERE shift_id = ?", [QUICK_TRIP_SHIFT_ID]);
  await db.runAsync("DELETE FROM tracking_state WHERE key IN ('active_shift_id', 'active_shift_started_at')");
  await applyNativeEnginePower("quick_trip_ended");

  // Restart drive detection for the next trip
  await startDriveDetection();

  // Set departure anchor so iOS can wake the app for the next trip
  setDepartureAnchor().catch(() => {});

  return coords;
}

// ── The arrived-but-unsaved trip ────────────────────────────────────────────
//
// "I've Arrived" tears the recording down (shift_coordinates deleted, the
// detection buffer emptied, the native store destroyed) and until 17 Sep 2026
// the only copy of the route from that moment on was React state inside the
// open screen. Backing out took the day with it. The trail and the trip's
// facts are now written here first, and stay until the driver saves or
// discards. See arrivedRecovery.ts for the rules and the drivers it cost.
//
// Deliberately NOT a new table. shift_coordinates already has exactly these
// columns and every read of it is scoped by shift_id, so a reserved id is
// invisible to the shift and quick-trip paths - the same trick __quick_trip__
// already uses. tracking_state already carries quick_trip_start as a JSON
// blob. Both tables exist on every install and are already in the GDPR wipe
// list, so nothing needs migrating: a driver upgrading mid-drive is covered
// the moment the new code runs, which a new table could not promise.

/** Rows per INSERT when saving the trail. A day's driving can be ten thousand
 *  fixes, and one statement each would keep the driver on a spinner; 100 rows
 *  is 600 bound parameters, well inside SQLite's limit. */
const ARRIVED_INSERT_CHUNK = 100;

/** Write the merged trail and the trip's facts, replacing any earlier one. */
export async function savePendingArrivedTrip(
  facts: PendingArrivedFacts,
  crumbs: PendingArrivedCrumb[]
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM shift_coordinates WHERE shift_id = ?", [ARRIVED_PENDING_SHIFT_ID]);
    for (let i = 0; i < crumbs.length; i += ARRIVED_INSERT_CHUNK) {
      const chunk = crumbs.slice(i, i + ARRIVED_INSERT_CHUNK);
      const values = chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
      const params: (string | number | null)[] = [];
      for (const c of chunk) {
        params.push(ARRIVED_PENDING_SHIFT_ID, c.lat, c.lng, c.speed, c.accuracy, c.recordedAt);
      }
      await db.runAsync(
        `INSERT INTO shift_coordinates (shift_id, lat, lng, speed, accuracy, recorded_at) VALUES ${values}`,
        params
      );
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
      [PENDING_ARRIVED_KEY, JSON.stringify(facts)]
    );
  });
}

/** Change a fact or two without rewriting the trail, which can run to
 *  thousands of rows. Used when the road-routed distance lands after the
 *  trail has already been saved. No-op when there is nothing stored. */
export async function updatePendingArrivedTrip(patch: Partial<PendingArrivedFacts>): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = ?",
    [PENDING_ARRIVED_KEY]
  );
  const facts = parsePendingArrived(row?.value ?? null);
  if (!facts) return;
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [PENDING_ARRIVED_KEY, JSON.stringify({ ...facts, ...patch })]
  );
}

/** The stored arrived trip, or null when there is none or it is unreadable. */
export async function loadPendingArrivedTrip(): Promise<{
  facts: PendingArrivedFacts;
  crumbs: PendingArrivedCrumb[];
} | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = ?",
    [PENDING_ARRIVED_KEY]
  );
  const facts = parsePendingArrived(row?.value ?? null);
  if (!facts) {
    // A half-written or corrupt record is not worth keeping its trail either.
    if (row) await clearPendingArrivedTrip();
    return null;
  }
  const stored = await db.getAllAsync<StoredCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM shift_coordinates WHERE shift_id = ? ORDER BY recorded_at ASC",
    [ARRIVED_PENDING_SHIFT_ID]
  );
  return {
    facts,
    crumbs: stored.map((c) => ({
      lat: c.lat,
      lng: c.lng,
      speed: c.speed,
      accuracy: c.accuracy,
      recordedAt: c.recorded_at,
    })),
  };
}

/** Drop it. Called once the trip is saved, or once it is truly discarded. */
export async function clearPendingArrivedTrip(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM shift_coordinates WHERE shift_id = ?", [ARRIVED_PENDING_SHIFT_ID]);
  await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [PENDING_ARRIVED_KEY]);
}

/**
 * Hand a discarded recording back to the server as a missed journey, when it
 * was long enough to be worth asking about. Best effort: a failure here must
 * never stop a driver leaving the screen, and the day is no worse off than it
 * was before this existed.
 *
 * Returns true if a report was actually sent.
 */
export async function reportPendingArrivedDiscard(facts: PendingArrivedFacts): Promise<boolean> {
  const report = buildDiscardReport(facts);
  if (!report) return false;
  try {
    const { reportDiscardedRecording } = await import("../api/trips");
    await reportDiscardedRecording(report);
    return true;
  } catch {
    return false;
  }
}

/**
 * App start: an arrived trip nobody ever saved or discarded. A fresh one is
 * left alone - the trip form puts it back on screen. An old one is reported
 * as a discarded recording, so the day comes back as a "journey you might
 * have missed" card instead of sitting in SQLite forever.
 */
export async function sweepStalePendingArrivedTrip(): Promise<void> {
  try {
    const pending = await loadPendingArrivedTrip();
    if (!pending) return;
    if (pendingArrivedAction(pending.facts, Date.now()) !== "expire") return;
    await reportPendingArrivedDiscard(pending.facts);
    await clearPendingArrivedTrip();
  } catch {
    // Never let a recovery sweep break app start.
  }
}

/**
 * Read background coordinates collected so far without clearing them.
 * Used to update the UI with distance covered while the app was backgrounded
 * (e.g. when the user was using a SatNav app).
 */
export async function peekBackgroundCoordinates(shiftId?: string): Promise<StoredCoordinate[]> {
  const db = await getDatabase();
  const id = shiftId ?? QUICK_TRIP_SHIFT_ID;
  return db.getAllAsync<StoredCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM shift_coordinates WHERE shift_id = ? ORDER BY recorded_at ASC",
    [id]
  );
}

/**
 * Clear the drive detection cooldown so the next drive triggers a notification.
 * Call this after a trip is saved so the return journey gets detected promptly.
 */
export async function clearDetectionCooldown(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM tracking_state WHERE key = 'last_detection_notification'");
}

/**
 * Transition from auto-detection to an interactive quick trip.
 * Transfers buffered detection_coordinates into shift_coordinates so the
 * trip-form map shows the full route from the original detection point.
 * Saves a QUICK_TRIP_KEY so trip-form resumes in "driving" mode.
 * Returns the start coordinate for navigation context, or null if no coords.
 */
export async function promoteDetectionToQuickTrip(): Promise<{
  lat: number;
  lng: number;
  address: string | null;
  startedAt: string;
} | null> {
  const db = await getDatabase();

  // Read buffered detection coordinates
  const rawCoords = await db.getAllAsync<StoredCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM detection_coordinates ORDER BY recorded_at ASC"
  );

  if (rawCoords.length === 0) return null;

  // Safety: if auto_recording_active got stuck ON across a crash, the buffer
  // can contain ancient coords plus fresh ones separated by a large time gap.
  // Detect the gap and keep only the most recent contiguous segment.
  //
  // CRITICAL: do NOT purge by absolute age. A legitimately long drive (e.g.
  // 45-min commute) has an earliest coord >30 min old by the time the user
  // taps the detection notification, but every pair of consecutive coords is
  // only seconds apart. Those must all be kept or the trip starts mid-drive.
  const GAP_THRESHOLD_MS = 30 * 60 * 1000;
  let segmentStart = 0;
  for (let i = 1; i < rawCoords.length; i++) {
    const prev = new Date(rawCoords[i - 1].recorded_at).getTime();
    const curr = new Date(rawCoords[i].recorded_at).getTime();
    if (curr - prev > GAP_THRESHOLD_MS) {
      segmentStart = i;
    }
  }
  const detectionCoords = segmentStart > 0 ? rawCoords.slice(segmentStart) : rawCoords;

  if (detectionCoords.length === 0) return null;

  const first = detectionCoords[0];

  // Transfer detection_coordinates → shift_coordinates under quick trip ID
  for (const c of detectionCoords) {
    await db.runAsync(
      "INSERT INTO shift_coordinates (shift_id, lat, lng, speed, accuracy, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
      [QUICK_TRIP_SHIFT_ID, c.lat, c.lng, c.speed, c.accuracy, c.recorded_at]
    );
  }

  // Reverse geocode the start point for the address
  let address: string | null = null;
  try {
    address = await reverseGeocode(first.lat, first.lng);
  } catch {}

  // Save quick trip start so trip-form resumes in "driving" mode
  const tripStart = {
    lat: first.lat,
    lng: first.lng,
    address,
    startedAt: first.recorded_at,
  };
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    ["quick_trip_start", JSON.stringify(tripStart)]
  );

  // Now start proper quick trip tracking (stops detection, clears auto-recording state, starts high-accuracy GPS)
  await startQuickTripTracking();

  // Clear the detection coordinates (already transferred)
  await db.runAsync("DELETE FROM detection_coordinates");

  return tripStart;
}

/**
 * Process collected GPS coordinates into trips for a completed shift.
 * Segments coordinates based on stop detection (>2 min stationary = trip boundary).
 * Creates each trip via the API. Returns the number of trips created.
 */
// One run per shift at a time. The shift can be closed by the End Shift
// button, the automatic end, the 18-hour ghost-shift release and the app-open
// sweep of leftover breadcrumbs, and two of those can meet on one app open
// (f02756e7, 27 Sep 2026: the automatic end and the orphan sweep in the same
// second). A second caller joins the run already going instead of saving the
// same breadcrumbs again.
const shiftRunsInFlight = new Map<string, Promise<number>>();

export interface ProcessShiftTripsOptions {
  /** Save the trail as ONE trip, never cut at a long stop. */
  whole?: boolean;
  /** Mark the trips driverKeptGoing so the server's visit splitter leaves them whole. */
  driverKeptGoing?: boolean;
}

export function processShiftTrips(
  shiftId: string,
  vehicleId?: string,
  options?: ProcessShiftTripsOptions
): Promise<number> {
  const running = shiftRunsInFlight.get(shiftId);
  if (running) return running;
  const run = processShiftTripsOnce(shiftId, vehicleId, options).finally(() => {
    shiftRunsInFlight.delete(shiftId);
  });
  shiftRunsInFlight.set(shiftId, run);
  return run;
}

/**
 * Turn the breadcrumbs of shifts that are no longer running into trips.
 *
 * A shift's breadcrumbs used to be processed only when that shift was closed,
 * and kept "for retry" if any trip failed, with nothing ever retrying them.
 * The 18-hour ghost-shift release (shiftSuppressesAutoDetection) cleared the
 * lock and left them untouched too. Now that the automatic engine drops fixes
 * a shift's breadcrumbs already cover (ownedFixes.ts), breadcrumbs that are
 * never processed would mean a drive saved by neither, so every app open and
 * every lock release sweeps them. Re-processing is safe: a trip already saved
 * from the same breadcrumbs matches the phone's two-minute dedup and the
 * server's start-time key and comes back as the same trip.
 */
export async function processLeftoverShiftBreadcrumbs(reason: string): Promise<void> {
  try {
    const db = await getDatabase();
    const active = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    const rows = await db.getAllAsync<{ shift_id: string; n: number }>(
      "SELECT shift_id, COUNT(*) AS n FROM shift_coordinates WHERE shift_id NOT IN (?, ?) GROUP BY shift_id",
      [QUICK_TRIP_SHIFT_ID, ARRIVED_PENDING_SHIFT_ID]
    );
    for (const row of rows) {
      if (row.shift_id === active?.value) continue;
      const shift = await db.getFirstAsync<{ vehicle_id: string | null }>(
        "SELECT vehicle_id FROM shifts WHERE id = ?",
        [row.shift_id]
      );
      const created = await processShiftTrips(row.shift_id, shift?.vehicle_id ?? undefined);
      logDetectionEvent("shift_breadcrumbs_processed", {
        reason,
        fixes: row.n,
        tripsCreated: created,
      }).catch(() => {});
    }
  } catch {
    // Best effort: the breadcrumbs stay and the next app open tries again.
  }
}

async function processShiftTripsOnce(
  shiftId: string,
  vehicleId?: string,
  options?: ProcessShiftTripsOptions
): Promise<number> {
  const db = await getDatabase();

  const coords = await db.getAllAsync<StoredCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM shift_coordinates WHERE shift_id = ? ORDER BY recorded_at ASC",
    [shiftId]
  );

  // Delete only what this run read. The shift can be re-attached while the
  // run is out on the network (the dashboard re-attaches a shift the server
  // still calls active), and fixes recorded after the read are not ours.
  const lastRead = coords.length > 0 ? coords[coords.length - 1].recorded_at : null;
  const consumeRead = () =>
    lastRead == null
      ? Promise.resolve()
      : db.runAsync("DELETE FROM shift_coordinates WHERE shift_id = ? AND recorded_at <= ?", [shiftId, lastRead]);

  if (coords.length < 2) {
    await consumeRead();
    return 0;
  }

  // DO NOT delete coordinates yet - only delete after trips are successfully
  // created. Previously coordinates were deleted before trip creation, meaning
  // any failure (API error, crash, memory pressure on long shifts) permanently
  // lost all GPS data with no way to recover.

  const segments = segmentsToSave(
    coords,
    journeyBoundaryMs(await getJourneyEndMinutes()).splitMs,
    options?.whole === true
  );
  // The lock ids are not shifts the server knows. Sending "__quick_trip__"
  // as shiftId failed validation, so every trip the quick-trip recovery
  // rebuilt was rejected and deleted (28 Sep 2026).
  const serverShiftId =
    shiftId === QUICK_TRIP_SHIFT_ID || shiftId === ARRIVED_PENDING_SHIFT_ID ? undefined : shiftId;
  let created = 0;
  let allSucceeded = true;

  for (const segment of segments) {
    if (segment.length < 2) continue;

    // Filter GPS outliers (poor accuracy + speed-jump teleports) before summing.
    // filterTraceOutliers() preserves first + last so the trip start/end stays
    // at the points the user actually saw on the map.
    const filteredSegment = filterTraceOutliers(segment);

    // Sum filtered chord segments, then ask bestTraceDistance() to combine the
    // haversine total with an OSRM map-match across the trace and an OSRM
    // start->end fallback. Map-matching snaps each point to the nearest road,
    // fixing chord-to-arc undercount on winding routes (5-10% gain) and
    // catching detours the start->end call would miss.
    let gpsSumDistance = 0;
    for (let i = 1; i < filteredSegment.length; i++) {
      gpsSumDistance += haversine(
        filteredSegment[i - 1].lat, filteredSegment[i - 1].lng,
        filteredSegment[i].lat, filteredSegment[i].lng
      );
    }

    const first = filteredSegment[0];
    const last = filteredSegment[filteredSegment.length - 1];
    const distanceResult = await bestTraceDistance(filteredSegment, gpsSumDistance);
    const totalDistance = distanceResult.distanceMiles;
    const tripQuality = computeTripQuality(segment, filteredSegment, {
      distanceSource: distanceResult.source,
      matchSucceeded: distanceResult.matchSucceeded,
    });
    // Speed from the trace geometry, recorded for the server's benefit. A
    // shift trip is never walk-suppressed - the driver started the shift
    // themselves, so their intent outranks any sensor - but the server's
    // phantom guards use this to tell a real short hop from GPS drift, and
    // the device's own speed field is too often zero to rely on.
    tripQuality.sustainedSpeedMph = computeSustainedSpeedMph(filteredSegment);

    if (totalDistance < MIN_TRIP_DISTANCE_MILES) continue;

    // Reverse-geocode start and end points for human-readable addresses
    const [startAddress, endAddress] = await Promise.all([
      reverseGeocode(first.lat, first.lng),
      reverseGeocode(last.lat, last.lng),
    ]);

    try {
      // A real shift's trips are business: the driver started the shift to
      // say they were working (28 Sep 2026, a shift-only driver tagging every
      // one by hand). Anything else keeps the work schedule's answer.
      const tripTime = new Date(first.recorded_at);
      const classification = shiftTripClassification(
        serverShiftId,
        await getScheduleClassification(tripTime)
      );

      // Downsample coordinates if the filtered segment exceeds the API limit.
      // API max is 20000; we preserve start + end and evenly sample the rest
      // so a long trip still has a representative route polyline.
      const MAX_COORDS = 20000;
      let tripCoords = filteredSegment;
      if (filteredSegment.length > MAX_COORDS) {
        const step = filteredSegment.length / (MAX_COORDS - 2);
        const sampled = [filteredSegment[0]];
        for (let i = 1; i < MAX_COORDS - 1; i++) {
          sampled.push(filteredSegment[Math.floor(i * step)]);
        }
        sampled.push(filteredSegment[filteredSegment.length - 1]);
        tripCoords = sampled;
      }

      await syncCreateTrip({
        shiftId: serverShiftId,
        vehicleId,
        startLat: first.lat,
        startLng: first.lng,
        endLat: last.lat,
        endLng: last.lng,
        startAddress: startAddress ?? undefined,
        endAddress: endAddress ?? undefined,
        distanceMiles: Math.round(totalDistance * 100) / 100,
        startedAt: first.recorded_at,
        endedAt: last.recorded_at,
        classification,
        coordinates: tripCoords.map((c) => ({
          lat: c.lat,
          lng: c.lng,
          speed: c.speed,
          accuracy: c.accuracy,
          recordedAt: c.recorded_at,
        })),
        gpsQuality: options?.driverKeptGoing
          ? { ...tripQuality, driverKeptGoing: true }
          : tripQuality,
      });
      created++;
    } catch (err) {
      console.error("Failed to create trip from GPS data:", err);
      allSucceeded = false;
    }
  }

  // Only delete coordinates after all trips have been processed.
  // If any trip creation failed, keep the coordinates so they can
  // be reprocessed on the next shift end or app restart.
  if (allSucceeded) {
    await consumeRead();
  } else {
    console.warn(`[processShiftTrips] ${created} trips created but some failed - keeping ${coords.length} coordinates for retry`);
  }

  return created;
}

// Pure, in its own module so it can be tested; re-exported for the live map.
export { segmentTrips } from "./shiftSegments";

// Background task - runs when app is backgrounded, stores coords in SQLite
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Background location error:", error);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };

  try {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );

    if (!result) return;
    const shiftId = result.value;

    for (const loc of locations) {
      await db.runAsync(
        "INSERT INTO shift_coordinates (shift_id, lat, lng, speed, accuracy, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          shiftId,
          loc.coords.latitude,
          loc.coords.longitude,
          loc.coords.speed ?? null,
          loc.coords.accuracy ?? null,
          new Date(loc.timestamp).toISOString(),
        ]
      );
    }
    // A Start Trip left running after parking finishes itself (see
    // QUICK_TRIP_PARKED_MS). The fixes that arrive while the driver walks
    // about are the wakes this check needs; throttled so a stream of them
    // costs one look a minute.
    // "Still on your trip?": every driving fix pushes the OS-held reminder 10
    // minutes out (parkedReminderRule.ts). Reads the batch plus the fix before
    // it, so implied speed works across batch edges. Never breaks storage.
    if (shiftId === QUICK_TRIP_SHIFT_ID) {
      try {
        const recent = await db.getAllAsync<{
          lat: number;
          lng: number;
          speed: number | null;
          accuracy: number | null;
          recorded_at: string;
        }>(
          "SELECT lat, lng, speed, accuracy, recorded_at FROM shift_coordinates WHERE shift_id = ? ORDER BY recorded_at DESC LIMIT ?",
          [shiftId, locations.length + 1]
        );
        const fixes: ShiftFix[] = recent.map((r) => ({
          lat: r.lat,
          lng: r.lng,
          speed: r.speed,
          accuracy: r.accuracy,
          recordedAtMs: new Date(r.recorded_at).getTime(),
        }));
        const drove = lastDrivingFixMs(fixes);
        if (drove != null) await reconcileParkedReminder(drove);
      } catch {
        // the reminder is optional; breadcrumbs are already stored
      }
    }
    if (shiftId === QUICK_TRIP_SHIFT_ID && Date.now() - lastQuickTripParkCheckMs > 60_000) {
      lastQuickTripParkCheckMs = Date.now();
      await shiftSuppressesAutoDetection(db).catch(() => true);
    }
  } catch (err) {
    console.error("Failed to store location:", err);
  }
});

let lastQuickTripParkCheckMs = 0;
