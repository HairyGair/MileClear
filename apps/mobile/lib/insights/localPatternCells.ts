// Day-by-hour trip counts from the phone's own trip table, in local time.
// Used by "When you drive" in Personal mode, where the server heatmap (which
// only counts business trips) would leave out the trips that matter. Also
// works offline.

import { getDatabase } from "../db/index";
import type { PatternCell } from "./drivePattern";

/** Group trip start times (ISO strings) into day-of-week/hour cells, local time. */
export function cellsFromStartTimes(startedAt: string[]): PatternCell[] {
  const map = new Map<string, PatternCell>();
  for (const iso of startedAt) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const dayOfWeek = d.getDay();
    const hour = d.getHours();
    const key = `${dayOfWeek}_${hour}`;
    const cell = map.get(key);
    if (cell) cell.tripCount += 1;
    else map.set(key, { dayOfWeek, hour, tripCount: 1 });
  }
  return [...map.values()];
}

export async function loadLocalPatternCells(weeksBack = 12, businessOnly = false): Promise<PatternCell[]> {
  const db = await getDatabase();
  const since = new Date(Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.getAllAsync<{ started_at: string }>(
    `SELECT started_at FROM trips WHERE started_at >= ?${businessOnly ? " AND classification = 'business'" : ""}`,
    [since]
  );
  return cellsFromStartTimes(rows.map((r) => r.started_at));
}
