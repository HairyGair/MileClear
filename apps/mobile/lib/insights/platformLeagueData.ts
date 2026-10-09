// Data for the platform league. Built from endpoints that are free for every
// driver (earnings list + trip summary per platform) so free drivers can see
// the ORDER; the figures are masked in the card (maskLeagueForFree), not
// withheld here. One function, so the source is easy to swap once
// docs/insights-oct2026/NUMBERS.md names a single pay-per-mile calculation.

import type { PlatformTag } from "@mileclear/shared";
import { fetchEarnings } from "../api/earnings";
import { fetchTripSummary } from "../api/trips";
import type { LeagueInput } from "./platformLeague";

const MAX_PLATFORMS = 6;
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/** Start of the window as an ISO string. `sinceIso` wins over `days`. */
export function windowStart(days: number, sinceIso?: string): string {
  if (sinceIso) return sinceIso;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function loadLeagueInputs(from: string): Promise<LeagueInput[]> {
  // 1. Earnings by platform in the window.
  const gross = new Map<string, number>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchEarnings({ from, page, pageSize: PAGE_SIZE });
    for (const e of res.data) {
      gross.set(e.platform, (gross.get(e.platform) ?? 0) + e.amountPence);
    }
    if (page >= res.totalPages) break;
  }

  // 2. Business trips and miles for each platform that earned something.
  const platforms = [...gross.entries()]
    .filter(([, pence]) => pence > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PLATFORMS)
    .map(([p]) => p);

  const rows = await Promise.all(
    platforms.map(async (platform): Promise<LeagueInput | null> => {
      try {
        const res = await fetchTripSummary({
          classification: "business",
          platformTag: platform as PlatformTag,
          from,
        });
        return {
          platform,
          grossPence: gross.get(platform) ?? 0,
          trips: res.data.businessTrips,
          miles: res.data.businessMiles,
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
