// Starting, checking and restarting the GPS task a shift or Start Trip records
// with. The rules and the story are in lockGpsRule.ts: Android refuses to
// start the task once the app is off screen, and that refusal used to be
// swallowed, leaving a shift that recorded nothing.
//
// Never import lib/tracking/index.ts from here: it registers the background
// task at import time, and it imports this module.

import { AppState, Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { getDatabase } from "../db/index";
import { ARRIVED_PENDING_SHIFT_ID } from "./arrivedRecovery";
import {
  LOCK_GPS_WARNING_ID,
  gpsStartErrorText,
  lockGpsWarningCopy,
  lockKindOf,
  warningDue,
  type LockKind,
} from "./lockGpsRule";

export const LOCATION_TASK_NAME = "mileclear-background-location";
const QUICK_TRIP_SHIFT_ID = "__quick_trip__"; // mirrors lib/tracking/index.ts
const WARNED_AT_KEY = "lock_gps_warned_at";

function taskOptions(kind: LockKind): Location.LocationTaskOptions {
  return {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 50,
    deferredUpdatesInterval: 10000,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: kind === "shift" ? "MileClear is tracking your shift" : "MileClear is tracking your trip",
      notificationBody: "Tap to open the app",
      killServiceOnDestroy: false,
    },
  };
}

/** Telemetry and the phone log; never throws. */
async function report(type: string, data: Record<string, unknown>): Promise<void> {
  try {
    const { logDetectionEvent } = await import("./detection");
    await logDetectionEvent(type.replace(/^trip\./, ""), data);
  } catch {}
  try {
    const { queueAppEvent } = await import("./recordingDrops");
    await queueAppEvent(type, data);
  } catch {}
}

async function showWarning(kind: LockKind): Promise<void> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [WARNED_AT_KEY]
    );
    const now = Date.now();
    if (!warningDue(row ? Number(row.value) : null, now)) return;
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [WARNED_AT_KEY, String(now)]);
    const copy = lockGpsWarningCopy(kind);
    await Notifications.scheduleNotificationAsync({
      identifier: LOCK_GPS_WARNING_ID,
      content: {
        title: copy.title,
        body: copy.body,
        data: { type: "lock_gps_not_recording", action: "open_dashboard" },
        ...(Platform.OS === "android" && { channelId: "reminders" }),
      },
      trigger: null,
    });
  } catch {
    // no notification permission, or none possible: the foreground retry still runs
  }
}

async function clearWarning(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(LOCK_GPS_WARNING_ID);
  } catch {}
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [WARNED_AT_KEY]);
  } catch {}
}

/**
 * Start the task for a shift or Start Trip. Returns whether it is running.
 * A refusal is logged (`trip.lock_gps_start_failed`) and the driver is told
 * by notification; the next time the app is on screen ensureLockGps() tries
 * again. Never throws.
 */
export async function startLockGps(kind: LockKind, reason: string): Promise<boolean> {
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, taskOptions(kind));
    await clearWarning();
    return true;
  } catch (err) {
    await report("trip.lock_gps_start_failed", {
      kind,
      reason,
      error: gpsStartErrorText(err),
      appState: AppState.currentState,
      platform: Platform.OS,
    });
    await showWarning(kind);
    return false;
  }
}

/**
 * The lock is held but its task is not running: start it. Run when the app
 * comes on screen, which is when Android allows it. Never throws.
 */
export async function ensureLockGps(reason: string): Promise<void> {
  try {
    const db = await getDatabase();
    const lock = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    const kind = lockKindOf(lock?.value, QUICK_TRIP_SHIFT_ID, ARRIVED_PENDING_SHIFT_ID);
    if (!kind) {
      await clearWarning();
      return;
    }
    if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) {
      await clearWarning();
      return;
    }
    const started = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_started_at'"
    );
    const lockMs = started ? Number(started.value) : NaN;
    if (await startLockGps(kind, reason)) {
      await report("trip.lock_gps_restarted", {
        kind,
        reason,
        minutesSinceLock: Number.isFinite(lockMs) ? Math.round((Date.now() - lockMs) / 60000) : null,
        platform: Platform.OS,
      });
    }
  } catch {
    // best effort: the next foreground tries again
  }
}
