import type { CommunityTotals } from "@mileclear/shared";
import { MILES_TRACKED_FLOOR } from "./stats";

// Live fleet figures for the marketing pages, from GET /community/totals.
// The API rounds both numbers DOWN and caches them for an hour; pages that
// use this revalidate hourly too, so nothing here is hard-coded.
//
// Fallback when the API can't be reached: miles falls back to a checked
// floor (all-time miles only grow, so it stays true), and active drivers is
// null so the page hides that figure rather than show a stale one.

export const LIVE_STATS_REVALIDATE_SECONDS = 3600;

export interface LiveStats {
  /** "1.3 million+" / "980,000+". Always present. */
  milesDisplay: string;
  /** "800+", or null when there is no trustworthy live figure. */
  activeDriversDisplay: string | null;
}

/** 1,300,000 -> "1.3 million+", 980,000 -> "980,000+". Expects a rounded-down figure. */
export function formatMilesPlus(miles: number): string {
  if (miles >= 1_000_000) {
    const millions = Math.floor(miles / 100_000) / 10;
    return `${millions.toLocaleString("en-GB", { maximumFractionDigits: 1 })} million+`;
  }
  return `${Math.floor(miles).toLocaleString("en-GB")}+`;
}

export async function getLiveStats(): Promise<LiveStats> {
  const fallback: LiveStats = {
    milesDisplay: formatMilesPlus(MILES_TRACKED_FLOOR),
    activeDriversDisplay: null,
  };
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";
  try {
    const res = await fetch(`${base}/community/totals`, {
      next: { revalidate: LIVE_STATS_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as { data?: Partial<CommunityTotals> };
    const miles = body.data?.milesAllTime;
    const drivers = body.data?.activeDrivers30d;
    return {
      // Never below the checked floor: a lower reading means the API is
      // pointed at the wrong database, not that miles went backwards.
      milesDisplay: formatMilesPlus(
        typeof miles === "number" && Number.isFinite(miles) ? Math.max(miles, MILES_TRACKED_FLOOR) : MILES_TRACKED_FLOOR,
      ),
      activeDriversDisplay:
        typeof drivers === "number" && Number.isFinite(drivers) && drivers >= 10
          ? `${Math.floor(drivers).toLocaleString("en-GB")}+`
          : null,
    };
  } catch {
    return fallback;
  }
}
