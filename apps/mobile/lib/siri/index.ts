/**
 * Siri Shortcuts bridge
 *
 * Wraps the native SiriModule with graceful fallbacks.
 * All functions are no-ops on Android and in Expo Go (where the native
 * module is not compiled in).
 *
 * The only responsibility of this module is keeping the App Group
 * UserDefaults token in sync with the active session so that App Intents
 * (TodaysMilesIntent, WeeklyGoalIntent, etc.) can authenticate with the
 * MileClear API when the app is not open.
 */

import { NativeModules, Platform } from "react-native";

const { SiriModule } = NativeModules;

/**
 * Returns true if the Siri native module is available on this device.
 * Will be false on Android and in Expo Go (development builds required).
 */
export function isSiriAvailable(): boolean {
  return Platform.OS === "ios" && !!SiriModule;
}

/**
 * Write the access token to App Group UserDefaults so that Siri App Intents
 * can call the MileClear API without the app being in the foreground.
 *
 * Call this whenever a new access token is issued (login, register, OAuth,
 * token refresh).
 */
export async function syncTokenToSiri(accessToken: string): Promise<void> {
  if (!isSiriAvailable()) return;
  try {
    await SiriModule.setAccessToken(accessToken);
  } catch {
    // Silent - failing to sync the token is non-fatal; Siri intents will
    // simply return "Open MileClear to log in first" until the next sync.
  }
}

/**
 * Remove the access token from App Group UserDefaults.
 * Call this on logout so Siri intents stop making authenticated API calls.
 */
export async function clearSiriToken(): Promise<void> {
  if (!isSiriAvailable()) return;
  try {
    await SiriModule.clearAccessToken();
  } catch {
    // Silent
  }
}
