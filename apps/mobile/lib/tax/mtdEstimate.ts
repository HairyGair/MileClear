// Turns HMRC's calculation into plain-words lines for the "sent" screen.
// Every figure and every percentage comes from the calculation HMRC returned.
// Nothing is worked out here except adding HMRC's own lines together to check
// they match HMRC's headline. If they don't match (other charges, a second
// income, reliefs we don't show), the breakdown is left out and the headline
// stands alone, so the screen never shows lines that don't add up.

import type { HmrcCalculationSummary, HmrcCalculationBand } from "../api/hmrc";

export interface EstimateLine {
  /** "free" is the tax-free line, "taxed" is a charge, "paid" is tax already paid (shown as a minus). */
  kind: "free" | "taxed" | "paid";
  label: string;
  /** Pounds, exactly as HMRC returned it. Negative for "paid". */
  amount: number;
}

export interface EstimateExplained {
  /** Pounds. The headline. Undefined when HMRC sent no total. */
  total: number | undefined;
  taxFree: number | undefined;
  taxed: number | undefined;
  /** Empty when HMRC's lines don't add up to its headline. */
  lines: EstimateLine[];
}

/** How far the lines may be from the headline and still count as the same sum. */
const RECONCILE_TOLERANCE_POUNDS = 1;

/** "£1,234.50", or "-£1,234.50" for a negative amount. Plain minus, no dash characters. */
export function formatPounds(v: number): string {
  const abs = Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}£${abs}`;
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

/** HMRC's total if it sent one, else its own parts added together, less tax already paid. */
function totalOf(s: HmrcCalculationSummary): number | undefined {
  if (s.totalIncomeTaxAndNicsDue !== undefined) return s.totalIncomeTaxAndNicsDue;
  if (s.incomeTaxAmount === undefined && s.nic2 === undefined && s.nic4 === undefined) return undefined;
  return (s.incomeTaxAmount ?? 0) + (s.nic2 ?? 0) + (s.nic4 ?? 0) - (s.totalTaxDeducted ?? 0);
}

export function explainEstimate(s: HmrcCalculationSummary): EstimateExplained {
  const total = totalOf(s);
  const charges: EstimateLine[] = [];

  const taxBands = charged(s.incomeTaxBands);
  if (taxBands.length > 0) {
    for (const b of taxBands) {
      charges.push({
        kind: "taxed",
        label: `Income tax, ${pct(b.rate)} of the next ${formatPounds(b.income)}`,
        amount: b.amount,
      });
    }
  } else if (s.incomeTaxAmount !== undefined) {
    charges.push({ kind: "taxed", label: "Income tax", amount: s.incomeTaxAmount });
  }

  const nicBands = charged(s.class4Bands);
  if (nicBands.length > 0) {
    for (const b of nicBands) {
      const sameAsTax = taxBands.length === 1 && nicBands.length === 1 && taxBands[0].income === b.income;
      charges.push({
        kind: "taxed",
        label: `National Insurance, ${pct(b.rate)} of ${sameAsTax ? "the same" : formatPounds(b.income)}`,
        amount: b.amount,
      });
    }
    if ((s.nic2 ?? 0) > 0) {
      charges.push({ kind: "taxed", label: "National Insurance, flat weekly rate", amount: s.nic2 as number });
    }
  } else if (s.nic2 !== undefined || s.nic4 !== undefined) {
    charges.push({ kind: "taxed", label: "National Insurance", amount: (s.nic2 ?? 0) + (s.nic4 ?? 0) });
  }

  const paid = s.totalTaxDeducted ?? 0;
  if (paid > 0) {
    charges.push({ kind: "paid", label: "Tax already paid through your job", amount: -paid });
  }

  const sum = charges.reduce((a, l) => a + l.amount, 0);
  const reconciles = total !== undefined && charges.length > 0 && Math.abs(sum - total) <= RECONCILE_TOLERANCE_POUNDS;

  if (!reconciles) {
    return { total, taxFree: undefined, taxed: undefined, lines: [] };
  }

  const lines: EstimateLine[] = [];
  if (s.personalAllowance !== undefined && s.personalAllowance > 0) {
    lines.push({
      kind: "free",
      label: `The first ${gbpShort(s.personalAllowance)} of your income this year is tax-free`,
      amount: 0,
    });
  }
  lines.push(...charges);

  return { total, taxFree: s.personalAllowance, taxed: s.totalTaxableIncome, lines };
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
