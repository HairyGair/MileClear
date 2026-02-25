// GPS tracking and trip detection logic
// Uses expo-location + expo-task-manager for background location
// Stores coordinates in SQLite, segments into trips on shift end

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getDatabase } from "../db/index";
import { syncCreateTrip } from "../sync/actions";
import { startDriveDetection, stopDriveDetection } from "./detection";
import { reverseGeocode } from "../location/geocoding";

const LOCATION_TASK_NAME = "mileclear-background-location";
const MIN_TRIP_DISTANCE_MILES = 0.1;
const STOP_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const STOP_SPEED_MS = 1.5; // m/s (~3.4 mph)

interface StoredCoordinate {
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
  const { status: foreground } =
    await Location.requestForegroundPermissionsAsync();
  if (foreground !== "granted") return false;

  const { status: background } =
    await Location.requestBackgroundPermissionsAsync();
  return background === "granted";
}

export async function isTrackingActive(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
}

export async function startShiftTracking(shiftId: string): Promise<void> {
  await stopDriveDetection();

  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('active_shift_id', ?)",
    [shiftId]
  );

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 50,
    deferredUpdatesInterval: 10000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "MileClear is tracking your shift",
      notificationBody: "Tap to open the app",
    },
  });
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

  await startDriveDetection();
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

  // Read coordinates atomically — copy to a processing flag to prevent
  // the background task from writing more while we process
  const coords = await db.getAllAsync<StoredCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM shift_coordinates WHERE shift_id = ? ORDER BY recorded_at ASC",
    [shiftId]
  );

  if (coords.length < 2) {
    await db.runAsync("DELETE FROM shift_coordinates WHERE shift_id = ?", [shiftId]);
    return 0;
  }

  // Delete coordinates immediately after reading to avoid race with background task
  // (shift tracking should already be stopped before calling this function)
  await db.runAsync("DELETE FROM shift_coordinates WHERE shift_id = ?", [shiftId]);

  const segments = segmentTrips(coords);
  let created = 0;

  for (const segment of segments) {
    if (segment.length < 2) continue;

    let totalDistance = 0;
    for (let i = 1; i < segment.length; i++) {
      totalDistance += haversine(
        segment[i - 1].lat, segment[i - 1].lng,
        segment[i].lat, segment[i].lng
      );
    }

    if (totalDistance < MIN_TRIP_DISTANCE_MILES) continue;

    const first = segment[0];
    const last = segment[segment.length - 1];

    // Reverse-geocode start and end points for human-readable addresses
    const [startAddress, endAddress] = await Promise.all([
      reverseGeocode(first.lat, first.lng),
      reverseGeocode(last.lat, last.lng),
    ]);

    try {
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
        classification: "business",
        coordinates: segment.map((c) => ({
          lat: c.lat,
          lng: c.lng,
          speed: c.speed,
          accuracy: c.accuracy,
          recordedAt: c.recorded_at,
        })),
      });
      created++;
    } catch (err) {
      console.error("Failed to create trip from GPS data:", err);
    }
  }

  return created;
}

function segmentTrips(coords: StoredCoordinate[]): StoredCoordinate[][] {
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
        // Stopped for >2 minutes — end current trip, start fresh
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

// Background task — runs when app is backgrounded, stores coords in SQLite
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
