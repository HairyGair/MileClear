// Geofencing — anchor-only.
//
// History: this file used to drive auto-trip detection via per-saved-location
// geofences. Each Home/Work/School fired Enter/Exit events that ran their
// own tentative-arrival state machine, with drive-through guards,
// registration-grace logic, position-verify gates, and a separate GPS
// tracking task. Anthony 17 May 2026 reported the saved-location flow was
// glitchier than just having an anchor at the user's last parked spot —
// he deleted his saved locations and detection improved significantly.
//
// New architecture (17 May 2026):
//   - ONE geofence: the departure anchor at the user's last stationary
//     position. When iOS fires Exit on it, we enter watch-mode (silently
//     buffer coords until real driving speed confirms the trip).
//   - Saved locations are pure data. Used by detection.ts's classification
//     engine to auto-tag trips, and by the trip-creation pipeline to
//     attribute startAddress/endAddress when GPS coords are inside a
//     saved location's radius. NOT registered as iOS geofences anymore.
//   - Trip detection flows entirely through detection.ts: watch-mode →
//     recording → stop-detection → finalize. No parallel path.
//
// What was removed (~750 lines deleted):
//   - GEOFENCE_TRACKING_TASK_NAME and its TaskManager.defineTask
//   - handleSavedLocationEnter / handleSavedLocationExit
//   - setTentativeArrival / clearTentativeArrival / tryFinalizeTentativeArrival
//   - processGeofenceTrip (geofence-driven trip creation)
//   - updateGeofenceTripLiveActivity / startGeofenceTripLiveActivity
//   - startGeofenceTracking / stopGeofenceTracking
//   - Drive-through guard
//   - Registration-grace logic for saved locations
//   - sendTripConfirmationNotification / scheduleConfirmationReminder
//     (detection.ts has its own "Trip recorded" notification path)
//
// Why this is better:
//   - One trip-finalization codepath instead of two competing paths
//   - No more iOS geofence-flap loops from overlapping regions
//   - No more "St Roberts School" attribution from stale Exits
//   - No more 90-second tentative dwell window for arrivals
//   - Trip end is determined by stop-detection (>2min stationary in
//     detection.ts), not by Enter events from arbitrary saved locations
//   - Auto-classification still uses saved-location data, but via the
//     proper classifyTrip engine in lib/classification

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getDatabase } from "../db/index";
import { enterWatchMode, logDetectionEvent } from "../tracking/detection";

const GEOFENCE_TASK_NAME = "mileclear-geofence-monitor";

// How long before a still-"active" anchor region is force re-registered to
// defeat iOS's silently-dead-region failure (reports active, delivers no Exit).
// Short enough that a stale region is refreshed within a normal day's app use,
// long enough to avoid churning Core Location on every foreground.
const GEOFENCE_REFRESH_MS = 60 * 60 * 1000; // 1 hour

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Anchor geofence handler ────────────────────────────────────────────
//
// The ONLY geofence handler. Listens for Exit on the departure anchor
// (the synthetic 100m region around the user's last parked spot). On
// verified Exit, plants a backfill coord at the anchor and triggers
// watch-mode in detection.ts — which then promotes to recording iff
// real driving speed is observed within the watch window.
//
// Saved-location identifiers are no longer registered as geofences, so
// any Enter/Exit events for them would only happen if a legacy region
// is still active in iOS's per-app geofence registry. The handler
// ignores those events defensively (logs + returns).

try {
  TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error("Geofence task error:", error);
      return;
    }
    if (!data) return;

    const { eventType, region } = data as {
      eventType: Location.GeofencingEventType;
      region: Location.LocationRegion;
    };

    try {
      const db = await getDatabase();

      // Don't interfere with active shifts (shift mode owns its own GPS).
      const activeShift = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
      );
      if (activeShift) return;

      // Only handle the anchor. Anything else is a legacy region from
      // before the saved-location-geofences removal — defensively ignore.
      if (region.identifier !== "__departure_anchor__") {
        logDetectionEvent("geofence_legacy_region_ignored", {
          identifier: region.identifier ?? "unknown",
          eventType:
            eventType === Location.GeofencingEventType.Enter ? "enter" : "exit",
        }).catch(() => {});
        return;
      }

      if (eventType !== Location.GeofencingEventType.Exit) return;

      // Verify the device is genuinely outside the anchor before
      // promoting to watch mode. iOS fires Exits from cached cell-tower
      // fixes that can be 100s of metres off — without this gate we'd
      // boot continuous GPS for every bathroom break.
      const anchorRow = await db.getAllAsync<{ key: string; value: string }>(
        "SELECT key, value FROM tracking_state WHERE key IN ('departure_anchor_lat', 'departure_anchor_lng')"
      );
      const anchorMap = Object.fromEntries(anchorRow.map((r) => [r.key, r.value]));
      const anchorLat = parseFloat(anchorMap["departure_anchor_lat"] ?? "");
      const anchorLng = parseFloat(anchorMap["departure_anchor_lng"] ?? "");

      if (Number.isFinite(anchorLat) && Number.isFinite(anchorLng)) {
        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const distMeters =
            haversine(
              pos.coords.latitude, pos.coords.longitude,
              anchorLat, anchorLng,
            ) * 1609.344;
          // Anchor radius is 100m. Require the user be at least 30m
          // outside (130m total) before accepting the Exit. Below that
          // the signal is indistinguishable from indoor GPS drift.
          if (distMeters < 130) {
            logDetectionEvent("anchor_exit_drift_rejected", {
              distMeters: Math.round(distMeters),
            }).catch(() => {});
            return;
          }
          logDetectionEvent("anchor_exit_verified", {
            distMeters: Math.round(distMeters),
          }).catch(() => {});

          // Backfill: plant a synthetic detection_coordinate at the
          // anchor's exact lat/lng, timestamped 30s ago. The watch /
          // record pipeline reads coords ORDER BY recorded_at, so this
          // becomes the trip's first GPS point — route starts at the
          // user's actual departure spot, not 100m down the road where
          // iOS got around to firing Exit.
          const backfillTs = new Date(Date.now() - 30_000).toISOString();
          await db.runAsync(
            `INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at)
             VALUES (?, ?, ?, ?, ?)`,
            [anchorLat, anchorLng, 0, 50, backfillTs]
          );
          logDetectionEvent("anchor_backfill_planted", {
            lat: anchorLat,
            lng: anchorLng,
            recorded_at: backfillTs,
          }).catch(() => {});
        } catch (err) {
          logDetectionEvent("anchor_exit_verify_failed", {
            error: err instanceof Error ? err.message : "unknown",
          }).catch(() => {});
          // Fall through to enterWatchMode — better to proceed than
          // miss a real drive because getCurrentPositionAsync timed out.
        }
      }

      await enterWatchMode("anchor_exit");
    } catch (err) {
      console.error("Geofence handler error:", err);
    }
  });
} catch (err) {
  console.warn("Failed to define geofence task:", err);
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * (Re-)register the anchor geofence. Saved locations are not registered as
 * geofences — they're pure data used by classification and address
 * attribution only. Callers (app start, after saved-location edits) can
 * still invoke this safely; it just re-applies the current anchor.
 *
 * If no anchor exists yet (fresh install, post-reboot before first trip),
 * this no-ops. The first trip's end position will seed the anchor via
 * setDepartureAnchor.
 */
export async function registerGeofences(): Promise<void> {
  // When the native engine owns detection, the JS anchor geofence must never
  // arm — it competes with RNBG's own geofences/location (Anthony 3 June:
  // RNBG's __STATIONARY_REGION__ collided with this handler and the drive was
  // missed). Every JS geofence arm funnels through here, so this single gate
  // covers startup, finalize, ensureAnchorGeofenceArmed, restart, etc.
  try {
    const { isNativeLocationEngineEnabled } = await import("../tracking/nativeEngineFlag");
    const { isNativeEngineAvailable } = await import("../tracking/nativeLocation");
    if (isNativeEngineAvailable() && (await isNativeLocationEngineEnabled())) {
      await stopGeofencing();
      return;
    }
  } catch {}

  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== "granted") return;

  const db = await getDatabase();
  const anchorLat = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'departure_anchor_lat'"
  );
  const anchorLng = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'departure_anchor_lng'"
  );

  if (!anchorLat || !anchorLng) {
    // No anchor to register. Stop any legacy regions to clear iOS's
    // per-app registry of stale saved-location geofences from before
    // the 17 May refactor.
    await stopGeofencing();
    return;
  }

  const regions: Location.LocationRegion[] = [
    {
      identifier: "__departure_anchor__",
      latitude: parseFloat(anchorLat.value),
      longitude: parseFloat(anchorLng.value),
      radius: 100, // 100m — tight wake-up, drift absorbed by verify gate
      notifyOnEnter: false,
      notifyOnExit: true,
    },
  ];

  // Stamp registration time. Kept for diagnostics — the
  // registration-grace logic on saved-location Exits no longer exists,
  // but the timestamp is still useful when debugging anchor behaviour.
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_registered_at', ?)",
    [Date.now().toString()]
  );

  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
}

export async function stopGeofencing(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
    if (isRunning) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    }
  } catch {
    // Best effort
  }
}

export async function isGeofencingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
  } catch {
    return false;
  }
}

/**
 * Confirm the anchor geofence is actually being monitored by iOS. The
 * anchored-skip in startDriveDetection relies entirely on this region's
 * Exit event to wake detection when the user drives off — if iOS silently
 * evicted the region (happens after reboot, OS/app update, or Precise
 * Location toggles) the anchored-skip would strand detection forever,
 * logging only `anchored_still`.
 *
 * If an anchor exists but monitoring isn't live, re-register and re-verify.
 * Returns the final state so the caller can decide whether the anchored-skip
 * is safe (active) or whether it must fall back to a continuous subscription.
 */
export async function ensureAnchorGeofenceArmed(): Promise<{
  hasAnchor: boolean;
  active: boolean;
}> {
  const db = await getDatabase();
  const lat = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'departure_anchor_lat'"
  );
  const lng = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'departure_anchor_lng'"
  );
  if (!lat || !lng) return { hasAnchor: false, active: false };

  let active = false;
  try {
    active = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
  } catch {}

  // CRITICAL: do NOT trust active === true. The dominant real-world failure is
  // iOS accepting the region (hasStartedGeofencingAsync → true) yet silently
  // never delivering the Exit — Anthony's device went dark 22-28 May AND again
  // 30 May with the geofence reporting active:true the whole time and zero
  // Exits across daily drives. A region that's been registered for a while is
  // the prime suspect. Force a fresh re-registration when it's gone stale,
  // even if iOS claims it's active — re-registering resets Core Location's
  // monitoring and clears the dead-region state. This is the fix for "armed
  // but never fires".
  let stale = !active;
  if (active) {
    const reg = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'geofence_registered_at'"
    );
    const lastReg = reg ? parseInt(reg.value, 10) : 0;
    if (!Number.isFinite(lastReg) || Date.now() - lastReg > GEOFENCE_REFRESH_MS) {
      stale = true;
    }
  }
  if (active && !stale) return { hasAnchor: true, active: true };

  // Not monitoring, or monitoring a possibly-dead stale region — re-arm fresh.
  try {
    await registerGeofences();
    active = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
  } catch {}
  logDetectionEvent("anchor_geofence_rearm_attempt", { active, forcedRefresh: stale }).catch(() => {});
  return { hasAnchor: true, active };
}

// ─── Departure anchor ───────────────────────────────────────────────────

/**
 * Register a geofence around the user's current (or specified) position.
 * When the user exits this 100m radius, iOS reliably wakes the app —
 * even if it was terminated — and we restart drive detection.
 *
 * Called after trips finish (user is stationary) and on app startup.
 * iOS limits to ~20 geofences per app. We only ever register 1.
 */
export async function setDepartureAnchor(lat?: number, lng?: number): Promise<void> {
  try {
    const db = await getDatabase();

    let latitude = lat;
    let longitude = lng;

    if (latitude == null || longitude == null) {
      const loc = await Location.getLastKnownPositionAsync();
      if (!loc) return;
      latitude = loc.coords.latitude;
      longitude = loc.coords.longitude;
    }

    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('departure_anchor_lat', ?)",
      [latitude.toString()]
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('departure_anchor_lng', ?)",
      [longitude.toString()]
    );

    // Re-register so the anchor moves to the new position.
    await registerGeofences();
  } catch {
    // Best effort — detection still works via the in-process tracker.
  }
}

// ─── Stale-state cleanup ────────────────────────────────────────────────

/**
 * Clear any legacy geofence-trip state left over from before the
 * 17 May refactor. The old `geofence_departed_at` / `geofence_departed_location`
 * / `geofence_tentative_arrival_*` keys could pin the Live Activity on
 * the Dynamic Island indefinitely if their owning code path was deleted
 * without resetting state.
 *
 * Called from _layout.tsx on every AppState -> active transition.
 * No-op if no stale state exists.
 */
export async function cleanupStaleGeofenceLA(): Promise<void> {
  try {
    const db = await getDatabase();
    // Wipe any legacy state keys from the old geofence-trip path. These
    // should normally not exist on a fresh install, but lingering values
    // from pre-refactor builds get cleaned up here.
    await db.runAsync(
      "DELETE FROM tracking_state WHERE key IN ('geofence_departed_location', 'geofence_departed_at', 'geofence_tentative_arrival', 'geofence_tentative_arrival_at', 'geofence_arrived_location')"
    );
    // Best-effort: dismiss any Live Activity that may have been orphaned
    // by the old path. End is idempotent.
    try {
      const { endLiveActivity } = await import("../liveActivity");
      await endLiveActivity();
    } catch {
      // No active LA, or end failed — fine.
    }
  } catch {
    // Cleanup path — never block app startup.
  }
}

// ─── Unconfirmed-trip helpers ───────────────────────────────────────────
//
// The pre-refactor geofence path marked auto-created trips with a
// `__unconfirmed__` notes prefix and sent a per-trip confirmation push.
// New geofence trips no longer use this pattern — detection.ts sends
// its own "Trip recorded as X" / "Trip recorded - classify it" pushes
// at finalize time. The helpers below are retained for backward compat
// so historical __unconfirmed__ / __shaded__ trips still surface in the
// UI surfaces that read them.

export async function confirmGeofenceTrip(tripId: string): Promise<void> {
  const db = await getDatabase();
  const trip = await db.getFirstAsync<{ notes: string | null }>(
    "SELECT notes FROM trips WHERE id = ?",
    [tripId]
  );
  if (!trip) return;

  const cleanNotes = trip.notes?.startsWith("__unconfirmed__") ? null : trip.notes;
  await db.runAsync(
    "UPDATE trips SET notes = ? WHERE id = ?",
    [cleanNotes, tripId]
  );
}

export async function rejectGeofenceTrip(tripId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM coordinates WHERE trip_id = ?", [tripId]);
  await db.runAsync("DELETE FROM trips WHERE id = ?", [tripId]);
}

export async function getUnconfirmedTrips(): Promise<Array<{
  id: string;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  startedAt: string;
  endedAt: string | null;
}>> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT id, start_address as startAddress, end_address as endAddress,
            distance_miles as distanceMiles, started_at as startedAt, ended_at as endedAt
     FROM trips WHERE notes LIKE '__unconfirmed__%' ORDER BY started_at DESC`
  );
}

// ─── Midnight auto-shade logic ──────────────────────────────────────────

export async function shadeExpiredUnconfirmedTrips(): Promise<number> {
  const db = await getDatabase();
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  const cutoffHour = 21; // 9pm
  let cutoff: string;

  if (now.getHours() >= cutoffHour) {
    const yesterday = new Date(midnight);
    yesterday.setDate(yesterday.getDate() - 1);
    cutoff = yesterday.toISOString();
  } else {
    cutoff = midnight.toISOString();
  }

  const result = await db.runAsync(
    `UPDATE trips SET notes = REPLACE(notes, '__unconfirmed__', '__shaded__')
     WHERE notes LIKE '__unconfirmed__%' AND started_at < ?`,
    [cutoff]
  );

  return result.changes;
}

export async function getShadedTrips(): Promise<Array<{
  id: string;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  startedAt: string;
  endedAt: string | null;
}>> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT id, start_address as startAddress, end_address as endAddress,
            distance_miles as distanceMiles, started_at as startedAt, ended_at as endedAt
     FROM trips WHERE notes LIKE '__shaded__%' ORDER BY started_at DESC`
  );
}
