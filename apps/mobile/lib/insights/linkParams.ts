// Reads `?period=` and `?offset=` on /insights, so a link from Home (the
// Monday "Last week" door, the Personal hero's month link) lands on the
// right period. Pure.

import { isInsightsPeriod, type InsightsPeriod } from "./period";

export interface InsightsLink {
  period: InsightsPeriod;
  /** 0 = now, -1 = the one before. Never positive. */
  offset: number;
}

type Param = string | string[] | undefined;

function first(v: Param): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** The farthest back a link may point (about ten years of weeks). */
const MAX_BACK = 520;

/** null when there is no usable `period`: the screen then keeps its remembered choice. */
export function parseInsightsLink(period: Param, offset: Param): InsightsLink | null {
  const p = first(period);
  if (!isInsightsPeriod(p)) return null;
  const raw = first(offset);
  let off = 0;
  if (raw !== undefined && /^-?\d+$/.test(raw.trim())) {
    const n = parseInt(raw.trim(), 10);
    off = Math.max(-MAX_BACK, Math.min(0, n));
  }
  return { period: p, offset: off === 0 ? 0 : off };
}

/**
 * A Home link to Insights, stamped with the time of the tap (`&at=`). The
 * Insights tab stays mounted, so a second tap on the same link would otherwise
 * carry the same params and be ignored: the driver who had moved to Tax year
 * stayed there, scrolled half way down (QA 10 Oct).
 */
export function stampInsightsLink(route: string, now: number = Date.now()): string {
  if (!/^\/(\(tabs\)\/)?insights\?/.test(route)) return route;
  return `${route}&at=${now}`;
}
