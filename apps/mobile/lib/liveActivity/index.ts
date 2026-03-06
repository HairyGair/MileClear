/**
 * Live Activity (Dynamic Island) bridge
 *
 * Wraps the native LiveActivityModule with graceful fallbacks.
 * Returns null/void silently when not supported (Expo Go, Android, iOS < 16.2).
 */

import { NativeModules, Platform } from "react-native";

const LiveActivityModule = NativeModules.LiveActivityModule;

let currentActivityId: string | null = null;

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
    return id;
  } catch {
    return null;
  }
}

/**
 * Update the current Live Activity with new state.
 */
export async function updateLiveActivity(params: {
  elapsedSeconds: number;
  distanceMiles: number;
  speedMph: number;
  tripCount?: number;
}): Promise<void> {
  if (Platform.OS !== "ios" || !LiveActivityModule || !currentActivityId) return;
  try {
    await LiveActivityModule.updateActivity({
      activityId: currentActivityId,
      elapsedSeconds: params.elapsedSeconds,
      distanceMiles: params.distanceMiles,
      speedMph: params.speedMph,
      tripCount: params.tripCount ?? 0,
    });
  } catch {}
}

/**
 * End the current Live Activity.
 */
export async function endLiveActivity(): Promise<void> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return;
  try {
    await LiveActivityModule.endActivity();
    currentActivityId = null;
  } catch {}
}
