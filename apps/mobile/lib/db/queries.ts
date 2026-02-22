// Local SQLite read helpers for offline-first list/edit screens
// Converts snake_case SQLite rows to camelCase API-compatible shapes

import { getDatabase } from "./index";

// ─── Trips ──────────────────────────────────────────────────────────────────

interface LocalTripRow {
  id: string;
  shift_id: string | null;
  vehicle_id: string | null;
  start_lat: number;
  start_lng: number;
  end_lat: number | null;
  end_lng: number | null;
  start_address: string | null;
  end_address: string | null;
  distance_miles: number;
  started_at: string;
  ended_at: string | null;
  is_manual_entry: number;
  classification: string;
  platform_tag: string | null;
  notes: string | null;
  synced_at: string | null;
}

function mapTripRow(row: LocalTripRow, isLocal: boolean) {
  return {
    id: row.id,
    shiftId: row.shift_id,
    vehicleId: row.vehicle_id,
    startLat: row.start_lat,
    startLng: row.start_lng,
    endLat: row.end_lat,
    endLng: row.end_lng,
    startAddress: row.start_address,
    endAddress: row.end_address,
    distanceMiles: row.distance_miles,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    isManualEntry: row.is_manual_entry === 1,
    classification: row.classification,
    platformTag: row.platform_tag,
    notes: row.notes,
    vehicle: null,
    _isLocal: isLocal,
  };
}

export async function getLocalTrips(opts?: { classification?: string }) {
  const db = await getDatabase();
  let sql = "SELECT * FROM trips";
  const params: string[] = [];
  if (opts?.classification) {
    sql += " WHERE classification = ?";
    params.push(opts.classification);
  }
  sql += " ORDER BY started_at DESC";
  const rows = await db.getAllAsync<LocalTripRow>(sql, params);
  return rows.map((r) => mapTripRow(r, r.synced_at == null));
}

export async function getLocalUnsyncedTrips(opts?: { classification?: string }) {
  const db = await getDatabase();
  let sql = "SELECT * FROM trips WHERE synced_at IS NULL";
  const params: string[] = [];
  if (opts?.classification) {
    sql += " AND classification = ?";
    params.push(opts.classification);
  }
  sql += " ORDER BY started_at DESC";
  const rows = await db.getAllAsync<LocalTripRow>(sql, params);
  return rows.map((r) => mapTripRow(r, true));
}

export async function getLocalTrip(id: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<LocalTripRow>("SELECT * FROM trips WHERE id = ?", [id]);
  if (!row) return null;
  return mapTripRow(row, row.synced_at == null);
}

// ─── Fuel Logs ──────────────────────────────────────────────────────────────

interface LocalFuelLogRow {
  id: string;
  vehicle_id: string | null;
  litres: number;
  cost_pence: number;
  station_name: string | null;
  odometer_reading: number | null;
  logged_at: string;
  synced_at: string | null;
}

function mapFuelLogRow(row: LocalFuelLogRow, isLocal: boolean) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    litres: row.litres,
    costPence: row.cost_pence,
    stationName: row.station_name,
    odometerReading: row.odometer_reading,
    loggedAt: row.logged_at,
    vehicle: null,
    _isLocal: isLocal,
  };
}

export async function getLocalFuelLogs() {
  const db = await getDatabase();
  const rows = await db.getAllAsync<LocalFuelLogRow>(
    "SELECT * FROM fuel_logs ORDER BY logged_at DESC"
  );
  return rows.map((r) => mapFuelLogRow(r, r.synced_at == null));
}

export async function getLocalUnsyncedFuelLogs() {
  const db = await getDatabase();
  const rows = await db.getAllAsync<LocalFuelLogRow>(
    "SELECT * FROM fuel_logs WHERE synced_at IS NULL ORDER BY logged_at DESC"
  );
  return rows.map((r) => mapFuelLogRow(r, true));
}

export async function getLocalFuelLog(id: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<LocalFuelLogRow>(
    "SELECT * FROM fuel_logs WHERE id = ?",
    [id]
  );
  if (!row) return null;
  return mapFuelLogRow(row, row.synced_at == null);
}

// ─── Earnings ───────────────────────────────────────────────────────────────

interface LocalEarningRow {
  id: string;
  platform: string;
  amount_pence: number;
  period_start: string;
  period_end: string;
  source: string;
  synced_at: string | null;
}

function mapEarningRow(row: LocalEarningRow, isLocal: boolean) {
  return {
    id: row.id,
    platform: row.platform,
    amountPence: row.amount_pence,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    source: row.source,
    _isLocal: isLocal,
  };
}

export async function getLocalEarnings(opts?: { platform?: string }) {
  const db = await getDatabase();
  let sql = "SELECT * FROM earnings";
  const params: string[] = [];
  if (opts?.platform) {
    sql += " WHERE platform = ?";
    params.push(opts.platform);
  }
  sql += " ORDER BY period_start DESC";
  const rows = await db.getAllAsync<LocalEarningRow>(sql, params);
  return rows.map((r) => mapEarningRow(r, r.synced_at == null));
}

export async function getLocalUnsyncedEarnings(opts?: { platform?: string }) {
  const db = await getDatabase();
  let sql = "SELECT * FROM earnings WHERE synced_at IS NULL";
  const params: string[] = [];
  if (opts?.platform) {
    sql += " AND platform = ?";
    params.push(opts.platform);
  }
  sql += " ORDER BY period_start DESC";
  const rows = await db.getAllAsync<LocalEarningRow>(sql, params);
  return rows.map((r) => mapEarningRow(r, true));
}

export async function getLocalEarning(id: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<LocalEarningRow>(
    "SELECT * FROM earnings WHERE id = ?",
    [id]
  );
  if (!row) return null;
  return mapEarningRow(row, row.synced_at == null);
}
