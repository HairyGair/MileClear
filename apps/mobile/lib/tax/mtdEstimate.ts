// Turns HMRC's calculation into plain-words lines for the "sent" screen.
// Every figure and every percentage comes from the calculation HMRC returned.
// Nothing is worked out here: if HMRC didn't send a band, that line falls
// back to a plain amount with no percentage.

import type { HmrcCalculationSummary, HmrcCalculationBand } from "../api/hmrc";

export interface EstimateLine {
  /** "free" is the tax-free line, "taxed" is anything charged. */
  kind: "free" | "taxed";
  label: string;
  /** Pounds, exactly as HMRC returned it. */
  amount: number;
}

export interface EstimateExplained {
  /** Pounds. The headline. Undefined when HMRC sent no total. */
  total: number | undefined;
  taxFree: number | undefined;
  taxed: number | undefined;
  lines: EstimateLine[];
}

function gbp(v: number): string {
  return `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function gbpShort(v: number): string {
  return `£${v.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
}

function pct(rate: number): string {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(1)}%`;
}

function charged(bands: HmrcCalculationBand[] | undefined): HmrcCalculationBand[] {
  return (bands ?? []).filter((b) => b.rate > 0 && b.income > 0);
}

/** HMRC's total if it sent one, else its own parts added together. */
function totalOf(s: HmrcCalculationSummary): number | undefined {
  if (s.totalIncomeTaxAndNicsDue !== undefined) return s.totalIncomeTaxAndNicsDue;
  if (s.incomeTaxAmount === undefined && s.nic2 === undefined && s.nic4 === undefined) return undefined;
  return (s.incomeTaxAmount ?? 0) + (s.nic2 ?? 0) + (s.nic4 ?? 0);
}

export function explainEstimate(s: HmrcCalculationSummary): EstimateExplained {
  const lines: EstimateLine[] = [];

  if (s.totalAllowancesAndDeductions !== undefined && s.totalAllowancesAndDeductions > 0) {
    lines.push({
      kind: "free",
      label: `The first ${gbpShort(s.totalAllowancesAndDeductions)} of your income each year is tax-free`,
      amount: 0,
    });
  }

  const taxBands = charged(s.incomeTaxBands);
  if (taxBands.length > 0) {
    taxBands.forEach((b) => {
      lines.push({
        kind: "taxed",
        label: `Income tax, ${pct(b.rate)} of the next ${gbp(b.income)}`,
        amount: b.amount,
      });
    });
  } else if (s.incomeTaxAmount !== undefined) {
    lines.push({ kind: "taxed", label: "Income tax", amount: s.incomeTaxAmount });
  }

  const nicBands = charged(s.class4Bands);
  if (nicBands.length > 0) {
    nicBands.forEach((b) => {
      const sameAsTax = taxBands.length === 1 && nicBands.length === 1 && taxBands[0].income === b.income;
      lines.push({
        kind: "taxed",
        label: `National Insurance, ${pct(b.rate)} of ${sameAsTax ? "the same" : gbp(b.income)}`,
        amount: b.amount,
      });
    });
    if ((s.nic2 ?? 0) > 0) {
      lines.push({ kind: "taxed", label: "National Insurance, flat weekly rate", amount: s.nic2 as number });
    }
  } else if (s.nic2 !== undefined || s.nic4 !== undefined) {
    lines.push({ kind: "taxed", label: "National Insurance", amount: (s.nic2 ?? 0) + (s.nic4 ?? 0) });
  }

  return {
    total: totalOf(s),
    taxFree: s.totalAllowancesAndDeductions,
    taxed: s.totalTaxableIncome,
    lines,
  };
}

/**
 * Share of the bar that is tax-free, 0 to 1, from HMRC's own two figures.
 * Null when HMRC didn't send both, so the bar is left out rather than guessed.
 */
export function taxFreeShare(e: EstimateExplained): number | null {
  if (e.taxFree === undefined || e.taxed === undefined) return null;
  const sum = e.taxFree + e.taxed;
  if (sum <= 0) return null;
  return Math.min(1, Math.max(0, e.taxFree / sum));
}
