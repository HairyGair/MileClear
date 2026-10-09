// Where the platform league comes from.
//
//  Pro:  GET /business-insights/platform-pnl?period=&date= (the one league,
//        ranked by the server). Pro-gated.
//  Free: the same ranking rule applied to endpoints every driver can call
//        (earnings list + trip summary per platform) for the SAME window, so
//        the order a free driver sees is the order Pro would see (decision C:
//        names and order only; the card masks every figure). See
//        buildLeague in platformLeague.ts for the rule.

import type { LeagueInput, LeagueRow } from "./platformLeague";
import { buildLeague, leagueFromEntries, maskLeagueForFree } from "./platformLeague";
import {
  cachedBusinessTripSummary,
  cachedEarnings,
  cachedPlatformPnL,
  dateParam,
} from "./api";
import type { PeriodRange } from "./period";
import type { InsightsPeriod } from "./period";

const MAX_PLATFORMS = 6;
const MAX_PAGES = 3;

export async function loadFreeLeagueInputs(fromIso: string, toIso: string): Promise<LeagueInput[]> {
  const gross = new Map<string, number>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await cachedEarnings(fromIso, toIso, page);
    for (const e of res.data) gross.set(e.platform, (gross.get(e.platform) ?? 0) + e.amountPence);
    if (page >= res.totalPages) break;
  }

  const platforms = [...gross.entries()]
    .filter(([, pence]) => pence > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PLATFORMS)
    .map(([p]) => p);

  const rows = await Promise.all(
    platforms.map(async (platform): Promise<LeagueInput | null> => {
      try {
        const res = await cachedBusinessTripSummary(platform, fromIso, toIso);
        return {
          platform,
          grossPence: gross.get(platform) ?? 0,
          trips: res.businessTrips,
          miles: res.businessMiles,
          hours: null,
        };
      } catch {
        // A platform that is not a trip tag (or a failed call) just drops out.
        return null;
      }
    })
  );
  return rows.filter((r): r is LeagueInput => r !== null);
}

/** The rows the card draws, already masked for free drivers. */
export async function loadLeague(
  period: InsightsPeriod,
  range: PeriodRange,
  isPro: boolean
): Promise<LeagueRow[]> {
  if (isPro) {
    const entries = await cachedPlatformPnL(period, dateParam(range.anchor));
    return leagueFromEntries(entries);
  }
  const inputs = await loadFreeLeagueInputs(range.start.toISOString(), range.end.toISOString());
  return maskLeagueForFree(buildLeague(inputs));
}
