// One-shot backfill for "ghost trips" - trips that exist in local SQLite with
// synced_at IS NULL but have no queued CREATE. Caused by a bug in the
// geofencing path that inserted directly into the trips table without going
// through syncCreateTrip or enqueueSync, leaving rows orphaned forever.
// Fix-forward: every cold start, sweep these orphans and enqueue CREATEs.
// Idempotent - the existence check on existing CREATE rows means subsequent
// runs are no-ops.

import { getDatabase } from "../db/index";
import { enqueueSync } from "./queue";

interface OrphanTripRow {
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
  classification: string;
  platform_tag: string | null;
  category: string | null;
  business_purpose: string | null;
  notes: string | null;
}

interface CoordRow {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recorded_at: string;
}

export async function backfillGhostTrips(): Promise<number> {
  const db = await getDatabase();

  const orphans = await db.getAllAsync<OrphanTripRow>(
    `SELECT t.id, t.shift_id, t.vehicle_id, t.start_lat, t.start_lng,
            t.end_lat, t.end_lng, t.start_address, t.end_address,
            t.distance_miles, t.started_at, t.ended_at, t.classification,
            t.platform_tag, t.category, t.business_purpose, t.notes
     FROM trips t
     WHERE t.synced_at IS NULL
       AND t.id NOT IN (
         SELECT entity_id FROM sync_queue
         WHERE entity_type = 'trip' AND action = 'create'
       )`
  );

  if (orphans.length === 0) return 0;

  const now = new Date().toISOString();

  for (const trip of orphans) {
    const coords = await db.getAllAsync<CoordRow>(
      `SELECT lat, lng, speed, accuracy, recorded_at
       FROM coordinates WHERE trip_id = ? ORDER BY recorded_at ASC`,
      [trip.id]
    );

    // Strip the local-only `__unconfirmed__|...` / `__shaded__|...` markers
    // before sending to the server - they're UI state, not data.
    const cleanNotes =
      trip.notes &&
      !trip.notes.startsWith("__unconfirmed__") &&
      !trip.notes.startsWith("__shaded__")
        ? trip.notes
        : undefined;

    // Revive any update/delete rows that hit permanently_failed because the
    // server didn't have the trip yet. Once the CREATE we're about to enqueue
    // succeeds, processSyncQueue's cascade rewrites their entity_id to the new
    // server UUID and they replay cleanly.
    await db.runAsync(
      `UPDATE sync_queue
       SET status = 'pending', retry_count = 0, last_error = NULL, updated_at = ?
       WHERE entity_type = 'trip' AND entity_id = ?
         AND status = 'permanently_failed'
         AND action IN ('update', 'delete')`,
      [now, trip.id]
    );

    await enqueueSync("trip", trip.id, "create", {
      shiftId: trip.shift_id ?? undefined,
      vehicleId: trip.vehicle_id ?? undefined,
      startLat: trip.start_lat,
      startLng: trip.start_lng,
      endLat: trip.end_lat ?? undefined,
      endLng: trip.end_lng ?? undefined,
      startAddress: trip.start_address ?? undefined,
      endAddress: trip.end_address ?? undefined,
      distanceMiles: trip.distance_miles,
      startedAt: trip.started_at,
      endedAt: trip.ended_at ?? undefined,
      classification: trip.classification,
      platformTag: trip.platform_tag ?? undefined,
      category: trip.category ?? undefined,
      businessPurpose: trip.business_purpose ?? undefined,
      notes: cleanNotes,
      coordinates: coords.map((c) => ({
        lat: c.lat,
        lng: c.lng,
        speed: c.speed,
        accuracy: c.accuracy,
        recordedAt: c.recorded_at,
      })),
    });
  }

  return orphans.length;
}
