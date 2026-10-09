// Platform league: platforms ranked by pay per mile. Pure ranking and the
// free-preview masking (Decision C: free drivers see order and names, never
// a figure).

import { GIG_PLATFORMS } from "@mileclear/shared";

export const MIN_TRIPS_TO_RANK = 5;

export interface LeagueInput {
  platform: string;
  grossPence: number;
  trips: number;
  miles: number;
  /** Not available from every source; null when unknown. */
  hours?: number | null;
}

export interface LeagueRow {
  rank: number;
  platform: string;
  label: string;
  /** Pence per mile. Null in the free preview. */
  perMilePence: number | null;
  trips: number | null;
  miles: number | null;
  hours: number | null;
  /** Fewer than MIN_TRIPS_TO_RANK trips: listed last, marked "few trips". */
  fewTrips: boolean;
  /** 0 to 1, width of the inline bar against the top figure. Null in the free preview. */
  barFraction: number | null;
}

const LABELS: Record<string, string> = Object.fromEntries(GIG_PLATFORMS.map((p) => [p.value, p.label]));

export function platformLabel(platform: string): string {
  return LABELS[platform] ?? platform;
}

export function buildLeague(inputs: LeagueInput[]): LeagueRow[] {
  const usable = inputs
    .filter((r) => r.grossPence > 0 && r.miles > 0)
    .map((r) => ({
      ...r,
      perMile: r.grossPence / r.miles,
      few: r.trips < MIN_TRIPS_TO_RANK,
    }));
  // Enough-trips platforms first, then the few-trips ones; each group by pay per mile.
  usable.sort((a, b) => {
    if (a.few !== b.few) return a.few ? 1 : -1;
    return b.perMile - a.perMile;
  });
  // Bars scale to the best ranked platform, so a few-trip outlier can't flatten the rest.
  const ranked = usable.filter((r) => !r.few);
  const scaleSet = ranked.length > 0 ? ranked : usable;
  const top = scaleSet.length > 0 ? Math.max(...scaleSet.map((r) => r.perMile)) : 0;
  return usable.map((r, i) => ({
    rank: i + 1,
    platform: r.platform,
    label: platformLabel(r.platform),
    perMilePence: Math.round(r.perMile),
    trips: r.trips,
    miles: r.miles,
    hours: r.hours ?? null,
    fewTrips: r.few,
    barFraction: top > 0 ? Math.min(1, r.perMile / top) : 0,
  }));
}

/** A league of one is not a league. */
export function hasLeague(rows: LeagueRow[]): boolean {
  return rows.length >= 2;
}

/** Free preview: keep rank, name and the few-trips flag, drop every figure. */
export function maskLeagueForFree(rows: LeagueRow[]): LeagueRow[] {
  return rows.map((r) => ({
    rank: r.rank,
    platform: r.platform,
    label: r.label,
    perMilePence: null,
    trips: null,
    miles: null,
    hours: null,
    fewTrips: r.fewTrips,
    barFraction: null,
  }));
}

/** "£1.42/mi" from pence. */
export function formatPerMile(pence: number): string {
  return `£${(pence / 100).toFixed(2)}/mi`;
}

/** "24 trips, 312 mi" or "24 trips, 312 mi, 11 h". */
export function leagueSubline(r: LeagueRow): string | null {
  if (r.trips == null || r.miles == null) return null;
  const parts = [`${r.trips} ${r.trips === 1 ? "trip" : "trips"}`, `${Math.round(r.miles)} mi`];
  if (r.hours != null && r.hours > 0) parts.push(`${Math.round(r.hours)} h`);
  return parts.join(", ");
}
