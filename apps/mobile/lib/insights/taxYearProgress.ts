// Tax year progress maths for the Insights "Tax year so far" card.
// Pure: no React, no network. The claim figure itself comes from the Tax tab's
// source (GET /business-insights/tax-snapshot) so the two screens agree; this
// file only decides the bar, the 10,000 line and the words.

import { HMRC_THRESHOLD_MILES, getHmrcRatesForTaxYear } from "@mileclear/shared";

export type ClaimVehicleType = "car" | "van" | "motorbike";

export interface TaxYearProgressInput {
  /** Business miles so far this tax year. */
  businessMiles: number;
  /** "2026-27". */
  taxYear: string;
  /** Primary vehicle type; null when unknown (treated as a car). */
  vehicleType: ClaimVehicleType | null;
  /** The driver's employer rate, when they claim from an employer. */
  employerRatePence: number | null;
}

export interface TaxYearProgress {
  taxYear: string;
  miles: number;
  /** Show the bar to 10,000? False for employer rates and flat-rate motorbikes. */
  showBar: boolean;
  /** 0 to 1, how far along the bar. */
  fraction: number;
  /** True once miles are past 10,000 on a tiered (car/van) mileage claim. */
  over: boolean;
  /** Miles left until 10,000, 0 once over. */
  milesToGo: number;
  /** Pence per mile for the first 10,000 and after (by tax year). */
  rateFirstPence: number | null;
  rateAfterPence: number | null;
  claimsAtEmployerRate: boolean;
}

export function computeTaxYearProgress(input: TaxYearProgressInput): TaxYearProgress | null {
  const miles = Number.isFinite(input.businessMiles) ? Math.max(0, input.businessMiles) : 0;
  // Nothing to show before the first business mile (never a zero card).
  if (miles <= 0) return null;

  const claimsAtEmployerRate = input.employerRatePence != null;
  const vehicle = input.vehicleType ?? "car";
  const rates = getHmrcRatesForTaxYear(input.taxYear);
  const tiered = !claimsAtEmployerRate && vehicle !== "motorbike";

  let rateFirstPence: number | null = null;
  let rateAfterPence: number | null = null;
  if (tiered) {
    const r = rates[vehicle === "van" ? "van" : "car"];
    rateFirstPence = r.first10000;
    rateAfterPence = r.after10000;
  }

  const over = tiered && miles > HMRC_THRESHOLD_MILES;
  return {
    taxYear: input.taxYear,
    miles,
    showBar: tiered,
    fraction: tiered ? Math.min(1, miles / HMRC_THRESHOLD_MILES) : 0,
    over,
    milesToGo: tiered ? Math.max(0, Math.ceil(HMRC_THRESHOLD_MILES - miles)) : 0,
    rateFirstPence,
    rateAfterPence,
    claimsAtEmployerRate,
  };
}

function withCommas(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 25 -> "25p". */
export function formatRatePence(p: number): string {
  return `${Number.isInteger(p) ? p : p.toFixed(1)}p`;
}

/** "6,420 business miles since 6 April." */
export function milesLine(progress: TaxYearProgress): string {
  const unit = Math.round(progress.miles) === 1 ? "business mile" : "business miles";
  return `${withCommas(progress.miles)} ${unit} since 6 April.`;
}

/** The line under the bar. Null when there is nothing useful to add. */
export function boundaryLine(progress: TaxYearProgress): string | null {
  if (!progress.showBar || progress.rateAfterPence == null) return null;
  if (progress.over) {
    return `Over 10,000: each extra mile is now ${formatRatePence(progress.rateAfterPence)}`;
  }
  return `${withCommas(progress.milesToGo)} miles until the 10,000 line, when each mile drops to ${formatRatePence(progress.rateAfterPence)}`;
}

/** Screen reader label for the whole card. */
export function progressA11yLabel(progress: TaxYearProgress, claimText: string | null): string {
  const parts = [`Tax year ${progress.taxYear}`, milesLine(progress)];
  if (claimText) parts.push(`${claimText} claim so far.`);
  const b = boundaryLine(progress);
  if (b) parts.push(b);
  return parts.join(" ");
}
