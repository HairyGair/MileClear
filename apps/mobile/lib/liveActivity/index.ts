/**
 * Live Activity (Dynamic Island) bridge
 *
 * Wraps the native LiveActivityModule with graceful fallbacks.
 * Returns null/void silently when not supported (Expo Go, Android, iOS < 16.2).
 */

import { NativeModules, Platform } from "react-native";

const LiveActivityModule = NativeModules.LiveActivityModule;

let currentActivityId: string | null = null;
let activityStartDateMs: number | null = null;

/**
 * Check if Live Activities are supported and enabled on this device.
 */
export async function isLiveActivitySupported(): Promise<boolean> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return false;
  try {
    return await LiveActivityModule.isSupported();
  } catch {
    return false;
  }
}

/**
 * Start a Live Activity (Dynamic Island + lock screen widget).
 * Returns the activity ID, or null if unsupported/failed.
 */
export async function startLiveActivity(params: {
  activityType: "trip" | "shift";
  vehicleName?: string;
  isBusinessMode: boolean;
}): Promise<string | null> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return null;
  try {
    const id = await LiveActivityModule.startActivity({
      activityType: params.activityType,
      vehicleName: params.vehicleName ?? "",
      isBusinessMode: params.isBusinessMode,
    });
    currentActivityId = id;
    activityStartDateMs = Date.now();
    return id;
  } catch {
    return null;
  }
}

/**
 * Update the current Live Activity with new state.
 */
export async function updateLiveActivity(params: {
  distanceMiles: number;
  speedMph: number;
  tripCount?: number;
}): Promise<void> {
  if (Platform.OS !== "ios" || !LiveActivityModule || !currentActivityId) return;
  try {
    await LiveActivityModule.updateActivity({
      activityId: currentActivityId,
      distanceMiles: params.distanceMiles,
      speedMph: params.speedMph,
      tripCount: params.tripCount ?? 0,
      startDateMs: activityStartDateMs ?? Date.now(),
    });
  } catch {}
}

/**
 * End the current Live Activity immediately.
 */
export async function endLiveActivity(): Promise<void> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return;
  try {
    await LiveActivityModule.endActivity();
    currentActivityId = null;
    activityStartDateMs = null;
  } catch {}
}

/**
 * End the current Live Activity with a final summary that stays on the lock screen briefly.
 */
export async function endLiveActivityWithSummary(params: {
  distanceMiles: number;
  tripCount?: number;
}): Promise<void> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return;
  try {
    await LiveActivityModule.endActivityWithSummary({
      distanceMiles: params.distanceMiles,
      tripCount: params.tripCount ?? 0,
      startDateMs: activityStartDateMs ?? Date.now(),
    });
    currentActivityId = null;
    activityStartDateMs = null;
  } catch {}
}

/**
 * Get the ID of any currently running Live Activity.
 * Used for recovery after app kill - if a Live Activity is still alive
 * but our JS state was lost, we can resume updating it.
 */
export async function getActiveActivityId(): Promise<string | null> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return null;
  try {
    return await LiveActivityModule.getActiveActivityId();
  } catch {
    return null;
  }
}

/**
 * Recover a Live Activity after app restart.
 * If a Live Activity is still running but our in-memory state was lost,
 * this restores the currentActivityId so updates can resume.
 */
export async function recoverLiveActivity(startDateMs?: number): Promise<boolean> {
  const id = await getActiveActivityId();
  if (id) {
    currentActivityId = id;
    activityStartDateMs = startDateMs ?? Date.now();
    return true;
  }
  return false;
}

/** Restart the Live Activity to work around the 8-hour expiry. */
export async function restartLiveActivity(params: {
  activityType: "trip" | "shift";
  vehicleName?: string;
  isBusinessMode: boolean;
  originalStartDateMs: number;
}): Promise<string | null> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return null;
  try {
    // End existing
    await LiveActivityModule.endActivity();
    // Start fresh
    const id = await LiveActivityModule.startActivity({
      activityType: params.activityType,
      vehicleName: params.vehicleName ?? "",
      isBusinessMode: params.isBusinessMode,
    });
    currentActivityId = id;
    // Keep original start date so the timer shows total elapsed time
    activityStartDateMs = params.originalStartDateMs;
    // Immediately send an update with the correct startDate so the timer
    // doesn't reset to 00:00
    if (id) {
      await LiveActivityModule.updateActivity({
        activityId: id,
        distanceMiles: 0,
        speedMph: 0,
        tripCount: 0,
        startDateMs: params.originalStartDateMs,
      });
    }
    return id;
  } catch {
    return null;
  }
}
