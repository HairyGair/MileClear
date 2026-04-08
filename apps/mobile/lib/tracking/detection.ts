import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { getDatabase } from "../db/index";
import { sendDrivingDetectedNotification } from "../notifications/index";
import { DRIVING_SPEED_THRESHOLD_MPH, bestTripDistance } from "@mileclear/shared";
import { startLiveActivity, updateLiveActivity, endLiveActivity, endLiveActivityWithSummary, recoverLiveActivity } from "../liveActivity";
import { markBluetoothStateAtStart, hasBluetoothDisconnected, resetBluetoothState } from "../bluetooth";
import type { TripClassification, PlatformTag } from "@mileclear/shared";

const DETECTION_TASK_NAME = "mileclear-drive-detection";
const COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes
const BUFFER_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const SPEED_THRESHOLD_MS = DRIVING_SPEED_THRESHOLD_MPH * 0.44704; // mph to m/s
const FAST_GATE_SPEED_MS = 25 * 0.44704; // 25 mph - bypass consecutive detection gate
const STOP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes - trip ends after this idle period (covers fuel stops, drive-throughs)
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
 * Determine if any locations indicate driving speed.
 * Returns the highest detected speed in m/s, or null if no driving-speed reading.
 *
 * Filters out locations with poor GPS accuracy to prevent indoor GPS drift
 * (common when stationary indoors) from triggering false driving detections.
 *
 * Returning the speed (instead of a bool) lets the caller apply a fast-gate:
 * a single very-high-speed reading is unambiguous and can skip the consecutive
 * detection gate that otherwise costs ~400m of driving before recording starts.
 */
function detectDrivingSpeed(locations: Location.LocationObject[]): number | null {
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
  if (maxReportedSpeed >= SPEED_THRESHOLD_MS) return maxReportedSpeed;

  // Fall back to calculated speed - require stricter accuracy since distance/time
  // is much more susceptible to GPS drift than iOS's native speed estimation.
  const accurate = reliable.filter(
    (loc) => loc.coords.accuracy != null && loc.coords.accuracy <= GPS_ACCURACY_STRICT
  );
  let maxCalcSpeed = -1;
  if (accurate.length >= 2) {
    for (let i = 1; i < accurate.length; i++) {
      const prev = accurate[i - 1];
      const curr = accurate[i];
      const dtSec = (curr.timestamp - prev.timestamp) / 1000;
      if (dtSec > 0) {
        const distM = haversineMeters(
          prev.coords.latitude, prev.coords.longitude,
          curr.coords.latitude, curr.coords.longitude
        );
        const calcSpeed = distM / dtSec;
        if (calcSpeed > maxCalcSpeed) maxCalcSpeed = calcSpeed;
      }
    }
  }
  if (maxCalcSpeed >= SPEED_THRESHOLD_MS) return maxCalcSpeed;

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
  resetBluetoothState();

  // Calculate final distance for the Live Activity summary before clearing coords
  const finalStats = await getAutoTripRunningDistance();

  // Safety: drop any coordinates older than BUFFER_MAX_AGE_MS (30 min). If
  // auto_recording_active got stuck ON across a crash, the buffer can contain
  // coords from days ago. Without this purge, the saved trip's startedAt
  // would be the stale first coord (e.g. resulting in "5369:16" elapsed on
  // the Trip in Progress screen, or an impossibly long HMRC claim).
  const staleCutoff = new Date(Date.now() - BUFFER_MAX_AGE_MS).toISOString();
  await db.runAsync(
    "DELETE FROM detection_coordinates WHERE recorded_at < ?",
    [staleCutoff]
  );

  // Read all buffered coordinates
  const allCoords = await db.getAllAsync<BufferedCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM detection_coordinates ORDER BY recorded_at ASC"
  );

  logDetectionEvent("finalize_called", { coordCount: allCoords.length }).catch(() => {});

  // Clear state regardless of outcome
  await db.runAsync("DELETE FROM detection_coordinates");
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key IN ('auto_recording_active', 'last_driving_speed_at', 'driving_detection_count', 'finalization_mode', 'stop_anchor')"
  );

  if (allCoords.length < 2) {
    // No meaningful trip - dismiss Live Activity immediately
    logDetectionEvent("finalize_no_coords").catch(() => {});
    endLiveActivity().catch(() => {});
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
  if (coords.length < 2) return;

  // Calculate total distance: sum the GPS chord segments, then ask OSRM for
  // the road distance between start and end. bestTripDistance() takes the max
  // so we recover the chord-to-arc undercount on winding roads while preserving
  // any real detour the user took (which the GPS sum captures but OSRM doesn't).
  let gpsSumDistance = 0;
  for (let i = 1; i < coords.length; i++) {
    gpsSumDistance += haversineMiles(
      coords[i - 1].lat, coords[i - 1].lng,
      coords[i].lat, coords[i].lng
    );
  }
  const first = coords[0];
  const last = coords[coords.length - 1];
  const totalDistance = await bestTripDistance(
    gpsSumDistance,
    first.lat, first.lng,
    last.lat, last.lng,
  );

  if (totalDistance < MIN_AUTO_TRIP_DISTANCE_MILES) {
    // Too short to save - dismiss Live Activity immediately
    logDetectionEvent("finalize_too_short", { distance: totalDistance, gpsSumDistance }).catch(() => {});
    endLiveActivity().catch(() => {});
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
      endDateMs: new Date(last.recorded_at).getTime(),
      needsClassification: !wasAutoClassified,
    }).catch(() => {});

    // For auto-classified trips, fire the "Trip recorded as X" notification
    // BEFORE the API call - there are no action buttons that need the server
    // tripId, so nothing depends on the sync completing.
    if (wasAutoClassified && !isQuietHours()) {
      const from = startAddress || "Unknown";
      const to = endAddress || "Unknown";
      Notifications.scheduleNotificationAsync({
        content: {
          title: `Trip recorded as ${classification}`,
          body: `${from} to ${to} (${totalDistance.toFixed(1)} mi)`,
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
      coordinates: coords.map((c) => ({
        lat: c.lat,
        lng: c.lng,
        speed: c.speed,
        accuracy: c.accuracy,
        recordedAt: c.recorded_at,
      })),
    });

    // Store classification source on the local trip row
    const savedTripId = tripResult?.data?.id;
    if (classificationSource && savedTripId) {
      db.runAsync(
        "UPDATE trips SET classification_source = ? WHERE id = ?",
        [classificationSource, savedTripId]
      ).catch(() => {});
    }

    logDetectionEvent("finalize_saved", {
      tripId: savedTripId,
      distance: totalDistance,
      gpsSumDistance,
      durationSecs: Math.round((new Date(last.recorded_at).getTime() - new Date(first.recorded_at).getTime()) / 1000),
      classification,
    }).catch(() => {});

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
          body: `${from} to ${to} (${totalDistance.toFixed(1)} mi)`,
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

    // Set departure anchor at trip end point - if iOS terminates the app,
    // this geofence will reliably wake it when the user starts moving again
    try {
      const { setDepartureAnchor } = await import("../geofencing/index");
      await setDepartureAnchor(last.lat, last.lng);
    } catch {
      // Best effort
    }
  } catch (err) {
    console.error("Auto-trip save failed:", err);
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
    await db.runAsync("DELETE FROM tracking_state WHERE key = 'auto_recording_active'");
    return;
  }

  const elapsed = Date.now() - parseInt(lastDriving.value, 10);
  if (elapsed > STOP_TIMEOUT_MS) {
    logDetectionEvent("stale_finalize_triggered", { elapsedMs: elapsed }).catch(() => {});
    await finalizeAutoTrip();
  }
}

/**
 * Public: finalize stale auto-recordings on app startup.
 * Handles the case where the app was killed during an active recording.
 */
export async function finalizeStaleAutoRecordings(): Promise<void> {
  try {
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
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key IN ('auto_recording_active', 'last_driving_speed_at', 'driving_detection_count', 'finalization_mode', 'stop_anchor')"
  );
  resetBluetoothState();
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
            await startLiveActivity({ activityType: "trip", isBusinessMode: true });
          } catch {}
        }

        // Check if the recording is clearly stale (e.g. app was killed and just
        // reopened). If the last driving activity was long ago, finalize
        // immediately WITHOUT buffering these new coords - they'd set the trip
        // end time to "now" instead of when driving actually stopped.
        const lastDrivingCheck = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'last_driving_speed_at'"
        );
        if (lastDrivingCheck) {
          const staleElapsed = Date.now() - parseInt(lastDrivingCheck.value, 10);
          if (staleElapsed > STOP_TIMEOUT_MS * 2) {
            // Recording is very stale - finalize with existing coords only
            await finalizeAutoTrip();
            downgradeToDetectionMode().catch(() => {});
            return;
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

            // Bluetooth disconnection = fast trip end. If the user was connected
            // to their car's Bluetooth when recording started and now they're not,
            // that means the engine is off / they've left the car. Finalize after
            // a shorter grace period (90s) to avoid false positives from brief
            // BT dropouts.
            const BT_DISCONNECT_GRACE_MS = 90 * 1000;
            let btDisconnected = false;
            if (elapsed > BT_DISCONNECT_GRACE_MS) {
              try {
                btDisconnected = await hasBluetoothDisconnected();
              } catch {
                // BT check is best-effort
              }
            }

            if (elapsed > STOP_TIMEOUT_MS || btDisconnected) {
              await finalizeAutoTrip();
              resetBluetoothState();
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
      // Returns the highest detected speed in m/s, or null if no driving reading.
      let detectedSpeedMs = detectDrivingSpeed(locations);

      // Single-location batch: compare against the previous buffered coordinate.
      // Only trust this if the current location has good GPS accuracy -
      // indoor drift with poor accuracy is the main source of false positives.
      if (detectedSpeedMs == null && locations.length === 1) {
        const loc = locations[0];
        const locAccuracy = loc.coords.accuracy ?? 999;
        if (locAccuracy <= GPS_ACCURACY_STRICT) {
          const lastCoord = await db.getFirstAsync<{ lat: number; lng: number; recorded_at: string; accuracy: number | null }>(
            "SELECT lat, lng, recorded_at, accuracy FROM detection_coordinates ORDER BY recorded_at DESC LIMIT 1 OFFSET 1"
          );
          if (lastCoord && (lastCoord.accuracy == null || lastCoord.accuracy <= GPS_ACCURACY_STRICT)) {
            const dtSec = (loc.timestamp - new Date(lastCoord.recorded_at).getTime()) / 1000;
            if (dtSec > 0 && dtSec < 120) {
              const distM = haversineMeters(
                lastCoord.lat, lastCoord.lng,
                loc.coords.latitude, loc.coords.longitude
              );
              const calcSpeed = distM / dtSec;
              if (calcSpeed >= SPEED_THRESHOLD_MS) detectedSpeedMs = calcSpeed;
            }
          }
        }
      }

      if (detectedSpeedMs == null) {
        // Reset consecutive driving detection counter - the user isn't driving
        await db.runAsync("DELETE FROM tracking_state WHERE key = 'driving_detection_count'");
        return;
      }

      // ── Consecutive detection gate ──
      // Require multiple consecutive callbacks showing driving speed before
      // starting a recording. A single GPS outlier (drift, bounce, stale cache)
      // can't trigger a false "Looks like you're driving" notification.
      //
      // Fast-gate exception: a single very-high-speed reading (>=25 mph) is
      // unambiguous - GPS drift doesn't fake highway speeds. Skip the gate
      // so the trip starts immediately instead of waiting another ~400m of
      // driving for the second confirmation callback.
      const fastGate = detectedSpeedMs >= FAST_GATE_SPEED_MS;
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
          logDetectionEvent("driving_detected", { speedMs: detectedSpeedMs, count, gateRequired: CONSECUTIVE_DETECTIONS_REQUIRED }).catch(() => {});
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

        // Mark auto-recording as active + update last driving timestamp
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('auto_recording_active', '1')"
        );
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_driving_speed_at', ?)",
          [Date.now().toString()]
        );

        logDetectionEvent("recording_started", {
          speedMs: detectedSpeedMs,
          fastGate,
          source: "detection_task",
        }).catch(() => {});

        // Start Live Activity - must be awaited so the native Activity.request()
        // completes before iOS suspends the background task.
        try {
          await startLiveActivity({ activityType: "trip", isBusinessMode: true });
        } catch {}

        // Auto-upgrade to navigation-grade accuracy for better trip recording.
        try {
          await upgradeDetectionAccuracy();
        } catch {}

        // Snapshot Bluetooth connection state for trip-end detection.
        try {
          await markBluetoothStateAtStart();
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
 */
export async function forceStartRecording(reason: string): Promise<void> {
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

  // Snapshot Bluetooth state for trip-end detection (best-effort)
  try { await markBluetoothStateAtStart(); } catch {}

  // Start Live Activity so the user sees a trip in progress on the lock screen
  try {
    await startLiveActivity({ activityType: "trip", isBusinessMode: true });
  } catch {}

  // upgradeDetectionAccuracy() handles both "task already running" (restarts at
  // BestForNavigation) and "task not running" (starts fresh at BestForNavigation),
  // which is exactly what we want - skip detection mode entirely.
  try {
    await upgradeDetectionAccuracy();
  } catch {}

  logDetectionEvent("recording_started", { source: "force_start", reason }).catch(() => {});
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
 * Switches from 100m/15s (detection) to 50m/10s (recording) for denser GPS.
 */
export async function upgradeDetectionAccuracy(): Promise<void> {
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
