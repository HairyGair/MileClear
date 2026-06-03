// Data hydration service — pulls server data into local SQLite on first login
// or after a fresh install. Runs once per device; subsequent logins skip it.

import { getDatabase } from "../db/index";
import { fetchVehicles } from "../api/vehicles";
import { fetchShifts } from "../api/shifts";
import { fetchTrips } from "../api/trips";
import { fetchEarnings } from "../api/earnings";
import { fetchFuelLogs } from "../api/fuel";
import { fetchSavedLocations } from "../api/savedLocations";
import { registerGeofences } from "../geofencing/index";
import type { Vehicle, Shift, Earning, FuelLogWithVehicle, PaginatedResponse, SavedLocation } from "@mileclear/shared";
import type { TripWithVehicle } from "../api/trips";

export type HydrationProgressCallback = (
  step: string,
  done: number,
  total: number
) => void;

const TOTAL_STEPS = 6;

// 90 days ago in ISO format — limits how far back we hydrate
function ninetyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

// ── Check ──────────────────────────────────────────────────────────────────

export async function isHydrationComplete(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'hydration_complete'"
    );
    return row?.value === "1";
  } catch {
    return false;
  }
}

export async function resetHydration(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM tracking_state WHERE key = 'hydration_complete'"
  );
}

// ── Per-entity inserters ───────────────────────────────────────────────────

async function hydrateVehicles(vehicles: Vehicle[]): Promise<void> {
  if (!vehicles.length) return;
  const db = await getDatabase();
  const now = new Date().toISOString();

  // vehicles table does not exist in the local SQLite schema — vehicles are
  // API-only. We store them only if a local table is present; otherwise skip.
  const tableCheck = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='vehicles'"
  );
  if (!tableCheck) return;

  for (const v of vehicles) {
    await db.runAsync(
      `INSERT OR IGNORE INTO vehicles
         (id, make, model, year, fuel_type, vehicle_type, registration_plate,
          estimated_mpg, is_primary, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        v.id,
        v.make,
        v.model,
        v.year ?? null,
        v.fuelType,
        v.vehicleType,
        v.registrationPlate ?? null,
        v.estimatedMpg ?? null,
        v.isPrimary ? 1 : 0,
        now,
      ]
    );
  }
}

async function hydrateShifts(shifts: Shift[]): Promise<void> {
  if (!shifts.length) return;
  const db = await getDatabase();
  const now = new Date().toISOString();

  for (const s of shifts) {
    await db.runAsync(
      `INSERT OR IGNORE INTO shifts
         (id, vehicle_id, started_at, ended_at, status, synced_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        s.id,
        s.vehicleId ?? null,
        s.startedAt,
        s.endedAt ?? null,
        s.status,
        now,
      ]
    );
  }
}

async function hydrateTrips(trips: TripWithVehicle[]): Promise<void> {
  if (!trips.length) return;
  const db = await getDatabase();
  const now = new Date().toISOString();

  for (const t of trips) {
    await db.runAsync(
      `INSERT OR IGNORE INTO trips
         (id, shift_id, vehicle_id, start_lat, start_lng, end_lat, end_lng,
          start_address, end_address, distance_miles, started_at, ended_at,
          is_manual_entry, classification, platform_tag, notes, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id,
        t.shiftId ?? null,
        t.vehicleId ?? null,
        t.startLat,
        t.startLng,
        t.endLat ?? null,
        t.endLng ?? null,
        t.startAddress ?? null,
        t.endAddress ?? null,
        t.distanceMiles,
        t.startedAt,
        t.endedAt ?? null,
        t.isManualEntry ? 1 : 0,
        t.classification,
        t.platformTag ?? null,
        t.notes ?? null,
        now,
      ]
    );
  }
}

async function hydrateEarnings(earnings: Earning[]): Promise<void> {
  if (!earnings.length) return;
  const db = await getDatabase();
  const now = new Date().toISOString();

  for (const e of earnings) {
    await db.runAsync(
      `INSERT OR IGNORE INTO earnings
         (id, platform, amount_pence, period_start, period_end, source, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        e.id,
        e.platform,
        e.amountPence,
        e.periodStart,
        e.periodEnd,
        e.source,
        now,
      ]
    );
  }
}

async function hydrateFuelLogs(logs: FuelLogWithVehicle[]): Promise<void> {
  if (!logs.length) return;
  const db = await getDatabase();
  const now = new Date().toISOString();

  for (const f of logs) {
    await db.runAsync(
      `INSERT OR IGNORE INTO fuel_logs
         (id, vehicle_id, litres, cost_pence, station_name, odometer_reading,
          latitude, longitude, logged_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        f.id,
        f.vehicleId ?? null,
        f.litres,
        f.costPence,
        f.stationName ?? null,
        f.odometerReading ?? null,
        f.latitude ?? null,
        f.longitude ?? null,
        f.loggedAt,
        now,
      ]
    );
  }
}

async function hydrateSavedLocations(locations: SavedLocation[]): Promise<void> {
  // Full reconciliation against server truth. The old INSERT-OR-IGNORE
  // pattern was append-only — if a saved location was deleted on another
  // device (or via the web dashboard), the local copy stuck around and
  // kept attributing trips to "Home" / "St Roberts School" / etc long
  // after the server-side row was gone. The trip would then arrive at
  // the API tagged with names that no longer existed in saved_locations,
  // and the user would scratch their head trying to figure out why the
  // app "remembers" deleted places. Anthony 14 May 2026.
  const db = await getDatabase();
  const now = new Date().toISOString();
  const serverIds = new Set(locations.map((l) => l.id));

  // Don't blow away rows that haven't synced yet — they're in sync_queue
  // pending a CREATE. Once they upload they'll appear in the server
  // response on the next reconcile pass.
  const pendingCreates = await db.getAllAsync<{ entity_id: string }>(
    "SELECT entity_id FROM sync_queue WHERE entity_type = 'saved_location' AND operation = 'create'"
  );
  const pendingCreateIds = new Set(pendingCreates.map((r) => r.entity_id));

  // Same for pending DELETEs — the row needs to stay locally until the
  // server confirms the delete, otherwise the sync engine has nothing
  // to reference when it retries.
  const pendingDeletes = await db.getAllAsync<{ entity_id: string }>(
    "SELECT entity_id FROM sync_queue WHERE entity_type = 'saved_location' AND operation = 'delete'"
  );
  const pendingDeleteIds = new Set(pendingDeletes.map((r) => r.entity_id));

  const localRows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM saved_locations"
  );
  for (const row of localRows) {
    if (serverIds.has(row.id)) continue;
    if (pendingCreateIds.has(row.id)) continue;
    if (pendingDeleteIds.has(row.id)) continue;
    await db.runAsync("DELETE FROM saved_locations WHERE id = ?", [row.id]);
  }

  for (const loc of locations) {
    await db.runAsync(
      `INSERT OR REPLACE INTO saved_locations
         (id, name, location_type, latitude, longitude, radius_meters,
          geofence_enabled, synced_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        loc.id,
        loc.name,
        loc.locationType,
        loc.latitude,
        loc.longitude,
        loc.radiusMeters,
        loc.geofenceEnabled ? 1 : 0,
        now,
        loc.createdAt,
        loc.updatedAt,
      ]
    );
  }
}

/**
 * Public reconcile pass for saved locations. Unlike `hydrateLocalData`
 * (which runs once per fresh install, gated by `hydration_complete`),
 * this is safe to call repeatedly — at app start, after sync flush, or
 * when the saved-locations screen loads. It reaches out to the server,
 * pulls authoritative state, deletes local rows the server no longer
 * has, and upserts what it does. Pending sync_queue operations are
 * preserved so offline edits aren't lost.
 *
 * No-ops on network failure — better to keep stale data than wipe it.
 */
export async function reconcileSavedLocations(): Promise<void> {
  try {
    const result = (await fetchSavedLocations()) as { data: SavedLocation[] };
    await hydrateSavedLocations(result.data);
  } catch (err) {
    console.warn("[hydrate] saved-locations reconcile failed:", err);
  }
}

// ── Main hydration entry point ─────────────────────────────────────────────

export async function hydrateLocalData(
  onProgress?: HydrationProgressCallback
): Promise<void> {
  // Guard: skip if already hydrated
  const alreadyDone = await isHydrationComplete();
  if (alreadyDone) return;

  const from = ninetyDaysAgo();

  // Fetch all five entity types in parallel. Each result is wrapped in an
  // object so that a partial failure is recoverable — we carry on with
  // whatever data we have and still mark hydration complete at the end.
  type FetchResult<T> = { ok: true; data: T } | { ok: false; error: unknown };

  // Per-fetch timeout. A constrained cellular path (e.g. iCloud Private Relay)
  // can leave a fetch hanging indefinitely — it never resolves AND never
  // rejects — so the Promise.all below would never settle and the user is
  // trapped on the "0/6" hydration overlay forever (Anthony, 3 June: app loaded
  // on company WiFi but hung at 0/6 on 5G). The timeout converts a hung fetch
  // into a normal failure: attempt() catches it, hydration carries on with
  // whatever arrived and marks itself complete, and the sync engine backfills
  // the rest once the connection recovers.
  const FETCH_TIMEOUT_MS = 12000;

  function withTimeout<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("hydrate fetch timed out")),
        FETCH_TIMEOUT_MS
      );
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }

  async function attempt<T>(fn: () => Promise<T>): Promise<FetchResult<T>> {
    try {
      return { ok: true, data: await withTimeout(fn()) };
    } catch (error) {
      console.warn("[hydrate] fetch failed:", error);
      return { ok: false, error };
    }
  }

  onProgress?.("Fetching your data...", 0, TOTAL_STEPS);

  const [vehiclesResult, shiftsResult, tripsResult, earningsResult, fuelResult, savedLocationsResult] =
    await Promise.all([
      attempt(() => fetchVehicles()),
      attempt(() => fetchShifts()),
      attempt(() =>
        // 100 (was 200) — halves the largest hydration payload (~310 KB -> ~155
        // KB) so it's far likelier to complete on a marginal cellular link. The
        // rest of the history loads on demand from the server / via sync.
        fetchTrips({ from, pageSize: 100 }) as Promise<PaginatedResponse<TripWithVehicle>>
      ),
      attempt(() =>
        fetchEarnings({ from, pageSize: 100 }) as Promise<PaginatedResponse<Earning>>
      ),
      attempt(() =>
        fetchFuelLogs({ from, pageSize: 100 }) as Promise<PaginatedResponse<FuelLogWithVehicle>>
      ),
      attempt(() =>
        fetchSavedLocations() as Promise<{ data: SavedLocation[] }>
      ),
    ]);

  // Insert fetched data step by step, reporting progress along the way.
  // Errors during insertion are logged but do not abort the rest.

  onProgress?.("Syncing vehicles...", 1, TOTAL_STEPS);
  try {
    if (vehiclesResult.ok) {
      await hydrateVehicles(vehiclesResult.data.data);
    }
  } catch (err) {
    console.warn("[hydrate] vehicle insert failed:", err);
  }

  onProgress?.("Syncing shifts...", 2, TOTAL_STEPS);
  try {
    if (shiftsResult.ok) {
      await hydrateShifts(shiftsResult.data.data);
    }
  } catch (err) {
    console.warn("[hydrate] shift insert failed:", err);
  }

  onProgress?.("Syncing trips...", 3, TOTAL_STEPS);
  try {
    if (tripsResult.ok) {
      await hydrateTrips(tripsResult.data.data);
    }
  } catch (err) {
    console.warn("[hydrate] trip insert failed:", err);
  }

  onProgress?.("Syncing earnings...", 4, TOTAL_STEPS);
  try {
    if (earningsResult.ok) {
      await hydrateEarnings(earningsResult.data.data);
    }
  } catch (err) {
    console.warn("[hydrate] earnings insert failed:", err);
  }

  onProgress?.("Syncing fuel logs...", 5, TOTAL_STEPS);
  try {
    if (fuelResult.ok) {
      await hydrateFuelLogs(fuelResult.data.data);
    }
  } catch (err) {
    console.warn("[hydrate] fuel log insert failed:", err);
  }

  onProgress?.("Syncing saved locations...", 6, TOTAL_STEPS);
  try {
    if (savedLocationsResult.ok) {
      await hydrateSavedLocations(savedLocationsResult.data.data);
      // Register geofences now that locations are in SQLite
      await registerGeofences();
    }
  } catch (err) {
    console.warn("[hydrate] saved locations insert failed:", err);
  }

  // Mark hydration complete as long as SOMETHING came through. Partial data is
  // fine — the sync engine backfills gaps, and this prevents an infinite loop
  // where a transient error on one endpoint re-runs the whole process on every
  // login. But if EVERY fetch failed (fully offline, or a cellular path that
  // timed out all six), leave hydration incomplete so it retries on the next
  // launch rather than stranding the user with an empty, "complete" local store.
  const anySucceeded =
    vehiclesResult.ok ||
    shiftsResult.ok ||
    tripsResult.ok ||
    earningsResult.ok ||
    fuelResult.ok ||
    savedLocationsResult.ok;

  if (!anySucceeded) {
    console.warn(
      "[hydrate] every fetch failed — leaving hydration incomplete to retry next launch"
    );
    return;
  }

  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('hydration_complete', '1')"
  );
}
