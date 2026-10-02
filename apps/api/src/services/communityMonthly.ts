// Community numbers: what the whole MileClear fleet did in one UK calendar
// month ("In September, 466 drivers logged 650,000 miles..."). Shown on the
// public /community page, as a card in the app in the first days of the next
// month, and in admin with ready-to-paste social posts.
//
// Pure: no database. services/communityMonthlyLoader.ts reads the rows and
// caches the result; every rule below is unit-tested in
// __tests__/services/communityMonthly.test.ts.
//
// RULES
//   Month        A UK calendar month (Europe/London), so a trip at 00:30 BST
//                on 1 October is October's even though it is 23:30 UTC on
//                30 September. Trips are placed by startedAt.
//   Trips        Non-phantom trips only, and not the newer half of a flagged
//                possible double-count (possibleDuplicateOfId set), so one
//                drive is never counted twice.
//   Active       A driver with at least one counted trip in the month.
//   Claim value  An ESTIMATE of what the month's business miles are worth at
//                the HMRC mileage rates (calculateMileageDeduction with the
//                trip's own tax year, so April 1-5 trips use the old year's
//                table). The 10,000-mile step is applied per driver, per tax
//                year, per vehicle type (as services/mileage.ts does): the
//                month's miles are priced on top of the business miles that
//                driver had already done in that tax year before the month
//                began. A trip with no vehicle is priced as a car (the
//                common case; mileage.ts asks the driver's other vehicles,
//                which is a per-user query this rollup avoids). Employer
//                rates are ignored: this is the HMRC-rate figure, not what
//                anyone was actually paid.
//   Regions      The driver's home region from services/geography.ts
//                (assignHomeArea), today's reading rather than as of the
//                month. Region level only, never an area, district or town,
//                and a home known only from the signup IP is not used.
//
// PRIVACY
//   Aggregates only; nothing here names or describes one driver. No figure
//   is shown when fewer than PRIVACY_FLOOR (10) drivers stand behind it:
//     - the whole month is unpublished (every figure null) below 10 active
//       drivers;
//     - business miles and claim value need 10 drivers with business trips;
//     - new drivers needs 10 sign-ups;
//     - the busiest day needs 10 drivers on that day;
//     - a region is listed only with 10 active drivers in it;
//     - the top platform needs 10 drivers who tagged it.

import { GIG_PLATFORMS, calculateMileageDeduction } from "@mileclear/shared";
import type { CommunityMonthly, CommunityPostVariant } from "@mileclear/shared";
import { londonDayKey, londonDayStart } from "./signupsDaily.js";

export const PRIVACY_FLOOR = 10;
/** The first month offered. MileClear launched on the App Store in March 2026. */
export const COMMUNITY_FIRST_MONTH = "2026-03";
const TOP_REGIONS = 5;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Months ───────────────────────────────────────────────────────────────

export function isMonthKey(v: string): boolean {
  return MONTH_RE.test(v);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** "September 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "September". */
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1];
}

/** The UTC instants a UK calendar month starts and ends (end exclusive). */
export function monthBounds(month: string): { start: Date; end: Date } {
  return {
    start: londonDayStart(`${month}-01`),
    end: londonDayStart(`${shiftMonth(month, 1)}-01`),
  };
}

/** The most recent UK month that has fully ended. */
export function latestCompleteMonth(now: Date): string {
  return shiftMonth(londonDayKey(now).slice(0, 7), -1);
}

/** Every month that can be asked for, newest first. */
export function availableMonths(now: Date): string[] {
  const out: string[] = [];
  for (let m = latestCompleteMonth(now); m >= COMMUNITY_FIRST_MONTH; m = shiftMonth(m, -1)) out.push(m);
  return out;
}

/** UK tax year ("2026-27") of the UK calendar day an instant falls on. */
export function londonTaxYear(d: Date): string {
  const [y, m, day] = londonDayKey(d).split("-").map(Number);
  const startYear = m < 4 || (m === 4 && day < 6) ? y - 1 : y;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

/** The UTC instant a tax year starts (6 April, UK midnight). */
export function taxYearStart(taxYear: string): Date {
  return londonDayStart(`${taxYear.slice(0, 4)}-04-06`);
}

// ── Rollup ───────────────────────────────────────────────────────────────

export type VehicleClass = "car" | "van" | "motorbike";

export interface CommunityTrip {
  userId: string;
  startedAt: Date;
  distanceMiles: number;
  classification: string;
  platformTag: string | null;
  isManualEntry: boolean;
  isPhantomTrip: boolean;
  /** Set on the newer of two trips flagged as a possible double-count. */
  possibleDuplicateOfId: string | null;
  /** The trip's vehicle type, or null when it has no vehicle. */
  vehicleType: string | null;
}

export function vehicleClass(v: string | null | undefined): VehicleClass {
  return v === "van" || v === "motorbike" ? v : "car";
}

/** Key for prior business miles: driver, tax year, vehicle class. */
export function priorKey(userId: string, taxYear: string, vehicle: VehicleClass): string {
  return `${userId}|${taxYear}|${vehicle}`;
}

/** Is this trip counted at all? */
export function countsForCommunity(t: Pick<CommunityTrip, "isPhantomTrip" | "possibleDuplicateOfId">): boolean {
  return !t.isPhantomTrip && t.possibleDuplicateOfId == null;
}

export interface CommunityRollupInput {
  month: string;
  /** Trips that started in the month (the rollup still checks the bounds). */
  trips: CommunityTrip[];
  /**
   * Business miles each driver had already done in the tax year before the
   * month began, keyed by priorKey(). Missing keys mean 0.
   */
  priorBusinessMiles: Map<string, number>;
  /** Accounts created in the month. */
  newDrivers: number;
  /** Home region per driver (null when unknown or IP-only). */
  regionByUser: Map<string, string | null>;
  now: Date;
}

/**
 * Estimated claim value (pence) of business miles driven in a month, given
 * the business miles already done earlier in the same tax year. The 10,000
 * mile step is honoured: the month is priced as the difference between the
 * deduction on (prior + month) and on prior alone.
 */
export function marginalClaimPence(
  vehicle: VehicleClass,
  priorMiles: number,
  monthMiles: number,
  taxYear: string,
): number {
  if (monthMiles <= 0) return 0;
  const before = calculateMileageDeduction(vehicle, Math.max(0, priorMiles), { taxYear }).deductionPence;
  const after = calculateMileageDeduction(vehicle, Math.max(0, priorMiles) + monthMiles, { taxYear }).deductionPence;
  return after - before;
}

const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  GIG_PLATFORMS.map((p) => [p.value as string, p.label as string]),
);
/** Tags that are not a named platform, so never "the most common platform". */
const NOT_A_PLATFORM = new Set(["other", "freelance"]);

function weekdayOf(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
}

function unpublished(input: CommunityRollupInput, months: string[]): CommunityMonthly {
  return {
    month: input.month,
    label: monthLabel(input.month),
    published: false,
    privacyFloor: PRIVACY_FLOOR,
    activeDrivers: null,
    trips: null,
    totalMiles: null,
    businessMiles: null,
    claimValuePence: null,
    newDrivers: null,
    busiestDay: null,
    topRegions: [],
    autoRecordedPct: null,
    topPlatform: null,
    months,
    generatedAt: input.now.toISOString(),
  };
}

export function rollupCommunityMonth(input: CommunityRollupInput): CommunityMonthly {
  const { start, end } = monthBounds(input.month);
  const months = availableMonths(input.now);
  const trips = input.trips.filter(
    (t) => countsForCommunity(t) && t.startedAt >= start && t.startedAt < end && Number.isFinite(t.distanceMiles),
  );

  const drivers = new Set<string>();
  let totalMiles = 0;
  let autoTrips = 0;
  const businessDrivers = new Set<string>();
  let businessMiles = 0;
  // driver|taxYear|vehicle -> month business miles
  const businessByKey = new Map<string, { miles: number; vehicle: VehicleClass; taxYear: string }>();
  const days = new Map<string, { trips: number; miles: number; drivers: Set<string> }>();
  const platforms = new Map<string, { trips: number; drivers: Set<string> }>();

  for (const t of trips) {
    const miles = Math.max(0, t.distanceMiles);
    drivers.add(t.userId);
    totalMiles += miles;
    if (!t.isManualEntry) autoTrips += 1;

    const day = londonDayKey(t.startedAt);
    let d = days.get(day);
    if (!d) {
      d = { trips: 0, miles: 0, drivers: new Set() };
      days.set(day, d);
    }
    d.trips += 1;
    d.miles += miles;
    d.drivers.add(t.userId);

    if (t.platformTag && !NOT_A_PLATFORM.has(t.platformTag)) {
      let p = platforms.get(t.platformTag);
      if (!p) {
        p = { trips: 0, drivers: new Set() };
        platforms.set(t.platformTag, p);
      }
      p.trips += 1;
      p.drivers.add(t.userId);
    }

    if (t.classification === "business") {
      businessDrivers.add(t.userId);
      businessMiles += miles;
      const vehicle = vehicleClass(t.vehicleType);
      const taxYear = londonTaxYear(t.startedAt);
      const key = priorKey(t.userId, taxYear, vehicle);
      const e = businessByKey.get(key);
      if (e) e.miles += miles;
      else businessByKey.set(key, { miles, vehicle, taxYear });
    }
  }

  if (drivers.size < PRIVACY_FLOOR) return unpublished(input, months);

  let claimValuePence = 0;
  for (const [key, e] of businessByKey) {
    claimValuePence += marginalClaimPence(e.vehicle, input.priorBusinessMiles.get(key) ?? 0, e.miles, e.taxYear);
  }
  const businessOk = businessDrivers.size >= PRIVACY_FLOOR;

  let busiest: { date: string; trips: number; miles: number; drivers: number } | null = null;
  for (const [date, d] of days) {
    if (
      !busiest ||
      d.trips > busiest.trips ||
      (d.trips === busiest.trips && d.miles > busiest.miles) ||
      (d.trips === busiest.trips && d.miles === busiest.miles && date < busiest.date)
    ) {
      busiest = { date, trips: d.trips, miles: d.miles, drivers: d.drivers.size };
    }
  }

  const regionCounts = new Map<string, number>();
  for (const id of drivers) {
    const region = input.regionByUser.get(id);
    if (region) regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
  }
  const topRegions = [...regionCounts.entries()]
    .filter(([, n]) => n >= PRIVACY_FLOOR)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_REGIONS)
    .map(([region, n]) => ({ region, drivers: n }));

  const platform = [...platforms.entries()]
    .filter(([, p]) => p.drivers.size >= PRIVACY_FLOOR)
    .sort((a, b) => b[1].drivers.size - a[1].drivers.size || b[1].trips - a[1].trips || a[0].localeCompare(b[0]))[0];

  return {
    month: input.month,
    label: monthLabel(input.month),
    published: true,
    privacyFloor: PRIVACY_FLOOR,
    activeDrivers: drivers.size,
    trips: trips.length,
    totalMiles: Math.round(totalMiles),
    businessMiles: businessOk ? Math.round(businessMiles) : null,
    claimValuePence: businessOk ? claimValuePence : null,
    newDrivers: input.newDrivers >= PRIVACY_FLOOR ? input.newDrivers : null,
    busiestDay:
      busiest && busiest.drivers >= PRIVACY_FLOOR
        ? { date: busiest.date, weekday: weekdayOf(busiest.date), trips: busiest.trips, miles: Math.round(busiest.miles) }
        : null,
    topRegions,
    autoRecordedPct: trips.length ? Math.round((autoTrips / trips.length) * 100) : null,
    topPlatform: platform
      ? {
          platform: platform[0],
          label: PLATFORM_LABELS[platform[0]] ?? platform[0],
          drivers: platform[1].drivers.size,
          trips: platform[1].trips,
        }
      : null,
    months,
    generatedAt: input.now.toISOString(),
  };
}

// ── Social posts ─────────────────────────────────────────────────────────
//
// Plain UK English, no em dashes, no hashtags, and nothing beyond the
// numbers. "HMRC" only ever appears as "the HMRC mileage rates" (whose rates
// they are), never next to a word about MileClear.

export const COMMUNITY_PAGE_URL = "https://mileclear.com/community";

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

/** Claim value for a post: "£1,234,000" style, rounded since it is an estimate. */
export function formatClaimForPost(pence: number): string {
  const pounds = pence / 100;
  const step = pounds >= 100_000 ? 1000 : pounds >= 10_000 ? 100 : 10;
  return `£${(Math.round(pounds / step) * step).toLocaleString("en-GB")}`;
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Friday 12 September". */
export function busiestDayLabel(day: { date: string; weekday: string }): string {
  const [, m, d] = day.date.split("-").map(Number);
  return `${day.weekday} ${d} ${MONTH_NAMES[m - 1]}`;
}

export function buildCommunityPosts(c: CommunityMonthly): CommunityPostVariant[] {
  if (!c.published || c.activeDrivers == null || c.trips == null || c.totalMiles == null) return [];
  const name = monthName(c.month);
  const drivers = formatCount(c.activeDrivers);
  const miles = formatCount(c.totalMiles);
  const trips = formatCount(c.trips);
  const posts: CommunityPostVariant[] = [];

  // 1. The full post, for the Facebook group.
  const full: string[] = [
    `In ${name}, ${drivers} MileClear drivers logged ${miles} miles across ${trips} trips.`,
  ];
  if (c.businessMiles != null && c.claimValuePence != null && c.claimValuePence > 0) {
    full.push(
      `${formatCount(c.businessMiles)} of those miles were for work, worth about ${formatClaimForPost(c.claimValuePence)} in mileage claims at the HMRC mileage rates.`,
    );
  }
  const extras: string[] = [];
  if (c.busiestDay) extras.push(`The busiest day was ${busiestDayLabel(c.busiestDay)}, with ${formatCount(c.busiestDay.trips)} trips.`);
  if (c.autoRecordedPct != null) extras.push(`${c.autoRecordedPct}% of trips were recorded automatically.`);
  if (extras.length) full.push("", extras.join(" "));
  full.push("", `Thanks for driving with us. All the numbers: ${COMMUNITY_PAGE_URL}`);
  posts.push({ key: "full", label: "Facebook group", text: full.join("\n") });

  // 2. Short, for X / Threads / a story caption.
  posts.push({
    key: "short",
    label: "Short",
    text: `${name} in numbers: ${drivers} drivers, ${miles} miles, ${trips} trips, all logged with MileClear. ${COMMUNITY_PAGE_URL}`,
  });

  // 3. Community: where people drive and who joined.
  const community: string[] = [];
  if (c.topRegions.length) {
    community.push(
      `Where MileClear drivers were busiest in ${name}: ${listJoin(c.topRegions.slice(0, 3).map((r) => r.region))}.`,
    );
  }
  if (c.newDrivers != null) community.push(`A warm welcome to the ${formatCount(c.newDrivers)} drivers who joined in ${name}.`);
  if (c.topPlatform) community.push(`The platform drivers tagged most often was ${c.topPlatform.label}.`);
  if (community.length) {
    community.push("", `Together you drove ${miles} miles in ${name}. ${COMMUNITY_PAGE_URL}`);
    posts.push({ key: "community", label: "Community", text: community.join("\n") });
  }

  return posts;
}
