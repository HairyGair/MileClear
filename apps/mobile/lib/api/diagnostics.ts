// Diagnostic dump upload — fire-and-forget on app startup.
// Sends the current drive detection state + recent events to the server
// so admin can see each user's diagnostics without asking for screenshots.

import { Platform } from "react-native";
import Constants from "expo-constants";
import { apiRequest } from "./index";
import {
  getDriveDetectionDiagnostics,
  getRecentDetectionEvents,
} from "../tracking/detection";

const APP_VERSION = Constants.expoConfig?.version ?? "unknown";
const BUILD_NUMBER =
  Constants.expoConfig?.ios?.buildNumber ??
  (Constants as unknown as { nativeBuildVersion?: string }).nativeBuildVersion ??
  "?";

// Tracking state keys that contain raw GPS coordinates or sensitive
// device identifiers. Stripped before upload for GDPR compliance.
const STRIPPED_KEYS = new Set([
  "departure_anchor_lat",
  "departure_anchor_lng",
  "stop_anchor",
  "vehicle_bt_names",
  "quick_trip_start",
]);

/**
 * Upload the current diagnostics dump to the server. Called once per app
 * startup from _layout.tsx. Fire-and-forget — never throws, never blocks.
 */
export async function uploadDiagnosticDump(): Promise<void> {
  try {
    const [diagnostics, events] = await Promise.all([
      getDriveDetectionDiagnostics(),
      getRecentDetectionEvents(50),
    ]);

    // Strip GDPR-sensitive tracking state entries
    const safeTrackingState = diagnostics.trackingState.filter(
      (row) => !STRIPPED_KEYS.has(row.key)
    );

    // Compute a simple verdict string without importing the full
    // computeHealth UI logic. Just check the critical flags.
    let verdict = "healthy";
    if (!diagnostics.enabled) verdict = "error";
    else if (diagnostics.backgroundPermission !== "granted") verdict = "error";
    else if (diagnostics.enabled && diagnostics.backgroundPermission === "granted" && !diagnostics.taskRunning && !diagnostics.activeShiftId) verdict = "error";
    else if (diagnostics.autoRecordingActive) verdict = "warning";
    else if (diagnostics.quietHours || diagnostics.cooldownRemainingMs > 0) verdict = "info";

    await apiRequest("/user/diagnostics", {
      method: "POST",
      body: JSON.stringify({
        capturedAt: new Date().toISOString(),
        platform: Platform.OS,
        osVersion: String(Platform.Version),
        appVersion: APP_VERSION,
        buildNumber: BUILD_NUMBER,
        verdict,
        statusJson: {
          enabled: diagnostics.enabled,
          taskRunning: diagnostics.taskRunning,
          foregroundPermission: diagnostics.foregroundPermission,
          backgroundPermission: diagnostics.backgroundPermission,
          activeShiftId: diagnostics.activeShiftId,
          autoRecordingActive: diagnostics.autoRecordingActive,
          quietHours: diagnostics.quietHours,
          speedThresholdMph: diagnostics.speedThresholdMph,
          bufferedCoordinates: diagnostics.bufferedCoordinates,
          lastNotificationAt: diagnostics.lastNotificationAt,
          cooldownRemainingMs: diagnostics.cooldownRemainingMs,
          trackingState: safeTrackingState,
        },
        eventsJson: events,
      }),
    });
  } catch {
    // Fire-and-forget — diagnostics upload must never crash the app
  }
}
