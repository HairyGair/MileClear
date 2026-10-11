// "Do I need to send quarterly updates?" (Making Tax Digital for Income Tax).
//
// HMRC brings people in by their "qualifying income": gross self-employment
// income plus gross property income, before expenses, as on the Self
// Assessment return for an earlier tax year:
//
//   from 6 April 2026  if 2024-25 qualifying income was over £50,000
//   from 6 April 2027  if 2025-26 qualifying income was over £30,000
//   from 6 April 2028  if 2026-27 qualifying income was over £20,000
//
// Pure: the app passes the income it holds per tax year and today's date.
// MileClear holds self-employment earnings; it does not hold property income
// separately, so the screen tells drivers with rental income to add theirs.

export interface MtdPhase {
  /** First day quarterly updates apply (ISO). */
  startsOn: string;
  /** "April 2027", for the plain answer. */
  startsLabel: string;
  /** The tax year whose income decides it. */
  basedOnTaxYear: string;
  /** Over this (strictly) means in. Pence. */
  thresholdPence: number;
}

export const MTD_PHASES: readonly MtdPhase[] = [
  { startsOn: "2026-04-06", startsLabel: "April 2026", basedOnTaxYear: "2024-25", thresholdPence: 5_000_000 },
  { startsOn: "2027-04-06", startsLabel: "April 2027", basedOnTaxYear: "2025-26", thresholdPence: 3_000_000 },
  { startsOn: "2028-04-06", startsLabel: "April 2028", basedOnTaxYear: "2026-27", thresholdPence: 2_000_000 },
];

/** The tax years the check needs income for. */
export const MTD_SCOPE_TAX_YEARS: readonly string[] = MTD_PHASES.map((p) => p.basedOnTaxYear);

export type MtdScopeAnswer = "now" | "later" | "not_yet";

export interface MtdScopeYear {
  taxYear: string;
  /** Null when MileClear holds nothing for that year. */
  qualifyingIncomePence: number | null;
  thresholdPence: number;
  startsOn: string;
  /** False while the tax year is still running (the figure can only go up). */
  complete: boolean;
  over: boolean;
}

export interface MtdScopeResult {
  answer: MtdScopeAnswer;
  /** "You need to now" / "You'll need to from April 2027" / "You don't need to yet". */
  headline: string;
  /** One or two plain sentences on why. */
  detail: string;
  /** The phase that applies, when one does. */
  phase: MtdPhase | null;
  years: MtdScopeYear[];
  /** Years MileClear holds no income for, so the answer may be missing something. */
  missingTaxYears: string[];
}

/** "£50,000" (whole pounds, UK separators, the same on every JS engine). */
export function formatWholePounds(pence: number): string {
  const whole = Math.floor(Math.max(0, pence) / 100).toString();
  return `£${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 5 April at the end of a "2025-26" tax year, as ISO. */
function taxYearEnd(taxYear: string): string {
  return `${parseInt(taxYear.slice(0, 4), 10) + 1}-04-05`;
}

export function checkMtdScope(args: {
  /** Gross self-employment income per tax year ("2025-26"), pence. Missing = not held. */
  selfEmploymentPenceByTaxYear: Record<string, number | null | undefined>;
  /** Gross property income per tax year, pence, if known. */
  propertyPenceByTaxYear?: Record<string, number | null | undefined>;
  today: Date;
}): MtdScopeResult {
  const today = isoDate(args.today);

  const years: MtdScopeYear[] = MTD_PHASES.map((p) => {
    const se = args.selfEmploymentPenceByTaxYear[p.basedOnTaxYear];
    const prop = args.propertyPenceByTaxYear?.[p.basedOnTaxYear];
    const held = se != null || prop != null;
    const income = held ? (se ?? 0) + (prop ?? 0) : null;
    return {
      taxYear: p.basedOnTaxYear,
      qualifyingIncomePence: income,
      thresholdPence: p.thresholdPence,
      startsOn: p.startsOn,
      complete: today > taxYearEnd(p.basedOnTaxYear),
      over: income != null && income > p.thresholdPence,
    };
  });
  // Years still to come aren't "missing"; only finished or running ones are.
  const missingTaxYears = years
    .filter((y) => y.qualifyingIncomePence == null && today >= `${y.taxYear.slice(0, 4)}-04-06`)
    .map((y) => y.taxYear);

  for (let i = 0; i < MTD_PHASES.length; i++) {
    const phase = MTD_PHASES[i];
    const y = years[i];
    if (!y.over) continue;
    const limit = formatWholePounds(phase.thresholdPence);
    const reason = y.complete
      ? `Your self-employment income for ${y.taxYear} was over ${limit}.`
      : `Your self-employment income so far in ${y.taxYear} is already over ${limit}.`;
    if (today >= phase.startsOn) {
      return {
        answer: "now",
        headline: "You need to now",
        detail: `${reason} That means quarterly updates have applied to you since 6 ${phase.startsLabel}.`,
        phase,
        years,
        missingTaxYears,
      };
    }
    return {
      answer: "later",
      headline: `You'll need to from ${phase.startsLabel}`,
      detail: `${reason} That means quarterly updates start for you on 6 ${phase.startsLabel}. Until then, carry on with your Self Assessment as normal.`,
      phase,
      years,
      missingTaxYears,
    };
  }

  const running = years.find((y) => !y.complete && y.qualifyingIncomePence != null);
  const detail = running
    ? `Going by what's in MileClear, your income is under each limit so far. This tax year you're on ${formatWholePounds(running.qualifyingIncomePence!)} against the ${formatWholePounds(running.thresholdPence)} limit for ${MTD_PHASES.find((p) => p.basedOnTaxYear === running.taxYear)!.startsLabel}, so check again later in the year.`
    : "Going by what's in MileClear, your income is under each limit.";
  return { answer: "not_yet", headline: "You don't need to yet", detail, phase: null, years, missingTaxYears };
}
