import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getDatabase } from "../db/index";
import { sendDrivingDetectedNotification } from "../notifications/index";
import { DRIVING_SPEED_THRESHOLD_MPH } from "@mileclear/shared";

const DETECTION_TASK_NAME = "mileclear-drive-detection";
const COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes
const BUFFER_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const SPEED_THRESHOLD_MS = DRIVING_SPEED_THRESHOLD_MPH * 0.44704; // mph to m/s

export interface BufferedCoordinate {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recorded_at: string;
}

// TaskManager task must be defined at module top level — wrap in try-catch
// so a native module failure doesn't crash the entire JS bundle on startup
try {
  TaskManager.defineTask(DETECTION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error("Drive detection error:", error);
      return;
    }
    if (!data) return;

    const { locations } = data as { locations: Location.LocationObject[] };

    try {
      const db = await getDatabase();

      // Guard: don't buffer if a shift is active
      const activeShift = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
      );
      if (activeShift) return;

      // Purge stale detection coordinates (older than 30 min)
      const cutoff = new Date(Date.now() - BUFFER_MAX_AGE_MS).toISOString();
      await db.runAsync(
        "DELETE FROM detection_coordinates WHERE recorded_at < ?",
        [cutoff]
      );

      // Check if any location exceeds driving speed
      const isDriving = locations.some(
        (loc) => loc.coords.speed != null && loc.coords.speed >= SPEED_THRESHOLD_MS
      );
      if (!isDriving) return;

      // Buffer driving coordinates
      for (const loc of locations) {
        if (loc.coords.speed != null && loc.coords.speed >= SPEED_THRESHOLD_MS) {
          await db.runAsync(
            `INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              loc.coords.latitude,
              loc.coords.longitude,
              loc.coords.speed,
              loc.coords.accuracy,
              new Date(loc.timestamp).toISOString(),
            ]
          );
        }
      }

      // Cooldown: don't spam notifications
      const lastNotif = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'last_detection_notification'"
      );
      if (lastNotif) {
        const elapsed = Date.now() - parseInt(lastNotif.value, 10);
        if (elapsed < COOLDOWN_MS) return;
      }

      // Send notification and record timestamp
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

  // Guard: check permissions
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== "granted") return;

  // Guard: don't start if already running
  const isRunning = await TaskManager.isTaskRegisteredAsync(DETECTION_TASK_NAME);
  if (isRunning) return;

  await Location.startLocationUpdatesAsync(DETECTION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 200,
    deferredUpdatesInterval: 30000,
    activityType: Location.ActivityType.AutomotiveNavigation,
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
  // Default: enabled
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

export async function getAndClearBufferedCoordinates(): Promise<BufferedCoordinate[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BufferedCoordinate>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM detection_coordinates ORDER BY recorded_at ASC"
  );
  await db.runAsync("DELETE FROM detection_coordinates");
  return rows;
}
