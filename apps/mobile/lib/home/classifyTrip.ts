// One-tap Business / Personal from Home's Last trip card.
//
// The same path the trip summary uses (trip-form applyQuickChange): SQLite
// first, then the sync queue, so it works with no signal and shows on Trips at
// once. The platform tag is sent along because route learning reads it.

import { getDatabase } from "../db/index";
import { syncUpdateTrip } from "../sync/actions";
import { markLiveActivityClassified } from "../liveActivity";

/** "missing": the trip is no longer on this phone (deleted or merged meanwhile). */
export type ClassifyResult = "saved" | "queued" | "failed" | "missing";

export async function classifyTripFromHome(
  id: string,
  classification: "business" | "personal"
): Promise<ClassifyResult> {
  let platformTag: string | null = null;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ platform_tag: string | null }>(
      "SELECT platform_tag FROM trips WHERE id = ?",
      [id]
    );
    // Deleted or merged since the card was drawn: queueing an update for it
    // would only fail later and show as a trip that couldn't upload.
    if (!row) return "missing";
    platformTag = row.platform_tag ?? null;
  } catch {
    // route learning is best-effort
  }

  let result: ClassifyResult = "saved";
  try {
    const res = await syncUpdateTrip(id, { classification, platformTag: platformTag as never });
    // null means it is stored here and waiting to upload.
    if (res == null) result = "queued";
  } catch {
    // syncUpdateTrip writes SQLite and queues before it calls the API, so an
    // API error can still leave the change saved here and queued.
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ classification: string }>(
        "SELECT classification FROM trips WHERE id = ?",
        [id]
      );
      if (row?.classification !== classification) return "failed";
      result = "queued";
    } catch {
      return "failed";
    }
  }
  markLiveActivityClassified().catch(() => {});
  return result;
}
