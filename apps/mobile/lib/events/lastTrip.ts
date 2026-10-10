// Last-saved-trip signal: the persistent answer to "did my last trip actually
// save?". It survives restarts via tracking_state, so it must be written by
// EVERY save path: manual trip-form save, auto-detect finalize, and
// merge-extend. Read by the native headless task. (Home's Last trip card reads
// the trips table itself; the old session-only PostTripCard and the dashboard
// trip status strip that used the rest of this are gone.)

import { getDatabase } from "../db/index";

export interface LastSavedTrip {
  distanceMiles: number;
  startAddress: string | null;
  endAddress: string | null;
  savedAt: number; // Date.now()
  // Local/server trip id when known. Null when the save was queued offline
  // (no server id yet).
  tripId?: string | null;
  source?: "manual" | "auto" | "merged";
}

const PERSIST_KEY = "last_saved_trip";

/**
 * Record a saved trip in tracking_state. Persistence is best-effort — a status
 * surface must never be able to fail a save.
 */
export async function recordLastSavedTrip(trip: LastSavedTrip): Promise<void> {
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
