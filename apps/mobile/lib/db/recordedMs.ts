// detection_coordinates.recorded_ms: one row per fix (schema v12, 16 Oct 2026).
//
// bufferCoord had no uniqueness on the fix time and overlapping callbacks
// stored the same fix several times. recorded_ms is the fix time in epoch
// milliseconds, normalised the way the save path reads it; a unique index on
// it plus INSERT OR IGNORE keeps one copy.
//
// Runs on EVERY boot, not only at the version bump, so a failed index build
// is retried instead of hidden behind the version number. Cheap when all is
// in place: two PRAGMAs. No expo-sqlite import, so it runs under vitest.

import { isAnchorSignature, fixTimeMs } from "../tracking/savedFixes";

export const RECORDED_MS_INDEX = "idx_detection_coords_recorded_ms";

export interface RecordedMsDb {
  execAsync(sql: string): Promise<unknown>;
  runAsync(sql: string, params: Array<string | number | null>): Promise<unknown>;
  getAllAsync<T>(sql: string, params: Array<string | number | null>): Promise<T[]>;
}

export async function ensureRecordedMs(db: RecordedMsDb): Promise<void> {
  // The column is required by every buffer insert: let a failure here throw,
  // like any other migration.
  const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(detection_coordinates)", []);
  if (!cols.some((c) => c.name === "recorded_ms")) {
    await db.execAsync("ALTER TABLE detection_coordinates ADD COLUMN recorded_ms INTEGER;");
  }
  // The index is best effort: without it the buffer behaves as before
  // (duplicates possible, nothing lost), and the next boot tries again.
  try {
    const idx = await db.getAllAsync<{ name: string }>("PRAGMA index_list(detection_coordinates)", []);
    if (idx.some((i) => i.name === RECORDED_MS_INDEX)) return;
    await db.execAsync("BEGIN IMMEDIATE");
    try {
      const rows = await db.getAllAsync<{
        id: number;
        recorded_at: string;
        recorded_ms: number | null;
        speed: number | null;
        accuracy: number | null;
        activity: string | null;
      }>("SELECT id, recorded_at, recorded_ms, speed, accuracy, activity FROM detection_coordinates ORDER BY id ASC", []);
      // Backfill first. A row with no recorded_ms and the planted anchor's
      // signature stays NULL (a legacy anchor cannot be told from a real
      // fix, and a NULL can never fail the index).
      for (const r of rows) {
        if (r.recorded_ms !== null || isAnchorSignature(r)) continue;
        const ms = fixTimeMs(r.recorded_at);
        if (ms > 0) {
          await db.runAsync("UPDATE detection_coordinates SET recorded_ms = ? WHERE id = ?", [ms, r.id]);
        }
      }
      // Then dedupe on recorded_ms ALONE: any two rows that would clash in the
      // unique index, whatever they look like (a real Android fix can have the
      // anchor's signature: speed 0, accuracy 50, no activity). One of each
      // stays, the lowest id.
      await db.runAsync(
        `DELETE FROM detection_coordinates
         WHERE recorded_ms IS NOT NULL
           AND id NOT IN (SELECT MIN(id) FROM detection_coordinates WHERE recorded_ms IS NOT NULL GROUP BY recorded_ms)`,
        []
      );
      await db.execAsync(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${RECORDED_MS_INDEX} ON detection_coordinates (recorded_ms);`
      );
      await db.execAsync("COMMIT");
    } catch (err) {
      await db.execAsync("ROLLBACK").catch(() => {});
      throw err;
    }
  } catch {
    // Retried on the next boot.
  }
}
