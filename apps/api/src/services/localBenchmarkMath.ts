// "Drivers near you": the pure maths behind GET /business-insights/benchmarks/local.
//
// No database here. services/localBenchmark.ts loads the rows and hands them
// in, so every rule below is unit-tested in
// __tests__/services/localBenchmarkMath.test.ts.
//
// PEER GROUP: drivers whose home postcode AREA (services/geography.ts
// assignHomeArea) matches yours, in the same mode family, who drove in at
// least 2 of the last 4 complete weeks. Mode family: a "work" viewer is
// compared with work + both drivers on BUSINESS miles; a "personal" viewer
// with personal + both drivers on ALL miles.
//
// PRIVACY:
//   - A group under PEER_FLOOR (5) drivers is never used. We fall back to the
//     region, then the whole UK, and say which level was used. Under 5 in the
//     whole UK, nothing is returned.
//   - The middle-half range (25th-75th percentile) is only sent for groups of
//     RANGE_FLOOR (10) or more: with 5 drivers, a quartile IS a driver.
//   - Never a minimum, maximum or any single driver's value. Group figures
//     are rounded (miles to 5, money to £1, trips to 0.5, shares to 5%).

import { calculateMileageDeduction, getTaxYear, parseTaxYear } from "@mileclear/shared";
import type {
  LocalBenchmark,
  LocalBenchmarkLevel,
  LocalBenchmarkMode,
  LocalBenchmarkStat,
  VehicleType,
} from "@mileclear/shared";

export const PEER_FLOOR = 5;
export const RANGE_FLOOR = 10;
export const WINDOW_WEEKS = 4;
export const MIN_ACTIVE_WEEKS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// ── Window ───────────────────────────────────────────────────────────────

/**
 * The last WINDOW_WEEKS complete Monday-to-Monday weeks before `now` (UTC
 * midnight boundaries). `end` is the Monday that starts the current week, so
 * the week in progress never counts.
 */
export function completeWeeksWindow(now: Date, weeks = WINDOW_WEEKS): { start: Date; end: Date } {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysSinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
  const end = new Date(midnight - daysSinceMonday * DAY_MS);
  return { start: new Date(end.getTime() - weeks * WEEK_MS), end };
}

/**
 * The tax-year boundary (6 April) inside [start, end), or null when the window
 * sits inside one tax year. Trips on or after it belong to the new tax year.
 */
export function taxYearBoundaryInWindow(start: Date, end: Date): Date | null {
  const lastYear = getTaxYear(new Date(end.getTime() - 1));
  const boundary = parseTaxYear(lastYear).start;
  return boundary.getTime() > start.getTime() && boundary.getTime() < end.getTime() ? boundary : null;
}

// ── Claim value ──────────────────────────────────────────────────────────

export interface ClaimSegment {
  taxYear: string;
  vehicleType: VehicleType;
  /** Business miles in the window for this tax year + vehicle type. */
  miles: number;
  /** Business miles earlier in the same tax year (before the window), for the 10,000-mile step. */
  priorMiles: number;
}

/**
 * Mileage claim value (pence) of the window's business miles: per tax year and
 * vehicle type, deduction(prior + window) minus deduction(prior), so a driver
 * past 10,000 business miles this tax year is valued at the after-10k rate and
 * a trip before 6 April is valued at that tax year's rate.
 */
export function claimPenceForSegments(segments: ClaimSegment[]): number {
  let total = 0;
  for (const seg of segments) {
    if (seg.miles <= 0) continue;
    const opts = { taxYear: seg.taxYear };
    const after = calculateMileageDeduction(seg.vehicleType, seg.priorMiles + seg.miles, opts).deductionPence;
    const before = calculateMileageDeduction(seg.vehicleType, seg.priorMiles, opts).deductionPence;
    total += after - before;
  }
  return total;
}

// ── Per-driver stats ─────────────────────────────────────────────────────

export type ModeFamily = LocalBenchmarkMode;

/** Which comparison pools a driver belongs to, from User.dashboardMode. */
export function familiesOf(dashboardMode: string | null | undefined): ModeFamily[] {
  if (dashboardMode === "work") return ["work"];
  if (dashboardMode === "personal") return ["personal"];
  return ["work", "personal"]; // "both" (the default) and anything unexpected
}

/** The family a viewer is compared in: an explicit choice, else their dashboard mode. */
export function viewerFamily(dashboardMode: string | null | undefined, requested?: ModeFamily | null): ModeFamily {
  if (requested) return requested;
  return dashboardMode === "personal" ? "personal" : "work";
}

export interface DriverWindowStats {
  userId: string;
  area: string | null;
  region: string | null;
  families: ModeFamily[];
  /** Distinct weeks (0-4) with at least one non-phantom trip. */
  weeksActive: number;
  totalMiles: number;
  businessMiles: number;
  claimPence: number;
  trips: number;
  /** Trips marked business or personal. */
  classifiedTrips: number;
}

export interface WeeklyValues {
  miles: number;
  claimPence: number;
  trips: number;
  /** 0-100, null when no trips. */
  classifiedPct: number | null;
}

export function weeklyValues(s: DriverWindowStats, family: ModeFamily, weeks = WINDOW_WEEKS): WeeklyValues {
  return {
    miles: (family === "work" ? s.businessMiles : s.totalMiles) / weeks,
    claimPence: s.claimPence / weeks,
    trips: s.trips / weeks,
    classifiedPct: s.trips > 0 ? (s.classifiedTrips / s.trips) * 100 : null,
  };
}

export function isEligiblePeer(s: DriverWindowStats, family: ModeFamily): boolean {
  return s.weeksActive >= MIN_ACTIVE_WEEKS && s.families.includes(family);
}

// ── Distribution maths ───────────────────────────────────────────────────

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Linear-interpolated quantile (0-1) of an ascending array. */
export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * How many in 10 of `others` are below `you` (ties count half), rounded to a
 * whole number 0-10. Null with no one to compare against.
 */
export function aheadOfPerTen(others: number[], you: number): number | null {
  if (!others.length) return null;
  let below = 0;
  for (const v of others) {
    if (v < you) below += 1;
    else if (v === you) below += 0.5;
  }
  return Math.round((below / others.length) * 10);
}

export const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

export type MetricKey = "miles" | "claimPence" | "trips" | "classifiedPct";

/** Rounding step for group figures, per metric. */
export const GROUP_STEP: Record<MetricKey, number> = { miles: 5, claimPence: 100, trips: 0.5, classifiedPct: 5 };
/** Rounding step for the driver's own figures (their own data, so finer). */
export const YOU_STEP: Record<MetricKey, number> = { miles: 1, claimPence: 100, trips: 0.5, classifiedPct: 1 };

export function buildStat(
  metric: MetricKey,
  group: number[],
  you: number | null,
  othersForRank: number[] | null,
): LocalBenchmarkStat | null {
  if (group.length < PEER_FLOOR) return null;
  const sorted = [...group].sort((a, b) => a - b);
  const step = GROUP_STEP[metric];
  const showRange = sorted.length >= RANGE_FLOOR;
  return {
    median: roundTo(median(sorted)!, step),
    low: showRange ? roundTo(quantile(sorted, 0.25)!, step) : null,
    high: showRange ? roundTo(quantile(sorted, 0.75)!, step) : null,
    you: you == null ? null : roundTo(you, YOU_STEP[metric]),
    youAheadOfPerTen: you == null || !othersForRank ? null : aheadOfPerTen(othersForRank, you),
  };
}

// ── Peer group choice ────────────────────────────────────────────────────

export interface PeerGroupChoice {
  level: LocalBenchmarkLevel;
  members: DriverWindowStats[];
}

/**
 * The narrowest group with at least PEER_FLOOR eligible drivers: your area,
 * then your region, then the whole UK. Null when even the UK is under floor.
 */
export function choosePeerGroup(
  all: DriverWindowStats[],
  home: { area: string | null; region: string | null },
  family: ModeFamily,
): PeerGroupChoice | null {
  const eligible = all.filter((s) => isEligiblePeer(s, family));
  if (home.area) {
    const members = eligible.filter((s) => s.area === home.area);
    if (members.length >= PEER_FLOOR) return { level: "area", members };
  }
  if (home.region) {
    const members = eligible.filter((s) => s.region === home.region);
    if (members.length >= PEER_FLOOR) return { level: "region", members };
  }
  return eligible.length >= PEER_FLOOR ? { level: "national", members: eligible } : null;
}

// ── Assembly ─────────────────────────────────────────────────────────────

export interface GroupDistributions {
  level: LocalBenchmarkLevel;
  peerCount: number;
  /** userId -> weekly values, kept server-side only for ranking the viewer. */
  values: Array<{ userId: string } & WeeklyValues>;
}

export function groupDistributions(choice: PeerGroupChoice, family: ModeFamily): GroupDistributions {
  return {
    level: choice.level,
    peerCount: choice.members.length,
    values: choice.members.map((m) => ({ userId: m.userId, ...weeklyValues(m, family) })),
  };
}

export interface AssembleInput {
  userId: string;
  family: ModeFamily;
  home: { area: string | null; areaName: string | null; region: string | null };
  /** The viewer's own window stats, or null when they have no trips in it. */
  you: DriverWindowStats | null;
  group: GroupDistributions | null;
  window: { start: Date; end: Date };
  now: Date;
}

export function scopeLabel(
  level: LocalBenchmarkLevel,
  home: { area: string | null; areaName: string | null; region: string | null },
): string {
  if (level === "area" && home.area) return home.areaName ? `${home.areaName} (${home.area})` : home.area;
  if (level === "region" && home.region) return home.region;
  return "the UK";
}

export function assembleLocalBenchmark(input: AssembleInput): LocalBenchmark {
  const { home, family, group } = input;
  const youWeeksActive = input.you?.weeksActive ?? 0;
  const base = {
    mode: family,
    area: home.area ? { code: home.area, name: home.areaName ?? home.area, region: home.region ?? "" } : null,
    region: home.region,
    window: { start: input.window.start.toISOString(), end: input.window.end.toISOString(), weeks: WINDOW_WEEKS },
    youWeeksActive,
    generatedAt: input.now.toISOString(),
  };

  if (!group || group.peerCount < PEER_FLOOR) {
    return {
      ...base,
      available: false,
      reason: "not_enough_drivers",
      level: null,
      scopeLabel: null,
      peerCount: null,
      weeklyMiles: null,
      weeklyClaimPence: null,
      weeklyTrips: null,
      classifiedPct: null,
    };
  }

  const mine = input.you ? weeklyValues(input.you, family) : null;
  const ranked = youWeeksActive >= MIN_ACTIVE_WEEKS;
  const others = group.values.filter((v) => v.userId !== input.userId);

  const stat = (metric: MetricKey) => {
    const all = group.values.map((v) => v[metric]).filter((v): v is number => v != null);
    const rest = others.map((v) => v[metric]).filter((v): v is number => v != null);
    const youValue = mine ? mine[metric] : null;
    return buildStat(metric, all, youValue, ranked ? rest : null);
  };

  return {
    ...base,
    available: true,
    reason: "ok",
    level: group.level,
    scopeLabel: scopeLabel(group.level, home),
    peerCount: group.peerCount,
    weeklyMiles: stat("miles"),
    weeklyClaimPence: stat("claimPence"),
    weeklyTrips: stat("trips"),
    classifiedPct: stat("classifiedPct"),
  };
}
