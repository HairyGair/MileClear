/**
 * EmSee (was Ask MileClear; Pro, Oct 2026): the server-side tools the model can call.
 *
 * Every executor takes the driver's id from the authenticated request, never
 * from the model. The input schemas are strict, so a model that tries to pass
 * a `userId` (or anything else unexpected) gets a validation error back and
 * nothing is queried.
 *
 * What comes back is deliberately small: totals and groupings as pence
 * integers with a formatted string beside each one. Never GPS coordinates,
 * addresses, routes, station names, notes or descriptions, and never anything
 * about another driver.
 */

import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { claimValuePence, employerRatesFor, type RatedTrip } from "../lib/mileageRates.js";
import { messageTheTeam } from "./assistantMessage.js";
import { HELP_AREAS, helpForArea } from "./assistantHelp.js";
import { getProEntitlement, PERSONAL_PRO_SELECT } from "./proEntitlement.js";
import { lookupExpense } from "./expenseBank.js";
import { fetchExpenseSummary } from "./export-data.js";
import { buildTaxSnapshot } from "./taxSnapshot.js";
import { fallbackVehicleTypeFromList } from "./vehicleDefaults.js";
import {
  calculateMileageDeduction,
  getTaxYear,
  parseTaxYear,
  formatPence,
  EXPENSE_CATEGORIES,
  GIG_PLATFORMS,
} from "@mileclear/shared";

// ── Dates (UK) ──────────────────────────────────────────────────────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 3 * 366; // "up to 3 years"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The calendar day in London for an instant, as "YYYY-MM-DD". */
export function londonDayKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** London midnight at the start of a calendar day, as a UTC instant. */
export function londonMidnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d, 0);
  // London is UTC+1 in summer, so its midnight is 23:00 UTC the night before.
  const londonHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(
      new Date(utcMidnight)
    )
  );
  return new Date(utcMidnight - londonHour * 3600 * 1000);
}

function dayToUtc(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function addDays(day: string, n: number): string {
  return new Date(dayToUtc(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Monday of the week containing `day` (weeks run Monday to Sunday). */
export function mondayOf(day: string): string {
  const dow = new Date(dayToUtc(day)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

function isRealDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** "2026-09-01" -> "1 Sep 2026". */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function periodOf(from: string, to: string) {
  return { from, to, label: from === to ? dayLabel(from) : `${dayLabel(from)} to ${dayLabel(to)}` };
}

const rangeShape = {
  from: z.string().refine(isRealDay, "from must be a real date as YYYY-MM-DD"),
  to: z.string().refine(isRealDay, "to must be a real date as YYYY-MM-DD"),
};

function checkRange<T extends { from: string; to: string }>(schema: z.ZodType<T>) {
  return schema.superRefine((v, ctx) => {
    if (!isRealDay(v.from) || !isRealDay(v.to)) return;
    if (v.from > v.to) ctx.addIssue({ code: "custom", message: "from must be on or before to" });
    else if ((dayToUtc(v.to) - dayToUtc(v.from)) / 86_400_000 > MAX_RANGE_DAYS)
      ctx.addIssue({ code: "custom", message: "The range can be at most 3 years. Ask for a shorter period." });
    else if (v.from < "2000-01-01") ctx.addIssue({ code: "custom", message: "from is too far in the past" });
  });
}

/** Bounds for columns holding an instant (trips, fuel logs). */
function instantBounds(from: string, to: string) {
  return { gte: londonMidnight(from), lt: londonMidnight(addDays(to, 1)) };
}

/** Bounds for @db.Date columns (earnings, expenses). */
function dateBounds(from: string, to: string) {
  return { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) };
}

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;
const money = (pence: number) => ({ pence, formatted: formatPence(pence) });
const miles = (n: number) => `${round1(n).toLocaleString("en-GB", { maximumFractionDigits: 1 })} mi`;

/** Too many weekly rows waste the model's context; months are enough then. */
const MAX_GROUPS = 60;

type GroupBy = "none" | "week" | "month";

function groupKey(day: string, by: GroupBy): string | null {
  if (by === "week") return mondayOf(day);
  if (by === "month") return day.slice(0, 7);
  return null;
}

function groupLabel(key: string, by: GroupBy): string {
  return by === "week" ? `Week of Mon ${dayLabel(key)}` : monthLabel(key);
}

function finishGroups<T extends { key: string }>(map: Map<string, T>, by: GroupBy) {
  const rows = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (rows.length > MAX_GROUPS) {
    return {
      groups: rows.slice(-MAX_GROUPS).map((r) => ({ ...r, label: groupLabel(r.key, by) })),
      note: `Only the latest ${MAX_GROUPS} groups are shown. Group by month for a longer view.`,
    };
  }
  return { groups: rows.map((r) => ({ ...r, label: groupLabel(r.key, by) })) };
}

const PLATFORM_VALUES = GIG_PLATFORMS.map((p) => p.value) as [string, ...string[]];
const PLATFORM_LABEL = new Map<string, string>(GIG_PLATFORMS.map((p) => [p.value, p.label]));
const CATEGORY_VALUES = EXPENSE_CATEGORIES.map((c) => c.value) as [string, ...string[]];
const CATEGORY_META = new Map<string, { label: string; deductibleWithMileage: boolean }>(
  EXPENSE_CATEGORIES.map((c) => [c.value, { label: c.label, deductibleWithMileage: c.deductibleWithMileage }])
);

async function vehicleLabels(userId: string) {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId },
    select: { id: true, make: true, model: true, vehicleType: true, isPrimary: true },
  });
  return {
    vehicles,
    label: new Map(vehicles.map((v) => [v.id, `${v.make} ${v.model}`.trim()])),
  };
}

// ── earnings_summary ───────────────────────────────────────────────────────

const earningsSchema = checkRange(
  z
    .object({
      ...rangeShape,
      platform: z.enum(PLATFORM_VALUES).optional(),
      group_by: z.enum(["none", "week", "month"]).optional(),
    })
    .strict()
);

async function earningsSummary(userId: string, raw: unknown) {
  const input = earningsSchema.parse(raw);
  const by: GroupBy = input.group_by ?? "none";
  const rows = await prisma.earning.findMany({
    where: {
      userId,
      periodStart: dateBounds(input.from, input.to),
      ...(input.platform ? { platform: input.platform } : {}),
    },
    select: { platform: true, amountPence: true, periodStart: true },
  });

  let total = 0;
  const byPlatform = new Map<string, { pence: number; entries: number }>();
  const groups = new Map<string, { key: string; pence: number; entries: number }>();
  for (const r of rows) {
    total += r.amountPence;
    const p = byPlatform.get(r.platform) ?? { pence: 0, entries: 0 };
    p.pence += r.amountPence;
    p.entries += 1;
    byPlatform.set(r.platform, p);
    const k = groupKey(dateKey(r.periodStart), by);
    if (k) {
      const g = groups.get(k) ?? { key: k, pence: 0, entries: 0 };
      g.pence += r.amountPence;
      g.entries += 1;
      groups.set(k, g);
    }
  }

  const grouped = by === "none" ? null : finishGroups(groups, by);
  return {
    period: periodOf(input.from, input.to),
    platformFilter: input.platform ? PLATFORM_LABEL.get(input.platform) ?? input.platform : null,
    entries: rows.length,
    total: money(total),
    byPlatform: [...byPlatform.entries()]
      .sort((a, b) => b[1].pence - a[1].pence)
      .map(([platform, v]) => ({ platform: PLATFORM_LABEL.get(platform) ?? platform, entries: v.entries, ...money(v.pence) })),
    ...(grouped
      ? {
          groups: grouped.groups.map((g) => ({ label: g.label, entries: g.entries, ...money(g.pence) })),
          ...(grouped.note ? { note: grouped.note } : {}),
        }
      : {}),
    basis: "Earnings recorded in MileClear, counted by the date each one starts. Invoices are not included.",
  };
}

// ── mileage_summary ────────────────────────────────────────────────────────

const mileageSchema = checkRange(
  z
    .object({
      ...rangeShape,
      group_by: z.enum(["none", "week", "month"]).optional(),
    })
    .strict()
);

async function mileageSummary(userId: string, raw: unknown) {
  const input = mileageSchema.parse(raw);
  const by: GroupBy = input.group_by ?? "none";
  const [trips, { label }] = await Promise.all([
    prisma.trip.findMany({
      where: { userId, isPhantomTrip: false, startedAt: instantBounds(input.from, input.to) },
      select: { distanceMiles: true, classification: true, vehicleId: true, platformTag: true, startedAt: true },
    }),
    vehicleLabels(userId),
  ]);

  type Bucket = { business: number; personal: number; unclassified: number; trips: number };
  const empty = (): Bucket => ({ business: 0, personal: 0, unclassified: 0, trips: 0 });
  const add = (b: Bucket, cls: string, mi: number) => {
    b.trips += 1;
    if (cls === "business") b.business += mi;
    else if (cls === "personal") b.personal += mi;
    else b.unclassified += mi;
  };
  const fmt = (b: Bucket) => ({
    trips: b.trips,
    businessMiles: round1(b.business),
    personalMiles: round1(b.personal),
    unclassifiedMiles: round1(b.unclassified),
    totalMiles: round1(b.business + b.personal + b.unclassified),
    formatted: `${miles(b.business)} business, ${miles(b.personal)} personal, ${miles(b.unclassified)} not yet classified`,
  });

  const total = empty();
  const byVehicle = new Map<string, Bucket>();
  const byPlatform = new Map<string, number>();
  const groups = new Map<string, Bucket & { key: string }>();
  for (const t of trips) {
    add(total, t.classification, t.distanceMiles);
    const vKey = t.vehicleId && label.has(t.vehicleId) ? label.get(t.vehicleId)! : "No vehicle set";
    const vb = byVehicle.get(vKey) ?? empty();
    add(vb, t.classification, t.distanceMiles);
    byVehicle.set(vKey, vb);
    if (t.classification === "business" && t.platformTag) {
      byPlatform.set(t.platformTag, (byPlatform.get(t.platformTag) ?? 0) + t.distanceMiles);
    }
    const k = groupKey(londonDayKey(t.startedAt), by);
    if (k) {
      const g = groups.get(k) ?? { key: k, ...empty() };
      add(g, t.classification, t.distanceMiles);
      groups.set(k, g);
    }
  }

  const grouped = by === "none" ? null : finishGroups(groups, by);
  return {
    period: periodOf(input.from, input.to),
    ...fmt(total),
    byVehicle: [...byVehicle.entries()].map(([vehicle, b]) => ({ vehicle, ...fmt(b) })),
    businessMilesByPlatform: [...byPlatform.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([p, mi]) => ({ platform: PLATFORM_LABEL.get(p) ?? p, businessMiles: round1(mi) })),
    ...(grouped
      ? {
          groups: grouped.groups.map((g) => ({ label: g.label, ...fmt(g) })),
          ...(grouped.note ? { note: grouped.note } : {}),
        }
      : {}),
  };
}

// ── expenses_summary ───────────────────────────────────────────────────────

const expensesSchema = checkRange(
  z
    .object({
      ...rangeShape,
      category: z.enum(CATEGORY_VALUES).optional(),
      group_by: z.enum(["none", "month"]).optional(),
    })
    .strict()
);

async function expensesSummary(userId: string, raw: unknown) {
  const input = expensesSchema.parse(raw);
  const by: GroupBy = input.group_by ?? "none";
  const rows = await prisma.expense.findMany({
    where: {
      userId,
      date: dateBounds(input.from, input.to),
      ...(input.category ? { category: input.category } : {}),
    },
    select: { category: true, amountPence: true, date: true },
  });

  let total = 0;
  const byCategory = new Map<string, { pence: number; entries: number }>();
  const groups = new Map<string, { key: string; pence: number; entries: number }>();
  for (const r of rows) {
    total += r.amountPence;
    const c = byCategory.get(r.category) ?? { pence: 0, entries: 0 };
    c.pence += r.amountPence;
    c.entries += 1;
    byCategory.set(r.category, c);
    const k = groupKey(dateKey(r.date), by);
    if (k) {
      const g = groups.get(k) ?? { key: k, pence: 0, entries: 0 };
      g.pence += r.amountPence;
      g.entries += 1;
      groups.set(k, g);
    }
  }

  const grouped = by === "none" ? null : finishGroups(groups, by);
  return {
    period: periodOf(input.from, input.to),
    entries: rows.length,
    total: money(total),
    byCategory: [...byCategory.entries()]
      .sort((a, b) => b[1].pence - a[1].pence)
      .map(([cat, v]) => ({
        category: CATEGORY_META.get(cat)?.label ?? cat,
        entries: v.entries,
        claimableOnTopOfMileageRate: CATEGORY_META.get(cat)?.deductibleWithMileage ?? true,
        ...money(v.pence),
      })),
    ...(grouped
      ? {
          groups: grouped.groups.map((g) => ({ label: g.label, entries: g.entries, ...money(g.pence) })),
          ...(grouped.note ? { note: grouped.note } : {}),
        }
      : {}),
  };
}

// ── fuel_summary ───────────────────────────────────────────────────────────

const fuelSchema = checkRange(
  z
    .object({
      ...rangeShape,
      group_by: z.enum(["none", "month"]).optional(),
    })
    .strict()
);

async function fuelSummary(userId: string, raw: unknown) {
  const input = fuelSchema.parse(raw);
  const by: GroupBy = input.group_by ?? "none";
  const [logs, { label }] = await Promise.all([
    prisma.fuelLog.findMany({
      where: { userId, loggedAt: instantBounds(input.from, input.to) },
      // Never station name or coordinates.
      select: { costPence: true, litres: true, vehicleId: true, loggedAt: true },
    }),
    vehicleLabels(userId),
  ]);

  type B = { pence: number; litres: number; fillUps: number };
  const fmt = (b: B) => ({
    fillUps: b.fillUps,
    litres: round1(b.litres),
    ...money(b.pence),
    averagePencePerLitre: b.litres > 0 ? Math.round((b.pence / b.litres) * 10) / 10 : null,
  });
  const total: B = { pence: 0, litres: 0, fillUps: 0 };
  const byVehicle = new Map<string, B>();
  const groups = new Map<string, B & { key: string }>();
  for (const l of logs) {
    total.pence += l.costPence;
    total.litres += l.litres;
    total.fillUps += 1;
    const vKey = l.vehicleId && label.has(l.vehicleId) ? label.get(l.vehicleId)! : "No vehicle set";
    const v = byVehicle.get(vKey) ?? { pence: 0, litres: 0, fillUps: 0 };
    v.pence += l.costPence;
    v.litres += l.litres;
    v.fillUps += 1;
    byVehicle.set(vKey, v);
    const k = groupKey(londonDayKey(l.loggedAt), by);
    if (k) {
      const g = groups.get(k) ?? { key: k, pence: 0, litres: 0, fillUps: 0 };
      g.pence += l.costPence;
      g.litres += l.litres;
      g.fillUps += 1;
      groups.set(k, g);
    }
  }

  const grouped = by === "none" ? null : finishGroups(groups, by);
  return {
    period: periodOf(input.from, input.to),
    ...fmt(total),
    byVehicle: [...byVehicle.entries()].map(([vehicle, b]) => ({ vehicle, ...fmt(b) })),
    ...(grouped
      ? {
          groups: grouped.groups.map((g) => ({ label: g.label, ...fmt(g) })),
          ...(grouped.note ? { note: grouped.note } : {}),
        }
      : {}),
    basis: "Fill-ups logged in MileClear.",
  };
}

// ── best_worst_week ────────────────────────────────────────────────────────

const weekSchema = checkRange(
  z
    .object({
      ...rangeShape,
      metric: z.enum(["earnings", "business_miles", "total_miles"]),
    })
    .strict()
);

async function bestWorstWeek(userId: string, raw: unknown) {
  const input = weekSchema.parse(raw);
  const weeks = new Map<string, number>();
  if (input.metric === "earnings") {
    const rows = await prisma.earning.findMany({
      where: { userId, periodStart: dateBounds(input.from, input.to) },
      select: { amountPence: true, periodStart: true },
    });
    for (const r of rows) {
      const k = mondayOf(dateKey(r.periodStart));
      weeks.set(k, (weeks.get(k) ?? 0) + r.amountPence);
    }
  } else {
    const trips = await prisma.trip.findMany({
      where: {
        userId,
        isPhantomTrip: false,
        startedAt: instantBounds(input.from, input.to),
        ...(input.metric === "business_miles" ? { classification: "business" } : {}),
      },
      select: { distanceMiles: true, startedAt: true },
    });
    for (const t of trips) {
      const k = mondayOf(londonDayKey(t.startedAt));
      weeks.set(k, (weeks.get(k) ?? 0) + t.distanceMiles);
    }
  }

  const describe = (k: string, v: number) => ({
    week: `Mon ${dayLabel(k)} to Sun ${dayLabel(addDays(k, 6))}`,
    ...(input.metric === "earnings" ? money(Math.round(v)) : { miles: round1(v), formatted: miles(v) }),
  });
  const active = [...weeks.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (active.length === 0) {
    return { period: periodOf(input.from, input.to), metric: input.metric, weeksWithRecords: 0 };
  }
  const sum = active.reduce((s, [, v]) => s + v, 0);
  return {
    period: periodOf(input.from, input.to),
    metric: input.metric,
    weeksWithRecords: active.length,
    best: describe(active[0][0], active[0][1]),
    worst: describe(active[active.length - 1][0], active[active.length - 1][1]),
    topThree: active.slice(0, 3).map(([k, v]) => describe(k, v)),
    averageActiveWeek: describe(active[0][0], sum / active.length).formatted,
    basis: "Weeks run Monday to Sunday. Weeks with nothing recorded are left out of best and worst.",
  };
}

// ── tax_year_figures ───────────────────────────────────────────────────────

const taxYearSchema = z
  .object({
    tax_year: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "tax_year must look like 2026-27")
      .optional(),
  })
  .strict();

async function taxYearFigures(userId: string, raw: unknown, now: Date) {
  const input = taxYearSchema.parse(raw);
  const current = getTaxYear(now);
  const taxYear = input.tax_year ?? current;
  let bounds: { start: Date; end: Date };
  try {
    bounds = parseTaxYear(taxYear);
  } catch {
    throw new ToolInputError("tax_year must be a real tax year like 2026-27");
  }
  const startYear = Number(taxYear.slice(0, 4));
  if (startYear < 2015 || taxYear > current) throw new ToolInputError(`tax_year must be between 2015-16 and ${current}`);

  const [user, vehicles, trips, earnings, expenses] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { workType: true, employerMileageRatePence: true, employerMileageRatePenceAfter10k: true },
    }),
    prisma.vehicle.findMany({ where: { userId }, select: { id: true, vehicleType: true, isPrimary: true, providedByOthers: true } }),
    prisma.trip.findMany({
      where: { userId, isPhantomTrip: false, classification: "business", startedAt: { gte: bounds.start, lte: bounds.end } },
      select: { distanceMiles: true, vehicleId: true, platformTag: true },
    }),
    prisma.earning.aggregate({
      where: { userId, periodStart: { gte: bounds.start, lte: bounds.end } },
      _sum: { amountPence: true },
      _count: true,
    }),
    fetchExpenseSummary(userId, taxYear),
  ]);

  // Cars and vans share ONE 10,000-mile threshold a year (EIM31240), as in
  // services/mileage.ts; motorbikes have their own flat rate.
  const fallback = fallbackVehicleTypeFromList(vehicles);
  const typeOf = new Map(vehicles.map((v) => [v.id, v.vehicleType]));
  const providedIds = new Set(vehicles.filter((v) => v.providedByOthers).map((v) => v.id));
  let carVan = 0;
  let motorbike = 0;
  let provided = 0;
  const rated: RatedTrip[] = [];
  for (const t of trips) {
    // Vehicles someone else pays for: business miles, but no allowance.
    if (t.vehicleId && providedIds.has(t.vehicleId)) {
      provided += t.distanceMiles;
      continue;
    }
    const vt = (t.vehicleId && typeOf.get(t.vehicleId)) || fallback;
    if (vt === "motorbike") motorbike += t.distanceMiles;
    else carVan += t.distanceMiles;
    rated.push({ distanceMiles: t.distanceMiles, vehicleType: vt as RatedTrip["vehicleType"], platformTag: t.platformTag });
  }
  // The rate table to describe, and the allowance worked out the same way as
  // Home: gig-app trips at the approved rates, other work trips at the
  // employer's rate when one is set (lib/mileageRates).
  const employer = employerRatesFor(user);
  const carCalc = calculateMileageDeduction("car", carVan, { ...(employer ?? {}), taxYear });
  const bikeCalc = calculateMileageDeduction("motorbike", motorbike, { ...(employer ?? {}), taxYear });
  const allowancePence = claimValuePence(rated, user, taxYear);

  const result: Record<string, unknown> = {
    taxYear,
    period: periodOf(dateKey(new Date(Date.UTC(startYear, 3, 6))), dateKey(new Date(Date.UTC(startYear + 1, 3, 5)))),
    isCurrentTaxYear: taxYear === current,
    businessMiles: {
      carAndVan: round1(carVan),
      motorbike: round1(motorbike),
      total: round1(carVan + motorbike),
      ...(provided > 0
        ? {
            inVehiclesSomeoneElsePaysFor: round1(provided),
            note: "Business miles in vehicles marked as paid for by someone else are not in the mileage allowance or the totals above.",
          }
        : {}),
    },
    mileageRates: {
      source: carCalc.source === "employer"
        ? "your employer's rate for work trips; HMRC approved mileage rates for trips tagged with a gig app (self-employed)"
        : "HMRC approved mileage rates",
      carAndVan: `${carCalc.rateFirst10kPence}p a mile for the first 10,000 business miles (cars and vans together), ${carCalc.rateAfter10kPence}p after`,
      motorbike: `${bikeCalc.rateFirst10kPence}p a mile`,
    },
    mileageAllowance: money(allowancePence),
    earningsRecorded: { entries: earnings._count, ...money(earnings._sum.amountPence ?? 0) },
    expenses: {
      claimableOnTopOfMileageRate: money(expenses.totalAllowablePence),
      coveredByMileageRate: money(expenses.totalNonAllowablePence),
      byCategory: expenses.categories.map((c) => ({
        category: c.label,
        claimableOnTopOfMileageRate: c.deductibleWithMileage,
        ...money(c.totalPence),
      })),
    },
  };

  if (taxYear === current) {
    const snap = await buildTaxSnapshot(userId);
    result.estimateSoFar = {
      grossIncome: money(snap.ytd.grossEarningsPence),
      taxableProfit: money(snap.ytd.taxableProfitPence),
      estimatedTaxAndNationalInsurance: money(snap.ytd.estimatedTaxPence),
      filingDeadline: dayLabel(snap.filingDeadline.slice(0, 10)),
      note: "A rough estimate from what is recorded so far this tax year. Gross income includes invoices.",
    };
  }
  return result;
}

// ── can_i_claim ────────────────────────────────────────────────────────────

/** Expense-bank entry -> the driver's own expense category, where one fits. */
const BANK_TO_CATEGORY: Record<string, string> = {
  "phone-bill": "phone",
  "phone-device": "phone",
  "phone-mount": "phone",
  parking: "parking",
  toll: "tolls",
  "congestion-charge": "congestion",
  insurance: "insurance",
  mot: "mot",
  servicing: "maintenance",
  tyres: "maintenance",
  "car-wash": "maintenance",
  ppe: "clothing",
  clothing: "clothing",
  "branded-uniform": "clothing",
  helmet: "clothing",
  "delivery-bag": "equipment",
  dashcam: "equipment",
  satnav: "equipment",
  tools: "equipment",
  "first-aid-kit": "equipment",
  "cleaning-supplies": "equipment",
  accountant: "professional_fees",
  subscriptions: "subscription",
  "software-subs": "subscription",
  hotel: "accommodation",
  "public-transport": "public_transport",
  coffee: "subsistence",
};

const claimSchema = z.object({ item: z.string().trim().min(1).max(100) }).strict();

/** Expense-bank copy predates the no-em-dash rule; keep the answer clean. */
const noDash = (s: string) => s.replace(/\s*[–—]\s*/g, ", ");

async function canIClaim(userId: string, raw: unknown, now: Date) {
  const input = claimSchema.parse(raw);
  const entry = lookupExpense(input.item);
  if (!entry) {
    return {
      found: false,
      item: input.item,
      note: "No guidance for that item in MileClear's list. Suggest checking GOV.UK or an accountant.",
    };
  }
  const result: Record<string, unknown> = {
    found: true,
    name: entry.name,
    canClaim: entry.status,
    explanation: noDash(entry.explanation),
    ...(entry.note ? { note: noDash(entry.note) } : {}),
    guidance: "General guidance only.",
  };
  const category = BANK_TO_CATEGORY[entry.id];
  if (category) {
    const taxYear = getTaxYear(now);
    const { start, end } = parseTaxYear(taxYear);
    const agg = await prisma.expense.aggregate({
      where: { userId, category, date: { gte: start, lte: end } },
      _sum: { amountPence: true },
      _count: true,
    });
    result.yourRecords = {
      category: CATEGORY_META.get(category)?.label ?? category,
      taxYear,
      entries: agg._count,
      ...money(agg._sum.amountPence ?? 0),
    };
  }
  return result;
}

// ── trips_list ─────────────────────────────────────────────────────────────

/** Short enough for "did my trip on Tuesday record?" without dumping a month. */
const TRIPS_LIST_MAX_DAYS = 7;
const TRIPS_LIST_MAX_ROWS = 60;

const tripsListSchema = checkRange(
  z.object({ ...rangeShape }).strict()
).superRefine((v, ctx) => {
  if (isRealDay(v.from) && isRealDay(v.to) && (dayToUtc(v.to) - dayToUtc(v.from)) / 86_400_000 >= TRIPS_LIST_MAX_DAYS) {
    ctx.addIssue({ code: "custom", message: `List at most ${TRIPS_LIST_MAX_DAYS} days at a time. Use mileage_summary for longer periods.` });
  }
});

/** "14:05" in London time. */
function londonTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

async function tripsList(userId: string, raw: unknown) {
  const input = tripsListSchema.parse(raw);
  const rows = await prisma.trip.findMany({
    where: { userId, isPhantomTrip: false, startedAt: instantBounds(input.from, input.to) },
    select: { startedAt: true, endedAt: true, distanceMiles: true, classification: true, platformTag: true, isManualEntry: true },
    orderBy: { startedAt: "asc" },
    take: TRIPS_LIST_MAX_ROWS + 1,
  });
  const shown = rows.slice(0, TRIPS_LIST_MAX_ROWS);
  return {
    period: periodOf(input.from, input.to),
    trip_count: shown.length,
    trips: shown.map((t) => ({
      day: dayLabel(londonDayKey(t.startedAt)),
      start: londonTime(t.startedAt),
      end: t.endedAt ? londonTime(t.endedAt) : null,
      miles: miles(t.distanceMiles),
      classification: t.classification === "unclassified" ? "not sorted yet" : t.classification,
      platform: t.platformTag ? PLATFORM_LABEL.get(t.platformTag) ?? t.platformTag : null,
      added_by_hand: t.isManualEntry,
    })),
    ...(rows.length > TRIPS_LIST_MAX_ROWS ? { note: `Only the first ${TRIPS_LIST_MAX_ROWS} trips are shown. Ask about fewer days.` } : {}),
    about:
      "Only trips saved to the driver's account are listed. A drive can still be on their phone waiting to upload, or arrive later; places and routes are not available here.",
  };
}

// ── account_status ─────────────────────────────────────────────────────────

const FREE_VEHICLES = 1;
const FREE_SAVED_PLACES = 2;

const accountStatusSchema = z.object({}).strict();

async function accountStatus(userId: string, raw: unknown) {
  accountStatusSchema.parse(raw);
  const [user, vehicles, places, toSort, lastTrip, firstTrip] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { ...PERSONAL_PRO_SELECT, workType: true, dashboardMode: true, createdAt: true } }),
    prisma.vehicle.count({ where: { userId } }),
    prisma.savedLocation.count({ where: { userId } }),
    prisma.trip.count({ where: { userId, isPhantomTrip: false, classification: "unclassified" } }),
    prisma.trip.findFirst({ where: { userId, isPhantomTrip: false }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    prisma.trip.findFirst({ where: { userId, isPhantomTrip: false }, orderBy: { startedAt: "asc" }, select: { startedAt: true } }),
  ]);
  if (!user) throw new ToolInputError("No account found.");
  const pro = await getProEntitlement(userId, user);
  const sourceText: Record<string, string> = {
    subscription: "their own subscription",
    referral: "free months from inviting friends",
    team: "their employer's team",
    partner: "a partner offer",
    none: "not Pro",
  };
  return {
    pro: {
      active: pro.isPro,
      from: sourceText[pro.source] ?? pro.source,
      until: pro.until ? dayLabel(londonDayKey(pro.until)) : null,
      note: "If Pro comes from a subscription, the date is when the paid period ends or renews.",
    },
    work_type: user.workType,
    dashboard_mode: user.dashboardMode,
    joined: dayLabel(londonDayKey(user.createdAt)),
    vehicles: { count: vehicles, free_plan_limit: FREE_VEHICLES },
    saved_places: { count: places, free_plan_limit: FREE_SAVED_PLACES },
    trips_not_sorted_yet: toSort,
    first_trip: firstTrip ? dayLabel(londonDayKey(firstTrip.startedAt)) : null,
    latest_trip: lastTrip ? `${dayLabel(londonDayKey(lastTrip.startedAt))} at ${londonTime(lastTrip.startedAt)}` : null,
  };
}

// ── mileclear_help ─────────────────────────────────────────────────────────

const helpSchema = z.object({ area: z.enum(HELP_AREAS) }).strict();

async function mileclearHelp(raw: unknown) {
  return helpForArea(helpSchema.parse(raw).area);
}

// ── Registry ───────────────────────────────────────────────────────────────

export class ToolInputError extends Error {}

const dateProps = {
  from: { type: "string", description: "First day, YYYY-MM-DD (UK date)." },
  to: { type: "string", description: "Last day, YYYY-MM-DD (UK date), inclusive. At most 3 years after from." },
};

/** Tool definitions sent to the Messages API. Order is fixed. */
export const ASSISTANT_TOOLS = [
  {
    name: "earnings_summary",
    description:
      "Total earnings the driver recorded in MileClear between two dates, split by platform. Optionally one platform only, and optionally grouped by week or month.",
    input_schema: {
      type: "object",
      properties: {
        ...dateProps,
        platform: { type: "string", enum: PLATFORM_VALUES, description: "Only this platform." },
        group_by: { type: "string", enum: ["none", "week", "month"] },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "mileage_summary",
    description:
      "Miles and trip counts between two dates: business, personal and not yet classified, split by vehicle and (for business) by platform. Optionally grouped by week or month.",
    input_schema: {
      type: "object",
      properties: { ...dateProps, group_by: { type: "string", enum: ["none", "week", "month"] } },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "expenses_summary",
    description:
      "Expenses the driver recorded between two dates, by category. Says whether each category can be claimed on top of the mileage rate.",
    input_schema: {
      type: "object",
      properties: {
        ...dateProps,
        category: { type: "string", enum: CATEGORY_VALUES, description: "Only this category." },
        group_by: { type: "string", enum: ["none", "month"] },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "fuel_summary",
    description: "Fuel fill-ups logged between two dates: total spend, litres, average pence per litre, by vehicle.",
    input_schema: {
      type: "object",
      properties: { ...dateProps, group_by: { type: "string", enum: ["none", "month"] } },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "best_worst_week",
    description:
      "The best and worst weeks (Monday to Sunday) between two dates for earnings, business miles or total miles, with the top three and the average week.",
    input_schema: {
      type: "object",
      properties: { ...dateProps, metric: { type: "string", enum: ["earnings", "business_miles", "total_miles"] } },
      required: ["from", "to", "metric"],
      additionalProperties: false,
    },
  },
  {
    name: "tax_year_figures",
    description:
      "Figures for one UK tax year (6 April to 5 April): business miles, the mileage allowance at that year's rates, earnings, expenses, and for the current year a rough tax estimate so far.",
    input_schema: {
      type: "object",
      properties: { tax_year: { type: "string", description: "Like 2026-27. Leave out for the current tax year." } },
      additionalProperties: false,
    },
  },
  {
    name: "can_i_claim",
    description:
      "General guidance on whether a self-employed UK driver can usually claim a cost (for example phone, parking, insurance, uniform), plus what the driver has recorded in that expense category this tax year.",
    input_schema: {
      type: "object",
      properties: { item: { type: "string", description: "The thing they want to claim, in a few words." } },
      required: ["item"],
      additionalProperties: false,
    },
  },
  {
    name: "trips_list",
    description:
      "The driver's individual trips between two dates (at most 7 days): day, start and end time (UK), miles, Business/Personal/not sorted yet, platform, and whether it was added by hand. Use it for questions about particular trips, such as whether a drive was recorded. No places or routes.",
    input_schema: {
      type: "object",
      properties: { ...dateProps },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "account_status",
    description:
      "The driver's account: whether Pro is on, where it comes from and until when, work type, number of vehicles and saved places against the free plan limits, how many trips are not sorted yet, and the dates of their first and latest trips.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "mileclear_help",
    description:
      "How MileClear works: where things are in the app, what each feature does, what is free or Pro, and what to do when something goes wrong (missing trips, permissions, billing, account). Returns the written answers for one area. Use it for every question about using the app; never describe a screen, setting or feature that it does not return.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: HELP_AREAS,
          description:
            "getting_started; recording_trips (automatic trips, Start Trip, shifts, pause, battery, permissions); missing_or_wrong_trips; managing_trips (classify, add, edit, merge, split, delete, odometer); tax_and_claims; money (earnings, expenses, receipts, bank, invoices, fuel, fines); vehicles_and_places; pro_and_billing; account_and_app (sign-in, deleting, data, updates, website, contacting the team, EmSee); insights_and_alerts.",
        },
      },
      required: ["area"],
      additionalProperties: false,
    },
  },
  {
    name: "message_the_team",
    description:
      "Pass a message from the driver to Anthony and the MileClear team: a suggestion for the app, a problem or bug they have hit, or anything they ask you to pass on. Write it in the driver's own words, with the details they gave. The team replies by email. Only use it when the driver makes a suggestion, reports a problem, or asks you to pass something on.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["suggestion", "problem", "other"] },
        message: { type: "string", description: "What to pass on, 3 to 1500 characters." },
      },
      required: ["kind", "message"],
      additionalProperties: false,
    },
  },
] as const;

export type AssistantToolName = (typeof ASSISTANT_TOOLS)[number]["name"];

type Executor = (userId: string, input: unknown, now: Date) => Promise<unknown>;

const EXECUTORS: Record<AssistantToolName, Executor> = {
  earnings_summary: (u, i) => earningsSummary(u, i),
  mileage_summary: (u, i) => mileageSummary(u, i),
  expenses_summary: (u, i) => expensesSummary(u, i),
  fuel_summary: (u, i) => fuelSummary(u, i),
  best_worst_week: (u, i) => bestWorstWeek(u, i),
  tax_year_figures: taxYearFigures,
  can_i_claim: canIClaim,
  trips_list: (u, i) => tripsList(u, i),
  account_status: (u, i) => accountStatus(u, i),
  mileclear_help: (_u, i) => mileclearHelp(i),
  message_the_team: messageTheTeam,
};

export interface ToolRunResult {
  ok: boolean;
  content: string;
  /** The period label the figures cover, for the app to show under the answer. */
  period: string | null;
}

/**
 * Run one tool for the signed-in driver. `userId` must come from the
 * authenticated request. Input errors come back as a failed result for the
 * model to read, never as a thrown error.
 */
export async function runAssistantTool(
  userId: string,
  name: string,
  input: unknown,
  now: Date = new Date()
): Promise<ToolRunResult> {
  const exec = (EXECUTORS as Record<string, Executor | undefined>)[name];
  if (!exec) return { ok: false, content: `Unknown tool: ${name}`, period: null };
  try {
    const out = (await exec(userId, input ?? {}, now)) as { period?: { label?: string } };
    return { ok: true, content: JSON.stringify(out), period: out?.period?.label ?? null };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const msg = err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
      return { ok: false, content: `Invalid input. ${msg}`, period: null };
    }
    if (err instanceof ToolInputError) return { ok: false, content: `Invalid input. ${err.message}`, period: null };
    throw err;
  }
}
