// Roadworks line in the morning briefing (Oct 2026): loading. The rules are
// pure and tested in roadBriefingRule.ts.
//
// Street Manager only. One bounded query per driver with road alerts on:
// works overlapping their corridor's box that are in place now. The corridor
// never leaves the server; only the line about the driver's own roads goes
// back to them.

import { matchEventToCorridor } from "./roadCorridor.js";
import { findWorksRows, isStreetManagerEnabled } from "./streetManager.js";
import { loadCorridor, loadDismissedIds } from "./roadAlerts.js";
import { worksRowToCandidate } from "./roadWeekAhead.js";
import { selectBriefingWorks, type BriefingWorksEntry } from "./roadBriefingRule.js";
import type { WeekAheadCandidate } from "./roadWeekAheadRule.js";

const MAX_ROWS = 3000;

/** Works on this driver's usual roads in place now, most disruptive first.
 *  Empty when Street Manager is off, they have no usual roads, or anything
 *  fails (the briefing then goes without the line). */
export async function briefingRoadworksForDriver(userId: string, now: Date): Promise<BriefingWorksEntry[]> {
  if (!isStreetManagerEnabled()) return [];
  try {
    const corridor = await loadCorridor(userId, now);
    if (!corridor.bbox || corridor.cells.size === 0) return [];
    const bbox = corridor.bbox;
    const rows = await findWorksRows(
      {
        minLat: { lte: bbox.maxLat },
        maxLat: { gte: bbox.minLat },
        minLng: { lte: bbox.maxLng },
        maxLng: { gte: bbox.minLng },
        OR: [{ endAt: null }, { endAt: { gt: now } }],
        AND: [{ OR: [{ startAt: null }, { startAt: { lte: now } }] }],
      },
      MAX_ROWS
    );
    const candidates: WeekAheadCandidate[] = [];
    for (const r of rows) {
      const c = worksRowToCandidate(r, now);
      const m = matchEventToCorridor(corridor, {
        lines: c.event.lines,
        points: c.event.points,
        directionMode: c.event.directionMode,
      });
      if (m.matched) candidates.push({ ...c, days: m.days });
    }
    if (candidates.length === 0) return [];
    const dismissed = (await loadDismissedIds([userId], now)).get(userId) ?? new Set<string>();
    return selectBriefingWorks(candidates, { now, dismissed });
  } catch (err) {
    console.error("[roadBriefing] load failed:", (err as Error).message);
    return [];
  }
}
