import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { getDatabase } from "../db/index";
import { sendDrivingDetectedNotification } from "../notifications/index";
import { DRIVING_SPEED_THRESHOLD_MPH } from "@mileclear/shared";

const DETECTION_TASK_NAME = "mileclear-drive-detection";
const COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes
const BUFFER_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const SPEED_THRESHOLD_MS = DRIVING_SPEED_THRESHOLD_MPH * 0.44704; // mph to m/s
const STOP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — trip ends after this idle period
const CONTINUE_SPEED_MS = 1.0; // ~2.2 mph — any movement keeps an active recording alive
const MIN_AUTO_TRIP_DISTANCE_MILES = 0.15; // Filter noise / parking lot shuffles
const BG_PERMISSION_NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
let lastBgPermissionNudge = 0;

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
 */
function detectDrivingSpeed(locations: Location.LocationObject[]): boolean {
  const hasReportedSpeed = locations.some(
    (loc) => loc.coords.speed != null && loc.coords.speed >= SPEED_THRESHOLD_MS
  );
  if (hasReportedSpeed) return true;

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
        if (distM / dtSec >= SPEED_THRESHOLD_MS) return true;
      }
    }
  }

  if (locations.length === 1) {
    return false; // Handled separately in the task via stored state
  }

  return false;
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

// ── Auto-trip finalization ────────────────────────────────────────────────

/**
 * Process buffered detection coordinates into a saved trip.
 * Called when driving stops (no driving-speed location for 3+ min) or on app startup.
 */
async function finalizeAutoTrip(): Promise<void> {
  const db = await getDatabase();

  // Read all buffered coordinates
  const coords = await db.getAllAsync<BufferedCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM detection_coordinates ORDER BY recorded_at ASC"
  );

  // Clear state regardless of outcome
  await db.runAsync("DELETE FROM detection_coordinates");
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key IN ('auto_recording_active', 'last_driving_speed_at')"
  );

  if (coords.length < 2) return;

  // Calculate total distance
  let totalDistance = 0;
  for (let i = 1; i < coords.length; i++) {
    totalDistance += haversineMiles(
      coords[i - 1].lat, coords[i - 1].lng,
      coords[i].lat, coords[i].lng
    );
  }

  if (totalDistance < MIN_AUTO_TRIP_DISTANCE_MILES) return;

  const first = coords[0];
  const last = coords[coords.length - 1];

  // Reverse geocode start and end points
  let startAddress: string | null = null;
  let endAddress: string | null = null;
  try {
    const { reverseGeocode } = await import("../location/geocoding");
    [startAddress, endAddress] = await Promise.all([
      reverseGeocode(first.lat, first.lng),
      reverseGeocode(last.lat, last.lng),
    ]);
  } catch {
    // Geocoding is best-effort
  }

  // Save trip as unclassified — lands in inbox
  try {
    const { syncCreateTrip } = await import("../sync/actions");
    await syncCreateTrip({
      startLat: first.lat,
      startLng: first.lng,
      endLat: last.lat,
      endLng: last.lng,
      startAddress: startAddress ?? undefined,
      endAddress: endAddress ?? undefined,
      distanceMiles: Math.round(totalDistance * 100) / 100,
      startedAt: first.recorded_at,
      endedAt: last.recorded_at,
      classification: "unclassified",
      coordinates: coords.map((c) => ({
        lat: c.lat,
        lng: c.lng,
        speed: c.speed,
        accuracy: c.accuracy,
        recordedAt: c.recorded_at,
      })),
    });

    // Notify user
    const from = startAddress || "Unknown";
    const to = endAddress || "Unknown";
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Trip recorded",
        body: `${from} → ${to} (${totalDistance.toFixed(1)} mi)`,
        data: { action: "open_trips" },
      },
      trigger: null,
    }).catch(() => {});
  } catch (err) {
    console.error("Auto-trip save failed:", err);
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
    // Stale flag with no timestamp — clear it
    await db.runAsync("DELETE FROM tracking_state WHERE key = 'auto_recording_active'");
    return;
  }

  const elapsed = Date.now() - parseInt(lastDriving.value, 10);
  if (elapsed > STOP_TIMEOUT_MS) {
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
    "DELETE FROM tracking_state WHERE key IN ('auto_recording_active', 'last_driving_speed_at')"
  );
  if (clearCoords) {
    await db.runAsync("DELETE FROM detection_coordinates");
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

      // Check for stale auto-recording — finalize if driving stopped
      await checkStaleAutoRecording();

      // Check if recording is still active (may have just been finalized)
      const recording = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
      );
      const isRecording = recording?.value === "1";

      if (isRecording) {
        // ── Active recording: buffer ALL coords regardless of speed ──
        // This prevents trips from being cut short during slow traffic,
        // turns, traffic lights, or brief stops.
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

        // Any movement (>~2mph) keeps the trip alive — not just driving speed (>15mph)
        if (detectMovement(locations) || detectDrivingSpeed(locations)) {
          await db.runAsync(
            "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_driving_speed_at', ?)",
            [Date.now().toString()]
          );
        }
        return;
      }

      // ── Not recording: check if driving should START a new recording ──

      // Purge stale detection coordinates
      const cutoff = new Date(Date.now() - BUFFER_MAX_AGE_MS).toISOString();
      await db.runAsync(
        "DELETE FROM detection_coordinates WHERE recorded_at < ?",
        [cutoff]
      );

      // Check if locations indicate driving speed (>15mph to start)
      let isDriving = detectDrivingSpeed(locations);

      // Single-location batch: compare against the most recent buffered coordinate
      if (!isDriving && locations.length === 1) {
        const loc = locations[0];
        const lastCoord = await db.getFirstAsync<{ lat: number; lng: number; recorded_at: string }>(
          "SELECT lat, lng, recorded_at FROM detection_coordinates ORDER BY recorded_at DESC LIMIT 1"
        );
        if (lastCoord) {
          const dtSec = (loc.timestamp - new Date(lastCoord.recorded_at).getTime()) / 1000;
          if (dtSec > 0 && dtSec < 120) {
            const distM = haversineMeters(
              lastCoord.lat, lastCoord.lng,
              loc.coords.latitude, loc.coords.longitude
            );
            isDriving = distM / dtSec >= SPEED_THRESHOLD_MS;
          }
        }
      }

      if (!isDriving) return;

      // Buffer driving coordinates
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

      // Mark auto-recording as active + update last driving timestamp
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('auto_recording_active', '1')"
      );
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_driving_speed_at', ?)",
        [Date.now().toString()]
      );

      // Cooldown: don't spam detection notifications
      const lastNotif = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'last_detection_notification'"
      );
      if (lastNotif) {
        const elapsed = Date.now() - parseInt(lastNotif.value, 10);
        if (elapsed < COOLDOWN_MS) return;
      }

      // Send "Looks like you're driving" notification (user can optionally start a shift)
      await sendDrivingDetectedNotification();
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_detection_notification', ?)",
        [Date.now().toString()]
      );
    } catch (err) {
      console.error("Drive detection task error:", err);
    }
  });
} catch (err) {
  console.warn("TaskManager.defineTask failed — drive detection disabled:", err);
}

// ── Public API ───────────────────────────────────────────────────────────

export async function startDriveDetection(): Promise<void> {
  // Guard: don't start if disabled by user
  const enabled = await isDriveDetectionEnabled();
  if (!enabled) return;

  // Guard: don't start if a shift is active
  const db = await getDatabase();
  const activeShift = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
  );
  if (activeShift) return;

  // Guard: check permissions — notify user if background location is missing
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== "granted") {
    const now = Date.now();
    if (now - lastBgPermissionNudge > BG_PERMISSION_NUDGE_COOLDOWN_MS) {
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

  // Guard: don't start if already running
  const isRunning = await TaskManager.isTaskRegisteredAsync(DETECTION_TASK_NAME);
  if (isRunning) return;

  await Location.startLocationUpdatesAsync(DETECTION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 100,
    deferredUpdatesInterval: 15000,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: "MileClear",
      notificationBody: "Monitoring for driving activity",
    },
  });
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
 * Called when user taps "Track Trip" from a detection notification.
 * The detection task keeps running with the same logic — just better GPS.
 */
export async function upgradeDetectionAccuracy(): Promise<void> {
  const isRunning = await TaskManager.isTaskRegisteredAsync(DETECTION_TASK_NAME);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(DETECTION_TASK_NAME);
  }

  await Location.startLocationUpdatesAsync(DETECTION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 50,
    deferredUpdatesInterval: 10000,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "MileClear is tracking your trip",
      notificationBody: "Tap to open the app",
    },
  });
}

export async function getAndClearBufferedCoordinates(): Promise<BufferedCoordinate[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BufferedCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM detection_coordinates ORDER BY recorded_at ASC"
  );
  await db.runAsync("DELETE FROM detection_coordinates");
  // Also clear auto-recording state since coords are being consumed
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key IN ('auto_recording_active', 'last_driving_speed_at')"
  );
  return rows;
}
