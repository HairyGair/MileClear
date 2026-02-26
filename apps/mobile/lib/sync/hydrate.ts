// Data hydration service — pulls server data into local SQLite on first login
// or after a fresh install. Runs once per device; subsequent logins skip it.

import { getDatabase } from "../db/index";
import { fetchVehicles } from "../api/vehicles";
import { fetchShifts } from "../api/shifts";
import { fetchTrips } from "../api/trips";
import { fetchEarnings } from "../api/earnings";
import { fetchFuelLogs } from "../api/fuel";
import type { Vehicle, Shift, Earning, FuelLogWithVehicle, PaginatedResponse } from "@mileclear/shared";
import type { TripWithVehicle } from "../api/trips";

export type HydrationProgressCallback = (
  step: string,
  done: number,
  total: number
) => void;

const TOTAL_STEPS = 5;

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

  async function attempt<T>(fn: () => Promise<T>): Promise<FetchResult<T>> {
    try {
      return { ok: true, data: await fn() };
    } catch (error) {
      console.warn("[hydrate] fetch failed:", error);
      return { ok: false, error };
    }
  }

  onProgress?.("Fetching your data...", 0, TOTAL_STEPS);

  const [vehiclesResult, shiftsResult, tripsResult, earningsResult, fuelResult] =
    await Promise.all([
      attempt(() => fetchVehicles()),
      attempt(() => fetchShifts()),
      attempt(() =>
        fetchTrips({ from, pageSize: 200 }) as Promise<PaginatedResponse<TripWithVehicle>>
      ),
      attempt(() =>
        fetchEarnings({ from, pageSize: 100 }) as Promise<PaginatedResponse<Earning>>
      ),
      attempt(() =>
        fetchFuelLogs({ from, pageSize: 100 }) as Promise<PaginatedResponse<FuelLogWithVehicle>>
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

  // Mark hydration complete regardless of partial failures. This prevents
  // an infinite loop where a transient error on one endpoint re-runs the
  // whole process on every subsequent login. The sync engine will fill
  // any gaps from the server side going forward.
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('hydration_complete', '1')"
  );
}
