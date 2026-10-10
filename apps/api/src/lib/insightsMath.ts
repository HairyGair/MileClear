// The calculations behind every Insights figure (9 Oct 2026, "one figure,
// one source"). Pure functions; the services load rows and call these.
// docs/insights-oct2026/NUMBERS.md says which endpoint field the app shows.

import { isClaimableTrip } from "./claimableTrips.js";
import { periodClaimPence, type DatedRatedTrip, type RateUser } from "./mileageRates.js";
import { WEEKDAY_NAMES, dateOnlyParts, ukParts } from "./ukTime.js";

type VehicleType = "car" | "van" | "motorbike";

// ── Period totals ────────────────────────────────────────────────────

export interface PeriodTrip {
  distanceMiles: number;
  classification: string;
  platformTag: string | null;
  startedAt: Date;
  isPhantomTrip?: boolean;
  vehicle?: { vehicleType?: string | null; providedByOthers?: boolean | null } | null;
}

export interface PeriodTotals {
  totalMiles: number;
  businessMiles: number;
  personalMiles: number;
  totalTrips: number;
  businessTrips: number;
  personalTrips: number;
  /** What the period's business trips add to the mileage claim. */
  claimPence: number;
  /** The same trips at the approved rates only (no employer rate): the
   *  self-employment figure, "mileage on your tax return". Weekly P&L. */
  returnMileagePence: number;
  earningsPence: number;
  earningsCount: number;
}

export function toRated(trip: PeriodTrip, fallbackType: VehicleType): DatedRatedTrip {
  return {
    distanceMiles: trip.distanceMiles,
    vehicleType: (trip.vehicle?.vehicleType ?? fallbackType) as VehicleType,
    platformTag: trip.platformTag,
    startedAt: trip.startedAt,
  };
}

/** Turn a grouped aggregate of earlier claimable business miles (sum by
 *  vehicle and platform tag) into rated entries for the threshold. They all
 *  carry `startedAt` (the tax year start) so they land in that tax year. */
export function ratedFromGroups(
  groups: { vehicleId: string | null; platformTag: string | null; _sum: { distanceMiles: number | null } }[],
  vehicleTypeById: Map<string, string>,
  fallbackType: VehicleType,
  startedAt: Date,
): DatedRatedTrip[] {
  return groups
    .filter((g) => (g._sum.distanceMiles ?? 0) > 0)
    .map((g) => ({
      distanceMiles: g._sum.distanceMiles ?? 0,
      vehicleType: ((g.vehicleId ? vehicleTypeById.get(g.vehicleId) : null) ?? fallbackType) as VehicleType,
      platformTag: g.platformTag,
      startedAt,
    }));
}

/** Totals for one period. `earlier` are the claimable business miles
 *  earlier in the same tax year(s), already rated, for the 10,000-mile
 *  threshold. Phantom trips are always left out. */
export function summarisePeriod(args: {
  trips: PeriodTrip[];
  earlier: DatedRatedTrip[];
  earnings: { amountPence: number }[];
  user: RateUser | null | undefined;
  fallbackType: VehicleType;
}): PeriodTotals {
  const trips = args.trips.filter((t) => !t.isPhantomTrip);
  const business = trips.filter((t) => t.classification === "business");
  const personal = trips.filter((t) => t.classification === "personal");
  const sum = (ts: PeriodTrip[]) => ts.reduce((s, t) => s + t.distanceMiles, 0);
  const claimPence = periodClaimPence(
    args.earlier,
    business.filter(isClaimableTrip).map((t) => toRated(t, args.fallbackType)),
    args.user,
  );
  const claimable = business.filter(isClaimableTrip).map((t) => toRated(t, args.fallbackType));
  // null user = no employer rate: approved rates, threshold-aware.
  const returnMileagePence = periodClaimPence(args.earlier, claimable, null);
  return {
    totalMiles: round1(sum(trips)),
    businessMiles: round1(sum(business)),
    personalMiles: round1(sum(personal)),
    totalTrips: trips.length,
    businessTrips: business.length,
    personalTrips: personal.length,
    claimPence,
    returnMileagePence,
    earningsPence: args.earnings.reduce((s, e) => s + e.amountPence, 0),
    earningsCount: args.earnings.length,
  };
}

/** Whole-number percentage change, null when there is nothing to compare. */
export function percentChange(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Days driven ──────────────────────────────────────────────────────

/** Miles per UK calendar day: dates newest first (for streaks) and the
 *  best day. Ties keep the earlier day. */
export function ukDailyMiles(trips: { startedAt: Date; distanceMiles: number }[]): {
  datesDesc: string[];
  best: { dateKey: string; miles: number } | null;
} {
  const byDay = new Map<string, number>();
  for (const t of trips) {
    const key = ukParts(t.startedAt).dateKey;
    byDay.set(key, (byDay.get(key) ?? 0) + t.distanceMiles);
  }
  const datesDesc = [...byDay.keys()].sort().reverse();
  let best: { dateKey: string; miles: number } | null = null;
  for (const key of [...datesDesc].reverse()) {
    const miles = byDay.get(key)!;
    if (!best || miles > best.miles) best = { dateKey: key, miles };
  }
  return { datesDesc, best };
}

// ── Platform league ──────────────────────────────────────────────────

/** Below this many trips in the window a platform's pay per mile is shown
 *  last, marked "few trips" (SPEC-UX 3.4). */
export const PLATFORM_MIN_TRIPS = 5;

export interface PlatformLeagueRow {
  platform: string;
  earningsPence: number;
  trips: number;
  businessMiles: number;
  /** Time on that platform's trips (start to end), hours, 1 dp. Shifts
   *  carry no platform, so this is driving time, not logged-in time. */
  drivingHours: number;
  /** Earnings / business miles on that platform's trips; null with no miles. */
  earningsPerMilePence: number | null;
  earningsPerHourPence: number | null;
  fewTrips: boolean;
}

export function normalisePlatform(p: string | null | undefined): string {
  return (p ?? "").trim().toLowerCase();
}

/** One platform ranking, by pay per mile. Rows with enough trips first,
 *  then "few trips" rows, then rows with no miles (earnings but no tagged
 *  trips, or tagged trips but no earnings), each group best first.
 *  Untagged trips and earnings with no platform are left out. */
export function rankPlatforms(
  earnings: { platform: string; amountPence: number }[],
  trips: { platformTag: string | null; distanceMiles: number; startedAt: Date; endedAt?: Date | null }[],
): PlatformLeagueRow[] {
  const rows = new Map<string, { earningsPence: number; trips: number; miles: number; seconds: number }>();
  const row = (key: string) => {
    let r = rows.get(key);
    if (!r) {
      r = { earningsPence: 0, trips: 0, miles: 0, seconds: 0 };
      rows.set(key, r);
    }
    return r;
  };
  for (const e of earnings) {
    const key = normalisePlatform(e.platform);
    if (!key) continue;
    row(key).earningsPence += e.amountPence;
  }
  for (const t of trips) {
    const key = normalisePlatform(t.platformTag);
    if (!key) continue;
    const r = row(key);
    r.trips += 1;
    r.miles += t.distanceMiles;
    if (t.endedAt) r.seconds += Math.max(0, (t.endedAt.getTime() - t.startedAt.getTime()) / 1000);
  }
  const out: PlatformLeagueRow[] = [];
  for (const [platform, r] of rows) {
    if (r.earningsPence === 0 && r.trips === 0) continue;
    const hours = r.seconds / 3600;
    out.push({
      platform,
      earningsPence: r.earningsPence,
      trips: r.trips,
      businessMiles: round1(r.miles),
      drivingHours: round1(hours),
      earningsPerMilePence: r.miles >= 0.1 && r.earningsPence > 0 ? Math.round(r.earningsPence / r.miles) : null,
      // Under 15 minutes of driving time is too thin for a rate.
      earningsPerHourPence: hours >= 0.25 && r.earningsPence > 0 ? Math.round(r.earningsPence / hours) : null,
      fewTrips: r.trips < PLATFORM_MIN_TRIPS,
    });
  }
  const group = (r: PlatformLeagueRow) => (r.earningsPerMilePence == null ? 2 : r.fewTrips ? 1 : 0);
  return out.sort(
    (a, b) =>
      group(a) - group(b) ||
      (b.earningsPerMilePence ?? 0) - (a.earningsPerMilePence ?? 0) ||
      b.earningsPence - a.earningsPence ||
      a.platform.localeCompare(b.platform),
  );
}

// ── Pay by hour of day ───────────────────────────────────────────────
//
// Earnings carry only a date (Earning.periodStart/periodEnd are DATE
// columns, no time, no shift link). Bucketing them by periodStart's hour
// put every earning at midnight (1 AM in BST), so Golden Hours and the
// heatmap ranked "Sunday 1-2 AM" first. A date can still be placed in the
// hours actually worked that day: a one-day earning is spread over that
// day's shifts (or, with no shift, that day's business trips on the same
// platform, else all business trips that day), in proportion to the
// minutes worked in each hour. Earnings covering more than one day, and
// days with no recorded work, are left out of hour-of-day figures; they
// still count everywhere else (totals, day of week).

export interface WorkSpan {
  start: Date;
  end: Date | null;
  platformTag?: string | null;
}

export interface HourSlot {
  /** 0 = Sunday */
  dow: number;
  hour: number;
  totalPence: number;
  /** Distinct days this slot was paid. */
  days: number;
}

const MIN_SPAN_MS = 60_000;

function minutesByUkHour(span: WorkSpan): Map<string, { dow: number; hour: number; ms: number }> {
  const out = new Map<string, { dow: number; hour: number; ms: number }>();
  const startMs = span.start.getTime();
  const endMs = Math.max(span.end?.getTime() ?? startMs, startMs + MIN_SPAN_MS);
  let cursor = startMs;
  while (cursor < endMs) {
    const nextHour = Math.min(endMs, Math.floor(cursor / 3_600_000) * 3_600_000 + 3_600_000);
    const p = ukParts(new Date(cursor));
    const key = `${p.dow}_${p.hour}`;
    const cur = out.get(key) ?? { dow: p.dow, hour: p.hour, ms: 0 };
    cur.ms += nextHour - cursor;
    out.set(key, cur);
    cursor = nextHour;
  }
  return out;
}

export function allocateEarningsToHours(args: {
  earnings: { periodStart: Date; periodEnd: Date; amountPence: number; platform: string }[];
  shifts: WorkSpan[];
  businessTrips: WorkSpan[];
}): { slots: HourSlot[]; placedPence: number; unplacedPence: number } {
  const byDate = <T extends WorkSpan>(spans: T[]) => {
    const m = new Map<string, T[]>();
    for (const s of spans) {
      const key = ukParts(s.start).dateKey;
      const list = m.get(key) ?? [];
      list.push(s);
      m.set(key, list);
    }
    return m;
  };
  const shiftsByDate = byDate(args.shifts);
  const tripsByDate = byDate(args.businessTrips);

  const slots = new Map<string, { dow: number; hour: number; totalPence: number; days: Set<string> }>();
  let placedPence = 0;
  let unplacedPence = 0;

  for (const e of args.earnings) {
    const day = dateOnlyParts(e.periodStart).dateKey;
    if (dateOnlyParts(e.periodEnd).dateKey !== day) {
      unplacedPence += e.amountPence;
      continue;
    }
    const platform = normalisePlatform(e.platform);
    const dayTrips = tripsByDate.get(day) ?? [];
    const samePlatform = dayTrips.filter((t) => normalisePlatform(t.platformTag) === platform);
    const spans = shiftsByDate.get(day) ?? (samePlatform.length > 0 ? samePlatform : dayTrips);
    if (spans.length === 0) {
      unplacedPence += e.amountPence;
      continue;
    }
    const hours = new Map<string, { dow: number; hour: number; ms: number }>();
    for (const s of spans) {
      for (const [k, v] of minutesByUkHour(s)) {
        const cur = hours.get(k) ?? { dow: v.dow, hour: v.hour, ms: 0 };
        cur.ms += v.ms;
        hours.set(k, cur);
      }
    }
    const totalMs = [...hours.values()].reduce((s, h) => s + h.ms, 0);
    if (totalMs <= 0) {
      unplacedPence += e.amountPence;
      continue;
    }
    for (const [k, h] of hours) {
      const slot = slots.get(k) ?? { dow: h.dow, hour: h.hour, totalPence: 0, days: new Set<string>() };
      slot.totalPence += (e.amountPence * h.ms) / totalMs;
      slot.days.add(day);
      slots.set(k, slot);
    }
    placedPence += e.amountPence;
  }

  return {
    slots: [...slots.values()].map((s) => ({
      dow: s.dow,
      hour: s.hour,
      totalPence: Math.round(s.totalPence),
      days: s.days.size,
    })),
    placedPence,
    unplacedPence,
  };
}

function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

/** Best paid hours: average pay in that hour on the days it was worked. */
export function goldenHoursFromSlots(slots: HourSlot[], limit = 3): {
  dayOfWeek: string;
  hour: number;
  label: string;
  avgEarningsPence: number;
  tripCount: number;
}[] {
  return slots
    .filter((s) => s.totalPence > 0 && s.days > 0)
    .map((s) => ({
      dayOfWeek: WEEKDAY_NAMES[s.dow],
      hour: s.hour,
      label: `${WEEKDAY_NAMES[s.dow]} ${hourLabel(s.hour)} to ${hourLabel((s.hour + 1) % 24)}`,
      avgEarningsPence: Math.round(s.totalPence / s.days),
      // Days this hour was worked (the card says "N sessions").
      tripCount: s.days,
    }))
    .sort((a, b) => b.avgEarningsPence - a.avgEarningsPence || b.tripCount - a.tripCount)
    .slice(0, limit);
}

// ── Running cost per mile ────────────────────────────────────────────
//
// One definition (9 Oct 2026, revised after review). The Overview fuel
// card summed only the first page (3) of this month's fill-ups over this
// month's miles (£0.14); Trends and Fuel Economy divided tax-year spend by
// tax-year miles (23p), which collapses when a driver logs one fill-up
// after months of driving (£60 over 5,000 miles = 1.2p).
//
// From fill-ups: the fill-up window, first to last fill-up logged this
// tax year. Fuel bought at the first fill-up is burned AFTER it and the
// fuel burned before it was never logged, so the first fill-up's cost is
// left out; fill-ups 2..n replace the fuel used between fill-up 1 and
// fill-up n. Rate = cost of fill-ups 2..n / miles between fill-up 1 and
// fill-up n (odometer readings when both ends have one, else the trips
// recorded between them). Needs 2+ fill-ups and 100+ miles in the window.
// A fill-up the driver forgot to log makes this read low, so a rate
// outside half to double the MPG estimate is not trusted.
//
// Otherwise an estimate: MPG (odometer readings, else the vehicle's MPG,
// else 35) at the average price paid per litre (else a typical price).
// A period's fuel cost is its miles times this rate.

export const LITRES_PER_GALLON = 4.54609;
export const MIN_MILES_FOR_FILL_UP_RATE = 100;
const FALLBACK_MPG = 35;
const FALLBACK_PENCE_PER_LITRE: Record<string, number> = { petrol: 138, diesel: 145, hybrid: 138 };

export interface FillUp {
  loggedAt: Date;
  costPence: number;
  litres: number;
  odometerReading: number | null;
}

export interface FillUpWindow {
  start: Date;
  end: Date;
  /** Cost of the fill-ups after the first. */
  spendPence: number;
  /** Odometer miles between the first and last fill-up, when both have a reading. */
  odometerMiles: number | null;
}

/** First to last fill-up; null with fewer than two. */
export function fillUpWindow(fills: FillUp[]): FillUpWindow | null {
  if (fills.length < 2) return null;
  const sorted = [...fills].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const odo =
    first.odometerReading != null && last.odometerReading != null && last.odometerReading > first.odometerReading
      ? last.odometerReading - first.odometerReading
      : null;
  return {
    start: first.loggedAt,
    end: last.loggedAt,
    spendPence: sorted.slice(1).reduce((s, f) => s + f.costPence, 0),
    odometerMiles: odo,
  };
}

export interface RunningCost {
  /** Pence per mile, 1 dp. Null for electric vehicles (see charging). */
  pencePerMile: number | null;
  source: "fill_ups" | "estimate" | null;
  mpg: number | null;
  mpgSource: "odometer" | "vehicle" | "typical" | null;
  pencePerLitre: number | null;
}

export function runningCostPerMile(args: {
  /** From fillUpWindow, with `miles` = odometerMiles or the trip miles between start and end. */
  window: { spendPence: number; miles: number } | null;
  /** All fill-ups this tax year, for the average price per litre. */
  allSpendPence: number;
  allLitres: number;
  odometerMpg: number | null;
  vehicleMpg: number | null;
  fuelType: string | null;
}): RunningCost {
  if (args.fuelType === "electric") {
    return { pencePerMile: null, source: null, mpg: null, mpgSource: null, pencePerLitre: null };
  }
  const mpgSource = args.odometerMpg ? "odometer" : args.vehicleMpg ? "vehicle" : "typical";
  const mpg = args.odometerMpg || args.vehicleMpg || FALLBACK_MPG;
  const pencePerLitre =
    args.allLitres > 0 && args.allSpendPence > 0
      ? round1(args.allSpendPence / args.allLitres)
      : FALLBACK_PENCE_PER_LITRE[args.fuelType ?? "petrol"] ?? FALLBACK_PENCE_PER_LITRE.petrol;
  const estimate = (pencePerLitre * LITRES_PER_GALLON) / mpg;
  const w = args.window;
  if (w && w.spendPence > 0 && w.miles >= MIN_MILES_FOR_FILL_UP_RATE) {
    const rate = w.spendPence / w.miles;
    if (rate >= estimate / 2 && rate <= estimate * 2) {
      return { pencePerMile: round1(rate), source: "fill_ups", mpg, mpgSource, pencePerLitre };
    }
  }
  return { pencePerMile: round1(estimate), source: "estimate", mpg, mpgSource, pencePerLitre };
}

/** The old-client fields: `fuelCostPerMilePence` keeps its meaning (from
 *  real fill-up figures, else null); the estimate goes in a new field. */
export function legacyFuelFields(r: RunningCost): {
  fuelCostPerMilePence: number | null;
  estimatedFuelCostPerMilePence: number | null;
  fuelCostSource: "fill_ups" | "estimate" | null;
} {
  return {
    fuelCostPerMilePence: r.source === "fill_ups" ? r.pencePerMile : null,
    estimatedFuelCostPerMilePence: r.source === "estimate" ? r.pencePerMile : null,
    fuelCostSource: r.source,
  };
}

/** MPG from odometer readings: miles between the first and last reading
 *  over the litres put in after the first. Null below two readings. */
export function odometerMpg(logs: { odometerReading: number | null; litres: number }[]): number | null {
  const withOdo = logs
    .filter((l) => l.odometerReading != null && l.odometerReading > 0)
    .sort((a, b) => a.odometerReading! - b.odometerReading!);
  if (withOdo.length < 2) return null;
  const miles = withOdo[withOdo.length - 1].odometerReading! - withOdo[0].odometerReading!;
  const litres = withOdo.slice(1).reduce((s, l) => s + l.litres, 0);
  if (litres <= 0 || miles <= 0) return null;
  return round1(miles / (litres / LITRES_PER_GALLON));
}
