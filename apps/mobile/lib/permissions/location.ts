import * as Location from "expo-location";
import { Alert, Linking } from "react-native";

export type LocationPermissionTier = "none" | "foreground" | "always";

export interface LocationPermissionStatus {
  foreground: Location.PermissionStatus;
  background: Location.PermissionStatus;
  tier: LocationPermissionTier;
}

/**
 * Snapshot of the user's current Location permission state across both
 * foreground and background tiers, plus a derived `tier` summary.
 */
export async function getLocationPermissionStatus(): Promise<LocationPermissionStatus> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();

  let tier: LocationPermissionTier = "none";
  if (fg.status === "granted" && bg.status === "granted") {
    tier = "always";
  } else if (fg.status === "granted") {
    tier = "foreground";
  }

  return { foreground: fg.status, background: bg.status, tier };
}

/**
 * Smart escalation: gets the user from wherever they are now to "Always
 * Allow" via the most appropriate path.
 *
 * iOS deliberately makes this a two-step process. The user must first grant
 * foreground ("While Using App") access, then iOS prompts separately for
 * background ("Always") access. If the app has never asked, Settings
 * doesn't even contain a Location row for the user to flip manually -
 * we have to trigger the in-app prompt to make the row appear.
 *
 *  - foreground undetermined:  fire FG prompt in-app
 *  - foreground granted, BG undetermined: fire BG prompt in-app
 *  - any tier denied OR prompts didn't actually escalate: explain and
 *    deep-link to Settings with the exact toggle path spelled out
 *
 * Returns the final status after every attempt.
 */
export async function requestOrFixBackgroundLocation(): Promise<LocationPermissionStatus> {
  let status = await getLocationPermissionStatus();

  // Path 1: never been asked - fire the in-app FG prompt. This also creates
  // the Location row in iOS Settings, which is otherwise hidden.
  if (status.foreground === "undetermined") {
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // ignore, will fall through to Settings
    }
    status = await getLocationPermissionStatus();
  }

  // Path 2: FG granted but BG never asked - fire BG prompt. iOS may or may
  // not actually present the dialog (depends on heuristics around prior use);
  // we re-check status after and fall through to Settings if it didn't take.
  if (status.foreground === "granted" && status.background === "undetermined") {
    try {
      await Location.requestBackgroundPermissionsAsync();
    } catch {
      // ignore, will fall through to Settings
    }
    status = await getLocationPermissionStatus();
  }

  // Path 3: still not "always" - explain the manual route and offer Settings.
  if (status.tier !== "always") {
    showSettingsExplainer(status);
  }

  return status;
}

function showSettingsExplainer(status: LocationPermissionStatus) {
  const fgGranted = status.foreground === "granted";

  const title = fgGranted
    ? "One more step for auto-detection"
    : "Tracking needs location access";

  const message = fgGranted
    ? 'iOS hides "Always Allow" one tap deeper than it should.\n\nIn Settings:\n  1. Tap Location\n  2. Tap Always\n  3. Make sure Precise Location is on'
    : 'MileClear needs location access to record your trips.\n\nIn Settings:\n  1. Tap Location\n  2. Tap "Always" (or "While Using App" first if Always is not offered)\n  3. Make sure Precise Location is on';

  Alert.alert(title, message, [
    { text: "Not now", style: "cancel" },
    { text: "Open Settings", onPress: () => Linking.openSettings() },
  ]);
}
