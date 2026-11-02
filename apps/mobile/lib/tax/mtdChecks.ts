// Pure logic for the "Check and send" screen. No React, no network.
// The checks are advice only: nothing here ever blocks sending an update.

import type { PeriodSubmissionBreakdown, PeriodSubmissionPayload } from "../api/hmrc";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar day of an ISO date or date-time, as YYYY-MM-DD. "" if unreadable. */
export function localDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** "6 Jul", "5 Oct". */
export function shortDay(day: string): string {
  const d = parseDay(day);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "7 November", "5 October 2026" when withYear. */
export function longDay(day: string, withYear = false): string {
  const d = parseDay(day);
  return `${d.getDate()} ${LONG_MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
}

/** "6 April to 5 October 2026" (year on both ends when they differ). */
export function periodSentence(startDay: string, endDay: string): string {
  const s = parseDay(startDay);
  const e = parseDay(endDay);
  if (s.getFullYear() === e.getFullYear()) return `${longDay(startDay)} to ${longDay(endDay, true)}`;
  return `${longDay(startDay, true)} to ${longDay(endDay, true)}`;
}

export type CheckKind = "warn" | "ok" | "info";

export interface PreSendCheck {
  id: string;
  kind: CheckKind;
  title: string;
  detail?: string;
  /** Where the action button goes. */
  action?: { label: string; target: "trips-to-sort" | "earnings" };
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function listWeeks(weeks: string[], max = 4): string {
  const shown = weeks.slice(0, max).map(shortDay).join(", ");
  return weeks.length > max ? `${shown} and ${weeks.length - max} more` : shown;
}

export function buildPreSendChecks(args: {
  unmarkedCount: number;
  /** Null when the check does not apply to this driver. */
  missingWeeks: string[] | null;
  excludedMotorPence: number;
  serverWarnings: string[];
  fromDay: string;
  toDay: string;
  formatPence: (pence: number) => string;
}): PreSendCheck[] {
  const out: PreSendCheck[] = [];
  const range = `${shortDay(args.fromDay)} and ${shortDay(args.toDay)}`;

  if (args.unmarkedCount > 0) {
    const n = args.unmarkedCount;
    out.push({
      id: "unmarked",
      kind: "warn",
      title: `${n} ${plural(n, "trip isn't", "trips aren't")} marked yet`,
      detail: `Between ${range}. Only Business trips count towards your miles.`,
      action: { label: "Mark", target: "trips-to-sort" },
    });
  }

  if (args.missingWeeks === null) {
    // Not a self-employed driver: no earnings-by-week check.
  } else if (args.missingWeeks.length > 0) {
    const n = args.missingWeeks.length;
    out.push({
      id: "earnings",
      kind: "warn",
      title: `${n} ${plural(n, "week", "weeks")} with trips but no earnings`,
      detail: `${listWeeks(args.missingWeeks)}. Missing earnings mean HMRC sees less income than you made.`,
      action: { label: "Add", target: "earnings" },
    });
  } else {
    out.push({ id: "earnings", kind: "ok", title: "Earnings logged for every week you drove" });
  }

  if (args.excludedMotorPence > 0) {
    out.push({
      id: "motor",
      kind: "info",
      title: "Fuel, insurance and repairs left out",
      detail: `${args.formatPence(args.excludedMotorPence)} of them. The mileage rate already covers these, so claiming both isn't allowed.`,
    });
  }

  args.serverWarnings.forEach((w, i) => {
    out.push({ id: `warning-${i}`, kind: "warn", title: w });
  });

  return out;
}

// ── Where each figure came from ─────────────────────────────────────

export interface SourceLine {
  label: string;
  pence: number;
}

export interface FigureSource {
  id: "earnings" | "car" | "phone" | "other";
  label: string;
  pence: number;
  lines: SourceLine[];
  /** Small line under the lines, for example "From 618 earnings in MileClear". */
  note?: string;
  noteLink?: "earnings" | "trips";
}

const PLATFORMS: Record<string, string> = {
  uber: "Uber",
  deliveroo: "Deliveroo",
  just_eat: "Just Eat",
  amazon_flex: "Amazon Flex",
  stuart: "Stuart",
  gophr: "Gophr",
  dpd: "DPD",
  yodel: "Yodel",
  evri: "Evri",
  freelance: "Freelance",
  other: "Other",
};

export function platformLabel(tag: string): string {
  return PLATFORMS[tag] ?? tag;
}

function milesText(m: number): string {
  return m.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function rateText(p: number): string {
  return `${Number.isInteger(p) ? p : p.toFixed(1)}p`;
}

/**
 * Break the sent figures into rows a driver can follow back to their own data.
 * Uses only numbers the preview already returned; the amounts sent are not
 * touched.
 */
export function buildFigureSources(preview: PeriodSubmissionPayload): FigureSource[] {
  const b: PeriodSubmissionBreakdown = preview.breakdown;
  const pounds = (v: number | undefined) => Math.round((v ?? 0) * 100);
  const out: FigureSource[] = [];

  out.push({
    id: "earnings",
    label: "Earnings",
    pence: pounds(preview.periodIncome.turnover),
    lines: b.income.perPlatform.map((p) => ({ label: platformLabel(p.platform), pence: p.pence })),
    note: `From ${b.income.earningCount.toLocaleString("en-GB")} ${plural(b.income.earningCount, "earning", "earnings")} in MileClear`,
    noteLink: "earnings",
  });

  const carPence = pounds(preview.periodExpenses.carVanTravelExpenses);
  if (carPence > 0) {
    const m = b.mileage;
    const lines: SourceLine[] = [];
    const first = Math.max(0, Math.min(m.businessMilesThisPeriod, 10_000 - m.businessMilesPriorInTaxYear));
    const after = Math.max(0, m.businessMilesThisPeriod - first);
    if (m.rateFirst10kPence === m.rateAfter10kPence || after === 0) {
      lines.push({
        label: `${milesText(m.businessMilesThisPeriod)} business miles × ${rateText(m.rateFirst10kPence)}`,
        pence: m.deductionPence,
      });
    } else if (first === 0) {
      lines.push({
        label: `${milesText(after)} business miles × ${rateText(m.rateAfter10kPence)}`,
        pence: m.deductionPence,
      });
    } else {
      const firstPence = Math.round(first * m.rateFirst10kPence);
      lines.push({ label: `${milesText(first)} miles × ${rateText(m.rateFirst10kPence)}`, pence: firstPence });
      lines.push({
        label: `${milesText(after)} miles × ${rateText(m.rateAfter10kPence)}`,
        pence: m.deductionPence - firstPence,
      });
    }
    const rest = carPence - m.deductionPence;
    if (rest > 0) lines.push({ label: "Parking, tolls and other travel", pence: rest });
    out.push({
      id: "car",
      label: "Car, van and travel",
      pence: carPence,
      lines,
      note: `Miles from ${m.tripCount.toLocaleString("en-GB")} Business ${plural(m.tripCount, "trip", "trips")}`,
      noteLink: "trips",
    });
  }

  const adminPence = pounds(preview.periodExpenses.adminCosts);
  const feesPence = pounds(preview.periodExpenses.professionalFees);
  if (adminPence + feesPence > 0) {
    const lines: SourceLine[] = [];
    if (adminPence > 0 && feesPence > 0) {
      lines.push({ label: "Phone and admin", pence: adminPence });
      lines.push({ label: "Professional fees", pence: feesPence });
    }
    out.push({
      id: "phone",
      label: feesPence > 0 && adminPence > 0 ? "Phone, admin and fees" : feesPence > 0 ? "Professional fees" : "Phone and admin",
      pence: adminPence + feesPence,
      lines,
    });
  }

  const otherPence = pounds(preview.periodExpenses.otherExpenses);
  if (otherPence > 0) {
    out.push({
      id: "other",
      label: "Other costs",
      pence: otherPence,
      lines: [],
      note: `From ${b.expenses.expenseCount.toLocaleString("en-GB")} ${plural(b.expenses.expenseCount, "expense", "expenses")} in MileClear`,
    });
  }

  return out;
}

/** Costs total in pence, from the figures actually sent. */
export function costsPence(preview: PeriodSubmissionPayload): number {
  const e = preview.periodExpenses;
  return Math.round(
    ((e.carVanTravelExpenses ?? 0) +
      (e.professionalFees ?? 0) +
      (e.adminCosts ?? 0) +
      (e.otherExpenses ?? 0)) *
      100,
  );
}

/** Profit in pence from a stored HMRC period summary (income minus the expense fields). */
export function profitPenceFromStoredPeriod(detail: unknown): number | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as { periodIncome?: { turnover?: unknown }; periodExpenses?: Record<string, unknown> };
  const turnover = d.periodIncome?.turnover;
  if (typeof turnover !== "number") return null;
  let costs = 0;
  const e = d.periodExpenses ?? {};
  for (const [k, v] of Object.entries(e)) {
    if (typeof v === "number" && !k.startsWith("disallowable")) costs += Math.round(v * 100);
  }
  return Math.round(turnover * 100) - costs;
}

export interface NextStep {
  /** "7 February 2027" */
  due: string;
  /** "October to January update" */
  title: string;
  /** True for the last update of the tax year. */
  last: boolean;
}

/**
 * The updates still to come after the one just sent, nearest first, from the
 * year's obligations. Names use month names, never "Q2".
 */
export function nextUpdates(
  obligations: { start: string; end: string; due: string }[],
  sentEndDay: string,
): NextStep[] {
  const later = obligations
    .filter((o) => localDay(o.end) > sentEndDay)
    .sort((a, b) => a.start.localeCompare(b.start));
  return later.map((o, i) => ({
    due: longDay(localDay(o.due), true),
    title: `${LONG_MONTHS[parseDay(localDay(o.start)).getMonth()]} to ${LONG_MONTHS[parseDay(localDay(o.end)).getMonth()]} update`,
    last: i === later.length - 1,
  }));
}

/** "31 January 2028" for a tax year like "2026-27": the final-figures deadline. */
export function finishTheYearDeadline(taxYear: string): string {
  const startYear = Number(taxYear.slice(0, 4));
  return `31 January ${startYear + 2}`;
}

/**
 * Profit of the last update HMRC holds, but only when it is an earlier one than
 * the one being sent (its period ends before `toDay`). Null otherwise, so
 * re-sending the same update never shows a made-up "since your last update".
 */
export function previousUpdateProfitPence(detail: unknown, toDay: string): number | null {
  if (!detail || typeof detail !== "object") return null;
  const end = (detail as { periodDates?: { periodEndDate?: unknown } }).periodDates?.periodEndDate;
  if (typeof end !== "string") return null;
  const endDay = localDay(end);
  if (!endDay || endDay >= toDay) return null;
  return profitPenceFromStoredPeriod(detail);
}

/** Position of the period among the year's updates, from the year's obligations. Null when it can't be told. */
export function updateNumber(
  obligations: { start: string; end: string }[],
  toDay: string,
): { number: number; of: number } | null {
  const sorted = [...obligations].sort((a, b) => a.start.localeCompare(b.start));
  const idx = sorted.findIndex((o) => localDay(o.end) === toDay);
  if (idx < 0) return null;
  return { number: idx + 1, of: Math.max(4, sorted.length) };
}
