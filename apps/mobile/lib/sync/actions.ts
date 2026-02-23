// Sync-aware write wrappers
// Write to SQLite first, enqueue for sync, then attempt API call immediately.
// Network errors are caught (item stays queued). API validation errors (4xx) re-throw.

import { randomUUID } from "expo-crypto";
import type { SQLiteBindValue } from "expo-sqlite";
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
    const now = new Date().toISOString();
    const serverId = result.data.id;
    // Reconcile local ID to server-assigned ID
    await db.runAsync("UPDATE trips SET id = ?, synced_at = ? WHERE id = ?", [
      serverId, now, localId,
    ]);
    await db.runAsync(
      "UPDATE sync_queue SET entity_id = ?, status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'trip' AND action = 'create'",
      [serverId, now, localId]
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
  const db = await getDatabase();

  // Write to local SQLite first
  const setClauses: string[] = [];
  const values: SQLiteBindValue[] = [];
  if (data.classification !== undefined) { setClauses.push("classification = ?"); values.push(data.classification); }
  if (data.platformTag !== undefined) { setClauses.push("platform_tag = ?"); values.push(data.platformTag); }
  if (data.notes !== undefined) { setClauses.push("notes = ?"); values.push(data.notes); }
  if (data.endAddress !== undefined) { setClauses.push("end_address = ?"); values.push(data.endAddress); }
  if (data.endLat !== undefined) { setClauses.push("end_lat = ?"); values.push(data.endLat); }
  if (data.endLng !== undefined) { setClauses.push("end_lng = ?"); values.push(data.endLng); }
  if (data.endedAt !== undefined) { setClauses.push("ended_at = ?"); values.push(data.endedAt); }
  if (setClauses.length > 0) {
    values.push(id);
    await db.runAsync(`UPDATE trips SET ${setClauses.join(", ")} WHERE id = ?`, values);
  }

  await enqueueSync("trip", id, "update", { id, ...data } as unknown as Record<string, unknown>);

  try {
    const result = await apiUpdateTrip(id, data);
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'trip' AND action = 'update' AND status = 'pending'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    await db.runAsync(
      "DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'trip' AND action = 'update' AND status = 'pending'",
      [id]
    );
    throw err;
  }
}

export async function syncDeleteTrip(id: string) {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM trips WHERE id = ?", [id]);
  await enqueueSync("trip", id, "delete");

  try {
    const result = await apiDeleteTrip(id);
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'trip' AND action = 'delete'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    // API validation error — remove from queue (local row already gone, which is fine)
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
    const now = new Date().toISOString();
    const serverId = result.data.id;
    await db.runAsync("UPDATE earnings SET id = ?, synced_at = ? WHERE id = ?", [
      serverId, now, localId,
    ]);
    await db.runAsync(
      "UPDATE sync_queue SET entity_id = ?, status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'earning' AND action = 'create'",
      [serverId, now, localId]
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
  const db = await getDatabase();

  // Write to local SQLite first
  const setClauses: string[] = [];
  const values: SQLiteBindValue[] = [];
  if (data.platform !== undefined) { setClauses.push("platform = ?"); values.push(data.platform); }
  if (data.amountPence !== undefined) { setClauses.push("amount_pence = ?"); values.push(data.amountPence); }
  if (data.periodStart !== undefined) { setClauses.push("period_start = ?"); values.push(data.periodStart); }
  if (data.periodEnd !== undefined) { setClauses.push("period_end = ?"); values.push(data.periodEnd); }
  if (setClauses.length > 0) {
    values.push(id);
    await db.runAsync(`UPDATE earnings SET ${setClauses.join(", ")} WHERE id = ?`, values);
  }

  await enqueueSync("earning", id, "update", { id, ...data } as unknown as Record<string, unknown>);

  try {
    const result = await apiUpdateEarning(id, data);
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'earning' AND action = 'update' AND status = 'pending'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    await db.runAsync(
      "DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'earning' AND action = 'update' AND status = 'pending'",
      [id]
    );
    throw err;
  }
}

export async function syncDeleteEarning(id: string) {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM earnings WHERE id = ?", [id]);
  await enqueueSync("earning", id, "delete");

  try {
    const result = await apiDeleteEarning(id);
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'earning' AND action = 'delete'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
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
    `INSERT INTO fuel_logs (id, vehicle_id, litres, cost_pence, station_name, odometer_reading, latitude, longitude, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      localId,
      data.vehicleId ?? null,
      data.litres,
      data.costPence,
      data.stationName ?? null,
      data.odometerReading ?? null,
      data.latitude ?? null,
      data.longitude ?? null,
      data.loggedAt ?? new Date().toISOString(),
    ]
  );

  await enqueueSync("fuel_log", localId, "create", data as unknown as Record<string, unknown>);

  try {
    const result = await apiCreateFuelLog(data);
    const now = new Date().toISOString();
    const serverId = result.data.id;
    await db.runAsync("UPDATE fuel_logs SET id = ?, synced_at = ? WHERE id = ?", [
      serverId, now, localId,
    ]);
    await db.runAsync(
      "UPDATE sync_queue SET entity_id = ?, status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'fuel_log' AND action = 'create'",
      [serverId, now, localId]
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
  const db = await getDatabase();

  // Write to local SQLite first
  const setClauses: string[] = [];
  const values: SQLiteBindValue[] = [];
  if (data.vehicleId !== undefined) { setClauses.push("vehicle_id = ?"); values.push(data.vehicleId); }
  if (data.litres !== undefined) { setClauses.push("litres = ?"); values.push(data.litres); }
  if (data.costPence !== undefined) { setClauses.push("cost_pence = ?"); values.push(data.costPence); }
  if (data.stationName !== undefined) { setClauses.push("station_name = ?"); values.push(data.stationName); }
  if (data.odometerReading !== undefined) { setClauses.push("odometer_reading = ?"); values.push(data.odometerReading); }
  if (data.latitude !== undefined) { setClauses.push("latitude = ?"); values.push(data.latitude); }
  if (data.longitude !== undefined) { setClauses.push("longitude = ?"); values.push(data.longitude); }
  if (data.loggedAt !== undefined) { setClauses.push("logged_at = ?"); values.push(data.loggedAt); }
  if (setClauses.length > 0) {
    values.push(id);
    await db.runAsync(`UPDATE fuel_logs SET ${setClauses.join(", ")} WHERE id = ?`, values);
  }

  await enqueueSync("fuel_log", id, "update", { id, ...data } as unknown as Record<string, unknown>);

  try {
    const result = await apiUpdateFuelLog(id, data);
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'fuel_log' AND action = 'update' AND status = 'pending'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    await db.runAsync(
      "DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'fuel_log' AND action = 'update' AND status = 'pending'",
      [id]
    );
    throw err;
  }
}

export async function syncDeleteFuelLog(id: string) {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM fuel_logs WHERE id = ?", [id]);
  await enqueueSync("fuel_log", id, "delete");

  try {
    const result = await apiDeleteFuelLog(id);
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'fuel_log' AND action = 'delete'",
      [new Date().toISOString(), id]
    );
    return result;
  } catch (err) {
    if (isNetworkError(err)) return null;
    await db.runAsync(
      "DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = 'fuel_log' AND action = 'delete' AND status = 'pending'",
      [id]
    );
    throw err;
  }
}
