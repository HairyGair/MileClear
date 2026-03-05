// Geofencing engine — monitors saved locations and auto-creates trips
// Uses expo-location geofencing (OS-level, battery efficient)
// EXIT a saved location → start GPS tracking
// ENTER a saved location → stop tracking, save trip

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { randomUUID } from "expo-crypto";
import { getDatabase } from "../db/index";
import { reverseGeocode } from "../location/geocoding";
import { DRIVING_SPEED_THRESHOLD_MPH } from "@mileclear/shared";
import { checkBluetoothVehicleConnected } from "../bluetooth/index";

const GEOFENCE_TASK_NAME = "mileclear-geofence-monitor";
const GEOFENCE_TRACKING_TASK_NAME = "mileclear-geofence-tracking";
const SPEED_THRESHOLD_MS = DRIVING_SPEED_THRESHOLD_MPH * 0.44704; // mph → m/s
const MIN_TRIP_DISTANCE_MILES = 0.1;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Geofence event handler ────────────────────────────────────────────────

try {
  TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error("Geofence task error:", error);
      return;
    }
    if (!data) return;

    const { eventType, region } = data as {
      eventType: Location.GeofencingEventType;
      region: Location.LocationRegion;
    };

    try {
      const db = await getDatabase();

      // Don't interfere with active shifts
      const activeShift = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
      );
      if (activeShift) return;

      if (eventType === Location.GeofencingEventType.Exit) {
        // User left a saved location — arm geofence tracking
        // Store which location they left and when
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_departed_location', ?)",
          [region.identifier ?? "unknown"]
        );
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_departed_at', ?)",
          [new Date().toISOString()]
        );
        // Clear any previous arrival data
        await db.runAsync("DELETE FROM tracking_state WHERE key = 'geofence_arrived_location'");

        // Start GPS tracking to collect coordinates
        await startGeofenceTracking();

      } else if (eventType === Location.GeofencingEventType.Enter) {
        // User arrived at a saved location
        const departedRow = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'geofence_departed_location'"
        );
        const departedAtRow = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'geofence_departed_at'"
        );

        if (departedRow && departedAtRow) {
          // Stop GPS tracking
          await stopGeofenceTracking();

          // Process collected coordinates into a trip
          await processGeofenceTrip(
            departedRow.value,
            region.identifier ?? "unknown",
            departedAtRow.value
          );
        }

        // Clean up departure state
        await db.runAsync("DELETE FROM tracking_state WHERE key IN ('geofence_departed_location', 'geofence_departed_at')");
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_arrived_location', ?)",
          [region.identifier ?? "unknown"]
        );
      }
    } catch (err) {
      console.error("Geofence handler error:", err);
    }
  });
} catch (err) {
  console.warn("Failed to define geofence task:", err);
}

// ─── GPS tracking for geofence trips ─────────────────────────────────────

try {
  TaskManager.defineTask(GEOFENCE_TRACKING_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error("Geofence tracking error:", error);
      return;
    }
    if (!data) return;

    const { locations } = data as { locations: Location.LocationObject[] };

    try {
      const db = await getDatabase();

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
    } catch (err) {
      console.error("Geofence tracking store error:", err);
    }
  });
} catch (err) {
  console.warn("Failed to define geofence tracking task:", err);
}

// ─── Public API ─────────────────────────────────────────────────────────

export async function registerGeofences(): Promise<void> {
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== "granted") return;

  const db = await getDatabase();
  const locations = await db.getAllAsync<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
    geofence_enabled: number;
  }>(
    "SELECT id, name, latitude, longitude, radius_meters, geofence_enabled FROM saved_locations WHERE geofence_enabled = 1"
  );

  if (locations.length === 0) {
    // Stop geofencing if no locations are enabled
    await stopGeofencing();
    return;
  }

  const regions: Location.LocationRegion[] = locations.map((loc) => ({
    identifier: loc.id,
    latitude: loc.latitude,
    longitude: loc.longitude,
    radius: loc.radius_meters,
    notifyOnEnter: true,
    notifyOnExit: true,
  }));

  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
}

export async function stopGeofencing(): Promise<void> {
  const isRunning = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
  if (isRunning) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  }
}

export async function isGeofencingActive(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
}

async function startGeofenceTracking(): Promise<void> {
  const isRunning = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TRACKING_TASK_NAME);
  if (isRunning) return;

  await Location.startLocationUpdatesAsync(GEOFENCE_TRACKING_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 50,
    deferredUpdatesInterval: 10000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "MileClear",
      notificationBody: "Tracking your trip...",
    },
  });
}

async function stopGeofenceTracking(): Promise<void> {
  const isRunning = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TRACKING_TASK_NAME);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(GEOFENCE_TRACKING_TASK_NAME);
  }
}

// ─── Trip processing ─────────────────────────────────────────────────────

async function processGeofenceTrip(
  departedLocationId: string,
  arrivedLocationId: string,
  departedAt: string
): Promise<void> {
  const db = await getDatabase();

  // Read and clear detection coordinates
  const coords = await db.getAllAsync<{
    lat: number;
    lng: number;
    speed: number | null;
    accuracy: number | null;
    recorded_at: string;
  }>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM detection_coordinates ORDER BY recorded_at ASC"
  );
  await db.runAsync("DELETE FROM detection_coordinates");

  // Check if any coordinates indicate actual driving (speed > threshold)
  const drivingCoords = coords.filter(
    (c) => c.speed != null && c.speed >= SPEED_THRESHOLD_MS
  );
  if (drivingCoords.length === 0 && coords.length < 5) {
    // Likely walking, not driving — discard
    return;
  }

  // Calculate total distance
  let totalDistance = 0;
  for (let i = 1; i < coords.length; i++) {
    totalDistance += haversine(
      coords[i - 1].lat, coords[i - 1].lng,
      coords[i].lat, coords[i].lng
    );
  }

  if (totalDistance < MIN_TRIP_DISTANCE_MILES) return;

  const first = coords[0] || { lat: 0, lng: 0, recorded_at: departedAt };
  const last = coords[coords.length - 1] || first;

  // Look up location names from saved_locations
  const departedLoc = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM saved_locations WHERE id = ?",
    [departedLocationId]
  );
  const arrivedLoc = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM saved_locations WHERE id = ?",
    [arrivedLocationId]
  );

  const startAddress = departedLoc?.name || (await reverseGeocode(first.lat, first.lng)) || null;
  const endAddress = arrivedLoc?.name || (await reverseGeocode(last.lat, last.lng)) || null;

  // Check Bluetooth — if a vehicle's BT device is connected, auto-confirm the trip
  const btMatch = await checkBluetoothVehicleConnected();
  const isAutoConfirmed = btMatch != null;

  const tripId = randomUUID();
  const now = new Date().toISOString();
  const notes = isAutoConfirmed
    ? null
    : `__unconfirmed__|${departedLocationId}|${arrivedLocationId}`;

  // Store trip locally
  await db.runAsync(
    `INSERT INTO trips (id, start_lat, start_lng, end_lat, end_lng, start_address, end_address,
      distance_miles, started_at, ended_at, is_manual_entry, classification, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'personal', ?)`,
    [
      tripId,
      first.lat,
      first.lng,
      last.lat,
      last.lng,
      startAddress,
      endAddress,
      Math.round(totalDistance * 100) / 100,
      departedAt,
      now,
      notes,
    ]
  );

  // Store coordinates for route replay
  for (const c of coords) {
    await db.runAsync(
      `INSERT INTO coordinates (id, trip_id, lat, lng, speed, accuracy, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), tripId, c.lat, c.lng, c.speed, c.accuracy, c.recorded_at]
    );
  }

  if (isAutoConfirmed) {
    // Bluetooth confirmed — no notification needed, trip is fully saved
    return;
  }

  // No Bluetooth match — send confirmation notification
  await sendTripConfirmationNotification(tripId, startAddress, endAddress, totalDistance);

  // Schedule reminder for personal mode (3 hours)
  await scheduleConfirmationReminder(tripId, startAddress, endAddress, totalDistance);
}

// ─── Notifications ──────────────────────────────────────────────────────

async function sendTripConfirmationNotification(
  tripId: string,
  startAddress: string | null,
  endAddress: string | null,
  distanceMiles: number
): Promise<void> {
  const from = startAddress || "Unknown";
  const to = endAddress || "Unknown";
  const distance = distanceMiles.toFixed(1);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Trip detected",
      body: `${from} → ${to} (${distance} mi) — Were you driving?`,
      data: { type: "trip_confirmation", tripId },
      categoryIdentifier: "trip_confirm",
    },
    trigger: null, // Send immediately
  });
}

async function scheduleConfirmationReminder(
  tripId: string,
  startAddress: string | null,
  endAddress: string | null,
  distanceMiles: number
): Promise<void> {
  const from = startAddress || "Unknown";
  const to = endAddress || "Unknown";
  const distance = distanceMiles.toFixed(1);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Unconfirmed trip",
      body: `${from} → ${to} (${distance} mi) still needs confirmation`,
      data: { type: "trip_confirmation_reminder", tripId },
      categoryIdentifier: "trip_confirm",
    },
    trigger: { type: "timeInterval" as any, seconds: 3 * 60 * 60, repeats: false } as any,
  });
}

// ─── Trip confirmation/rejection ─────────────────────────────────────────

export async function confirmGeofenceTrip(tripId: string): Promise<void> {
  const db = await getDatabase();
  // Remove the __unconfirmed__ marker from notes
  const trip = await db.getFirstAsync<{ notes: string | null }>(
    "SELECT notes FROM trips WHERE id = ?",
    [tripId]
  );
  if (!trip) return;

  const cleanNotes = trip.notes?.startsWith("__unconfirmed__") ? null : trip.notes;
  await db.runAsync(
    "UPDATE trips SET notes = ? WHERE id = ?",
    [cleanNotes, tripId]
  );
}

export async function rejectGeofenceTrip(tripId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM coordinates WHERE trip_id = ?", [tripId]);
  await db.runAsync("DELETE FROM trips WHERE id = ?", [tripId]);
}

export async function getUnconfirmedTrips(): Promise<Array<{
  id: string;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  startedAt: string;
  endedAt: string | null;
}>> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT id, start_address as startAddress, end_address as endAddress,
            distance_miles as distanceMiles, started_at as startedAt, ended_at as endedAt
     FROM trips WHERE notes LIKE '__unconfirmed__%' ORDER BY started_at DESC`
  );
}

// ─── Midnight auto-shade logic ──────────────────────────────────────────

export async function shadeExpiredUnconfirmedTrips(): Promise<number> {
  const db = await getDatabase();
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  // If it's before 9pm, shade trips from before today's midnight
  // If it's after 9pm, don't shade today's trips (they get until tomorrow midnight)
  const cutoffHour = 21; // 9pm
  let cutoff: string;

  if (now.getHours() >= cutoffHour) {
    // After 9pm — cutoff is yesterday's midnight (trips before yesterday midnight get shaded)
    const yesterday = new Date(midnight);
    yesterday.setDate(yesterday.getDate() - 1);
    cutoff = yesterday.toISOString();
  } else {
    // Before 9pm — cutoff is today's midnight
    cutoff = midnight.toISOString();
  }

  const result = await db.runAsync(
    `UPDATE trips SET notes = REPLACE(notes, '__unconfirmed__', '__shaded__')
     WHERE notes LIKE '__unconfirmed__%' AND started_at < ?`,
    [cutoff]
  );

  return result.changes;
}

export async function getShadedTrips(): Promise<Array<{
  id: string;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  startedAt: string;
  endedAt: string | null;
}>> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT id, start_address as startAddress, end_address as endAddress,
            distance_miles as distanceMiles, started_at as startedAt, ended_at as endedAt
     FROM trips WHERE notes LIKE '__shaded__%' ORDER BY started_at DESC`
  );
}
