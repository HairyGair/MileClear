// "Next week on your roads" (Oct 2026): loading for the week-ahead push and
// the "Coming up this week" section. The rules are pure and tested in
// roadWeekAheadRule.ts.
//
// Street Manager only (planned works in England). One bounded query per
// driver: works overlapping their corridor's box that start inside the week
// in view. The corridor never leaves the server; only the matched works go
// back to the driver who owns it.

import { prisma } from "../lib/prisma.js";
import type { Corridor, LatLng } from "./roadCorridor.js";
import { matchEventToCorridor } from "./roadCorridor.js";
import { streetWorksToRoadEvent } from "./roadEvents.js";
import { isStreetManagerEnabled } from "./streetManager.js";
import {
  selectWeekAhead,
  type WeekAheadCandidate,
  type WeekAheadSelection,
  type WeekAheadWindow,
} from "./roadWeekAheadRule.js";

const MAX_ROWS = 3000;

type Bbox = { minLat: number; maxLat: number; minLng: number; maxLng: number };

/** Stored works in the box that start inside [start, end), with the fields
 *  the week-ahead ranking needs. Empty when Street Manager is off or the
 *  table is missing. */
export async function loadWeekAheadWorks(
  bbox: Bbox,
  window: Pick<WeekAheadWindow, "start" | "end">,
  now: Date
): Promise<Omit<WeekAheadCandidate, "days">[]> {
  if (!isStreetManagerEnabled()) return [];
  try {
    const rows = await prisma.streetWorksEvent.findMany({
      where: {
        minLat: { lte: bbox.maxLat },
        maxLat: { gte: bbox.minLat },
        minLng: { lte: bbox.maxLng },
        maxLng: { gte: bbox.minLng },
        startAt: { gte: window.start, lt: window.end },
      },
      select: {
        reference: true,
        trafficManagement: true,
        isTrafficSensitive: true,
        workStatus: true,
        streetName: true,
        town: true,
        promoter: true,
        startAt: true,
        endAt: true,
        geometry: true,
      },
      take: MAX_ROWS,
    });
    return rows.map((r) => {
      const g = (r.geometry ?? {}) as { lines?: LatLng[][]; points?: LatLng[] };
      return {
        event: streetWorksToRoadEvent(
          {
            reference: r.reference,
            trafficManagement: r.trafficManagement,
            isTrafficSensitive: r.isTrafficSensitive,
            streetName: r.streetName,
            town: r.town,
            promoter: r.promoter,
            startAt: r.startAt,
            endAt: r.endAt,
            lines: Array.isArray(g.lines) ? g.lines : [],
            points: Array.isArray(g.points) ? g.points : [],
          },
          now
        ),
        works: {
          trafficManagement: r.trafficManagement,
          isTrafficSensitive: r.isTrafficSensitive,
          workStatus: r.workStatus,
          promoter: r.promoter,
        },
      };
    });
  } catch (err) {
    console.error("[roadWeekAhead] load failed:", (err as Error).message);
    return [];
  }
}

/** The week-ahead selection for one driver, from their corridor. */
export async function weekAheadForCorridor(
  corridor: Corridor,
  window: WeekAheadWindow,
  now: Date,
  dismissed: Set<string>
): Promise<WeekAheadSelection> {
  const empty: WeekAheadSelection = { items: [], more: 0, total: 0 };
  if (!corridor.bbox || corridor.cells.size === 0) return empty;
  const works = await loadWeekAheadWorks(corridor.bbox, window, now);
  const candidates: WeekAheadCandidate[] = [];
  for (const w of works) {
    const m = matchEventToCorridor(corridor, {
      lines: w.event.lines,
      points: w.event.points,
      directionMode: w.event.directionMode,
    });
    if (m.matched) candidates.push({ ...w, days: m.days });
  }
  return selectWeekAhead(candidates, { now, window, dismissed });
}
