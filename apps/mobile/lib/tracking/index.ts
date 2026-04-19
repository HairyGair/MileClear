// GPS tracking and trip detection logic
// Uses expo-location + expo-task-manager for background location
// Stores coordinates in SQLite, segments into trips on shift end

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getDatabase } from "../db/index";
import { syncCreateTrip } from "../sync/actions";
import { startDriveDetection, stopDriveDetection, cancelAutoRecording } from "./detection";
import { reverseGeocode } from "../location/geocoding";
import { getScheduleClassification } from "../schedule/index";
import { setDepartureAnchor } from "../geofencing/index";
import { bestTraceDistance, computeTripQuality, filterTraceOutliers } from "@mileclear/shared";

const LOCATION_TASK_NAME = "mileclear-background-location";
const QUICK_TRIP_SHIFT_ID = "__quick_trip__";
const MIN_TRIP_DISTANCE_MILES = 0.1;
const STOP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes - prevents traffic lights / brief stops from splitting trips
const STOP_SPEED_MS = 1.5; // m/s (~3.4 mph)

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

  return true;
}

export async function isTrackingActive(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
}

export async function startShiftTracking(shiftId: string): Promise<void> {
  await stopDriveDetection();
  await cancelAutoRecording();

  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('active_shift_id', ?)",
    [shiftId]
  );

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
  await db.runAsync("DELETE FROM tracking_state WHERE key = 'active_shift_id'");

  // Clear any leftover detection coordinates and auto-recording state so the
  // detection system cannot finalize a duplicate trip for the same journey.
  await cancelAutoRecording(true);

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
  const isTracking = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  const db = await getDatabase();

  // Read all coordinates collected during the quick trip
  const coords = await db.getAllAsync<StoredCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM shift_coordinates WHERE shift_id = ? ORDER BY recorded_at ASC",
    [QUICK_TRIP_SHIFT_ID]
  );

  // Clean up
  await db.runAsync("DELETE FROM shift_coordinates WHERE shift_id = ?", [QUICK_TRIP_SHIFT_ID]);
  await db.runAsync("DELETE FROM tracking_state WHERE key = 'active_shift_id'");

  // Clear detection coordinates to prevent duplicate trip finalization
  await cancelAutoRecording(true);

  // Restart drive detection for the next trip
  await startDriveDetection();

  // Set departure anchor so iOS can wake the app for the next trip
  setDepartureAnchor().catch(() => {});

  return coords;
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
export async function processShiftTrips(
  shiftId: string,
  vehicleId?: string
): Promise<number> {
  const db = await getDatabase();

  const coords = await db.getAllAsync<StoredCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM shift_coordinates WHERE shift_id = ? ORDER BY recorded_at ASC",
    [shiftId]
  );

  if (coords.length < 2) {
    await db.runAsync("DELETE FROM shift_coordinates WHERE shift_id = ?", [shiftId]);
    return 0;
  }

  // DO NOT delete coordinates yet - only delete after trips are successfully
  // created. Previously coordinates were deleted before trip creation, meaning
  // any failure (API error, crash, memory pressure on long shifts) permanently
  // lost all GPS data with no way to recover.

  const segments = segmentTrips(coords);
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

    if (totalDistance < MIN_TRIP_DISTANCE_MILES) continue;

    // Reverse-geocode start and end points for human-readable addresses
    const [startAddress, endAddress] = await Promise.all([
      reverseGeocode(first.lat, first.lng),
      reverseGeocode(last.lat, last.lng),
    ]);

    try {
      // Check work schedule for auto-classification
      const tripTime = new Date(first.recorded_at);
      const classification = await getScheduleClassification(tripTime);

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
        console.log(`[processShiftTrips] Downsampled ${filteredSegment.length} coords to ${tripCoords.length}`);
      }

      await syncCreateTrip({
        shiftId,
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
        gpsQuality: tripQuality,
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
    await db.runAsync("DELETE FROM shift_coordinates WHERE shift_id = ?", [shiftId]);
  } else {
    console.warn(`[processShiftTrips] ${created} trips created but some failed - keeping ${coords.length} coordinates for retry`);
  }

  return created;
}

export function segmentTrips(coords: StoredCoordinate[]): StoredCoordinate[][] {
  if (coords.length < 2) return [];

  const trips: StoredCoordinate[][] = [];
  let current: StoredCoordinate[] = [coords[0]];
  let stoppedSince: number | null = null;

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const currTime = new Date(curr.recorded_at).getTime();
    const prevTime = new Date(prev.recorded_at).getTime();

    let stopped = false;
    if (curr.speed != null && curr.speed >= 0) {
      stopped = curr.speed < STOP_SPEED_MS;
    } else {
      const dt = (currTime - prevTime) / 1000;
      if (dt > 0) {
        const distMeters = haversine(prev.lat, prev.lng, curr.lat, curr.lng) * 1609.34;
        stopped = (distMeters / dt) < STOP_SPEED_MS;
      } else {
        stopped = true;
      }
    }

    if (stopped) {
      if (stoppedSince === null) stoppedSince = currTime;

      if (currTime - stoppedSince >= STOP_THRESHOLD_MS) {
        // Stopped for >2 minutes - end current trip, start fresh
        if (current.length >= 2) {
          trips.push(current);
        }
        current = [];
        stoppedSince = null;
        continue;
      }
    } else {
      stoppedSince = null;
    }

    current.push(curr);
  }

  if (current.length >= 2) {
    trips.push(current);
  }

  return trips;
}

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
  } catch (err) {
    console.error("Failed to store location:", err);
  }
});
