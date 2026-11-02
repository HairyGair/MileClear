// "Your tax so far" on the Quarterly updates hub. Pure: which of HMRC's
// calculations to show, the self-employed profit HMRC used, and the one
// sentence under the figure. Every figure comes from HMRC's calculation.
// The headline is the same one the sent screen shows (explainEstimate), so
// the two screens can never disagree.

import type { HmrcCalculationListItem, HmrcCalculationSummary, HmrcObligation } from "../api/hmrc";
import { explainEstimate, formatPounds } from "./mtdEstimate";
import { isMtdTest, type HmrcEnv } from "./mtdCopy";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** How many calculations the hub will open looking for a finished one. */
export const MAX_CALCULATIONS_TO_TRY = 2;

function datePart(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * HMRC's in-year calculations, newest first. Final-declaration ones are left
 * out: the hub shows how the year is going, not a tax return. Items without a
 * readable timestamp go last.
 */
export function inYearCalculationsNewestFirst(list: HmrcCalculationListItem[]): HmrcCalculationListItem[] {
  const time = (c: HmrcCalculationListItem) => {
    const t = Date.parse(c.calculationTimestamp);
    return Number.isFinite(t) ? t : -Infinity;
  };
  return list
    .filter((c) => c.calculationType === "in-year" && !!c.calculationId)
    .slice()
    .sort((a, b) => time(b) - time(a));
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * The self-employed profit HMRC used, in pounds, read from the calculation
 * HMRC returned (`raw`). HMRC's own total first, then its per-business lines.
 * Undefined when HMRC didn't send either, so the sentence leaves it out
 * rather than showing a figure HMRC didn't give.
 */
export function selfEmploymentProfit(summary: Pick<HmrcCalculationSummary, "raw">): number | undefined {
  const calc = obj(obj(summary.raw).calculation);
  const total = num(obj(calc.incomeSummaryTotals).totalSelfEmploymentProfit);
  if (total !== undefined) return total;
  const lines = Array.isArray(calc.businessProfitAndLoss) ? calc.businessProfitAndLoss : [];
  let sum: number | undefined;
  for (const l of lines) {
    const b = obj(l);
    const type = String(b.incomeSourceType ?? "");
    if (type !== "self-employment" && type !== "01") continue;
    const amount = num(b.taxableProfit) ?? num(b.netProfit);
    if (amount === undefined) continue;
    sum = (sum ?? 0) + amount;
  }
  return sum;
}

/**
 * Month the calculation's figures run up to: the end month of the newest
 * quarter HMRC had received by the time it ran the calculation. Null when
 * that can't be told (no sent quarters known, no received dates).
 */
export function figuresUpToMonth(
  fulfilled: Pick<HmrcObligation, "end" | "receivedDate" | "status">[] | null | undefined,
  calculationTimestamp: string | undefined,
): string | null {
  const ranOn = datePart(calculationTimestamp);
  if (!fulfilled || !ranOn) return null;
  let newestEnd: string | null = null;
  for (const o of fulfilled) {
    if (o.status !== "Fulfilled") continue;
    const received = datePart(o.receivedDate);
    const end = datePart(o.end);
    if (!received || !end || received > ranOn) continue;
    if (!newestEnd || end > newestEnd) newestEnd = end;
  }
  return newestEnd ? MONTHS[Number(newestEnd.slice(5, 7)) - 1] : null;
}

/** "£8,180" for whole pounds, "£8,180.50" otherwise. */
export function poundsShort(v: number): string {
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return `£${v.toLocaleString("en-GB", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

export interface TaxSoFarView {
  /** Pounds, HMRC's headline. */
  total: number;
  totalText: string;
  pill: string;
  sentence: string;
  /** Offer "See how it's worked out" (only when there is tax to explain). */
  canExplain: boolean;
}

export const TAX_SO_FAR_HEADING = "Your tax so far";
export const SEE_HOW_WORKED_OUT = "See how it's worked out";

function updatesLine(env: HmrcEnv): string {
  return isMtdTest(env)
    ? "The test service updates this each time you send."
    : "HMRC updates this each time you send.";
}

/**
 * What the section shows, or null to hide it. Hidden when there's no
 * finished calculation or HMRC sent no headline figure.
 */
export function taxSoFarView(
  summary: HmrcCalculationSummary | null | undefined,
  opts: { upToMonth?: string | null; env: HmrcEnv },
): TaxSoFarView | null {
  if (!summary || !summary.ready) return null;
  const { total } = explainEstimate(summary);
  if (total === undefined) return null;

  const profit = selfEmploymentProfit(summary);
  const allowance = summary.personalAllowance;
  const pill = isMtdTest(opts.env) ? "Test estimate" : "HMRC estimate";
  const after = updatesLine(opts.env);
  const isZero = Math.abs(total) < 0.005;

  let sentence: string;
  if (isZero && profit !== undefined && allowance !== undefined && allowance > 0 && profit <= allowance) {
    const upTo = opts.upToMonth ? `up to ${opts.upToMonth}` : "so far";
    sentence = `Your profit ${upTo} (${poundsShort(profit)}) is under the ${poundsShort(allowance)} you can earn tax-free in a year. ${after}`;
  } else if (isZero) {
    sentence = `No tax worked out on what you've sent so far. ${after}`;
  } else if (total > 0 && profit !== undefined) {
    sentence = `On ${poundsShort(profit)} profit so far. ${after}`;
  } else {
    sentence = `Worked out from what you've sent so far. ${after}`;
  }

  return {
    total,
    totalText: formatPounds(isZero ? 0 : total),
    pill,
    sentence,
    canExplain: !isZero,
  };
}

// ── The hub's Help list ─────────────────────────────────────────────

export const MTD_HISTORY_ROUTE = "/tax-mtd-history";

export const HUB_HELP_HEADING = "Help";

export const HUB_HELP_ROWS = [
  { key: "explainer", title: "How quarterly updates work", sub: "5 short cards, 1 minute" },
  { key: "late", title: "What if I miss a deadline?", sub: "What HMRC does, and what to do" },
  { key: "history", title: "Update history", sub: "What you've sent, and HMRC's estimates" },
] as const;

export const REMINDERS_TITLE = "Reminders";

/**
 * Line under "Reminders". The switch is the driver's "Tax deadlines" push
 * setting, which covers every tax date, and the quarterly reminder email is
 * not part of it, so the "off" line says both.
 */
export function remindersSub(on: boolean): string {
  return on ? "7 days and 1 day before each date" : "Push off for every tax date. Emails aren't affected.";
}
