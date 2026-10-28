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

// Set while a shift or Start Trip is starting. Its housekeeping can meet an
// old lock's self-heal, which stops the shared task; while this is set the
// stops below leave the new start's task alone.
let lockStarting = 0;

/** Wrap a shift or Start Trip start: self-heal stops are held off until it ends. */
export async function withLockStarting<T>(run: () => Promise<T>): Promise<T> {
  lockStarting++;
  try {
    return await run();
  } finally {
    lockStarting--;
  }
}

export function isLockStarting(): boolean {
  return lockStarting > 0;
}
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
    const error = gpsStartErrorText(err);
    await report("trip.lock_gps_start_failed", {
      kind,
      reason,
      error,
      appState: AppState.currentState,
      platform: Platform.OS,
    });
    // Only the off-screen refusal is fixed by opening the app; for anything
    // else (Expo Go, a missing permission) the warning would be a false promise.
    if (error === "not_on_screen") await showWarning(kind);
    return false;
  }
}

/**
 * After the lock is written: start the task if the housekeeping in between
 * stopped it (a stranded Start Trip's self-heal stops the shared task) or
 * the first start was refused. Never throws.
 */
export async function startLockGpsIfStopped(kind: LockKind, reason: string): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) return;
    await startLockGps(kind, reason);
  } catch {}
}

/** Stop the task when no lock owns it; it would only drain the battery. Never throws. */
export async function stopLockGpsWithoutLock(reason: string): Promise<void> {
  try {
    if (isLockStarting()) return;
    if ((await readLock()) != null) return; // a new lock owns it now
    if (!(await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME))) return;
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    await report("trip.lock_gps_stopped_no_lock", { reason, platform: Platform.OS });
  } catch {}
}

async function readLock(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
  );
  return row?.value ?? null;
}

/**
 * The lock is held but its task is not running: start it. Run when the app
 * comes on screen, which is when Android allows it. Never throws.
 */
export async function ensureLockGps(reason: string): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) {
      await clearWarning();
      return;
    }
    // Let the lock's own checks run first: they end a shift that is over
    // (ended elsewhere, 18 hours old, no local row) and release a stranded
    // Start Trip, and GPS must not be restarted for either.
    const db = await getDatabase();
    try {
      const { shiftSuppressesAutoDetection } = await import("./detection");
      await shiftSuppressesAutoDetection(db);
    } catch {}
    const lock = await readLock();
    const kind = lockKindOf(lock, QUICK_TRIP_SHIFT_ID, ARRIVED_PENDING_SHIFT_ID);
    if (!kind) {
      await clearWarning();
      return;
    }
    if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) return;
    const started = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_started_at'"
    );
    const lockMs = started ? Number(started.value) : NaN;
    if (!(await startLockGps(kind, reason))) return;
    // Released while the start was out (a self-heal on the same foreground):
    // nothing would store its fixes, so stop it again.
    if ((await readLock()) == null) {
      await stopLockGpsWithoutLock(`${reason}_lock_released`);
      return;
    }
    await report("trip.lock_gps_restarted", {
      kind,
      reason,
      minutesSinceLock: Number.isFinite(lockMs) ? Math.round((Date.now() - lockMs) / 60000) : null,
      platform: Platform.OS,
    });
  } catch {
    // best effort: the next foreground tries again
  }
}
