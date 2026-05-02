import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as FileSystem from "expo-file-system";
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
 *
 * 1.1.3 expanded payload:
 *  - sync queue breakdown by status (pending / failed / permanently_failed)
 *  - seconds since last successful trip POST
 *  - days since last trip recorded
 *  - free disk bytes
 *  - iOS BackgroundFetch status (Background App Refresh)
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

    const [
      fg,
      bg,
      notif,
      taskActive,
      pendingSyncCount,
      syncQueueBreakdown,
      tripFreshness,
      freeDiskBytes,
      backgroundFetchStatus,
    ] = await Promise.all([
      Location.getForegroundPermissionsAsync().catch(() => null),
      Location.getBackgroundPermissionsAsync().catch(() => null),
      Notifications.getPermissionsAsync().catch(() => null),
      TaskManager.isTaskRegisteredAsync(DETECTION_TASK_NAME).catch(() => false),
      getPendingCount().catch(() => 0),
      collectSyncQueueBreakdown(db).catch(() => ({ failed: 0, permFailed: 0 })),
      collectTripFreshness(db).catch(() => ({ secondsSinceLastTripPost: undefined, daysSinceLastTrip: undefined })),
      collectFreeDiskBytes().catch(() => undefined),
      collectBackgroundFetchStatus().catch(() => undefined),
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
      syncQueueFailed: syncQueueBreakdown.failed,
      syncQueuePermFailed: syncQueueBreakdown.permFailed,
      secondsSinceLastTripPost: tripFreshness.secondsSinceLastTripPost,
      daysSinceLastTrip: tripFreshness.daysSinceLastTrip,
      freeDiskBytes,
      backgroundFetchStatus,
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

// ── Field collectors ─────────────────────────────────────────────────────

/** Count of sync_queue rows by terminal status, for the heartbeat payload. */
async function collectSyncQueueBreakdown(
  db: Awaited<ReturnType<typeof getDatabase>>
): Promise<{ failed: number; permFailed: number }> {
  const failed = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'"
  );
  const permFailed = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'permanently_failed'"
  );
  return {
    failed: failed?.count ?? 0,
    permFailed: permFailed?.count ?? 0,
  };
}

/**
 * Two trip-freshness signals:
 *  - secondsSinceLastTripPost: how long since a trip last reached the server
 *    (synced_at NOT NULL). Identifies silent sync failures even when the
 *    queue counters look healthy.
 *  - daysSinceLastTrip: how long since any trip was recorded locally.
 *    Distinguishes active drivers from passive installs for outreach.
 */
async function collectTripFreshness(
  db: Awaited<ReturnType<typeof getDatabase>>
): Promise<{ secondsSinceLastTripPost?: number; daysSinceLastTrip?: number }> {
  const lastSynced = await db.getFirstAsync<{ synced_at: string | null }>(
    "SELECT synced_at FROM trips WHERE synced_at IS NOT NULL ORDER BY synced_at DESC LIMIT 1"
  );
  const lastAny = await db.getFirstAsync<{ started_at: string }>(
    "SELECT started_at FROM trips ORDER BY started_at DESC LIMIT 1"
  );

  const result: { secondsSinceLastTripPost?: number; daysSinceLastTrip?: number } = {};

  if (lastSynced?.synced_at) {
    const ageMs = Date.now() - new Date(lastSynced.synced_at).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0) {
      result.secondsSinceLastTripPost = Math.round(ageMs / 1000);
    }
  }

  if (lastAny?.started_at) {
    const ageMs = Date.now() - new Date(lastAny.started_at).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0) {
      result.daysSinceLastTrip = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    }
  }

  return result;
}

/** Best-effort free disk bytes. Returns undefined on any failure. */
async function collectFreeDiskBytes(): Promise<number | undefined> {
  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    if (typeof free === "number" && Number.isFinite(free) && free >= 0) {
      return Math.round(free);
    }
  } catch {
    // FileSystem can throw on iOS Simulator and some Android variants.
  }
  return undefined;
}

/**
 * iOS Background App Refresh status. If the user has it disabled in Settings,
 * iOS won't wake the app for the BACKGROUND_FINALIZE_TASK and tracking
 * reliability tanks. Surface this in the heartbeat so admin can target a
 * "your tracking won't work, here's how to enable Background App Refresh"
 * push to affected users.
 */
async function collectBackgroundFetchStatus(): Promise<
  HeartbeatData["backgroundFetchStatus"]
> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Available) return "available";
    if (status === BackgroundFetch.BackgroundFetchStatus.Denied) return "denied";
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted) return "restricted";
  } catch {
    // Module unavailable on simulator.
  }
  return undefined;
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
