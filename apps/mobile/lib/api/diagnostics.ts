// Diagnostic dump upload — fire-and-forget on app startup.
// Sends the current drive detection state + recent events to the server
// so admin can see each user's diagnostics without asking for screenshots.

import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { apiRequest } from "./index";
import {
  getDriveDetectionDiagnostics,
  getRecentDetectionEvents,
} from "../tracking/detection";
import { getDatabase } from "../db";
import { getAppStateInfo } from "../appState";
import { getRoutingStats } from "../tracking/routingStats";

const APP_VERSION = Constants.expoConfig?.version ?? "unknown";
const BUILD_NUMBER =
  Constants.expoConfig?.ios?.buildNumber ??
  (Constants as unknown as { nativeBuildVersion?: string }).nativeBuildVersion ??
  "?";

/**
 * The OTA-vs-native version trap. `APP_VERSION` / `BUILD_NUMBER` above come
 * from `Constants.expoConfig` — i.e. the app.json baked into the JS bundle,
 * which an OTA update REPLACES. So a device on the native 1.3.0 (build 74)
 * binary that pulled an OTA whose app.json said 1.3.1/75 will report
 * "1.3.1 / 75" here, even though no 1.3.1 binary exists (this caused real
 * confusion 9 Jun 2026: "why are users on 1.3.1 when I haven't built it?").
 *
 * `Updates.runtimeVersion` is embedded in the NATIVE binary and an OTA can
 * only launch if its runtime matches — so it's the true native-build identity
 * regardless of which OTA is layered on top. We capture it (plus which update
 * is actually running) so admin can reconcile the OTA label against the real
 * binary. expo-updates is disabled in Expo Go / dev, so guard everything.
 */
function getUpdatesInfo(): Record<string, unknown> {
  try {
    if (!Updates.isEnabled) return { isEnabled: false };
    return {
      isEnabled: true,
      // The real native binary identity (e.g. "1.3.0-build74").
      runtimeVersion: Updates.runtimeVersion ?? null,
      channel: Updates.channel ?? null,
      // null on an embedded launch (no OTA pulled yet).
      updateId: Updates.updateId ?? null,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch ?? null,
      createdAt: Updates.createdAt ? Updates.createdAt.toISOString() : null,
    };
  } catch {
    return { isEnabled: false };
  }
}

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
 * Pull the last N trip rows from local SQLite — gives the diagnostic
 * reader a quick view of "what's the device storing as recent trips?"
 * without round-tripping to the server. Used to spot client/server
 * divergence (a class of bug we've hit twice now: client thinks one
 * merged trip exists, server has two split rows).
 */
async function getRecentLocalTrips(limit = 10) {
  try {
    const db = await getDatabase();
    return await db.getAllAsync<{
      id: string;
      start_address: string | null;
      end_address: string | null;
      distance_miles: number;
      started_at: string;
      ended_at: string | null;
      classification: string | null;
      is_manual_entry: number;
      synced_at: string | null;
    }>(
      "SELECT id, start_address, end_address, distance_miles, started_at, ended_at, classification, is_manual_entry, synced_at FROM trips ORDER BY started_at DESC LIMIT ?",
      [limit]
    );
  } catch {
    return [];
  }
}

/**
 * Pull all saved locations from local SQLite so the diagnostic dump
 * can resolve UUIDs in event payloads to human-readable names. Without
 * this, every `geofence_tentative_arrival {locationId: "abc-123-..."}`
 * event required a server query to make sense of.
 */
async function getSavedLocations() {
  try {
    const db = await getDatabase();
    return await db.getAllAsync<{
      id: string;
      name: string;
      location_type: string;
      latitude: number;
      longitude: number;
      radius_meters: number;
      geofence_enabled: number;
    }>(
      "SELECT id, name, location_type, latitude, longitude, radius_meters, geofence_enabled FROM saved_locations ORDER BY name ASC"
    );
  } catch {
    return [];
  }
}

/**
 * Build a one-line summary of the last 24h of detection activity:
 * how many trips saved, dropped as phantom, deduped, finalize_too_short'd,
 * registration-grace rejected. Lets the diagnostic reader see at a glance
 * what shape of activity the user has been having before scrolling 50
 * raw events.
 */
async function getActivitySummary() {
  try {
    const db = await getDatabase();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rows = await db.getAllAsync<{ event: string; count: number }>(
      "SELECT event, COUNT(*) as count FROM detection_events WHERE recorded_at >= ? GROUP BY event ORDER BY count DESC",
      [cutoff]
    );
    const summary: Record<string, number> = {};
    for (const row of rows) summary[row.event] = row.count;
    return summary;
  } catch {
    return {};
  }
}

/**
 * Upload the current diagnostics dump to the server. Called once per app
 * startup from _layout.tsx. Fire-and-forget — never throws, never blocks.
 */
export async function uploadDiagnosticDump(): Promise<void> {
  try {
    const [
      diagnostics,
      events,
      recentTrips,
      savedLocations,
      activitySummary,
      routingStats,
    ] = await Promise.all([
      getDriveDetectionDiagnostics(),
      getRecentDetectionEvents(50),
      getRecentLocalTrips(10),
      getSavedLocations(),
      getActivitySummary(),
      getRoutingStats(24),
    ]);

    const appState = getAppStateInfo();

    // Strip GDPR-sensitive tracking state entries
    const safeTrackingState = diagnostics.trackingState.filter(
      (row) => !STRIPPED_KEYS.has(row.key)
    );

    // Verdict. The previous logic flagged "error" whenever taskRunning was
    // false — but under the backstop model taskRunning:false is the NORMAL
    // parked/backgrounded state (the subscription restarts on foreground and
    // catches drives via the missed-exit path), and geofencingActive is
    // unreliable dump telemetry. So a perfectly healthy device that had just
    // auto-captured trips reported "error" (Anthony 1 June: verdict "error"
    // with TWO auto-trips the same day). The honest signal is whether
    // auto-capture is actually happening — recent auto-trips => healthy. The
    // only hard errors are the two things a user can act on: detection turned
    // off, or background-location permission missing. A long dry spell with
    // both of those fine is a soft "warning" (could be the capture bug, could
    // just be no driving), never a hard error.
    const lastAutoTrip = recentTrips.find((t) => !t.is_manual_entry);
    const daysSinceAutoTrip = lastAutoTrip
      ? (Date.now() - new Date(lastAutoTrip.started_at).getTime()) / 86_400_000
      : Infinity;
    // Native-engine devices stamp a fresh lastNativeLocationAt for as long as
    // the engine is alive and delivering fixes — so "engine alive but no
    // auto-trip" is the silent-non-capture signature (philfixit, 22 Jun:
    // verdict "healthy", engine stamping fixes daily, zero trips for 5 days).
    // Flag those at 4 days instead of waiting for the generic 10-day dry-spell
    // warning, so the verdict stops reading "healthy" while capture is silently
    // broken. Permissions are already known-good past the guards above.
    const NATIVE_FIX_FRESH_MS = 2 * 86_400_000;
    const nativeEngineAlive =
      diagnostics.nativeEngineEnabled &&
      diagnostics.lastNativeLocationAt != null &&
      Date.now() - new Date(diagnostics.lastNativeLocationAt).getTime() < NATIVE_FIX_FRESH_MS;
    let verdict = "healthy";
    if (!diagnostics.enabled) verdict = "error";
    else if (diagnostics.backgroundPermission !== "granted") verdict = "error";
    else if (diagnostics.autoRecordingActive) verdict = "info";
    else if (diagnostics.quietHours || diagnostics.cooldownRemainingMs > 0) verdict = "info";
    else if (nativeEngineAlive && daysSinceAutoTrip > 4) verdict = "warning";
    else if (!Number.isFinite(daysSinceAutoTrip) || daysSinceAutoTrip > 10) verdict = "warning";

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
          geofencingActive: diagnostics.geofencingActive,
          hasAnchor: diagnostics.hasAnchor,
          lastFixAccuracyMeters: diagnostics.lastFixAccuracyMeters,
          detectionProfile: diagnostics.detectionProfile,
          nativeEngineEnabled: diagnostics.nativeEngineEnabled,
          lastNativeLocationAt: diagnostics.lastNativeLocationAt,
          motionPermission: diagnostics.motionPermission,
          // True native-binary identity + which OTA is running on top of it,
          // so the reported appVersion/buildNumber (OTA label) can be
          // reconciled against the real binary. See getUpdatesInfo().
          updates: getUpdatesInfo(),
          trackingState: safeTrackingState,
          // ── Wave 1 context additions (14 May 2026) ────────────
          recentTrips,
          savedLocations,
          appState,
          activitySummary,
          routingStats,
          device: {
            // JS-only fields. Battery / charging would need expo-battery
            // (native rebuild). Add them when we next bump the build.
            isPad: Platform.OS === "ios" && Platform.isPad,
            isTV: Platform.isTV,
            constants: {
              deviceName: Constants.deviceName ?? null,
              installationId: Constants.installationId ?? null,
              appOwnership: Constants.appOwnership ?? null,
              executionEnvironment: Constants.executionEnvironment ?? null,
            },
          },
        },
        eventsJson: events,
      }),
    });
  } catch {
    // Fire-and-forget — diagnostics upload must never crash the app
  }
}
