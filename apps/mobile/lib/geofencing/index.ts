// Geofencing engine — monitors saved locations and auto-creates trips
// Uses expo-location geofencing (OS-level, battery efficient)
// EXIT a saved location → start GPS tracking
// ENTER a saved location → stop tracking, save trip

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { randomUUID } from "expo-crypto";
import { getDatabase } from "../db/index";
import { reverseGeocode } from "../location/geocoding";
import { DRIVING_SPEED_THRESHOLD_MPH, bestTripDistance } from "@mileclear/shared";
import { stopDriveDetection, startDriveDetection, cancelAutoRecording, enterWatchMode, logDetectionEvent, INGEST_ACCURACY_PRE_RECORDING_M, INGEST_ACCURACY_DURING_RECORDING_M } from "../tracking/detection";
import { startLiveActivity, endLiveActivityWithSummary } from "../liveActivity";

const GEOFENCE_TASK_NAME = "mileclear-geofence-monitor";
const GEOFENCE_TRACKING_TASK_NAME = "mileclear-geofence-tracking";
const SPEED_THRESHOLD_MS = DRIVING_SPEED_THRESHOLD_MPH * 0.44704; // mph → m/s
const MIN_TRIP_DISTANCE_MILES = 0.1;

// Minimum dwell inside a saved-location geofence before a trip is treated as
// a real arrival. Driving past a saved location at speed fires Enter then
// Exit within seconds; a real arrival means the user parked, so they will
// still be inside the radius after this window. 90 seconds balances:
// - long enough to filter drive-throughs of any saved location regardless
//   of radius (a 200m radius at 30mph crosses in ~24s, well under 90s)
// - short enough that a real "arrived at school, dropped kids, drove off"
//   sequence still finalizes the inbound trip before the next trip starts
const TENTATIVE_DWELL_MS = 90_000;
const TENTATIVE_FINALIZE_DELAY_MS = TENTATIVE_DWELL_MS + 5_000;

// In-memory timer for finalizing tentative arrivals while the JS runtime is
// awake. Best-effort: iOS suspends timers while the app is backgrounded, so
// the location-task tick and Exit-event paths in this module are the actual
// reliability guarantees. The timer just makes the foreground/active-walk
// case feel snappy.
let tentativeFinalizeTimer: ReturnType<typeof setTimeout> | null = null;

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

// ─── Geofence event handler ────────────────────────────────────────────────

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

      // Don't interfere with active shifts
      const activeShift = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
      );
      if (activeShift) return;

      if (eventType === Location.GeofencingEventType.Exit && region.identifier === "__departure_anchor__") {
        // User left their last stationary position. This is a strong SUSPICION
        // that a drive is starting — but iOS geofences fire spuriously from
        // indoor GPS drift, walks to the bin, carparks with bad signal, and
        // a host of other non-driving causes. We used to treat this signal as
        // a CONFIRMED drive (forceStartRecording → Live Activity → 0 mi
        // phantom recordings sat in the Dynamic Island for hours).
        //
        // Now we enter "watch mode" instead: silently buffer GPS readings,
        // upgrade to high-accuracy mode, and let the existing detection-task
        // driving check (consecutive samples > 15mph or single fast-gate
        // > 25mph) decide when to promote watch → recording. If real driving
        // never happens within WATCH_MODE_MAX_AGE_MS (20 min), watch mode
        // exits silently — no Live Activity ever appears, no notification
        // was sent, and the user wasn't bothered.
        //
        // Departure anchor keys stay intact so registerGeofences() can still
        // re-arm the anchor cleanly.
        await enterWatchMode("anchor_exit");
        return;
      }

      const regionId = region.identifier ?? "unknown";

      if (eventType === Location.GeofencingEventType.Exit) {
        await handleSavedLocationExit(regionId);
      } else if (eventType === Location.GeofencingEventType.Enter) {
        await handleSavedLocationEnter(regionId);
      }
    } catch (err) {
      console.error("Geofence handler error:", err);
    }
  });
} catch (err) {
  console.warn("Failed to define geofence task:", err);
}

// ─── GPS tracking for geofence trips ─────────────────────────────────────

try {
  TaskManager.defineTask(GEOFENCE_TRACKING_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error("Geofence tracking error:", error);
      return;
    }
    if (!data) return;

    const { locations } = data as { locations: Location.LocationObject[] };

    try {
      const db = await getDatabase();

      for (const loc of locations) {
        if (loc.coords.accuracy != null && loc.coords.accuracy > INGEST_ACCURACY_DURING_RECORDING_M) {
          logDetectionEvent("coord_dropped_low_accuracy", {
            source: "geofence_tracking",
            accuracy: Math.round(loc.coords.accuracy),
            threshold: INGEST_ACCURACY_DURING_RECORDING_M,
          }).catch(() => {});
          continue;
        }
        await db.runAsync(
          `INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            loc.coords.latitude,
            loc.coords.longitude,
            loc.coords.speed ?? null,
            loc.coords.accuracy ?? null,
            new Date(loc.timestamp).toISOString(),
          ]
        );
      }

      // Each new location update is also a chance to finalize a tentative
      // arrival whose dwell window has elapsed. iOS suspends JS timers when
      // the app is backgrounded, so this tick is the most reliable wake
      // signal we get. The function is a no-op if no tentative is pending
      // or the window hasn't elapsed yet.
      await tryFinalizeTentativeArrival("location_tick");
    } catch (err) {
      console.error("Geofence tracking store error:", err);
    }
  });
} catch (err) {
  console.warn("Failed to define geofence tracking task:", err);
}

// ─── Tentative arrival handlers ─────────────────────────────────────────
//
// On Enter, we don't immediately finalize a trip — we mark the location as
// a tentative arrival and wait TENTATIVE_DWELL_MS before deciding. Three
// resolution paths converge on the same outcome:
//
//   1. Exit fires for the tentative location within the dwell window
//      → drive-through. Discard tentative, keep tracking, no trip created.
//   2. Exit fires AFTER the dwell window
//      → real arrival. Finalize the inbound trip, then this Exit becomes
//      the start of a new trip.
//   3. Dwell elapses while still inside the radius (timer or location tick)
//      → real arrival. Finalize inbound trip, idle until next departure.
//
// Without this gate, every saved-location Enter terminated the active trip,
// so passing within the radius of any home/school/depot mid-drive would
// split a single journey into multiple short legs (Anthony's school-run bug).

async function setTentativeArrival(locationId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_tentative_arrival', ?)",
    [locationId]
  );
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_tentative_arrival_at', ?)",
    [now]
  );
  if (tentativeFinalizeTimer) clearTimeout(tentativeFinalizeTimer);
  tentativeFinalizeTimer = setTimeout(() => {
    tentativeFinalizeTimer = null;
    void tryFinalizeTentativeArrival("timer");
  }, TENTATIVE_FINALIZE_DELAY_MS);
  logDetectionEvent("geofence_tentative_arrival", { locationId }).catch(() => {});
}

async function clearTentativeArrival(reason: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key IN ('geofence_tentative_arrival', 'geofence_tentative_arrival_at')"
  );
  if (tentativeFinalizeTimer) {
    clearTimeout(tentativeFinalizeTimer);
    tentativeFinalizeTimer = null;
  }
  logDetectionEvent("geofence_tentative_cleared", { reason }).catch(() => {});
}

async function tryFinalizeTentativeArrival(source: "timer" | "location_tick"): Promise<void> {
  try {
    const db = await getDatabase();
    const tentRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'geofence_tentative_arrival'"
    );
    if (!tentRow) return;
    const tentAtRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'geofence_tentative_arrival_at'"
    );
    if (!tentAtRow) return;
    const arrivedAtIso = tentAtRow.value;
    const age = Date.now() - new Date(arrivedAtIso).getTime();
    if (age < TENTATIVE_DWELL_MS) return;

    // Verify the user is still inside the geofence — if they've already
    // moved out without iOS having fired Exit yet, defer to the Exit handler
    // which will reconcile correctly once iOS catches up.
    const loc = await db.getFirstAsync<{
      latitude: number;
      longitude: number;
      radius_meters: number;
    }>(
      "SELECT latitude, longitude, radius_meters FROM saved_locations WHERE id = ?",
      [tentRow.value]
    );
    if (!loc) {
      await clearTentativeArrival("saved_location_deleted");
      return;
    }
    const pos = await Location.getLastKnownPositionAsync();
    if (!pos) return;
    const distMiles = haversine(
      pos.coords.latitude, pos.coords.longitude,
      loc.latitude, loc.longitude
    );
    const distMeters = distMiles * 1609.344;
    // Allow 50m of GPS slop around the boundary
    if (distMeters > loc.radius_meters + 50) return;

    const departed = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'geofence_departed_location'"
    );
    const departedAt = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'geofence_departed_at'"
    );
    if (!departed || !departedAt) {
      await clearTentativeArrival("no_departure");
      return;
    }

    await stopGeofenceTracking();
    await processGeofenceTrip(departed.value, tentRow.value, departedAt.value, arrivedAtIso);
    await db.runAsync(
      "DELETE FROM tracking_state WHERE key IN ('geofence_departed_location', 'geofence_departed_at', 'geofence_tentative_arrival', 'geofence_tentative_arrival_at')"
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_arrived_location', ?)",
      [tentRow.value]
    );
    if (tentativeFinalizeTimer) {
      clearTimeout(tentativeFinalizeTimer);
      tentativeFinalizeTimer = null;
    }
    logDetectionEvent("geofence_real_arrival", {
      source,
      locationId: tentRow.value,
      ageMs: age,
    }).catch(() => {});
    await startDriveDetection();
  } catch (err) {
    console.error("tryFinalizeTentativeArrival error:", err);
  }
}

async function handleSavedLocationEnter(regionId: string): Promise<void> {
  const db = await getDatabase();

  // Position-verify the Enter event before treating it as legitimate.
  // iOS fires geofence Enter from cell-tower triangulation when GPS is poor,
  // which can put the device 500m+ from the geofence centre. Anthony hit
  // this 6 May 2026: at Shiney Row Roundabout (~955m from his "Mams"
  // saved location), iOS fired Enter for Mams. Without this check the
  // app would mark a tentative arrival and waste 90 seconds of dwell
  // before the finalize path's position-verify caught it.
  //
  // We allow generous tolerance (radius * 2 + 100m) because iOS enforces
  // its own ~100m minimum on geofence radii regardless of what we set,
  // and the user's last-known position can be a few seconds stale.
  // This gate only rejects clearly-wrong positions (e.g. half a kilometre
  // out), not borderline cases - those still proceed to the dwell logic.
  try {
    const loc = await db.getFirstAsync<{
      latitude: number;
      longitude: number;
      radius_meters: number;
    }>(
      "SELECT latitude, longitude, radius_meters FROM saved_locations WHERE id = ?",
      [regionId]
    );
    const pos = await Location.getLastKnownPositionAsync();
    if (loc && pos) {
      // Accuracy gate: cell-tower / WiFi-positioning fixes typically come
      // back at 500m+ accuracy. Real GPS in built-up areas clears 100m.
      // The position-verify check below is circular for cell-tower
      // phantoms - iOS's cached fix is the same coarse fix that fired
      // the Enter, so the distance check passes against itself. Refusing
      // a coarse fix as evidence breaks the loop. Anthony 8 May 2026:
      // physically at "Kaths" in Shiney Row, system fired Enter for
      // "Mams" in Penshaw (~1km away) and the position-verify let it
      // through because iOS's cached fix was the same cell-tower fix
      // that triggered Enter.
      if (pos.coords.accuracy != null && pos.coords.accuracy > INGEST_ACCURACY_PRE_RECORDING_M) {
        logDetectionEvent("geofence_enter_phantom_accuracy", {
          locationId: regionId,
          accuracy: Math.round(pos.coords.accuracy),
          threshold: INGEST_ACCURACY_PRE_RECORDING_M,
        }).catch(() => {});
        return;
      }
      const distMiles = haversine(
        pos.coords.latitude, pos.coords.longitude,
        loc.latitude, loc.longitude
      );
      const distMeters = distMiles * 1609.344;
      const tolerance = loc.radius_meters * 2 + 100;
      if (distMeters > tolerance) {
        logDetectionEvent("geofence_enter_phantom_position", {
          locationId: regionId,
          distMeters: Math.round(distMeters),
          radiusMeters: loc.radius_meters,
          toleranceMeters: tolerance,
        }).catch(() => {});
        return;
      }
    }
  } catch {
    // Position lookup failed - fall through to the existing flow rather
    // than dropping a potentially-real Enter. The dwell finalize will
    // still position-verify before saving a trip.
  }

  const departedRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'geofence_departed_location'"
  );
  const departedAtRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'geofence_departed_at'"
  );

  if (!departedRow || !departedAtRow) {
    // No active trip in progress — just record idle arrival so future
    // analytics or features can know "user is currently here".
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_arrived_location', ?)",
      [regionId]
    );
    return;
  }

  const existingTent = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'geofence_tentative_arrival'"
  );
  if (existingTent?.value === regionId) {
    // GPS jitter re-firing Enter for the same region — leave the existing
    // tentative timestamp in place so the dwell window doesn't reset.
    return;
  }
  if (existingTent && existingTent.value !== regionId) {
    // Entered a different geofence while a tentative was pending. The
    // previous tentative could not have hit its dwell (otherwise it would
    // already have finalized via timer or location tick), so it must have
    // been a drive-through past two close saved locations.
    logDetectionEvent("geofence_tentative_supplanted", {
      previous: existingTent.value,
      next: regionId,
    }).catch(() => {});
    await clearTentativeArrival("supplanted");
  }

  await setTentativeArrival(regionId);
  // GEOFENCE_TRACKING stays running so coords keep accumulating until we
  // either finalize the trip or resolve as a drive-through.
}

/**
 * Fire-and-forget Live Activity start for a freshly departed geofence trip.
 * Wrapped in try/catch so any LA failure (iOS denied, simulator, etc.) never
 * breaks the trip-capture flow that called it. Mode is derived from the
 * current app_mode (work / personal) so the accent colour matches the
 * trip's likely classification.
 */
async function startGeofenceTripLiveActivity(): Promise<void> {
  try {
    const db = await getDatabase();
    const modeRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'app_mode'"
    );
    const isBusinessMode = modeRow?.value !== "personal";
    await startLiveActivity({ activityType: "trip", isBusinessMode });
  } catch {
    // LA failed to start — trip capture continues unaffected.
  }
}

async function handleSavedLocationExit(regionId: string): Promise<void> {
  const db = await getDatabase();

  const tentRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'geofence_tentative_arrival'"
  );

  if (tentRow?.value === regionId) {
    // Exiting the location we tentatively arrived at — dwell decides.
    const tentAtRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'geofence_tentative_arrival_at'"
    );
    const arrivedAtIso = tentAtRow?.value ?? new Date().toISOString();
    const age = tentAtRow ? Date.now() - new Date(arrivedAtIso).getTime() : 0;

    if (age < TENTATIVE_DWELL_MS) {
      // Drive-through. Keep the original departure intact so the eventual
      // real arrival produces one continuous trip.
      logDetectionEvent("geofence_drive_through", {
        locationId: regionId,
        ageMs: age,
      }).catch(() => {});
      await clearTentativeArrival("drive_through");
      return;
    }

    // Real arrival — Exit fired after dwell elapsed because the user parked
    // long enough then drove off again. Finalize the inbound trip, then
    // treat this same Exit as the start of the next trip.
    const departed = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'geofence_departed_location'"
    );
    const departedAt = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'geofence_departed_at'"
    );
    if (departed && departedAt) {
      await processGeofenceTrip(departed.value, regionId, departedAt.value, arrivedAtIso);
      logDetectionEvent("geofence_real_arrival", {
        source: "exit",
        locationId: regionId,
        ageMs: age,
      }).catch(() => {});
    }
    await clearTentativeArrival("real_arrival_via_exit");
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_departed_location', ?)",
      [regionId]
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_departed_at', ?)",
      [new Date().toISOString()]
    );
    await db.runAsync("DELETE FROM tracking_state WHERE key = 'geofence_arrived_location'");
    // GEOFENCE_TRACKING is already running — coords keep flowing into the new trip.
    await startGeofenceTripLiveActivity();
    return;
  }

  // Standard departure from a saved location — no tentative was pending.
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_departed_location', ?)",
    [regionId]
  );
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('geofence_departed_at', ?)",
    [new Date().toISOString()]
  );
  await db.runAsync("DELETE FROM tracking_state WHERE key = 'geofence_arrived_location'");

  await stopDriveDetection();
  await cancelAutoRecording();
  await startGeofenceTracking();
  await startGeofenceTripLiveActivity();
}

// ─── Public API ─────────────────────────────────────────────────────────

export async function registerGeofences(): Promise<void> {
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== "granted") return;

  const db = await getDatabase();
  const locations = await db.getAllAsync<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
    geofence_enabled: number;
  }>(
    "SELECT id, name, latitude, longitude, radius_meters, geofence_enabled FROM saved_locations WHERE geofence_enabled = 1"
  );

  const regions: Location.LocationRegion[] = locations.map((loc) => ({
    identifier: loc.id,
    latitude: loc.latitude,
    longitude: loc.longitude,
    radius: loc.radius_meters,
    notifyOnEnter: true,
    notifyOnExit: true,
  }));

  // Include departure anchor — a temporary geofence around the user's last
  // stationary position. iOS manages geofences at the OS level, so they survive
  // app termination. When the user leaves this radius, iOS wakes the app and
  // the handler restarts drive detection. This is the most reliable way to
  // ensure detection starts immediately for terminated apps.
  const anchorLat = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'departure_anchor_lat'"
  );
  const anchorLng = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'departure_anchor_lng'"
  );
  if (anchorLat && anchorLng) {
    regions.push({
      identifier: "__departure_anchor__",
      latitude: parseFloat(anchorLat.value),
      longitude: parseFloat(anchorLng.value),
      radius: 200, // 200m — covers typical residential properties
      notifyOnEnter: false,
      notifyOnExit: true,
    });
  }

  if (regions.length === 0) {
    // Stop geofencing if no locations and no anchor
    await stopGeofencing();
    return;
  }

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

async function startGeofenceTracking(): Promise<void> {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(GEOFENCE_TRACKING_TASK_NAME);
  if (isRunning) return;

  await Location.startLocationUpdatesAsync(GEOFENCE_TRACKING_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 50,
    deferredUpdatesInterval: 10000,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: "MileClear",
      notificationBody: "Tracking your trip...",
    },
  });
}

async function stopGeofenceTracking(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(GEOFENCE_TRACKING_TASK_NAME);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(GEOFENCE_TRACKING_TASK_NAME);
    }
  } catch {
    // Best effort
  }
}

// ─── Departure anchor ───────────────────────────────────────────────────

/**
 * Register a geofence around the user's current (or specified) position.
 * When the user exits this 200m radius, iOS reliably wakes the app —
 * even if it was terminated — and we restart drive detection.
 *
 * Call this after trips finish (user is stationary) and on app startup.
 * iOS limits to ~20 geofences per app, so this adds just 1 region.
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

    // Re-register geofences to include the new anchor
    await registerGeofences();
  } catch {
    // Best effort — detection will still work via showsBackgroundLocationIndicator
  }
}

// ─── Trip processing ─────────────────────────────────────────────────────

async function processGeofenceTrip(
  departedLocationId: string,
  arrivedLocationId: string,
  departedAt: string,
  arrivedAt: string,
): Promise<void> {
  const db = await getDatabase();

  // Read coords accumulated up to the moment of arrival. Anything recorded
  // after `arrivedAt` is "user inside the geofence after they parked"
  // (walking around, sitting in the car, GPS jitter) and would inflate the
  // trip's end-point and distance if included.
  const coords = await db.getAllAsync<{
    lat: number;
    lng: number;
    speed: number | null;
    accuracy: number | null;
    recorded_at: string;
  }>(
    "SELECT lat, lng, speed, accuracy, recorded_at FROM detection_coordinates WHERE recorded_at <= ? ORDER BY recorded_at ASC",
    [arrivedAt]
  );
  // Drop the coords we just consumed AND any post-arrival noise. The next
  // trip starts from a clean slate either way.
  await db.runAsync("DELETE FROM detection_coordinates");
  // Clear auto-recording state to prevent duplicate trip creation
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key IN ('auto_recording_active', 'last_driving_speed_at')"
  );

  // Check if any coordinates indicate actual driving (speed > threshold)
  const drivingCoords = coords.filter(
    (c) => c.speed != null && c.speed >= SPEED_THRESHOLD_MS
  );
  if (drivingCoords.length === 0 && coords.length < 5) {
    // Likely walking, not driving — discard
    return;
  }

  // Sum GPS chord segments, then correct for chord-to-arc undercount via OSRM.
  // bestTripDistance() takes max(haversineSum, osrmRoute) so winding-road undercount
  // is fixed without overwriting any real detour the GPS sum captured.
  let gpsSumDistance = 0;
  for (let i = 1; i < coords.length; i++) {
    gpsSumDistance += haversine(
      coords[i - 1].lat, coords[i - 1].lng,
      coords[i].lat, coords[i].lng
    );
  }

  const first = coords[0] || { lat: 0, lng: 0, recorded_at: departedAt };
  const last = coords[coords.length - 1] || first;
  const totalDistance = await bestTripDistance(
    gpsSumDistance,
    first.lat, first.lng,
    last.lat, last.lng,
  );

  if (totalDistance < MIN_TRIP_DISTANCE_MILES) return;

  // Look up location names and types from saved_locations
  const departedLoc = await db.getFirstAsync<{ name: string; location_type: string }>(
    "SELECT name, location_type FROM saved_locations WHERE id = ?",
    [departedLocationId]
  );
  const arrivedLoc = await db.getFirstAsync<{ name: string; location_type: string }>(
    "SELECT name, location_type FROM saved_locations WHERE id = ?",
    [arrivedLocationId]
  );

  const startAddress = departedLoc?.name || (await reverseGeocode(first.lat, first.lng)) || null;
  const endAddress = arrivedLoc?.name || (await reverseGeocode(last.lat, last.lng)) || null;

  // Auto-classify based on saved location types
  const startType = departedLoc?.location_type ?? null;
  const endType = arrivedLoc?.location_type ?? null;
  const workTypes = ["work", "depot"];
  let classification: "business" | "personal" | "unclassified" = "unclassified";
  if ((startType && workTypes.includes(startType)) || (endType && workTypes.includes(endType))) {
    classification = "business";
  } else if (startType === "home" && endType === "home") {
    classification = "personal";
  }

  const tripId = randomUUID();
  const notes = `__unconfirmed__|${departedLocationId}|${arrivedLocationId}`;

  const roundedDistance = Math.round(totalDistance * 100) / 100;

  // Store trip locally. Notes carries the local-only `__unconfirmed__` marker
  // until the user confirms; the server payload below sends notes=null since
  // the marker is a UI affordance, not data the server cares about.
  await db.runAsync(
    `INSERT INTO trips (id, start_lat, start_lng, end_lat, end_lng, start_address, end_address,
      distance_miles, started_at, ended_at, is_manual_entry, classification, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      tripId,
      first.lat,
      first.lng,
      last.lat,
      last.lng,
      startAddress,
      endAddress,
      roundedDistance,
      departedAt,
      arrivedAt,
      classification,
      notes,
    ]
  );

  // Store coordinates for route replay
  for (const c of coords) {
    await db.runAsync(
      `INSERT INTO coordinates (id, trip_id, lat, lng, speed, accuracy, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), tripId, c.lat, c.lng, c.speed, c.accuracy, c.recorded_at]
    );
  }

  // Enqueue a server CREATE so this trip drains through processSyncQueue like
  // detection-finalised trips do. Without this the row sits with synced_at NULL
  // forever and any user-driven update (classify, edit) 404s on the server.
  const { enqueueSync } = await import("../sync/queue");
  await enqueueSync("trip", tripId, "create", {
    startLat: first.lat,
    startLng: first.lng,
    endLat: last.lat,
    endLng: last.lng,
    startAddress: startAddress ?? undefined,
    endAddress: endAddress ?? undefined,
    distanceMiles: roundedDistance,
    startedAt: departedAt,
    endedAt: arrivedAt,
    classification,
    coordinates: coords.map((c) => ({
      lat: c.lat,
      lng: c.lng,
      speed: c.speed,
      accuracy: c.accuracy,
      recordedAt: c.recorded_at,
    })),
  });

  // Fire the trip-confirmation notification unconditionally. A trip you just
  // finished driving is a moment in the user's day, not a 3am alarm. iOS
  // Focus / Do Not Disturb still mutes the sound; the notification itself
  // should always land so the user can act on it when they next look.
  await sendTripConfirmationNotification(tripId, startAddress, endAddress, totalDistance);
  await scheduleConfirmationReminder(tripId, startAddress, endAddress, totalDistance);

  // Set departure anchor at trip end point
  await setDepartureAnchor(last.lat, last.lng).catch(() => {});

  // Close out any Live Activity started at departure with a frozen
  // "Trip Complete" summary. Classification is unconfirmed at this
  // point, so the LA's classify CTA is left enabled. Wrapped in
  // try/catch — a failed LA end never affects the saved trip.
  try {
    await endLiveActivityWithSummary({
      distanceMiles: roundedDistance,
      tripCount: 0,
      startDateMs: new Date(departedAt).getTime(),
      endDateMs: new Date(arrivedAt).getTime(),
      needsClassification: classification === "unclassified",
    });
  } catch {
    // No active LA, or end failed — fine, trip is saved.
  }
}

// ─── Notifications ──────────────────────────────────────────────────────

async function sendTripConfirmationNotification(
  tripId: string,
  startAddress: string | null,
  endAddress: string | null,
  distanceMiles: number
): Promise<void> {
  const from = startAddress || "Unknown";
  const to = endAddress || "Unknown";
  const distance = distanceMiles.toFixed(1);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Trip detected",
      body: `${from} → ${to} (${distance} mi). Were you driving?`,
      data: { type: "trip_confirmation", tripId },
      categoryIdentifier: "trip_confirm",
    },
    trigger: null, // Send immediately
  });
}

async function scheduleConfirmationReminder(
  tripId: string,
  startAddress: string | null,
  endAddress: string | null,
  distanceMiles: number
): Promise<void> {
  const from = startAddress || "Unknown";
  const to = endAddress || "Unknown";
  const distance = distanceMiles.toFixed(1);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Unconfirmed trip",
      body: `${from} → ${to} (${distance} mi) still needs confirmation`,
      data: { type: "trip_confirmation_reminder", tripId },
      categoryIdentifier: "trip_confirm",
    },
    trigger: { type: "timeInterval" as any, seconds: 3 * 60 * 60, repeats: false } as any,
  });
}

// ─── Trip confirmation/rejection ─────────────────────────────────────────

export async function confirmGeofenceTrip(tripId: string): Promise<void> {
  const db = await getDatabase();
  // Remove the __unconfirmed__ marker from notes
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

  // If it's before 9pm, shade trips from before today's midnight
  // If it's after 9pm, don't shade today's trips (they get until tomorrow midnight)
  const cutoffHour = 21; // 9pm
  let cutoff: string;

  if (now.getHours() >= cutoffHour) {
    // After 9pm — cutoff is yesterday's midnight (trips before yesterday midnight get shaded)
    const yesterday = new Date(midnight);
    yesterday.setDate(yesterday.getDate() - 1);
    cutoff = yesterday.toISOString();
  } else {
    // Before 9pm — cutoff is today's midnight
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
