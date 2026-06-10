// Last-saved-trip signal, two consumers with different lifetimes:
//
//  - PostTripCard (personal dashboard): consume-once celebration, session-only.
//  - TripStatusStrip (dashboard status surface): persistent answer to "did my
//    last trip actually save?" — survives restarts via tracking_state, so it
//    must be written by EVERY save path: manual trip-form save, auto-detect
//    finalize, and merge-extend. Phase 1 of the reliability work (status
//    clarity, point 10).

import { getDatabase } from "../db/index";

export interface LastSavedTrip {
  distanceMiles: number;
  startAddress: string | null;
  endAddress: string | null;
  savedAt: number; // Date.now()
  // Local/server trip id when known. Null when the save was queued offline
  // (no server id yet) — the status strip falls back to aggregate queue state.
  tripId?: string | null;
  source?: "manual" | "auto" | "merged";
}

let _lastSaved: LastSavedTrip | null = null;

export function setLastSavedTrip(trip: LastSavedTrip): void {
  _lastSaved = trip;
}

/** Returns and clears the last saved trip (consume-once pattern). */
export function consumeLastSavedTrip(): LastSavedTrip | null {
  const trip = _lastSaved;
  _lastSaved = null;
  return trip;
}

const PERSIST_KEY = "last_saved_trip";

/**
 * Record a saved trip in BOTH the session store (PostTripCard) and
 * tracking_state (TripStatusStrip). Persistence is best-effort — a status
 * surface must never be able to fail a save.
 */
export async function recordLastSavedTrip(trip: LastSavedTrip): Promise<void> {
  _lastSaved = trip;
  try {
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
      [PERSIST_KEY, JSON.stringify(trip)]
    );
  } catch {
    // best-effort
  }
}

/** Read the persisted last-saved trip; null when absent or unparseable. */
export async function readPersistedLastSavedTrip(): Promise<LastSavedTrip | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [PERSIST_KEY]
    );
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value) as LastSavedTrip;
    if (typeof parsed?.savedAt !== "number" || typeof parsed?.distanceMiles !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
