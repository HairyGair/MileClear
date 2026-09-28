// The POST /trips body for a trip the phone holds, built from its own SQLite
// row. Used where the queue has no usable create body: the ghost-trip sweep
// (a row inserted without ever being queued) and a parked "create" whose body
// is really an edit (the pre-28 Sep 2026 missing-target rule turned queued
// edits into creates without changing the body). Pure, so it can be tested.

export interface LocalTripRow {
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

export interface LocalCoordRow {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recorded_at: string;
}

/** Local-only lock ids that are not shifts the server knows. Sending one as
 *  shiftId used to fail validation and lose the trip (see processShiftTrips). */
const PSEUDO_SHIFT_IDS = new Set(["__quick_trip__", "__arrived_pending__"]);

export function tripCreateBodyFromRow(row: LocalTripRow, coords: LocalCoordRow[]): Record<string, unknown> {
  // Strip the local-only `__unconfirmed__|...` / `__shaded__|...` markers
  // before sending to the server - they're UI state, not data.
  const cleanNotes =
    row.notes && !row.notes.startsWith("__unconfirmed__") && !row.notes.startsWith("__shaded__")
      ? row.notes
      : undefined;
  return {
    shiftId: row.shift_id && !PSEUDO_SHIFT_IDS.has(row.shift_id) ? row.shift_id : undefined,
    vehicleId: row.vehicle_id ?? undefined,
    startLat: row.start_lat,
    startLng: row.start_lng,
    endLat: row.end_lat ?? undefined,
    endLng: row.end_lng ?? undefined,
    startAddress: row.start_address ?? undefined,
    endAddress: row.end_address ?? undefined,
    distanceMiles: row.distance_miles,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    classification: row.classification,
    platformTag: row.platform_tag ?? undefined,
    category: row.category ?? undefined,
    businessPurpose: row.business_purpose ?? undefined,
    notes: cleanNotes,
    coordinates: coords.map((c) => ({
      lat: c.lat,
      lng: c.lng,
      speed: c.speed,
      accuracy: c.accuracy,
      recordedAt: c.recorded_at,
    })),
  };
}

/** True for the local-only lock ids, which must never be sent as a shift. */
export function isPseudoShiftId(id: string | null | undefined): boolean {
  return id != null && PSEUDO_SHIFT_IDS.has(id);
}
