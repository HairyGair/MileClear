// Tax bill planner maths (4 Oct 2026). Pure, unit tested
// (__tests__/services/taxPlannerMath.test.ts).
//
// Answers "how much will I have to pay HMRC, and when?" for a self-employed
// driver, from three bills: the tax year before last, last tax year and this
// one. Everything here is a UK calendar date or an integer of pence.
//
// The rules, checked against GOV.UK on 4 October 2026:
//
//   https://www.gov.uk/pay-self-assessment-tax-bill
//     "31 January - for any tax you owe for the previous tax year (known as
//     a balancing payment) and your first payment on account"; "31 July for
//     your second payment on account".
//
//   https://www.gov.uk/understand-self-assessment-bill/payments-on-account
//     - Payments on account are "payments towards your next tax bill
//       (including Class 4 National Insurance if you're self-employed)".
//     - "Each payment is usually half of the tax you owed the previous year."
//     - None are due if "the amount of tax you owed last year was less than
//       £1,000" or "last year you paid more than 80% of the tax you owed
//       outside of Self Assessment" (PAYE, tax taken at source).
//     - The balancing payment is the total tax owed minus the payments on
//       account already made, due 31 January after the tax year ends.
//     - Their worked example: a first-time £3,000 bill means £4,500 by
//       31 January (the whole bill plus £1,500 towards next year).
//
//   https://www.gov.uk/self-employed-national-insurance-rates
//     Class 2 is "treated as having been paid" for profits of £7,105 or more
//     (2026-27), so it is not payable and is left out of every bill here.
//     Below that threshold it is voluntary, so it is left out there too.
//
// Not modelled (said in the screen's caveats): student loan and capital
// gains in the balancing payment, a claim to reduce payments on account,
// and HMRC setting an overpayment against the next bill.

import { estimateUkTax } from "@mileclear/shared";

/** No payments on account when last year's bill was under £1,000. */
export const POA_MIN_BILL_PENCE = 100_000;
/** ...or when MORE than 80% of the tax was paid outside Self Assessment. */
export const POA_MAX_DEDUCTED_AT_SOURCE_SHARE = 0.8;
/** Below four weeks of a new tax year the pace is too noisy to multiply up. */
export const MIN_PROJECTION_DAYS = 28;
/** How many payment dates the planner lists at most. */
export const PLANNER_MAX_DATES = 4;

export interface UkDay {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

// ---------------------------------------------------------------------------
// Tax years and dates
// ---------------------------------------------------------------------------

/** Tax year a UK calendar day falls in. 5 April 2027 -> "2026-27",
 *  6 April 2027 -> "2027-28". */
export function taxYearOfDay(d: UkDay): string {
  const afterStart = d.month > 4 || (d.month === 4 && d.day >= 6);
  const start = afterStart ? d.year : d.year - 1;
  return taxYearFromStart(start);
}

export function taxYearStart(taxYear: string): number {
  return parseInt(taxYear.slice(0, 4), 10);
}

export function taxYearFromStart(start: number): string {
  return `${start}-${String(start + 1).slice(2)}`;
}

export function shiftTaxYear(taxYear: string, by: number): string {
  return taxYearFromStart(taxYearStart(taxYear) + by);
}

function dayNumber(d: UkDay): number {
  return Math.round(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);
}

export function daysBetween(from: UkDay, to: UkDay): number {
  return dayNumber(to) - dayNumber(from);
}

export function isoDay(d: UkDay): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

/**
 * The Self Assessment bill for a year's self-employed profit: income tax plus
 * Class 4 (Class 2 left out, see the header), less tax already taken through
 * PAYE. Same sum as the Tax Readiness card, minus its Class 2 line.
 */
export function billFromProfit(
  taxableProfitPence: number,
  opts: { otherIncomePence?: number | null; payeDeductedPence?: number | null } = {}
): { billPence: number; deductedAtSourcePence: number } {
  const t = estimateUkTax(taxableProfitPence, { otherIncomePence: opts.otherIncomePence ?? null });
  const deducted = Math.max(0, opts.payeDeductedPence ?? 0);
  // With other income set, estimateUkTax already returns only the EXTRA tax
  // the profit adds on top of it, and PAYE pays the tax on that income, so
  // PAYE is not taken off the bill again (7 Oct 2026). It still counts as
  // tax deducted at source for the payments-on-account test.
  const offset = (opts.otherIncomePence ?? 0) > 0 ? 0 : deducted;
  return {
    billPence: Math.max(0, t.incomeTaxPence + t.class4NiPence - offset),
    deductedAtSourcePence: deducted,
  };
}

/**
 * Multiply a year-so-far figure up to the whole tax year at the same pace.
 * Inside the first four weeks it divides by four weeks rather than the days
 * so far, so one good first week isn't read as a £100k year.
 */
export function projectToYearEnd(ytdPence: number, today: UkDay, taxYear: string): number {
  const start = taxYearStart(taxYear);
  const yearStart: UkDay = { year: start, month: 4, day: 6 };
  const nextStart: UkDay = { year: start + 1, month: 4, day: 6 };
  const yearDays = daysBetween(yearStart, nextStart);
  const elapsed = daysBetween(yearStart, today) + 1; // today counts
  if (elapsed >= yearDays) return Math.max(0, Math.round(ytdPence));
  if (elapsed <= 0) return 0;
  return Math.max(0, Math.round((ytdPence * yearDays) / Math.max(elapsed, MIN_PROJECTION_DAYS)));
}

export type PlannerBillSource =
  /** The driver typed it in (from their HMRC calculation). */
  | "entered"
  /** Worked out from what they recorded for a finished tax year. */
  | "estimate"
  /** This year so far, multiplied up to 5 April at the same pace. */
  | "projection"
  /** Before they started working for themselves: no bill. */
  | "not_self_employed"
  /** Nothing recorded for the year before last: taken to match last year. */
  | "assumed_same"
  /** Nothing to go on. */
  | "unknown";

export interface PlannerYear {
  taxYear: string;
  billPence: number | null;
  source: PlannerBillSource;
  /** Tax already taken through PAYE in the year, for the 80% test. */
  deductedAtSourcePence: number;
}

export type PoaReason = "under_threshold" | "mostly_deducted_at_source" | "no_bill";

export type PoaDecision =
  | { applies: true; eachPence: number }
  | { applies: false; reason: PoaReason }
  | { applies: null };

/**
 * Payments on account for the year AFTER `year`, from `year`'s bill. Each is
 * half the bill, rounded down to the penny (HMRC's statements do the same);
 * the balancing payment picks up the odd penny.
 */
export function paymentsOnAccountFrom(year: PlannerYear | undefined): PoaDecision {
  if (!year || year.billPence == null) return { applies: null };
  const bill = year.billPence;
  if (bill <= 0) return { applies: false, reason: "no_bill" };
  if (bill < POA_MIN_BILL_PENCE) return { applies: false, reason: "under_threshold" };
  const totalTax = bill + year.deductedAtSourcePence;
  if (totalTax > 0 && year.deductedAtSourcePence / totalTax > POA_MAX_DEDUCTED_AT_SOURCE_SHARE) {
    return { applies: false, reason: "mostly_deducted_at_source" };
  }
  return { applies: true, eachPence: Math.floor(bill / 2) };
}

// ---------------------------------------------------------------------------
// Which bill each year uses
// ---------------------------------------------------------------------------

export interface ResolveYearsInput {
  currentTaxYear: string;
  /** Tax year they started working for themselves, "earlier" for before the
   *  year before last, or null when they haven't said. */
  firstSelfEmployedTaxYear: string | "earlier" | null;
  /** Bills the driver typed in, by tax year. */
  enteredBills: Record<string, number>;
  /** The app's own figures, by tax year: a finished year's estimate, or this
   *  year's projection. hasEarnings false = nothing recorded for that year. */
  estimates: Record<string, { billPence: number; hasEarnings: boolean }>;
  deductedAtSourcePence: number;
}

/** Bills for the year before last, last year and this year, in that order. */
export function resolvePlannerYears(input: ResolveYearsInput): PlannerYear[] {
  const c = input.currentTaxYear;
  const years = [shiftTaxYear(c, -2), shiftTaxYear(c, -1), c];
  const started = input.firstSelfEmployedTaxYear;
  const out: PlannerYear[] = [];
  for (const taxYear of years) {
    const base = { taxYear, deductedAtSourcePence: input.deductedAtSourcePence };
    if (started && started !== "earlier" && taxYearStart(taxYear) < taxYearStart(started)) {
      out.push({ ...base, billPence: 0, source: "not_self_employed" });
      continue;
    }
    const entered = input.enteredBills[taxYear];
    if (entered != null && Number.isFinite(entered)) {
      out.push({ ...base, billPence: Math.max(0, Math.round(entered)), source: "entered" });
      continue;
    }
    const est = input.estimates[taxYear];
    if (est?.hasEarnings) {
      out.push({ ...base, billPence: est.billPence, source: taxYear === c ? "projection" : "estimate" });
      continue;
    }
    out.push({ ...base, billPence: null, source: "unknown" });
  }
  // The year before last is only needed for the payments on account already
  // made towards last year. With nothing recorded, take it to match last
  // year (the usual steady state) rather than leave the whole plan blank.
  const [beforeLast, last] = out;
  if (beforeLast.source === "unknown" && last.billPence != null) {
    out[0] = { ...beforeLast, billPence: last.billPence, source: "assumed_same" };
  }
  return out;
}

// ---------------------------------------------------------------------------
// The payment calendar
// ---------------------------------------------------------------------------

export type PlannerPartKind = "balancing" | "poa1" | "poa2";

export interface PlannerPart {
  kind: PlannerPartKind;
  /** The tax year the money goes towards. */
  taxYear: string;
  /** null = can't be worked out from what we have. */
  amountPence: number | null;
  /** Why a payment on account is £0. */
  noPoaReason?: PoaReason;
  /** Balancing payment only: payments on account came to more than the
   *  bill, so HMRC owes this back (or sets it against the next bill). */
  overpaidPence?: number;
}

export interface PlannerPayment {
  dueDate: string;
  daysAway: number;
  /** Sum of the parts; null if any part is unknown. */
  amountPence: number | null;
  parts: PlannerPart[];
  /** The first January with a payment on account in it: last year's whole
   *  bill plus half of it again towards this year (about 150%). */
  firstPaymentOnAccount: boolean;
}

interface RawPart extends PlannerPart {
  due: UkDay;
}

/**
 * The next payment dates (up to PLANNER_MAX_DATES) from `today`, today
 * included. A due date is never listed if it needs a bill for a year after
 * the current one, so the list stops at 31 July after next.
 */
export function buildPaymentSchedule(
  today: UkDay,
  years: PlannerYear[],
  maxDates: number = PLANNER_MAX_DATES
): PlannerPayment[] {
  const byYear = new Map(years.map((y) => [y.taxYear, y]));
  const c = taxYearOfDay(today);
  const raw: RawPart[] = [];

  // Payments on account towards tax year Y (from Y-1's bill): 31 January and
  // 31 July inside Y. Balancing for Y: 31 January after Y ends.
  const poaFor = (y: string) => paymentsOnAccountFrom(byYear.get(shiftTaxYear(y, -1)));

  for (const y of [shiftTaxYear(c, -1), c, shiftTaxYear(c, 1)]) {
    const s = taxYearStart(y);
    const poa = poaFor(y);
    const poaAmount = poa.applies === true ? poa.eachPence : poa.applies === false ? 0 : null;
    const noPoaReason = poa.applies === false ? poa.reason : undefined;
    raw.push({ kind: "poa1", taxYear: y, amountPence: poaAmount, noPoaReason, due: { year: s + 1, month: 1, day: 31 } });
    raw.push({ kind: "poa2", taxYear: y, amountPence: poaAmount, noPoaReason, due: { year: s + 1, month: 7, day: 31 } });
  }
  for (const y of [shiftTaxYear(c, -1), c]) {
    const s = taxYearStart(y);
    const bill = byYear.get(y)?.billPence ?? null;
    const poa = poaFor(y);
    const paid = poa.applies === true ? poa.eachPence * 2 : poa.applies === false ? 0 : null;
    let amountPence: number | null = null;
    let overpaidPence: number | undefined;
    if (bill != null && paid != null) {
      amountPence = Math.max(0, bill - paid);
      if (paid > bill) overpaidPence = paid - bill;
    }
    raw.push({ kind: "balancing", taxYear: y, amountPence, overpaidPence, due: { year: s + 2, month: 1, day: 31 } });
  }

  const upcoming = raw.filter((p) => daysBetween(today, p.due) >= 0);
  const dates = [...new Set(upcoming.map((p) => isoDay(p.due)))].sort().slice(0, maxDates);

  const order: Record<PlannerPartKind, number> = { balancing: 0, poa1: 1, poa2: 2 };
  return dates.map((dueDate) => {
    const parts = upcoming
      .filter((p) => isoDay(p.due) === dueDate)
      .sort((a, b) => order[a.kind] - order[b.kind]);
    const due = parts[0].due;
    const known = parts.every((p) => p.amountPence != null);
    const balancing = parts.find((p) => p.kind === "balancing");
    const poa1 = parts.find((p) => p.kind === "poa1");
    // First payment on account year: there's a POA this January, but none
    // went towards the year being settled (so the balancing payment is the
    // whole bill).
    const firstPaymentOnAccount =
      !!balancing &&
      !!poa1 &&
      (poa1.amountPence ?? 0) > 0 &&
      poaFor(balancing.taxYear).applies === false;
    return {
      dueDate,
      daysAway: daysBetween(today, due),
      amountPence: known ? parts.reduce((sum, p) => sum + (p.amountPence ?? 0), 0) : null,
      parts: parts.map(({ due: _due, ...p }) => p),
      firstPaymentOnAccount,
    };
  });
}

/**
 * One weekly figure that, put by from today, covers every listed payment by
 * its date: the highest of (everything due by that date / weeks until it).
 * Stops at the first payment it can't work out, so an unknown never reads as
 * £0. null when the first payment itself is unknown.
 */
export function weeklySetAside(payments: PlannerPayment[]): {
  weeklyPence: number | null;
  /** Last due date the figure covers. */
  coversTo: string | null;
} {
  let cumulative = 0;
  let weekly: number | null = null;
  let coversTo: string | null = null;
  for (const p of payments) {
    if (p.amountPence == null) break;
    cumulative += p.amountPence;
    const weeks = Math.max(1, p.daysAway / 7);
    weekly = Math.max(weekly ?? 0, Math.ceil(cumulative / weeks));
    coversTo = p.dueDate;
  }
  return { weeklyPence: weekly, coversTo };
}
