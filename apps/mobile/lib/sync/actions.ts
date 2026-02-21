// Sync-aware write wrappers
// Write to SQLite first, enqueue for sync, then attempt API call immediately.
// Network errors are caught (item stays queued). API validation errors (4xx) re-throw.

import { randomUUID } from "expo-crypto";
import { getDatabase } from "../db/index";
import { enqueueSync } from "./queue";
import {
  createTrip as apiCreateTrip,
  updateTrip as apiUpdateTrip,
  deleteTrip as apiDeleteTrip,
} from "../api/trips";
import type { CreateTripData, UpdateTripData } from "../api/trips";
import {
  createEarning as apiCreateEarning,
  updateEarning as apiUpdateEarning,
  deleteEarning as apiDeleteEarning,
} from "../api/earnings";
import type { CreateEarningData, UpdateEarningData } from "../api/earnings";
import {
  createFuelLog as apiCreateFuelLog,
  updateFuelLog as apiUpdateFuelLog,
  deleteFuelLog as apiDeleteFuelLog,
} from "../api/fuel";
import type { CreateFuelLogData, UpdateFuelLogData } from "../api/fuel";

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message.includes("Network request failed")) {
    return true;
  }
  if (err instanceof Error && err.message.includes("Network request failed")) {
    return true;
  }
  return false;
}

// ─── Trips ───────────────────────────────────────────────────────────────────

export async function syncCreateTrip(data: CreateTripData) {
  const localId = randomUUID();
  const db = await getDatabase();

  // Write to local SQLite
  await db.runAsync(
    `INSERT INTO trips (id, shift_id, vehicle_id, start_lat, start_lng, end_lat, end_lng,
      start_address, end_address, distance_miles, started_at, ended_at,
      is_manual_entry, classification, platform_tag, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      localId,
      data.shiftId ?? null,
      data.vehicleId ?? null,
      data.startLat,
      data.startLng,
      data.endLat ?? null,
      data.endLng ?? null,
      data.startAddress ?? null,
      data.endAddress ?? null,
      data.distanceMiles ?? 0,
      data.startedAt,
      data.endedAt ?? null,
      data.coordinates ? 0 : 1,
      data.classification ?? "business",
      data.platformTag ?? null,
      data.notes ?? null,
    ]
  );

  // Enqueue for sync
  await enqueueSync("trip", localId, "create", data as unknown as Record<string, unknown>);

  // Attempt API call immediately
  try {
    const result = await apiCreateTrip(data);
    // Mark synced — update local ID to server ID
    await db.runAsync("UPDATE trips SET synced_at = ? WHERE id = ?", [
      new Date().toISOString(),
      localId,
    ]);
    // Remove from queue on success
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'trip' AND action = 'create'",
      [new Date().toISOString(), localId]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) {
      // Swallow — stays queued for later sync
      return null;
    }
    // API validation error — remove from queue and re-throw
    await db.runAsync("DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'trip'", [localId]);
    await db.runAsync("DELETE FROM trips WHERE id = ?", [localId]);
    throw err;
  }
}

export async function syncUpdateTrip(id: string, data: UpdateTripData) {
  await enqueueSync("trip", id, "update", { id, ...data } as unknown as Record<string, unknown>);

  try {
    const result = await apiUpdateTrip(id, data);
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'trip' AND action = 'update' AND status = 'pending'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    const db = await getDatabase();
    await db.runAsync(
      "DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'trip' AND action = 'update' AND status = 'pending'",
      [id]
    );
    throw err;
  }
}

export async function syncDeleteTrip(id: string) {
  await enqueueSync("trip", id, "delete");

  try {
    const result = await apiDeleteTrip(id);
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'trip' AND action = 'delete'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    const db = await getDatabase();
    await db.runAsync(
      "DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'trip' AND action = 'delete' AND status = 'pending'",
      [id]
    );
    throw err;
  }
}

// ─── Earnings ────────────────────────────────────────────────────────────────

export async function syncCreateEarning(data: CreateEarningData) {
  const localId = randomUUID();
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO earnings (id, platform, amount_pence, period_start, period_end, source)
     VALUES (?, ?, ?, ?, ?, 'manual')`,
    [localId, data.platform, data.amountPence, data.periodStart, data.periodEnd]
  );

  await enqueueSync("earning", localId, "create", data as unknown as Record<string, unknown>);

  try {
    const result = await apiCreateEarning(data);
    await db.runAsync("UPDATE earnings SET synced_at = ? WHERE id = ?", [
      new Date().toISOString(),
      localId,
    ]);
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'earning' AND action = 'create'",
      [new Date().toISOString(), localId]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    await db.runAsync("DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'earning'", [localId]);
    await db.runAsync("DELETE FROM earnings WHERE id = ?", [localId]);
    throw err;
  }
}

export async function syncUpdateEarning(id: string, data: UpdateEarningData) {
  await enqueueSync("earning", id, "update", { id, ...data } as unknown as Record<string, unknown>);

  try {
    const result = await apiUpdateEarning(id, data);
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'earning' AND action = 'update' AND status = 'pending'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    const db = await getDatabase();
    await db.runAsync(
      "DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'earning' AND action = 'update' AND status = 'pending'",
      [id]
    );
    throw err;
  }
}

export async function syncDeleteEarning(id: string) {
  await enqueueSync("earning", id, "delete");

  try {
    const result = await apiDeleteEarning(id);
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'earning' AND action = 'delete'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    const db = await getDatabase();
    await db.runAsync(
      "DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'earning' AND action = 'delete' AND status = 'pending'",
      [id]
    );
    throw err;
  }
}

// ─── Fuel Logs ───────────────────────────────────────────────────────────────

export async function syncCreateFuelLog(data: CreateFuelLogData) {
  const localId = randomUUID();
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO fuel_logs (id, vehicle_id, litres, cost_pence, station_name, odometer_reading, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      localId,
      data.vehicleId ?? null,
      data.litres,
      data.costPence,
      data.stationName ?? null,
      data.odometerReading ?? null,
      data.loggedAt ?? new Date().toISOString(),
    ]
  );

  await enqueueSync("fuel_log", localId, "create", data as unknown as Record<string, unknown>);

  try {
    const result = await apiCreateFuelLog(data);
    await db.runAsync("UPDATE fuel_logs SET synced_at = ? WHERE id = ?", [
      new Date().toISOString(),
      localId,
    ]);
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'fuel_log' AND action = 'create'",
      [new Date().toISOString(), localId]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    await db.runAsync("DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'fuel_log'", [localId]);
    await db.runAsync("DELETE FROM fuel_logs WHERE id = ?", [localId]);
    throw err;
  }
}

export async function syncUpdateFuelLog(id: string, data: UpdateFuelLogData) {
  await enqueueSync("fuel_log", id, "update", { id, ...data } as unknown as Record<string, unknown>);

  try {
    const result = await apiUpdateFuelLog(id, data);
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'fuel_log' AND action = 'update' AND status = 'pending'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    const db = await getDatabase();
    await db.runAsync(
      "DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'fuel_log' AND action = 'update' AND status = 'pending'",
      [id]
    );
    throw err;
  }
}

export async function syncDeleteFuelLog(id: string) {
  await enqueueSync("fuel_log", id, "delete");

  try {
    const result = await apiDeleteFuelLog(id);
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'fuel_log' AND action = 'delete'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    const db = await getDatabase();
    await db.runAsync(
      "DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'fuel_log' AND action = 'delete' AND status = 'pending'",
      [id]
    );
    throw err;
  }
}
