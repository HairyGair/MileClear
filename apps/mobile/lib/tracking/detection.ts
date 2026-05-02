import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import { getDatabase } from "../db/index";
import {
  sendDrivingDetectedNotification,
  showRecordingActiveNotification,
  dismissRecordingActiveNotification,
} from "../notifications/index";
import {
  DRIVING_SPEED_THRESHOLD_MPH,
  bestTraceDistance,
  computeTripQuality,
  filterTraceOutliers,
} from "@mileclear/shared";
import { startLiveActivity, updateLiveActivity, endLiveActivity, endLiveActivityWithSummary, recoverLiveActivity } from "../liveActivity";
import { getNotificationPreferences } from "../notifications/preferences";

/**
 * Wrapper around startLiveActivity for auto-detected trips. Honors the user
 * preference `autoTripLiveActivity`: when false, suppresses the LA so it
 * only appears for manually-started trips/shifts. Defaults to true so
 * existing behavior is unchanged for users who haven't opted out.
 */
async function maybeStartAutoTripLiveActivity(
  opts: Parameters<typeof startLiveActivity>[0]
): Promise<void> {
  try {
    const prefs = await getNotificationPreferences();
    if (!prefs.autoTripLiveActivity) return;
  } catch {
    // Pref read failure is non-fatal; default to showing LA.
  }
  await startLiveActivity(opts);
}
import type { TripClassification, PlatformTag } from "@mileclear/shared";

const DETECTION_TASK_NAME = "mileclear-drive-detection";
const BACKGROUND_FINALIZE_TASK = "mileclear-background-finalize";
const BACKGROUND_FETCH_INTERVAL_S = 15 * 60; // 15 minutes - iOS treats as a hint, actual cadence varies
const COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes
const BUFFER_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const SPEED_THRESHOLD_MS = DRIVING_SPEED_THRESHOLD_MPH * 0.44704; // mph to m/s
const FAST_GATE_SPEED_MS = 25 * 0.44704; // 25 mph - bypass consecutive detection gate
const STOP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes - trip ends after this idle period (covers fuel stops, drive-throughs)
const WATCH_MODE_MAX_AGE_MS = 20 * 60 * 1000; // 20 minutes - silently clean up watch mode if no driving is observed in this window
const CONTINUE_SPEED_MS = 1.0; // ~2.2 mph - any movement keeps an active recording alive
const RESUME_DISPLACEMENT_M = 80; // metres - must move this far from stop anchor to resume trip (GPS drift stays within ~30m)
const MIN_AUTO_TRIP_DISTANCE_MILES = 0.3; // Filter noise / parking lot shuffles / GPS drift mini-trips
const MERGE_TIME_WINDOW_MS = 15 * 60 * 1000; // 15 minutes - merge trips that ended within this window
const MERGE_DISTANCE_M = 500; // metres - merge trips whose end/start are within this radius
const GPS_ACCURACY_THRESHOLD = 75; // metres - reject readings with worse accuracy (indoor GPS drift). Bumped from 50 to 75 to catch cold-start GPS fixes that are still accurate enough to trust the iOS-reported speed
const GPS_ACCURACY_STRICT = 30; // metres - stricter threshold for calculated speed (not iOS-reported)
const CONSECUTIVE_DETECTIONS_REQUIRED = 2; // How many consecutive driving-speed callbacks before starting recording (bypassed when speed >= FAST_GATE_SPEED_MS)
const QUIET_HOURS_START = 22; // 10pm
const QUIET_HOURS_END = 7;   // 7am
const BG_PERMISSION_NUDGE_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours - per-session, not persisted
const DETECTION_EVENT_LOG_LIMIT = 500; // Cap rows in detection_events to keep storage bounded
// Module-level state: resets on every cold start of the JS process. This means
// the user gets the permission nudge every cold launch (not gated by the 4h cooldown),
// which is intentional - if they ignored the previous nudge yesterday, they should
// see it again on first launch today.
let lastBgPermissionNudge = 0;

/** Returns true during quiet hours (10pm–7am). Trips still record, just no notifications. */
function isQuietHours(): boolean {
  const hour = new Date().getHours();
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

export interface BufferedCoordinate {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recorded_at: string;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineMeters(lat1, lng1, lat2, lng2) / 1609.344;
}

/**
 * Check whether (lat, lng) is inside any saved location's geofence.
 *
 * Used by the drive-detection task to suppress phantom "you appear to be
 * driving" notifications when the user is clearly at home, work, or any
 * saved depot. Indoor GPS drift with a phone in a pocket can produce
 * speed bursts above the driving threshold (15mph) even when the user is
 * just walking around the kitchen; without this gate those bursts trigger
 * false notifications.
 *
 * The real "leaving a saved location to drive" case is still handled by
 * the separate departure-anchor geofence exit handler, which fires its
 * own notification once the user actually breaches the radius.
 */
async function isInsideAnySavedLocation(lat: number, lng: number): Promise<boolean> {
  try {
    const db = await getDatabase();
    const locations = await db.getAllAsync<{
      latitude: number;
      longitude: number;
      radius_meters: number;
    }>("SELECT latitude, longitude, radius_meters FROM saved_locations");
    for (const loc of locations) {
      // Fallback to schema default (150m) when radius_meters is missing.
      // Indoor GPS drift with phone in pocket can exceed 100m, so a tighter
      // fallback misses real "user is at home" cases.
      const radius = loc.radius_meters > 0 ? loc.radius_meters : 150;
      const distM = haversineMeters(lat, lng, loc.latitude, loc.longitude);
      if (distM <= radius) return true;
    }
    return false;
  } catch {
    // DB not ready or table missing - fail open so detection still works
    return false;
  }
}

/**
 * Determine if any locations indicate driving speed.
 *
 * Returns the highest detected speed in m/s with its source, or null if no
 * driving-speed reading. Source distinguishes iOS-reported (Kalman-filtered,
 * high confidence) from calculated (distance/time, susceptible to GPS noise).
 *
 * Filters out locations with poor GPS accuracy to prevent indoor GPS drift
 * (common when stationary indoors) from triggering false driving detections.
 *
 * The source field lets the caller apply a fast-gate ONLY when we trust the
 * reading. A single calc-speed value at highway speed is almost always GPS
 * jitter; a single reported-speed value at the same level is real driving.
 */
const CALC_SPEED_MIN_DT_SEC = 3; // require at least 3s sample period for calc speed
const CALC_SPEED_MIN_DIST_M = 30; // require at least 30m displacement for calc speed

interface DetectionResult {
  speedMs: number;
  source: "reported" | "calculated";
}

function detectDrivingSpeed(locations: Location.LocationObject[]): DetectionResult | null {
  // Only consider locations with reasonable GPS accuracy.
  // Indoor GPS can drift 50-200m with accuracy values of 50-150+.
  const reliable = locations.filter(
    (loc) => loc.coords.accuracy != null && loc.coords.accuracy <= GPS_ACCURACY_THRESHOLD
  );

  // Trust iOS-reported speed (CoreLocation applies its own Kalman filter).
  // Require speed >= 0 (iOS reports -1 when speed fix is unavailable).
  let maxReportedSpeed = -1;
  for (const loc of reliable) {
    if (loc.coords.speed != null && loc.coords.speed >= 0 && loc.coords.speed > maxReportedSpeed) {
      maxReportedSpeed = loc.coords.speed;
    }
  }
  if (maxReportedSpeed >= SPEED_THRESHOLD_MS) {
    return { speedMs: maxReportedSpeed, source: "reported" };
  }

  // Fall back to calculated speed - require stricter accuracy since distance/time
  // is much more susceptible to GPS drift than iOS's native speed estimation.
  // Two 30m-accurate fixes can legitimately differ by 60m even when the user
  // is stationary, so we additionally require a meaningful sample period AND
  // displacement before trusting calc speed - this kills sub-second jitter.
  const accurate = reliable.filter(
    (loc) => loc.coords.accuracy != null && loc.coords.accuracy <= GPS_ACCURACY_STRICT
  );
  let maxCalcSpeed = -1;
  if (accurate.length >= 2) {
    for (let i = 1; i < accurate.length; i++) {
      const prev = accurate[i - 1];
      const curr = accurate[i];
      const dtSec = (curr.timestamp - prev.timestamp) / 1000;
      const distM = haversineMeters(
        prev.coords.latitude, prev.coords.longitude,
        curr.coords.latitude, curr.coords.longitude
      );
      if (dtSec >= CALC_SPEED_MIN_DT_SEC && distM >= CALC_SPEED_MIN_DIST_M) {
        const calcSpeed = distM / dtSec;
        if (calcSpeed > maxCalcSpeed) maxCalcSpeed = calcSpeed;
      }
    }
  }
  if (maxCalcSpeed >= SPEED_THRESHOLD_MS) {
    return { speedMs: maxCalcSpeed, source: "calculated" };
  }

  return null;
}

/**
 * Append an event to the detection_events log. Capped at DETECTION_EVENT_LOG_LIMIT
 * rows so storage stays bounded. Best-effort: never throws, never blocks the caller.
 *
 * Used to diagnose "trip didn't start" / "wrong start time" reports without
 * requiring users to plug in a debugger.
 */
async function logDetectionEvent(event: string, data?: Record<string, unknown>): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      "INSERT INTO detection_events (recorded_at, event, data) VALUES (?, ?, ?)",
      [new Date().toISOString(), event, data ? JSON.stringify(data) : null]
    );
    await db.runAsync(
      "DELETE FROM detection_events WHERE id NOT IN (SELECT id FROM detection_events ORDER BY id DESC LIMIT ?)",
      [DETECTION_EVENT_LOG_LIMIT]
    );
  } catch {
    // Logging failures must never break detection
  }
}

/** Public accessor for diagnostics screens / GDPR export. */
export async function getRecentDetectionEvents(limit = 100): Promise<Array<{ recorded_at: string; event: string; data: string | null }>> {
  try {
    const db = await getDatabase();
    return await db.getAllAsync<{ recorded_at: string; event: string; data: string | null }>(
      "SELECT recorded_at, event, data FROM detection_events ORDER BY id DESC LIMIT ?",
      [limit]
    );
  } catch {
    return [];
  }
}

export interface DriveDetectionDiagnostics {
  enabled: boolean;
  taskRunning: boolean;
  foregroundPermission: string;
  backgroundPermission: string;
  activeShiftId: string | null;
  autoRecordingActive: boolean;
  quietHours: boolean;
  lastNotificationAt: string | null;
  cooldownRemainingMs: number;
  cooldownMs: number;
  speedThresholdMph: number;
  trackingState: Array<{ key: string; value: string }>;
  bufferedCoordinates: number;
}

/**
 * Gather everything a diagnostics screen needs in one call: runtime flags,
 * permissions, tracking_state dump, and buffered coordinate count. Never throws.
 */
export async function getDriveDetectionDiagnostics(): Promise<DriveDetectionDiagnostics> {
  const result: DriveDetectionDiagnostics = {
    enabled: true,
    taskRunning: false,
    foregroundPermission: "unknown",
    backgroundPermission: "unknown",
    activeShiftId: null,
    autoRecordingActive: false,
    quietHours: isQuietHours(),
    lastNotificationAt: null,
    cooldownRemainingMs: 0,
    cooldownMs: COOLDOWN_MS,
    speedThresholdMph: DRIVING_SPEED_THRESHOLD_MPH,
    trackingState: [],
    bufferedCoordinates: 0,
  };

  try {
    result.enabled = await isDriveDetectionEnabled();
  } catch {}

  try {
    result.taskRunning = await Location.hasStartedLocationUpdatesAsync(DETECTION_TASK_NAME);
  } catch {}

  try {
    const fg = await Location.getForegroundPermissionsAsync();
    result.foregroundPermission = fg.status;
  } catch {}

  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    result.backgroundPermission = bg.status;
  } catch {}

  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM tracking_state ORDER BY key ASC"
    );
    result.trackingState = rows;
    for (const row of rows) {
      if (row.key === "active_shift_id") result.activeShiftId = row.value;
      if (row.key === "auto_recording_active") result.autoRecordingActive = row.value === "1";
      if (row.key === "last_detection_notification") {
        const ts = Number(row.value);
        if (!Number.isNaN(ts)) {
          result.lastNotificationAt = new Date(ts).toISOString();
          result.cooldownRemainingMs = Math.max(0, COOLDOWN_MS - (Date.now() - ts));
        }
      }
    }

    const buffered = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM detection_coordinates"
    );
    result.bufferedCoordinates = buffered?.count ?? 0;
  } catch {}

  return result;
}

/**
 * Clear all rows from the detection_events log. Used by the diagnostics
 * screen before reproducing a problem so the captured events are scoped to
 * the repro window only.
 */
export async function clearDetectionEvents(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM detection_events");
  } catch {}
}

/** Force-restart the detection task. Use from diagnostics when stuck. */
export async function restartDriveDetection(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(DETECTION_TASK_NAME);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(DETECTION_TASK_NAME);
    }
  } catch {}
  await startDriveDetection();
}

/**
 * Check if any locations show movement above the lower "continue" threshold.
 * Used to keep an active recording alive during slow traffic / turns.
 */
function detectMovement(locations: Location.LocationObject[]): boolean {
  if (locations.some(
    (loc) => loc.coords.speed != null && loc.coords.speed >= CONTINUE_SPEED_MS
  )) {
    return true;
  }

  if (locations.length >= 2) {
    for (let i = 1; i < locations.length; i++) {
      const prev = locations[i - 1];
      const curr = locations[i];
      const dtSec = (curr.timestamp - prev.timestamp) / 1000;
      if (dtSec > 0) {
        const distM = haversineMeters(
          prev.coords.latitude, prev.coords.longitude,
          curr.coords.latitude, curr.coords.longitude
        );
        if (distM / dtSec >= CONTINUE_SPEED_MS) return true;
      }
    }
  }

  return false;
}

// ── Live Activity helpers for auto-trip ───────────────────────────────────

/** Calculate running distance from all buffered detection coordinates. */
async function getAutoTripRunningDistance(): Promise<{ miles: number; speedMph: number }> {
  try {
    const db = await getDatabase();
    const coords = await db.getAllAsync<{ lat: number; lng: number; speed: number | null }>(
      "SELECT lat, lng, speed FROM detection_coordinates ORDER BY recorded_at ASC"
    );
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      total += haversineMiles(coords[i - 1].lat, coords[i - 1].lng, coords[i].lat, coords[i].lng);
    }
    // Use latest speed if available
    const lastSpeed = coords.length > 0 ? (coords[coords.length - 1].speed ?? 0) : 0;
    const speedMph = lastSpeed > 0 ? lastSpeed * 2.23694 : 0; // m/s to mph
    return { miles: Math.round(total * 100) / 100, speedMph: Math.round(speedMph) };
  } catch {
    return { miles: 0, speedMph: 0 };
  }
}

// ── Auto-trip finalization ────────────────────────────────────────────────

// Lock prevents concurrent finalizeAutoTrip() calls from both creating a trip.
// The background detection task and finalizeStaleAutoRecordings() (AppState
// foreground handler) can interleave at await points, both reading the same
// coordinates before either deletes them.
let finalizingTrip = false;

// Lock prevents concurrent "confirmed driving" blocks from each sending
// a notification. Multiple background location callbacks can fire at once,
// each reading the same cooldown timestamp before any writes the new one.
let startingRecording = false;

// Watchdog interval that periodically checks for stuck recordings.
// The single setTimeout in forceStartRecording fires once at 11 minutes but
// may find the recording still fresh (last_driving_speed_at recently updated).
// This interval runs every 3 minutes while recording is active, catching the
// case where iOS stops delivering location callbacks entirely and the recording
// sits idle for hours (David Hall's 5hr stuck-recording bug).
const WATCHDOG_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
let watchdogInterval: ReturnType<typeof setInterval> | null = null;

function startWatchdog(): void {
  stopWatchdog();
  watchdogInterval = setInterval(() => {
    checkStaleAutoRecording().catch(() => {});
  }, WATCHDOG_INTERVAL_MS);
}

function stopWatchdog(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

/**
 * Aliveness check used before any "stale finalize" path that fires while
 * the user might still be driving with iOS having suspended the JS runtime.
 *
 * iOS sometimes suspends the JS task while keeping native location
 * collection alive (the Live Activity continues to update). In that state
 * `last_driving_speed_at` goes stale even though the user is mid-drive.
 * Without verification, the next BackgroundFetch / startup check would
 * finalize the recording as a 0.1 mi phantom trip with start = end
 * timestamp.
 *
 * This helper asks iOS for the most recent location and returns true if
 * the device is moving at driving speed within the last few minutes. On
 * "still alive", it also refreshes last_driving_speed_at and buffers the
 * fetched coord so the recording continues without a gap.
 *
 * Returns false if location is unavailable or the device is genuinely
 * stationary - caller should proceed with the original finalize.
 */
async function isStillDrivingViaLocation(source: string): Promise<boolean> {
  try {
    const current = await Location.getLastKnownPositionAsync({
      maxAge: 5 * 60 * 1000,
      requiredAccuracy: 200,
    });
    if (!current) return false;

    const fixAgeMs = Date.now() - current.timestamp;
    const speed = current.coords.speed ?? 0;

    // Be conservative: require BOTH a recent fix AND driving-speed.
    // If iOS hands back an old cached fix, we'd rather finalize early than
    // skip a real stop.
    if (fixAgeMs > 3 * 60 * 1000 || speed < SPEED_THRESHOLD_MS) {
      return false;
    }

    const db = await getDatabase();
    const now = Date.now();

    // Refresh state so the next stale check has accurate data.
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_driving_speed_at', ?)",
      [String(now)]
    );

    // Buffer the fetched coord so the recorded distance keeps growing
    // through the suspended-JS gap. Without this, finalize when it
    // eventually does fire would only have the original buffer.
    await db.runAsync(
      `INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        current.coords.latitude,
        current.coords.longitude,
        speed,
        current.coords.accuracy ?? null,
        new Date(current.timestamp).toISOString(),
      ]
    );

    logDetectionEvent("stale_finalize_skipped_alive", {
      source,
      fixAgeMs,
      speed,
    }).catch(() => {});

    return true;
  } catch {
    // Location request failed - we can't tell. Fall through to the
    // original finalize path; a rare too-early end is a smaller bug
    // than a stuck recording that never finalizes.
    return false;
  }
}

/**
 * Process buffered detection coordinates into a saved trip.
 * Called when driving stops (no driving-speed location for 3+ min) or on app startup.
 */
export async function finalizeAutoTrip(): Promise<void> {
  if (finalizingTrip) return;
  finalizingTrip = true;
  try {
    await _finalizeAutoTripInner();
  } finally {
    finalizingTrip = false;
  }
}

async function _finalizeAutoTripInner(): Promise<void> {
  const db = await getDatabase();

  // Calculate final distance for the Live Activity summary before clearing coords
  const finalStats = await getAutoTripRunningDistance();

  // Read all buffered coordinates
  const rawCoords = await db.getAllAsync<BufferedCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM detection_coordinates ORDER BY recorded_at ASC"
  );

  // Safety: if auto_recording_active got stuck ON across a crash, the buffer
  // can contain ancient coords plus fresh ones, separated by a large time
  // gap. Detect that gap and keep only the most recent contiguous segment.
  //
  // CRITICAL: do NOT purge by absolute age. A legitimate >30 min drive
  // produces coords where the earliest is >30 min old at finalize time, but
  // every pair of consecutive coords is only seconds apart. Those must all
  // be kept or long commutes get saved as "half trips".
  let allCoords = rawCoords;
  if (rawCoords.length >= 2) {
    let segmentStart = 0;
    for (let i = 1; i < rawCoords.length; i++) {
      const prev = new Date(rawCoords[i - 1].recorded_at).getTime();
      const curr = new Date(rawCoords[i].recorded_at).getTime();
      if (curr - prev > BUFFER_MAX_AGE_MS) {
        // Large gap = boundary between a stale stuck-state buffer and fresh
        // recording. Everything before this gap is garbage from a crash.
        segmentStart = i;
      }
    }
    if (segmentStart > 0) {
      allCoords = rawCoords.slice(segmentStart);
      logDetectionEvent("finalize_gap_trimmed", {
        totalCoords: rawCoords.length,
        keptCoords: allCoords.length,
        droppedCoords: segmentStart,
      }).catch(() => {});
    }
  }

  logDetectionEvent("finalize_called", { coordCount: allCoords.length }).catch(() => {});

  // Stop watchdog - recording is ending
  stopWatchdog();

  // Dismiss the persistent recording notification - covers every finalize
  // path (saved, too_short, no_coords, error). LA dismissal is per-path
  // below; this is the single notification cleanup point.
  dismissRecordingActiveNotification().catch(() => {});

  // Clear state regardless of outcome
  await db.runAsync("DELETE FROM detection_coordinates");
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key IN ('auto_recording_active', 'last_driving_speed_at', 'driving_detection_count', 'finalization_mode', 'stop_anchor')"
  );

  if (allCoords.length < 2) {
    // No meaningful trip - dismiss Live Activity immediately
    logDetectionEvent("finalize_no_coords").catch(() => {});
    endLiveActivity().catch(() => {});
    // Re-arm the departure anchor at the current position. Critical for
    // phantom anchor_exit recovery: indoor GPS drift fires a false exit,
    // force_start begins a recording that never captures real movement,
    // and this finalize runs with 0 coords. Without re-arming, iOS has
    // no region left to fire on the next real departure and the actual
    // trip is lost. setDepartureAnchor() with no args uses the current
    // location, which is what we want.
    try {
      const { setDepartureAnchor } = await import("../geofencing/index");
      await setDepartureAnchor();
      logDetectionEvent("anchor_rearmed_after_phantom", { reason: "no_coords" }).catch(() => {});
    } catch {}
    return;
  }

  // Defensive sanity check: degenerate buffer with zero/near-zero time
  // span and tiny distance is a phantom finalize - usually triggered
  // by the watchdog firing while the user was about to start a real
  // trip but had only the very first coords in the buffer. Saving these
  // creates the "0.1 mi 17:34 -> 17:34" rows users see in their inbox.
  // Drop them silently here; the user will get a real trip when the
  // next departure fires properly.
  const firstTs = new Date(allCoords[0].recorded_at).getTime();
  const lastTs = new Date(allCoords[allCoords.length - 1].recorded_at).getTime();
  const spanMs = lastTs - firstTs;
  let quickDistMeters = 0;
  for (let i = 1; i < allCoords.length; i++) {
    quickDistMeters += haversineMeters(
      allCoords[i - 1].lat,
      allCoords[i - 1].lng,
      allCoords[i].lat,
      allCoords[i].lng
    );
  }
  const earlyDistMiles = quickDistMeters / 1609.344;
  if (spanMs < 30_000 && earlyDistMiles < 0.3) {
    logDetectionEvent("finalize_dropped_phantom", {
      coordCount: allCoords.length,
      spanMs,
      distanceMiles: earlyDistMiles,
    }).catch(() => {});
    endLiveActivity().catch(() => {});
    try {
      const { setDepartureAnchor } = await import("../geofencing/index");
      await setDepartureAnchor();
    } catch {}
    return;
  }

  // Trim trailing stationary coordinates to find the true trip end.
  // After the user parks, GPS pings continue at the same location - these
  // inflate the end time to when the trip was finalized (or when the app
  // was next opened for stale recordings) instead of when driving actually stopped.
  let endIdx = allCoords.length - 1;
  for (let i = allCoords.length - 1; i > 0; i--) {
    const curr = allCoords[i];
    const prev = allCoords[i - 1];
    const distM = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng);
    const speed = curr.speed != null && curr.speed > 0 ? curr.speed : 0;

    // This coordinate represents real movement - use it as the trip endpoint
    if (speed >= CONTINUE_SPEED_MS || distM > 30) {
      endIdx = i;
      break;
    }
    // If we've walked all the way back, keep at least the second coordinate
    if (i === 1) endIdx = 1;
  }

  const coords = allCoords.slice(0, endIdx + 1);
  if (coords.length < 2) {
    // Defensive: should be unreachable because allCoords.length >= 2 (checked
    // above) and the tail-trim loop guarantees endIdx >= 1. Log if we ever
    // hit it so the silent-exit class of bug stays visible.
    logDetectionEvent("finalize_tail_trim_too_short", {
      totalCoords: allCoords.length,
      keptCoords: coords.length,
      endIdx,
    }).catch(() => {});
    return;
  }

  // Filter GPS outliers (poor accuracy + speed-jump teleports) before
  // calculating distance. Always keeps first + last so start/end addresses
  // stay consistent with what the user saw on the map.
  const filteredCoords = filterTraceOutliers(coords);
  if (filteredCoords.length !== coords.length) {
    logDetectionEvent("finalize_outliers_filtered", {
      raw: coords.length,
      kept: filteredCoords.length,
      dropped: coords.length - filteredCoords.length,
    }).catch(() => {});
  }

  // Calculate total distance:
  //   - haversine sum of the filtered chord segments (catches detours)
  //   - OSRM map-match on the trace (snaps each point to a road, fixes the
  //     chord-to-arc undercount on winding routes - 5-10% better than haversine)
  //   - OSRM start->end fallback when match fails
  // bestTraceDistance() picks the most plausible value, capping the matched
  // result at 1.5x haversine to guard against the rare OSRM hallucination.
  let gpsSumDistance = 0;
  for (let i = 1; i < filteredCoords.length; i++) {
    gpsSumDistance += haversineMiles(
      filteredCoords[i - 1].lat, filteredCoords[i - 1].lng,
      filteredCoords[i].lat, filteredCoords[i].lng
    );
  }
  const first = filteredCoords[0];
  const last = filteredCoords[filteredCoords.length - 1];
  const distanceResult = await bestTraceDistance(filteredCoords, gpsSumDistance);
  const totalDistance = distanceResult.distanceMiles;
  const tripQuality = computeTripQuality(allCoords, filteredCoords, {
    distanceSource: distanceResult.source,
    matchSucceeded: distanceResult.matchSucceeded,
  });

  if (totalDistance < MIN_AUTO_TRIP_DISTANCE_MILES) {
    // Too short to save - dismiss Live Activity immediately
    logDetectionEvent("finalize_too_short", { distance: totalDistance, gpsSumDistance }).catch(() => {});
    endLiveActivity().catch(() => {});
    // Re-arm the departure anchor at the end of the brief movement so the
    // next real trip gets a fresh exit event. Without this, a short walk
    // or parking-lot shuffle consumes the anchor exit and leaves iOS with
    // no region to fire on the next real departure.
    try {
      const { setDepartureAnchor } = await import("../geofencing/index");
      await setDepartureAnchor(last.lat, last.lng);
      logDetectionEvent("anchor_rearmed_after_phantom", { reason: "too_short" }).catch(() => {});
    } catch {}
    return;
  }

  // Reverse geocode + classify in parallel. All three are independent network
  // operations and previously ran sequentially, adding 1-3 seconds to the
  // user-perceived "trip landed in inbox" latency. Running them together
  // caps the total wait at the slowest call instead of the sum.
  const [startAddress, endAddress, classificationResult] = await Promise.all([
    (async () => {
      try {
        const { reverseGeocode } = await import("../location/geocoding");
        return await reverseGeocode(first.lat, first.lng);
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const { reverseGeocode } = await import("../location/geocoding");
        return await reverseGeocode(last.lat, last.lng);
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const { classifyTrip, AUTO_CLASSIFY_THRESHOLD } = await import("../classification");
        const result = await classifyTrip({
          startLat: first.lat,
          startLng: first.lng,
          endLat: last.lat,
          endLng: last.lng,
          startedAt: first.recorded_at,
          endedAt: last.recorded_at,
        });
        return { result, threshold: AUTO_CLASSIFY_THRESHOLD };
      } catch {
        // Classification engine failure is non-fatal - save as unclassified
        return null;
      }
    })(),
  ]);

  let classification: TripClassification = "unclassified";
  let platformTag: PlatformTag | undefined = undefined;
  let classificationSource: string | null = null;
  if (classificationResult?.result) {
    classificationSource = classificationResult.result.source;
    if (classificationResult.result.confidence >= classificationResult.threshold) {
      classification = classificationResult.result.classification as TripClassification;
      platformTag = classificationResult.result.platformTag
        ? (classificationResult.result.platformTag as PlatformTag)
        : undefined;
    }
  }

  try {
    // ── Multi-stop merge check ──
    // If a recent trip ended nearby, merge this segment into it instead of
    // creating a new trip. This handles fuel stops, school drop-offs, drive-throughs
    // where the driver stops briefly and then continues.
    const recentTrip = await db.getFirstAsync<{
      id: string;
      end_lat: number | null;
      end_lng: number | null;
      ended_at: string | null;
      distance_miles: number;
      started_at: string;
    }>(
      "SELECT id, end_lat, end_lng, ended_at, distance_miles, started_at FROM trips ORDER BY ended_at DESC LIMIT 1"
    );

    let merged = false;
    if (recentTrip?.ended_at && recentTrip.end_lat != null && recentTrip.end_lng != null) {
      const timeSinceLastTrip = new Date(first.recorded_at).getTime() - new Date(recentTrip.ended_at).getTime();
      const distFromLastEnd = haversineMeters(
        recentTrip.end_lat, recentTrip.end_lng,
        first.lat, first.lng
      );

      if (timeSinceLastTrip >= 0 && timeSinceLastTrip < MERGE_TIME_WINDOW_MS && distFromLastEnd < MERGE_DISTANCE_M) {
        // Merge: extend the previous trip's end point, distance, and time
        const { syncUpdateTrip } = await import("../sync/actions");
        const newDistance = Math.round((recentTrip.distance_miles + totalDistance) * 100) / 100;
        await syncUpdateTrip(recentTrip.id, {
          endLat: last.lat,
          endLng: last.lng,
          endAddress: endAddress ?? null,
          endedAt: last.recorded_at,
          distanceMiles: newDistance,
        });
        merged = true;
        logDetectionEvent("finalize_merged", { intoTripId: recentTrip.id, segmentMiles: totalDistance, mergedTotal: newDistance }).catch(() => {});

        // End Live Activity with the combined distance. Merged trips are
        // already classified (we don't re-classify on merge), so no
        // classification CTA is needed.
        endLiveActivityWithSummary({
          distanceMiles: newDistance,
          startDateMs: recentTrip.started_at ? new Date(recentTrip.started_at).getTime() : new Date(first.recorded_at).getTime(),
          endDateMs: new Date(last.recorded_at).getTime(),
          needsClassification: false,
        }).catch(() => {});

        // Notify user of the merged trip
        if (!isQuietHours()) {
          const from = recentTrip.started_at
            ? await (async () => {
                try {
                  const row = await db.getFirstAsync<{ start_address: string | null }>(
                    "SELECT start_address FROM trips WHERE id = ?", [recentTrip.id]
                  );
                  return row?.start_address || "Unknown";
                } catch { return "Unknown"; }
              })()
            : "Unknown";
          const to = endAddress || "Unknown";
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Trip extended - ${newDistance} mi`,
              body: `${from} to ${to}`,
              data: { action: "open_trips" },
            },
            trigger: null,
          });
        }
      }
    }

    if (!merged) {
    // Look up the most recently used vehicle from local trips, so auto-detected
    // trips inherit a vehicle rather than appearing as "Unknown vehicle" in exports.
    let vehicleId: string | undefined;
    try {
      const lastTrip = await db.getFirstAsync<{ vehicle_id: string | null }>(
        "SELECT vehicle_id FROM trips WHERE vehicle_id IS NOT NULL ORDER BY started_at DESC LIMIT 1"
      );
      if (lastTrip?.vehicle_id) vehicleId = lastTrip.vehicle_id;
    } catch {
      // Best-effort - trip will just have no vehicle
    }

    const wasAutoClassified = classification !== "unclassified";
    const roundedDistance = Math.round(totalDistance * 100) / 100;

    // Flip the Live Activity into the final "Trip Complete" state BEFORE the
    // syncCreateTrip API call. The LA is a user-facing element and shouldn't
    // wait for a network round trip to update - the local trip row gets
    // written inside syncCreateTrip immediately anyway, so the inbox is
    // already up to date by the time the user looks.
    endLiveActivityWithSummary({
      distanceMiles: roundedDistance,
      startDateMs: new Date(first.recorded_at).getTime(),
      endDateMs: new Date(last.recorded_at).getTime(),
      needsClassification: !wasAutoClassified,
    }).catch(() => {});

    // Fetch today's running totals for the post-drive summary
    let todayContext = "";
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayRow = await db.getFirstAsync<{ cnt: number; miles: number }>(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(distance_miles), 0) as miles FROM trips WHERE started_at >= ?",
        [todayStart.toISOString()]
      );
      if (todayRow && todayRow.cnt > 0) {
        const totalMiles = (todayRow.miles + roundedDistance).toFixed(1);
        const tripNum = todayRow.cnt + 1;
        todayContext = ` - trip ${tripNum} today, ${totalMiles} mi total`;
      }
    } catch {}

    // For auto-classified trips, fire the "Trip recorded as X" notification
    // BEFORE the API call - there are no action buttons that need the server
    // tripId, so nothing depends on the sync completing.
    if (wasAutoClassified && !isQuietHours()) {
      const from = startAddress || "Unknown";
      const to = endAddress || "Unknown";
      Notifications.scheduleNotificationAsync({
        content: {
          title: `Trip recorded as ${classification}`,
          body: `${from} to ${to} (${totalDistance.toFixed(1)} mi)${todayContext}`,
          data: { action: "open_trips" },
        },
        trigger: null,
      }).catch(() => {});
    }

    const { syncCreateTrip } = await import("../sync/actions");
    const tripResult = await syncCreateTrip({
      startLat: first.lat,
      startLng: first.lng,
      endLat: last.lat,
      endLng: last.lng,
      startAddress: startAddress ?? undefined,
      endAddress: endAddress ?? undefined,
      distanceMiles: roundedDistance,
      startedAt: first.recorded_at,
      endedAt: last.recorded_at,
      classification,
      platformTag: platformTag ?? undefined,
      vehicleId,
      coordinates: filteredCoords.map((c) => ({
        lat: c.lat,
        lng: c.lng,
        speed: c.speed,
        accuracy: c.accuracy,
        recordedAt: c.recorded_at,
      })),
      gpsQuality: tripQuality,
    });

    // Store classification source on the local trip row
    const savedTripId = tripResult?.data?.id;
    if (classificationSource && savedTripId) {
      db.runAsync(
        "UPDATE trips SET classification_source = ? WHERE id = ?",
        [classificationSource, savedTripId]
      ).catch(() => {});
    }

    if (tripResult === null) {
      // syncCreateTrip returned null = hit the dedup window (another sync
      // path already saved this trip within 2 minutes). Log explicitly so
      // this path is distinguishable from a real save.
      logDetectionEvent("finalize_dedup_skipped", {
        distance: totalDistance,
      }).catch(() => {});
    } else {
      logDetectionEvent("finalize_saved", {
        tripId: savedTripId,
        distance: totalDistance,
        gpsSumDistance,
        durationSecs: Math.round((new Date(last.recorded_at).getTime() - new Date(first.recorded_at).getTime()) / 1000),
        classification,
      }).catch(() => {});
    }

    // For unclassified trips, fire the "classify it" notification NOW that
    // we have the server tripId. The Business/Personal lock-screen buttons
    // call syncUpdateTrip(tripId, ...) which needs the canonical ID.
    if (!wasAutoClassified && !isQuietHours()) {
      const from = startAddress || "Unknown";
      const to = endAddress || "Unknown";
      const tripId = savedTripId;
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Trip recorded - classify it",
          body: `${from} to ${to} (${totalDistance.toFixed(1)} mi)${todayContext}`,
          data: tripId
            ? {
                action: "classify_trip",
                tripId,
                startLat: first.lat,
                startLng: first.lng,
                endLat: last.lat,
                endLng: last.lng,
              }
            : { action: "open_trips" },
          ...(tripId ? { categoryIdentifier: "trip_recorded" } : {}),
        },
        trigger: null,
      }).catch(() => {});
    }

    // If auto-classified, learn from it to reinforce the route pattern
    if (classification !== "unclassified") {
      try {
        const { learnFromClassification } = await import("../classification");
        await learnFromClassification({
          startLat: first.lat, startLng: first.lng,
          endLat: last.lat, endLng: last.lng,
          classification, platformTag: platformTag ?? null,
        });
      } catch {}
    }

    } // end if (!merged)

    // Set departure anchor at the user's CURRENT position — not the trimmed
    // "last coord" from the trip buffer. Using the last buffered coord is
    // stale for two reasons: (1) the tail-trim earlier in this function
    // removes trailing stationary coords, so last.lat/lng is often 30s+
    // behind the user's current position; (2) finalize can run while the
    // user is still physically moving (e.g. BT disconnect during drive).
    // Registering a 200m region centered on a stale coord means iOS
    // immediately re-evaluates the user as outside that region and fires
    // another exit event within milliseconds — kicking off a phantom
    // recording that captures zero real movement. Seen in the wild as a
    // 72ms gap between finalize_saved and recording_started(anchor_exit).
    // setDepartureAnchor() with no args uses getLastKnownPositionAsync(),
    // which is fresh at finalize time since the task just processed a
    // location batch.
    try {
      const { setDepartureAnchor } = await import("../geofencing/index");
      await setDepartureAnchor();
    } catch {
      // Best effort
    }
  } catch (err) {
    console.error("Auto-trip save failed:", err);
    // Critical: log the failure so it surfaces in the diagnostic dump.
    // Without this, a throw inside the save path (e.g. syncCreateTrip API
    // validation error, DB lock, reverse-geocode crash) produces a
    // finalize_called event with NO matching outcome event, making the bug
    // invisible. This was the root cause of Norman's Kingston Park and
    // David Hall's 2026-04-11 silent finalize exits.
    const errorMessage =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : String(err);
    logDetectionEvent("finalize_save_failed", {
      error: errorMessage.slice(0, 500),
    }).catch(() => {});
    // Dismiss Live Activity on failure
    endLiveActivity().catch(() => {});
  }
}

/**
 * Check for and finalize any stale auto-recordings.
 * Call on app startup and at the top of each detection task invocation.
 */
async function checkStaleAutoRecording(): Promise<void> {
  const db = await getDatabase();

  const recording = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
  );
  if (recording?.value !== "1") return;

  const lastDriving = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'last_driving_speed_at'"
  );
  if (!lastDriving) {
    // Stale flag with no timestamp - clear it
    stopWatchdog();
    await db.runAsync("DELETE FROM tracking_state WHERE key = 'auto_recording_active'");
    return;
  }

  const elapsed = Date.now() - parseInt(lastDriving.value, 10);
  if (elapsed > STOP_TIMEOUT_MS) {
    // Verify the device isn't actively driving before finalizing - covers
    // the case where this fires from app-startup or watchdog after iOS
    // suspended the JS task during a real drive.
    if (await isStillDrivingViaLocation("stale_check")) {
      return;
    }
    logDetectionEvent("stale_finalize_triggered", { elapsedMs: elapsed }).catch(() => {});
    await finalizeAutoTrip();
  }
}

/**
 * Public: finalize stale auto-recordings on app startup.
 * Handles the case where the app was killed during an active recording, AND
 * the case where watch mode was entered but never promoted (no real driving
 * was observed before the user closed the app). Both clean up silently.
 */
export async function finalizeStaleAutoRecordings(): Promise<void> {
  try {
    // Stale watch-mode cleanup: if watch mode was active when the app got
    // killed, and the timeout has now elapsed, exit silently — the geofence
    // exit was a phantom (carpark, walk to bin, indoor drift, etc).
    const db = await getDatabase();
    const watchActive = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'watch_mode_active'"
    );
    if (watchActive?.value === "1") {
      const watchStartedAt = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'watch_mode_started_at'"
      );
      if (watchStartedAt) {
        const watchAge = Date.now() - parseInt(watchStartedAt.value, 10);
        if (watchAge > WATCH_MODE_MAX_AGE_MS) {
          logDetectionEvent("foreground_watch_timeout", { ageMs: watchAge }).catch(() => {});
          await exitWatchModeSilently("foreground_timeout");
        }
      }
    }
    await checkStaleAutoRecording();
  } catch (err) {
    console.error("Stale auto-recording finalization failed:", err);
  }
}

/**
 * Cancel any in-progress auto-recording.
 * @param clearCoords Whether to also delete buffered coordinates.
 *   - true: user tapped "Not Driving" (discard everything)
 *   - false: user started a shift (coords may be transferred)
 */
export async function cancelAutoRecording(clearCoords = false): Promise<void> {
  stopWatchdog();
  dismissRecordingActiveNotification().catch(() => {});
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key IN ('auto_recording_active', 'last_driving_speed_at', 'driving_detection_count', 'finalization_mode', 'stop_anchor')"
  );
  if (clearCoords) {
    await db.runAsync("DELETE FROM detection_coordinates");
    // Dismiss Live Activity when user taps "Not Driving"
    endLiveActivity().catch(() => {});
  }
}

// ── Background task ──────────────────────────────────────────────────────

try {
  TaskManager.defineTask(DETECTION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error("Drive detection error:", error);
      return;
    }
    if (!data) return;

    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;

    try {
      const db = await getDatabase();

      // Guard: don't buffer if a shift/quick-trip is active
      const activeShift = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
      );
      if (activeShift) return;

      const recording = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
      );
      const isRecording = recording?.value === "1";

      // If the user tapped End Trip on the Live Activity (via the iOS 17.2+
      // App Intent), the widget process has already flipped the LA phase to
      // "saving" but the main app hasn't processed it yet. This is our third
      // and most important trigger for running finalize: the background
      // location task keeps firing for a few minutes after the user parks
      // (iOS drip-feeds callbacks), so even if the user never opens the app,
      // we'll catch the pending finalize within seconds of the tap.
      if (isRecording) {
        try {
          const { getLiveActivityPhase } = await import("../liveActivity");
          const phase = await getLiveActivityPhase();
          if (phase === "saving") {
            logDetectionEvent("pending_finalize_via_task", { source: "app_intent" }).catch(() => {});
            await finalizeAutoTrip();
            downgradeToDetectionMode().catch(() => {});
            return;
          }
        } catch {
          // LA phase check is best-effort
        }
      }

      if (isRecording) {
        // ── Active recording ──

        // Recover Live Activity if JS process was restarted (iOS killed app between
        // background callbacks). The in-memory currentActivityId would be null, causing
        // updateLiveActivity() to silently skip. This re-links to the existing activity
        // or starts a fresh one if it expired.
        // Look up the trip start time from the earliest detection coordinate so the
        // timer shows total elapsed time instead of resetting to zero.
        let tripStartMs: number | undefined;
        try {
          const firstCoord = await db.getFirstAsync<{ recorded_at: string }>(
            "SELECT recorded_at FROM detection_coordinates ORDER BY recorded_at ASC LIMIT 1"
          );
          if (firstCoord) {
            tripStartMs = new Date(firstCoord.recorded_at).getTime();
          }
        } catch {}
        const recovered = await recoverLiveActivity(tripStartMs);
        if (!recovered) {
          try {
            await maybeStartAutoTripLiveActivity({ activityType: "trip", isBusinessMode: true });
          } catch {}
        }

        // Check if the recording is clearly stale (e.g. app was killed and just
        // reopened). If the last driving activity was long ago, finalize
        // immediately WITHOUT buffering these new coords - they'd set the trip
        // end time to "now" instead of when driving actually stopped.
        //
        // Important: the locations array iOS just delivered tells us whether
        // the device is genuinely parked or whether the JS runtime was simply
        // suspended during a real drive. If the newest delivered location is
        // recent AND shows driving speed, the recording is alive - skip the
        // stale-finalize and let the buffering loop below run normally.
        const lastDrivingCheck = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'last_driving_speed_at'"
        );
        if (lastDrivingCheck) {
          const staleElapsed = Date.now() - parseInt(lastDrivingCheck.value, 10);
          if (staleElapsed > STOP_TIMEOUT_MS * 2) {
            const newest = locations[locations.length - 1];
            const newestAgeMs = Date.now() - newest.timestamp;
            const newestSpeed = newest.coords.speed ?? 0;
            const stillDriving =
              newestAgeMs < 3 * 60 * 1000 && newestSpeed > SPEED_THRESHOLD_MS;
            if (stillDriving) {
              logDetectionEvent("stale_finalize_skipped_alive", {
                source: "location_task_resume",
                staleElapsedMs: staleElapsed,
                newestLocAgeMs: newestAgeMs,
                newestLocSpeed: newestSpeed,
              }).catch(() => {});
              // Refresh state so the next gate sees fresh data, then fall
              // through to the normal buffering path.
              await db.runAsync(
                "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_driving_speed_at', ?)",
                [String(Date.now())]
              );
            } else {
              // Recording is genuinely stale - finalize with existing coords only
              await finalizeAutoTrip();
              downgradeToDetectionMode().catch(() => {});
              return;
            }
          }
        }

        // Buffer coords - recording is recent enough that this could be resumed driving.
        for (const loc of locations) {
          await db.runAsync(
            `INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              loc.coords.latitude,
              loc.coords.longitude,
              loc.coords.speed ?? null,
              loc.coords.accuracy ?? null,
              new Date(loc.timestamp).toISOString(),
            ]
          );
        }

        // Check if we're in finalization mode - if so, require real displacement
        // from the stop anchor, not just a speed reading (GPS drift reports movement)
        const inFinalization = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'finalization_mode'"
        );
        let hasRealMovement = detectMovement(locations) || detectDrivingSpeed(locations) != null;

        if (hasRealMovement && inFinalization) {
          // Verify actual displacement from stop anchor point
          const anchorRow = await db.getFirstAsync<{ value: string }>(
            "SELECT value FROM tracking_state WHERE key = 'stop_anchor'"
          );
          if (anchorRow) {
            try {
              const anchor = JSON.parse(anchorRow.value);
              const latest = locations[locations.length - 1];
              const displacement = haversineMeters(
                anchor.lat, anchor.lng,
                latest.coords.latitude, latest.coords.longitude
              );
              if (displacement < RESUME_DISPLACEMENT_M) {
                hasRealMovement = false; // GPS drift, not real driving
              }
            } catch {}
          }
        }

        if (hasRealMovement) {
          // Check if this is resuming driving after a long pause (e.g. parked
          // at Aldi for 30 min, now driving home). If last movement was
          // >STOP_TIMEOUT_MS ago, the previous trip should be finalized BEFORE
          // we buffer coords for the new trip. Otherwise both legs end up in
          // one recording, the gap detector drops the first segment at
          // finalize time, and the outbound trip is lost.
          const lastDrivingResume = await db.getFirstAsync<{ value: string }>(
            "SELECT value FROM tracking_state WHERE key = 'last_driving_speed_at'"
          );
          if (lastDrivingResume) {
            const resumeElapsed = Date.now() - parseInt(lastDrivingResume.value, 10);
            if (resumeElapsed > STOP_TIMEOUT_MS) {
              logDetectionEvent("split_trip_on_resume", { elapsedMs: resumeElapsed }).catch(() => {});
              await finalizeAutoTrip();
              // Finalize clears auto_recording_active. Re-set it so we continue
              // recording the new trip without missing these fresh coords.
              await db.runAsync(
                "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('auto_recording_active', '1')"
              );
              // Restart watchdog for the new recording
              startWatchdog();
              // Start a fresh Live Activity for the new trip
              try {
                let isBusinessMode = true;
                const modeRow = await db.getFirstAsync<{ value: string }>(
                  "SELECT value FROM tracking_state WHERE key = 'app_mode'"
                );
                if (modeRow?.value === "personal") isBusinessMode = false;
                await maybeStartAutoTripLiveActivity({ activityType: "trip", isBusinessMode });
              } catch {}
            }
          }

          await db.runAsync(
            "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_driving_speed_at', ?)",
            [Date.now().toString()]
          );
          // Update Live Activity with running distance
          getAutoTripRunningDistance().then(({ miles, speedMph }) => {
            updateLiveActivity({ distanceMiles: miles, speedMph }).catch(() => {});
          }).catch(() => {});
          // If we were in finalization mode (waiting for stop timeout), switch back
          // to recording mode since the user is genuinely moving again.
          if (inFinalization) {
            await db.runAsync("DELETE FROM tracking_state WHERE key IN ('finalization_mode', 'stop_anchor')");
            upgradeDetectionAccuracy().catch(() => {});
          }
        } else {
          // No movement in this batch - check if the trip should end.
          // Only finalize when stationary, never when we just received driving coords.
          const lastDriving = await db.getFirstAsync<{ value: string }>(
            "SELECT value FROM tracking_state WHERE key = 'last_driving_speed_at'"
          );
          if (lastDriving) {
            const elapsed = Date.now() - parseInt(lastDriving.value, 10);

            if (elapsed > STOP_TIMEOUT_MS) {
              await finalizeAutoTrip();
              // Downgrade back to low-power detection mode
              downgradeToDetectionMode().catch(() => {});
            } else {
              // Not timed out yet - switch to finalization mode so callbacks keep
              // flowing even while stationary. Normal recording mode uses 50m distance
              // intervals, which means no callbacks when parked. GPS drift at 5m
              // intervals ensures we get regular callbacks to check the timeout.
              const alreadyFinalization = await db.getFirstAsync<{ value: string }>(
                "SELECT value FROM tracking_state WHERE key = 'finalization_mode'"
              );
              if (!alreadyFinalization) {
                await db.runAsync(
                  "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('finalization_mode', '1')"
                );
                // Save the stop anchor point so we can detect real displacement vs GPS drift
                const lastLoc = locations[locations.length - 1];
                await db.runAsync(
                  "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('stop_anchor', ?)",
                  [JSON.stringify({ lat: lastLoc.coords.latitude, lng: lastLoc.coords.longitude })]
                );
                switchToFinalizationMode().catch(() => {});
              }
            }
          }
        }
        return;
      }

      // ── Not recording: check if driving should START a new recording ──

      // Clean up any orphaned recording state (e.g., app was killed mid-recording)
      await checkStaleAutoRecording();

      // Clean up stale watch mode. Watch mode is entered on geofence anchor
      // exit and waits for real driving to be observed. If the timeout
      // elapses without driving (carpark with bad signal, walked to bin and
      // back, indoor GPS drift), exit silently — no LA was ever shown so the
      // user never knew anything was happening.
      const watchActive = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'watch_mode_active'"
      );
      if (watchActive?.value === "1") {
        const watchStartedAt = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'watch_mode_started_at'"
        );
        if (watchStartedAt) {
          const watchAge = Date.now() - parseInt(watchStartedAt.value, 10);
          if (watchAge > WATCH_MODE_MAX_AGE_MS) {
            const watchReason = await db.getFirstAsync<{ value: string }>(
              "SELECT value FROM tracking_state WHERE key = 'watch_mode_reason'"
            );
            logDetectionEvent("watch_mode_timeout", {
              ageMs: watchAge,
              originalReason: watchReason?.value ?? "unknown",
            }).catch(() => {});
            await exitWatchModeSilently("timeout");
            // Continue running the rest of detection — the user might be
            // starting to drive RIGHT NOW (which is why iOS is calling us),
            // and the existing fast-gate will catch it on this same call.
          }
        }
      }

      // Purge stale detection coordinates (>30 min old), but only pre-detection
      // buffering points. If there are many coordinates (a real trip was recorded
      // but finalization was missed), attempt finalization first.
      const coordCount = await db.getFirstAsync<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM detection_coordinates"
      );
      if (coordCount && coordCount.cnt > 5) {
        // Looks like an un-finalized trip - try to finalize before purging
        await finalizeAutoTrip();
      }
      const cutoff = new Date(Date.now() - BUFFER_MAX_AGE_MS).toISOString();
      await db.runAsync(
        "DELETE FROM detection_coordinates WHERE recorded_at < ?",
        [cutoff]
      );

      // Buffer ALL incoming coords - even before driving speed is confirmed.
      // This captures the departure point and early route through residential
      // streets where speed stays below 15mph. Without this, the first miles
      // of a trip are lost because detection only triggered on faster roads.
      for (const loc of locations) {
        await db.runAsync(
          `INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            loc.coords.latitude,
            loc.coords.longitude,
            loc.coords.speed ?? null,
            loc.coords.accuracy ?? null,
            new Date(loc.timestamp).toISOString(),
          ]
        );
      }

      // Check if locations indicate driving speed (>15mph to start recording).
      // Returns the highest detected speed with source ("reported" = trusted iOS
      // Kalman, "calculated" = distance/time + susceptible to GPS noise), or null.
      let detection = detectDrivingSpeed(locations);

      // Single-location batch: compare against the previous buffered coordinate.
      // Only trust this if both fixes have strict GPS accuracy AND the sample
      // period + displacement are large enough that GPS noise can't fake speed.
      if (detection == null && locations.length === 1) {
        const loc = locations[0];
        const locAccuracy = loc.coords.accuracy ?? 999;
        if (locAccuracy <= GPS_ACCURACY_STRICT) {
          const lastCoord = await db.getFirstAsync<{ lat: number; lng: number; recorded_at: string; accuracy: number | null }>(
            "SELECT lat, lng, recorded_at, accuracy FROM detection_coordinates ORDER BY recorded_at DESC LIMIT 1 OFFSET 1"
          );
          if (lastCoord && (lastCoord.accuracy == null || lastCoord.accuracy <= GPS_ACCURACY_STRICT)) {
            const dtSec = (loc.timestamp - new Date(lastCoord.recorded_at).getTime()) / 1000;
            if (dtSec >= CALC_SPEED_MIN_DT_SEC && dtSec < 120) {
              const distM = haversineMeters(
                lastCoord.lat, lastCoord.lng,
                loc.coords.latitude, loc.coords.longitude
              );
              if (distM >= CALC_SPEED_MIN_DIST_M) {
                const calcSpeed = distM / dtSec;
                if (calcSpeed >= SPEED_THRESHOLD_MS) {
                  detection = { speedMs: calcSpeed, source: "calculated" };
                }
              }
            }
          }
        }
      }

      if (detection == null) {
        // Reset consecutive driving detection counter - the user isn't driving
        await db.runAsync("DELETE FROM tracking_state WHERE key = 'driving_detection_count'");
        return;
      }

      const detectedSpeedMs = detection.speedMs;
      const speedSource = detection.source;

      // ── Saved-location gate ──
      // Indoor GPS drift (phone in pocket, walking around the house) can
      // fabricate speed bursts above the driving threshold. If the latest
      // reading is inside any saved location's geofence, treat the burst
      // as drift and bail out. The departure-anchor exit handler still
      // catches legitimate "leaving home" drives once the user actually
      // breaches the radius.
      const latestLoc = locations[locations.length - 1];
      if (
        latestLoc &&
        (await isInsideAnySavedLocation(
          latestLoc.coords.latitude,
          latestLoc.coords.longitude
        ))
      ) {
        await db.runAsync("DELETE FROM tracking_state WHERE key = 'driving_detection_count'");
        logDetectionEvent("detection_suppressed_at_saved_location", {
          speedMs: detectedSpeedMs,
          source: speedSource,
          lat: latestLoc.coords.latitude,
          lng: latestLoc.coords.longitude,
          accuracy: latestLoc.coords.accuracy ?? null,
        }).catch(() => {});
        return;
      }

      // ── Consecutive detection gate ──
      // Require multiple consecutive callbacks showing driving speed before
      // starting a recording. A single GPS outlier (drift, bounce, stale cache)
      // can't trigger a false "Looks like you're driving" notification.
      //
      // Fast-gate exception: a single very-high-speed iOS-reported reading is
      // unambiguous - CoreLocation's Kalman filter doesn't fake highway speeds.
      // Calculated speed is NOT fast-gated: a single GPS bounce can produce
      // 100+mph in calc, so we always require the consecutive-detection
      // confirmation when calc is the source.
      const fastGate = detectedSpeedMs >= FAST_GATE_SPEED_MS && speedSource === "reported";
      if (!fastGate) {
        const countRow = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'driving_detection_count'"
        );
        const count = countRow ? parseInt(countRow.value, 10) + 1 : 1;
        if (count < CONSECUTIVE_DETECTIONS_REQUIRED) {
          await db.runAsync(
            "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('driving_detection_count', ?)",
            [count.toString()]
          );
          logDetectionEvent("driving_detected", { speedMs: detectedSpeedMs, source: speedSource, count, gateRequired: CONSECUTIVE_DETECTIONS_REQUIRED }).catch(() => {});
          return; // Wait for more confirmation
        }
      }

      // Confirmed driving - use lock to prevent concurrent callbacks from
      // each sending a notification. Multiple location updates can arrive
      // simultaneously and interleave at await points.
      if (startingRecording) return;
      startingRecording = true;
      try {
        await db.runAsync("DELETE FROM tracking_state WHERE key = 'driving_detection_count'");

        // Prune stale pre-detection coords before the recording officially
        // begins. Pre-detection buffering writes every incoming location to
        // the buffer (line ~1059) to capture the departure point. If an
        // earlier finalize in the same or recent task invocation failed
        // silently or left residue, those ancient coords will bleed into
        // this new recording's saved trip with wildly wrong startedAt.
        // Seen in the wild as Norman's Kingston Park return leg carrying 2
        // coords from 3 min before the drive, and David Hall's Saturday
        // trip carrying residue from 5 min before. Keep only the last 60
        // seconds of pre-detection so the departure point is still visible.
        const pruneCutoff = new Date(Date.now() - 60_000).toISOString();
        const pruned = await db.runAsync(
          "DELETE FROM detection_coordinates WHERE recorded_at < ?",
          [pruneCutoff],
        );
        if (pruned.changes > 0) {
          logDetectionEvent("pre_detection_pruned", {
            droppedCoords: pruned.changes,
            cutoffSecondsAgo: 60,
          }).catch(() => {});
        }

        // Mark auto-recording as active + update last driving timestamp
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('auto_recording_active', '1')"
        );
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_driving_speed_at', ?)",
          [Date.now().toString()]
        );
        // If watch mode was active, this is the watch→recording promotion.
        // Clear watch flags so the timeout cleanup doesn't try to undo us.
        await clearWatchModeFlags();

        // Start watchdog for stuck-recording detection
        startWatchdog();

        logDetectionEvent("recording_started", {
          speedMs: detectedSpeedMs,
          speedSource,
          fastGate,
          source: "detection_task",
        }).catch(() => {});

        // Start Live Activity - must be awaited so the native Activity.request()
        // completes before iOS suspends the background task.
        try {
          await maybeStartAutoTripLiveActivity({ activityType: "trip", isBusinessMode: true });
        } catch {}

        // Persistent passive notification as a safety net for when the Live
        // Activity silently fails to present (Anthony hit this 2026-04-24:
        // live_activity_started logged but no LA visible on device).
        showRecordingActiveNotification().catch(() => {});

        // Auto-upgrade to navigation-grade accuracy for better trip recording.
        try {
          await upgradeDetectionAccuracy();
        } catch {}

        // Quiet hours: still record the trip, just don't buzz the user at 3am
        if (isQuietHours()) return;

        // Cooldown: don't spam detection notifications
        const lastNotif = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'last_detection_notification'"
        );
        if (lastNotif) {
          const elapsed = Date.now() - parseInt(lastNotif.value, 10);
          if (elapsed < COOLDOWN_MS) return;
        }

        // Send "Looks like you're driving" notification
        await sendDrivingDetectedNotification();
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_detection_notification', ?)",
          [Date.now().toString()]
        );
      } finally {
        startingRecording = false;
      }
    } catch (err) {
      console.error("Drive detection task error:", err);
    }
  });
} catch (err) {
  console.warn("TaskManager.defineTask failed - drive detection disabled:", err);
}

// ── Background fetch task: periodic stale-trip finalize ────────────────────
// iOS suspends the JS runtime when backgrounded, so an auto-trip that ends
// while the user is parked may sit unfinalised for hours - the user only
// sees the trip when they reopen the app and finalizeStaleAutoRecordings()
// runs on AppState change.
//
// BackgroundFetch lets iOS wake the app every ~15-60 min (cadence is at
// iOS's discretion based on user behaviour). When fired, we finalize any
// stale recording, which fires the standard "Trip recorded - classify it"
// notification - the user gets pinged even if they never opened the app.

try {
  TaskManager.defineTask(BACKGROUND_FINALIZE_TASK, async () => {
    try {
      const db = await getDatabase();

      // First: clean up stale watch mode if the user never actually drove.
      // Background fetch is the safety net for when iOS killed the JS runtime
      // mid-watch and the in-task timeout cleanup couldn't fire.
      const watchActive = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'watch_mode_active'"
      );
      if (watchActive?.value === "1") {
        const watchStartedAt = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'watch_mode_started_at'"
        );
        if (watchStartedAt) {
          const watchAge = Date.now() - parseInt(watchStartedAt.value, 10);
          if (watchAge > WATCH_MODE_MAX_AGE_MS) {
            logDetectionEvent("background_fetch_watch_timeout", { ageMs: watchAge }).catch(() => {});
            await exitWatchModeSilently("background_fetch_timeout");
            return BackgroundFetch.BackgroundFetchResult.NewData;
          }
        }
      }

      const recording = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
      );
      if (recording?.value !== "1") {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const lastDriving = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'last_driving_speed_at'"
      );
      if (!lastDriving) {
        // Recording active but no last-driving timestamp — stale state, clean it.
        await db.runAsync("DELETE FROM tracking_state WHERE key = 'auto_recording_active'");
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }

      const elapsed = Date.now() - parseInt(lastDriving.value, 10);
      if (elapsed > STOP_TIMEOUT_MS) {
        // CRITICAL: verify the device isn't still actively driving before
        // finalizing. iOS may have suspended the JS task, so
        // last_driving_speed_at is stale even though the user is mid-drive
        // (Live Activity on the native side continues to update). Without
        // this check, the user gets phantom 0.1 mi trips with start = end
        // timestamps while their real journey continues unrecorded.
        if (await isStillDrivingViaLocation("background_fetch")) {
          return BackgroundFetch.BackgroundFetchResult.NewData;
        }
        logDetectionEvent("background_fetch_finalize", { elapsedMs: elapsed }).catch(() => {});
        await finalizeAutoTrip();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (err) {
      console.warn("Background finalize task error:", err);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch (err) {
  console.warn("Background finalize task define failed:", err);
}

/**
 * Register the background-fetch task with iOS. Best-effort - never throws.
 * Should be called once per app start. Re-registering is idempotent.
 */
export async function registerBackgroundFinalize(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      logDetectionEvent("background_fetch_unavailable", { status }).catch(() => {});
      return;
    }
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FINALIZE_TASK);
    if (isRegistered) return;
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FINALIZE_TASK, {
      minimumInterval: BACKGROUND_FETCH_INTERVAL_S,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    logDetectionEvent("background_fetch_registered", {
      minimumIntervalSec: BACKGROUND_FETCH_INTERVAL_S,
    }).catch(() => {});
  } catch (err) {
    console.warn("registerBackgroundFinalize failed:", err);
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export async function startDriveDetection(): Promise<void> {
  // Guard: don't start if disabled by user
  const enabled = await isDriveDetectionEnabled();
  if (!enabled) {
    logDetectionEvent("detection_skipped", { reason: "disabled" }).catch(() => {});
    return;
  }

  // Guard: don't start if a shift is active
  const db = await getDatabase();
  const activeShift = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
  );
  if (activeShift) {
    logDetectionEvent("detection_skipped", { reason: "active_shift" }).catch(() => {});
    return;
  }

  // Guard: don't restart if auto-recording is active (would downgrade 50m -> 100m)
  const recording = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
  );
  if (recording?.value === "1") {
    logDetectionEvent("detection_skipped", { reason: "recording_active" }).catch(() => {});
    return;
  }

  // Guard: check permissions - notify user if background location is missing
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== "granted") {
    logDetectionEvent("permission_lost", { status }).catch(() => {});
    const now = Date.now();
    if (!isQuietHours() && now - lastBgPermissionNudge > BG_PERMISSION_NUDGE_COOLDOWN_MS) {
      lastBgPermissionNudge = now;
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Trips aren't being recorded",
          body: "MileClear needs 'Always' location access to detect driving automatically. Tap to fix this in Settings.",
          data: { action: "open_settings" },
        },
        trigger: null,
      }).catch(() => {});
    }
    return;
  }

  // Use hasStartedLocationUpdatesAsync - checks if location updates are actually
  // being delivered. The old check (isTaskRegisteredAsync) only checked if the
  // task handler was defined, which is ALWAYS true after module import. This meant
  // startLocationUpdatesAsync was never called after iOS cleared the subscription
  // (overnight kill, TestFlight update, force quit, reboot), so detection silently
  // stopped working until the user happened to trigger a fresh registration.
  const isRunning = await Location.hasStartedLocationUpdatesAsync(DETECTION_TASK_NAME);
  if (isRunning) {
    logDetectionEvent("detection_already_running").catch(() => {});
    return;
  }

  await Location.startLocationUpdatesAsync(DETECTION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 200,
    deferredUpdatesInterval: 15000,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    // Hide the blue indicator in detection mode - the app appears "always on"
    // otherwise. Lower accuracy + wider intervals keep iOS delivering updates
    // without terminating the app, while avoiding the persistent blue pill.
    // Active recording (upgradeDetectionAccuracy) switches to High + visible.
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: "MileClear",
      notificationBody: "Monitoring for driving activity",
    },
  });
  logDetectionEvent("detection_started").catch(() => {});
}

/**
 * High-confidence trip start: mark recording active immediately and switch
 * to high-accuracy GPS without waiting for the consecutive detection gate.
 *
 * Called when an external signal tells us the user has definitely started a
 * trip - currently only the geofence departure-anchor exit handler. The
 * standard detection task waits for 2 callbacks at >15mph (~400m of driving)
 * before marking recording active, which loses the start of every trip.
 *
 * Safety: if movement turns out to be too short (false positive: walking,
 * GPS bounce), the MIN_AUTO_TRIP_DISTANCE_MILES filter at finalization
 * discards the trip with no user-visible artifact.
 *
 * Concurrency: the DB-backed guard on `auto_recording_active` reads then
 * writes ~1ms later, leaving a window where two concurrent callers (e.g.
 * two anchor_exit handlers firing in the same tick) both pass the guard
 * and both proceed to start recording / Live Activity. Anthony hit this
 * 2026-04-24: two recording_started + two live_activity_started inside
 * 0.4s. The in-memory promise mutex below collapses concurrent calls
 * onto the same in-flight body so only one runs.
 */
/**
 * Enter "watch mode" — quietly buffer GPS readings without committing to a
 * recording. This is what iOS geofence anchor-exit handlers should call now
 * (instead of the old `forceStartRecording`). The detection task's existing
 * driving-confirmation logic will promote watch → recording when sustained
 * driving is observed. If no driving is observed within
 * WATCH_MODE_MAX_AGE_MS, watch mode silently exits via stale cleanup —
 * no Live Activity ever appears, no notification was ever sent.
 *
 * Replaces the previous behaviour where anchor_exit immediately started a
 * recording and Live Activity, producing "0 mi · 35m" phantoms whenever
 * indoor GPS drift fired a false geofence exit.
 */
export async function enterWatchMode(reason: string): Promise<void> {
  // Same guards as forceStartRecording — don't override user disable, no
  // permission, or active shift.
  const enabled = await isDriveDetectionEnabled();
  if (!enabled) {
    logDetectionEvent("watch_mode_skipped", { reason, cause: "disabled" }).catch(() => {});
    return;
  }
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== "granted") {
    logDetectionEvent("watch_mode_skipped", { reason, cause: "permission" }).catch(() => {});
    return;
  }

  const db = await getDatabase();
  const activeShift = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
  );
  if (activeShift) {
    logDetectionEvent("watch_mode_skipped", { reason, cause: "active_shift" }).catch(() => {});
    return;
  }

  // If a recording is already active, nothing to do — watch mode is meaningless
  // because we're already past the "is this real driving?" stage.
  const recording = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
  );
  if (recording?.value === "1") {
    logDetectionEvent("watch_mode_skipped", { reason, cause: "already_recording" }).catch(() => {});
    return;
  }

  // Set watch flags. Any in-flight watch mode gets its timer reset, which is
  // what we want — a re-entered watch (e.g. another geofence exit ping) means
  // the user is doing something, so the timeout extends.
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('watch_mode_active', '1')"
  );
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('watch_mode_started_at', ?)",
    [Date.now().toString()]
  );
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('watch_mode_reason', ?)",
    [reason]
  );

  // Upgrade GPS so we get coords promptly. Crucially we do NOT set
  // auto_recording_active here — that's the bit that triggers the LA, the
  // notification, and all the user-visible signals. Watch mode is silent.
  try {
    await upgradeDetectionAccuracy();
  } catch {}

  logDetectionEvent("watch_mode_entered", { reason }).catch(() => {});
}

/**
 * Cleanly exit watch mode without finalizing a trip. Called when the watch
 * timer expires without observing real driving (carpark with bad signal,
 * user walked to the bin and back, indoor GPS drift, etc). Clears the
 * buffered detection_coordinates so the next watch/recording cycle doesn't
 * inherit stale data, and downgrades GPS accuracy back to the lower-power
 * detection mode.
 */
async function exitWatchModeSilently(reason: string): Promise<void> {
  const db = await getDatabase();

  await db.runAsync("DELETE FROM detection_coordinates");
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key IN ('watch_mode_active', 'watch_mode_started_at', 'watch_mode_reason', 'driving_detection_count')"
  );

  try {
    await downgradeToDetectionMode();
  } catch {}

  logDetectionEvent("watch_mode_exited", { reason }).catch(() => {});
}

/** Clear watch mode flags when transitioning to a real recording. Idempotent. */
async function clearWatchModeFlags(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key IN ('watch_mode_active', 'watch_mode_started_at', 'watch_mode_reason')"
  );
}

let forceStartInFlight: Promise<void> | null = null;

export async function forceStartRecording(reason: string): Promise<void> {
  if (forceStartInFlight) {
    logDetectionEvent("force_start_skipped", { reason, cause: "in_flight" }).catch(() => {});
    return forceStartInFlight;
  }
  forceStartInFlight = forceStartRecordingImpl(reason).finally(() => {
    forceStartInFlight = null;
  });
  return forceStartInFlight;
}

async function forceStartRecordingImpl(reason: string): Promise<void> {
  // Same guards as startDriveDetection - don't override user disable / shift / permissions
  const enabled = await isDriveDetectionEnabled();
  if (!enabled) {
    logDetectionEvent("force_start_skipped", { reason, cause: "disabled" }).catch(() => {});
    return;
  }
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== "granted") {
    logDetectionEvent("force_start_skipped", { reason, cause: "permission" }).catch(() => {});
    return;
  }

  const db = await getDatabase();
  const activeShift = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
  );
  if (activeShift) {
    logDetectionEvent("force_start_skipped", { reason, cause: "active_shift" }).catch(() => {});
    return;
  }

  // If recording is already active, nothing to do.
  const existing = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
  );
  if (existing?.value === "1") {
    logDetectionEvent("force_start_skipped", { reason, cause: "already_recording" }).catch(() => {});
    return;
  }

  await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('auto_recording_active', '1')");
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_driving_speed_at', ?)",
    [Date.now().toString()]
  );
  // If watch mode was active, the recording-start is the watch→recording
  // promotion. Clear watch flags so the timeout cleanup doesn't try to undo
  // what we just set up.
  await clearWatchModeFlags();

  // Read the user's actual dashboard mode for Live Activity accent colour.
  // Previously hardcoded to isBusinessMode: true which showed amber even
  // when the user was in personal mode.
  let isBusinessMode = true;
  try {
    const modeRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'app_mode'"
    );
    if (modeRow?.value === "personal") isBusinessMode = false;
  } catch {}

  // Start Live Activity so the user sees a trip in progress on the lock screen
  // and Dynamic Island. Log the result so diagnostics can show whether it worked.
  try {
    await maybeStartAutoTripLiveActivity({ activityType: "trip", isBusinessMode });
    logDetectionEvent("live_activity_started", { source: "force_start" }).catch(() => {});
  } catch (laErr) {
    logDetectionEvent("live_activity_failed", {
      source: "force_start",
      error: (laErr as Error).message || "unknown",
    }).catch(() => {});
  }

  // Persistent passive notification as a safety net for when the Live Activity
  // silently fails to present.
  showRecordingActiveNotification().catch(() => {});

  // Send the "Looks like you're driving" notification so the user gets feedback
  // even when force_start fires from a background geofence handler (where the
  // Dynamic Island / Live Activity may be throttled by iOS). Previously
  // force_start bypassed the notification entirely — the user had zero visual
  // indication that a trip was recording.
  try {
    if (!isQuietHours()) {
      const lastNotif = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'last_detection_notification'"
      );
      const elapsed = lastNotif ? Date.now() - parseInt(lastNotif.value, 10) : Infinity;
      if (elapsed >= COOLDOWN_MS) {
        await sendDrivingDetectedNotification();
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_detection_notification', ?)",
          [Date.now().toString()]
        );
      }
    }
  } catch {}

  // upgradeDetectionAccuracy() handles both "task already running" (restarts at
  // BestForNavigation) and "task not running" (starts fresh at BestForNavigation),
  // which is exactly what we want - skip detection mode entirely.
  try {
    await upgradeDetectionAccuracy();
  } catch {}

  logDetectionEvent("recording_started", { source: "force_start", reason }).catch(() => {});

  // Start watchdog that checks every 3 minutes for stuck recordings.
  // Replaces the single 11-minute setTimeout which could miss the window
  // if last_driving_speed_at was recently updated when the timeout fired.
  startWatchdog();
}

export async function stopDriveDetection(): Promise<void> {
  const isRunning = await TaskManager.isTaskRegisteredAsync(DETECTION_TASK_NAME);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(DETECTION_TASK_NAME);
  }
}

export async function isDriveDetectionEnabled(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'drive_detection_enabled'"
  );
  return row ? row.value === "1" : true;
}

export async function setDriveDetectionEnabled(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('drive_detection_enabled', ?)",
    [enabled ? "1" : "0"]
  );

  if (enabled) {
    await startDriveDetection();
  } else {
    await stopDriveDetection();
  }
}

/**
 * Upgrade detection to higher accuracy with visible background indicator.
 * Called automatically when auto-recording starts, or when user taps "Track Trip".
 * Switches from 200m/15s (detection) to 50m/10s (recording) for denser GPS.
 *
 * Verifies the upgrade took effect with a post-call hasStartedLocationUpdatesAsync
 * check, and retries once on failure. Anthony hit the failure mode 2026-04-26:
 * an active recording trip showed only 16 GPS points across 1h1m / 1.4mi
 * (~140m between points = 200m detection mode, not 50m recording mode).
 * iOS appears to have suspended the JS runtime during the stop->start sequence,
 * leaving the task either stopped or stuck in detection mode.
 *
 * Never throws. Failures are logged via recording_upgrade_failed diagnostic
 * events for admin review.
 */
export async function upgradeDetectionAccuracy(): Promise<void> {
  const firstAttempt = await tryUpgrade();
  if (firstAttempt.ok) return;

  logDetectionEvent("recording_upgrade_failed", {
    attempt: 1,
    error: firstAttempt.error,
  }).catch(() => {});

  // iOS may have briefly suspended JS during stopLocationUpdatesAsync ->
  // startLocationUpdatesAsync. Wait then retry once.
  await new Promise<void>((resolve) => setTimeout(resolve, 500));

  const secondAttempt = await tryUpgrade();
  if (secondAttempt.ok) {
    logDetectionEvent("recording_upgrade_recovered", { attempt: 2 }).catch(() => {});
    return;
  }

  logDetectionEvent("recording_upgrade_failed", {
    attempt: 2,
    error: secondAttempt.error,
  }).catch(() => {});
  // Detection-mode is still running, which is better than crashing the
  // recording start. The diagnostic alert system surfaces these events.
}

type UpgradeResult = { ok: true } | { ok: false; error: string };

async function tryUpgrade(): Promise<UpgradeResult> {
  try {
    const isRunning = await TaskManager.isTaskRegisteredAsync(DETECTION_TASK_NAME);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(DETECTION_TASK_NAME);
    }

    await Location.startLocationUpdatesAsync(DETECTION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 50,
      deferredUpdatesInterval: 10000,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: "MileClear is recording your trip",
        notificationBody: "Tap to open the app",
      },
    });

    const verified = await Location.hasStartedLocationUpdatesAsync(DETECTION_TASK_NAME);
    if (!verified) {
      return { ok: false, error: "task did not start after upgrade" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Switch to finalization mode when the user has parked but the stop timeout
 * hasn't elapsed yet. Uses a very small distance interval (5m) so that
 * natural GPS drift keeps generating callbacks even while stationary.
 * This ensures the timeout check runs regularly instead of waiting for
 * the user to open the app or drive again.
 */
async function switchToFinalizationMode(): Promise<void> {
  try {
    const isRunning = await TaskManager.isTaskRegisteredAsync(DETECTION_TASK_NAME);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(DETECTION_TASK_NAME);
    }

    await Location.startLocationUpdatesAsync(DETECTION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 5, // GPS drift (~5-30m) generates callbacks while stationary
      deferredUpdatesInterval: 30000, // At least every 30s
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: "MileClear",
        notificationBody: "Saving your trip...",
      },
    });
  } catch {
    // Best-effort
  }
}

/**
 * Downgrade back to low-power detection mode after a trip finishes.
 * Switches from 50m/10s (recording) back to 100m/15s (detection).
 */
async function downgradeToDetectionMode(): Promise<void> {
  try {
    const isRunning = await TaskManager.isTaskRegisteredAsync(DETECTION_TASK_NAME);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(DETECTION_TASK_NAME);
    }

    await Location.startLocationUpdatesAsync(DETECTION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 200,
      deferredUpdatesInterval: 15000,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: "MileClear",
        notificationBody: "Monitoring for driving activity",
      },
    });
  } catch {
    // Best-effort - detection will restart next time startDriveDetection() is called
  }
}

export async function getAndClearBufferedCoordinates(): Promise<BufferedCoordinate[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BufferedCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM detection_coordinates ORDER BY recorded_at ASC"
  );
  await db.runAsync("DELETE FROM detection_coordinates");
  // Also clear auto-recording state since coords are being consumed
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key IN ('auto_recording_active', 'last_driving_speed_at', 'finalization_mode')"
  );
  return rows;
}
