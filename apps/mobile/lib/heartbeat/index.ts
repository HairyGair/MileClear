import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { getDatabase } from "../db/index";
import { sendHeartbeat, type HeartbeatData } from "../api/user";
import { getPendingCount } from "../sync/queue";

const DETECTION_TASK_NAME = "drive-detection";
const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Collect current permission/tracking state and POST /user/heartbeat.
 *
 * Rate-limited to once per 24 hours via the `last_heartbeat_at` key in the
 * tracking_state SQLite table. Fire-and-forget - never throws.
 *
 * Called from _layout.tsx on app launch. The 24h rate-limit means it's
 * cheap to invoke on every session without hammering the API.
 */
export async function maybeSendHeartbeat(): Promise<void> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'last_heartbeat_at'"
    );
    if (row) {
      const last = parseInt(row.value, 10);
      if (!Number.isNaN(last) && Date.now() - last < HEARTBEAT_INTERVAL_MS) {
        return; // within 24h cooldown
      }
    }

    const [fg, bg, notif, taskActive, pendingSyncCount] = await Promise.all([
      Location.getForegroundPermissionsAsync().catch(() => null),
      Location.getBackgroundPermissionsAsync().catch(() => null),
      Notifications.getPermissionsAsync().catch(() => null),
      TaskManager.isTaskRegisteredAsync(DETECTION_TASK_NAME).catch(() => false),
      getPendingCount().catch(() => 0),
    ]);

    // Unused foreground permission kept in scope to avoid dead-code warnings
    // in case we add a fg-permission field later.
    void fg;

    const data: HeartbeatData = {
      bgLocationPermission: mapLocationStatus(bg?.status),
      notificationPermission: mapNotificationStatus(notif?.status),
      trackingTaskActive: taskActive,
      appVersion: Constants.expoConfig?.version ?? undefined,
      buildNumber:
        Platform.OS === "ios"
          ? (Constants.expoConfig?.ios?.buildNumber ?? undefined)
          : String(Constants.expoConfig?.android?.versionCode ?? ""),
      osVersion: `${Platform.OS} ${Platform.Version}`,
      pendingSyncCount,
    };

    await sendHeartbeat(data);

    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('last_heartbeat_at', ?)",
      [String(Date.now())]
    );
  } catch {
    // Never throw - telemetry is non-critical.
  }
}

function mapLocationStatus(
  status: Location.PermissionStatus | undefined
): HeartbeatData["bgLocationPermission"] {
  if (!status) return undefined;
  if (status === Location.PermissionStatus.GRANTED) return "granted";
  if (status === Location.PermissionStatus.DENIED) return "denied";
  return "undetermined";
}

function mapNotificationStatus(
  status: Notifications.PermissionStatus | undefined
): HeartbeatData["notificationPermission"] {
  if (!status) return undefined;
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}
