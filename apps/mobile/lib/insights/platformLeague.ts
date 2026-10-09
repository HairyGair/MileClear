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

/** Same grouping as the server's rankPlatforms (apps/api/src/lib/insightsMath.ts):
 *  ranked rows first, then "few trips", then rows with no pay per mile. */
function group(perMile: number | null, few: boolean): number {
  return perMile == null ? 2 : few ? 1 : 0;
}

/** Bars scale to the best ranked platform, so a few-trip outlier can't flatten the rest. */
function barFractions(rows: Array<{ perMile: number | null; few: boolean }>): Array<number | null> {
  const withPay = rows.filter((r) => r.perMile != null) as Array<{ perMile: number; few: boolean }>;
  const ranked = withPay.filter((r) => !r.few);
  const scaleSet = ranked.length > 0 ? ranked : withPay;
  const top = scaleSet.length > 0 ? Math.max(...scaleSet.map((r) => r.perMile)) : 0;
  return rows.map((r) => (r.perMile == null || top <= 0 ? null : Math.min(1, r.perMile / top)));
}

/**
 * Builds the league from raw per-platform totals. This is the FREE source
 * (earnings list + trip summary per platform). It applies the server's own
 * ranking rule, so a free driver's order matches what Pro sees from
 * GET /business-insights/platform-pnl: pay per mile rounded to the penny
 * (earnings over business miles, needs 0.1 mile and some pay), few trips
 * (under 5) after the others, rows with no pay per mile last, ties by
 * earnings then name. Platforms that only have tagged trips and no earnings
 * can't be listed from this source; the server lists them last.
 */
export function buildLeague(inputs: LeagueInput[]): LeagueRow[] {
  const usable = inputs
    .filter((r) => r.grossPence > 0 || r.trips > 0)
    .map((r) => ({
      ...r,
      perMile: r.miles >= 0.1 && r.grossPence > 0 ? Math.round(r.grossPence / r.miles) : null,
      few: r.trips < MIN_TRIPS_TO_RANK,
    }));
  usable.sort(
    (a, b) =>
      group(a.perMile, a.few) - group(b.perMile, b.few) ||
      (b.perMile ?? 0) - (a.perMile ?? 0) ||
      b.grossPence - a.grossPence ||
      a.platform.localeCompare(b.platform)
  );
  const bars = barFractions(usable);
  return usable.map((r, i) => ({
    rank: i + 1,
    platform: r.platform,
    label: platformLabel(r.platform),
    perMilePence: r.perMile,
    trips: r.trips,
    miles: r.miles,
    hours: r.hours ?? null,
    fewTrips: r.few,
    barFraction: bars[i],
  }));
}

/** The server's league (Pro): already ranked, so the order is kept as sent. */
export interface LeagueEntryInput {
  platform: string;
  rank: number;
  earningsPerMilePence: number | null;
  trips: number;
  businessMiles: number;
  drivingHours: number;
  fewTrips: boolean;
}

export function leagueFromEntries(entries: LeagueEntryInput[]): LeagueRow[] {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);
  const bars = barFractions(sorted.map((e) => ({ perMile: e.earningsPerMilePence, few: e.fewTrips })));
  return sorted.map((e, i) => ({
    rank: e.rank,
    platform: e.platform,
    label: platformLabel(e.platform),
    perMilePence: e.earningsPerMilePence,
    trips: e.trips,
    miles: e.businessMiles,
    hours: e.drivingHours > 0 ? e.drivingHours : null,
    fewTrips: e.fewTrips,
    barFraction: bars[i],
  }));
}

/** A league of one is not a league. */
export function hasLeague(rows: LeagueRow[]): boolean {
  return rows.length >= 2;
}

/**
 * No earnings in the window, so nothing can be ranked (SPEC-UX 3.4 empty
 * state: "Add what you were paid to rank your platforms."). Free rows only
 * exist for platforms with earnings, so none means none; Pro rows with trips
 * but no pay per mile are platforms driven for but not paid in the window.
 * A row with earnings but no tagged trips is not this case.
 */
export function leagueHasNoEarnings(rows: LeagueRow[]): boolean {
  return rows.every((r) => r.perMilePence == null && r.trips != null && r.trips > 0);
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
