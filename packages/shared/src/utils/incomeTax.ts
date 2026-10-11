// Income Tax bands for the tax estimates (Tax tab, Home, Self Assessment
// wizard, payment plan). Tax-year-aware, the same way HMRC_RATES_BY_TAX_YEAR
// is for mileage, and region-aware: Scotland sets its own rates and bands on
// wages, profits and pensions ("non-savings, non-dividend income"). Savings
// and dividends use the UK rates everywhere, and the Personal Allowance, its
// taper above £100,000 and National Insurance are UK-wide.
//
// Bands are stored as HMRC publishes them: slices of TAXABLE income, that is
// income after the Personal Allowance. That way a reduced allowance (income
// over £100,000) moves every threshold down the way it does on a real return.
//
// Sources (checked 11 Oct 2026):
//   https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past
//     (both regions, 2025-26 and 2026-27, as taxable income after allowances)
//   https://www.gov.uk/scottish-income-tax (2026-27, gross income view)
//   https://www.gov.uk/scottish-income-tax/2025-to-2026-tax-year (2025-26)
//   https://www.gov.scot/publications/scottish-income-tax-rates-and-bands/pages/2026-to-2027/

import type { TaxRegion } from "./mileageRelief.js";

export interface IncomeTaxBandDef {
  /** Plain name, e.g. "Starter rate". */
  label: string;
  /** Rate as a decimal, e.g. 0.19. */
  rate: number;
  /** Top of the band in TAXABLE income (after the Personal Allowance), in
   *  pence. null for the last band. */
  upToTaxablePence: number | null;
}

export interface IncomeTaxRates {
  taxYear: string;
  region: TaxRegion;
  personalAllowancePence: number;
  /** Allowance falls by £1 for every £2 of income over this. */
  allowanceTaperFromPence: number;
  bands: IncomeTaxBandDef[];
  /**
   * True when the year asked for has no checked rates and these are the
   * latest known year's rates standing in for it. Screens show this as
   * "provisional". Never true for a year in INCOME_TAX_RATES_BY_TAX_YEAR.
   */
  provisional: boolean;
}

const PA = 1_257_000; // £12,570, 2021-22 onwards (frozen)
const TAPER_FROM = 10_000_000; // £100,000

const RUK_BANDS: IncomeTaxBandDef[] = [
  { label: "Basic rate", rate: 0.2, upToTaxablePence: 3_770_000 }, // £37,700
  { label: "Higher rate", rate: 0.4, upToTaxablePence: 12_514_000 }, // £125,140
  { label: "Additional rate", rate: 0.45, upToTaxablePence: null },
];

type YearTable = Record<TaxRegion, Omit<IncomeTaxRates, "taxYear" | "region" | "provisional">>;

/**
 * Checked years only. Add a year here once gov.uk publishes it; until then
 * getIncomeTaxRates() falls back to the latest year and flags it provisional.
 */
export const INCOME_TAX_RATES_BY_TAX_YEAR: Record<string, YearTable> = {
  "2025-26": {
    rUK: { personalAllowancePence: PA, allowanceTaperFromPence: TAPER_FROM, bands: RUK_BANDS },
    scotland: {
      personalAllowancePence: PA,
      allowanceTaperFromPence: TAPER_FROM,
      bands: [
        { label: "Starter rate", rate: 0.19, upToTaxablePence: 282_700 }, // £2,827 (income to £15,397)
        { label: "Basic rate", rate: 0.2, upToTaxablePence: 1_492_100 }, // £14,921 (to £27,491)
        { label: "Intermediate rate", rate: 0.21, upToTaxablePence: 3_109_200 }, // £31,092 (to £43,662)
        { label: "Higher rate", rate: 0.42, upToTaxablePence: 6_243_000 }, // £62,430 (to £75,000)
        { label: "Advanced rate", rate: 0.45, upToTaxablePence: 12_514_000 }, // £125,140
        { label: "Top rate", rate: 0.48, upToTaxablePence: null },
      ],
    },
  },
  "2026-27": {
    rUK: { personalAllowancePence: PA, allowanceTaperFromPence: TAPER_FROM, bands: RUK_BANDS },
    scotland: {
      personalAllowancePence: PA,
      allowanceTaperFromPence: TAPER_FROM,
      bands: [
        { label: "Starter rate", rate: 0.19, upToTaxablePence: 396_700 }, // £3,967 (income to £16,537)
        { label: "Basic rate", rate: 0.2, upToTaxablePence: 1_695_600 }, // £16,956 (to £29,526)
        { label: "Intermediate rate", rate: 0.21, upToTaxablePence: 3_109_200 }, // £31,092 (to £43,662)
        { label: "Higher rate", rate: 0.42, upToTaxablePence: 6_243_000 }, // £62,430 (to £75,000)
        { label: "Advanced rate", rate: 0.45, upToTaxablePence: 12_514_000 }, // £125,140
        { label: "Top rate", rate: 0.48, upToTaxablePence: null },
      ],
    },
  },
};

export const INCOME_TAX_LATEST_TAX_YEAR = "2026-27";

const startYear = (ty: string) => parseInt(ty.slice(0, 4), 10);

/** The region a user's yes/no answer means. null/undefined (not asked) = rest of UK. */
export function taxRegionFor(scottishTaxpayer: boolean | null | undefined): TaxRegion {
  return scottishTaxpayer ? "scotland" : "rUK";
}

/**
 * Income Tax rates for a tax year and region. A year we have not checked
 * gets the nearest checked year's rates with `provisional: true` (older
 * years get the earliest checked year, newer years the latest).
 */
export function getIncomeTaxRates(taxYear: string | null | undefined, region: TaxRegion = "rUK"): IncomeTaxRates {
  const ty = taxYear ?? INCOME_TAX_LATEST_TAX_YEAR;
  const known = INCOME_TAX_RATES_BY_TAX_YEAR[ty];
  if (known) return { taxYear: ty, region, provisional: false, ...known[region] };
  const years = Object.keys(INCOME_TAX_RATES_BY_TAX_YEAR).sort();
  const s = /^\d{4}-\d{2}$/.test(ty) ? startYear(ty) : startYear(INCOME_TAX_LATEST_TAX_YEAR);
  const stand = s < startYear(years[0]) ? years[0] : years[years.length - 1];
  return { taxYear: ty, region, provisional: true, ...INCOME_TAX_RATES_BY_TAX_YEAR[stand][region] };
}

/** Personal Allowance after the taper: £1 less for every £2 over £100,000. */
export function personalAllowanceFor(totalIncomePence: number, rates: IncomeTaxRates): number {
  const over = Math.max(0, totalIncomePence - rates.allowanceTaperFromPence);
  return Math.max(0, rates.personalAllowancePence - Math.floor(over / 2));
}

export interface IncomeTaxSlice {
  label: string;
  rate: number;
  /** Taxable income falling in this band, pence. */
  taxablePence: number;
  /** Unrounded tax on it, pence. */
  taxPence: number;
}

/** Each band's share of an income (pence, before allowances). Bands with nothing in them are included as 0. */
export function incomeTaxSlices(totalIncomePence: number, rates: IncomeTaxRates): IncomeTaxSlice[] {
  const income = Math.max(0, totalIncomePence);
  const taxable = Math.max(0, income - personalAllowanceFor(income, rates));
  let lo = 0;
  return rates.bands.map((b) => {
    const hi = b.upToTaxablePence ?? Number.POSITIVE_INFINITY;
    const inBand = Math.max(0, Math.min(taxable, hi) - lo);
    lo = hi;
    return { label: b.label, rate: b.rate, taxablePence: inBand, taxPence: inBand * b.rate };
  });
}

/** Income Tax (unrounded pence) on a total of non-savings, non-dividend income. */
export function incomeTaxOn(totalIncomePence: number, rates: IncomeTaxRates): number {
  return incomeTaxSlices(totalIncomePence, rates).reduce((s, x) => s + x.taxPence, 0);
}

/**
 * The part of each band a profit adds on top of other income: the slices of
 * (other + profit) less the slices of other alone. Taxable amounts can add up
 * to more than the profit when the profit pushes income over £100,000 and the
 * allowance shrinks; the tax always adds up to the extra tax on the profit.
 */
export function marginalIncomeTaxSlices(
  profitPence: number,
  otherIncomePence: number,
  rates: IncomeTaxRates,
): IncomeTaxSlice[] {
  const other = Math.max(0, otherIncomePence);
  const withProfit = incomeTaxSlices(other + Math.max(0, profitPence), rates);
  const alone = incomeTaxSlices(other, rates);
  return withProfit.map((s, i) => ({
    label: s.label,
    rate: s.rate,
    taxablePence: s.taxablePence - alone[i].taxablePence,
    taxPence: s.taxPence - alone[i].taxPence,
  }));
}

/**
 * Where the first band at 40% or more starts, as total income (pence) for
 * someone on the full allowance: £50,270 for the rest of the UK, £43,662 in
 * Scotland. Used for the "you're £X from the higher rate" line.
 */
export function higherRateStartsAtPence(rates: IncomeTaxRates): { incomePence: number; rate: number } {
  let lo = 0;
  for (const b of rates.bands) {
    if (b.rate >= 0.4) return { incomePence: rates.personalAllowancePence + lo, rate: b.rate };
    lo = b.upToTaxablePence ?? lo;
  }
  return { incomePence: Number.POSITIVE_INFINITY, rate: 0 };
}
