// Mileage Allowance Relief (MAR) for employees who drive their own vehicle
// for work. Pure maths, shared by the API and the app. Every rule below is
// taken from GOV.UK or the HMRC Employment Income Manual (EIM) and the URL is
// next to the rule. Checked 4 Oct 2026.
//
// THE RULE (EIM31235, EIM31330):
//   For each tax year and each KIND of vehicle:
//     approved amount = business miles x the approved mileage rate (AMAP)
//     paid            = mileage allowance payments the employer actually paid
//     paid - approved > 0  -> the excess is taxable (employer reports it)
//     paid - approved < 0  -> the shortfall is Mileage Allowance Relief
//   https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31235
//   https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31330
//
// KINDS of vehicle (EIM31240): cars and vans are ONE kind and share one
// 10,000 mile limit; motorcycles and cycles are separate kinds with a flat
// rate. Kinds are worked out separately and NOT netted against each other
// (EIM31375: "they should be reported separately, not amalgamated").
//   https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31240
//   https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31375
//
// 10,000 MILES is per tax year, per employment (EIM31275, EIM31280). Two jobs
// with unconnected employers in one year each get their own 10,000; jobs with
// the same or associated employers share one. This calculator counts every
// business mile against ONE limit (one employer), which is the usual case and
// never overstates relief. Callers must say so to the user.
//   https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31280
//
// ONLY what was actually received counts (EIM31340): an allowance the
// employee could have claimed but did not reduces nothing. A monthly lump sum
// for the car counts as a mileage allowance payment (EIM31360).
//   https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31340
//   https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31360
//
// PASSENGER PAYMENTS (5p per passenger per business mile) are an exemption
// only, never a relief (EIM31405, EIM31410), so passenger miles play no part
// here and passenger payments must not be counted as "paid".
//   https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31410
//
// COMMUTING: "This does not include travelling to and from your work, unless
// it's a temporary place of work."
//   https://www.gov.uk/tax-relief-for-employees/vehicles-you-use-for-work
//
// TIME LIMIT: "the current tax year and the 4 previous tax years"; by post,
// "within 4 years from the end of the tax year you are claiming for".
//   https://www.gov.uk/tax-relief-for-employees/vehicles-you-use-for-work
//   https://www.gov.uk/guidance/send-an-income-tax-relief-claim-for-job-expenses-by-post-or-phone
//
// HOW TO CLAIM: P87 when "your total expenses claim for each tax year is
// £2,500 or less - if the amount is more than £2,500, you need to fill in a
// Self Assessment tax return". "If you complete a Self Assessment tax return,
// you must claim through your tax return instead."
//   https://www.gov.uk/guidance/send-an-income-tax-relief-claim-for-job-expenses-by-post-or-phone
//   https://www.gov.uk/tax-relief-for-employees
//
// TAX BACK: "You'll get tax relief based on what you've spent and the rate at
// which you pay tax" (claim £60 at 20% = £12). "The amount of tax relief you
// get cannot be more than the amount of tax you paid in that year."
//   https://www.gov.uk/tax-relief-for-employees

import { getTaxYear, parseTaxYear } from "./index.js";
import { ukDateParts } from "./saCountdown.js";

// ── Approved mileage rates ─────────────────────────────────────────

export interface AmapRates {
  /** Cars and vans, first 10,000 business miles in the tax year (pence). */
  carVanFirst10kPence: number;
  /** Cars and vans, every business mile after 10,000 (pence). */
  carVanAfter10kPence: number;
  /** Motorcycles, all business miles (pence). */
  motorcyclePence: number;
  /** Cycles, all business miles (pence). */
  cyclePence: number;
}

/**
 * Statutory rates, EIM31240 (updated 21 May 2026) and the GOV.UK rates page:
 *   2011-12 to 2025-26: car/van 45p then 25p, motorcycle 24p, cycle 20p
 *   2026-27 onwards:    car/van 55p then 25p, motorcycle 24p, cycle 20p
 * https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31240
 * https://www.gov.uk/government/publications/rates-and-allowances-travel-mileage-and-fuel-allowances/travel-mileage-and-fuel-rates-and-allowances
 */
const AMAP_FROM_2011_12: AmapRates = {
  carVanFirst10kPence: 45,
  carVanAfter10kPence: 25,
  motorcyclePence: 24,
  cyclePence: 20,
};
const AMAP_FROM_2026_27: AmapRates = {
  carVanFirst10kPence: 55,
  carVanAfter10kPence: 25,
  motorcyclePence: 24,
  cyclePence: 20,
};

/** The latest tax year whose rates GOV.UK has actually published. */
export const AMAP_LATEST_PUBLISHED_TAX_YEAR = "2026-27";

/** 10,000 business miles per tax year (EIM31240). */
export const AMAP_THRESHOLD_MILES = 10_000;

/**
 * Most a single year's job expenses can be and still go on a P87 (inclusive).
 * Above it, Self Assessment.
 * https://www.gov.uk/guidance/send-an-income-tax-relief-claim-for-job-expenses-by-post-or-phone
 */
export const P87_MAX_CLAIM_PENCE = 250_000;

/** Passenger payment exemption, 5p per passenger per business mile (EIM31405). Not a relief. */
export const AMAP_PASSENGER_PENCE = 5;

export const MAR_GOV_UK_URL = "https://www.gov.uk/tax-relief-for-employees/vehicles-you-use-for-work";
export const MAR_P87_POST_URL =
  "https://www.gov.uk/guidance/send-an-income-tax-relief-claim-for-job-expenses-by-post-or-phone";

function startYearOf(taxYear: string): number {
  // parseTaxYear validates the "2025-26" shape and throws otherwise.
  return parseTaxYear(taxYear).start.getFullYear();
}

/**
 * Approved mileage rates for a tax year. Null before 2011-12 (no relief can
 * be claimed that far back anyway). Years after the latest published year
 * use the latest rates, with `published: false` so a caller can say so.
 */
export function amapRatesForTaxYear(
  taxYear: string,
): { rates: AmapRates; published: boolean } | null {
  const start = startYearOf(taxYear);
  if (start < 2011) return null;
  const published = start <= startYearOf(AMAP_LATEST_PUBLISHED_TAX_YEAR);
  return { rates: start >= 2026 ? AMAP_FROM_2026_27 : AMAP_FROM_2011_12, published };
}

// ── Income Tax rates, for the "tax back" estimate ──────────────────

export type TaxRegion = "rUK" | "scotland";

export interface TaxBand {
  /** Plain name, e.g. "Basic rate". */
  label: string;
  /** Percent, e.g. 20. */
  ratePct: number;
}

/**
 * Income Tax rates on wages for England, Wales and Northern Ireland, and for
 * Scotland, per tax year. Only the rates matter here (relief x rate); bands
 * are not needed because we never guess which band someone is in.
 *
 * 2023-24 to 2026-27, both regions:
 *   https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past
 * 2025-26 and 2026-27 Scotland also:
 *   https://www.gov.uk/scottish-income-tax
 * 2022-23 (Scotland 19/20/21/41/46; rest of UK 20/40/45), from HMRC's Scottish
 * Income Tax annual report 2023, which lists both:
 *   https://www.gov.uk/government/publications/scottish-income-tax-hmrc-annual-report-2023/scottish-income-tax-hmrc-annual-report-2023
 */
const RUK_BANDS: TaxBand[] = [
  { label: "Basic rate", ratePct: 20 },
  { label: "Higher rate", ratePct: 40 },
  { label: "Additional rate", ratePct: 45 },
];

const INCOME_TAX_BANDS: Record<string, Record<TaxRegion, TaxBand[]>> = {
  "2022-23": {
    rUK: RUK_BANDS,
    scotland: [
      { label: "Starter rate", ratePct: 19 },
      { label: "Basic rate", ratePct: 20 },
      { label: "Intermediate rate", ratePct: 21 },
      { label: "Higher rate", ratePct: 41 },
      { label: "Top rate", ratePct: 46 },
    ],
  },
  "2023-24": {
    rUK: RUK_BANDS,
    scotland: [
      { label: "Starter rate", ratePct: 19 },
      { label: "Basic rate", ratePct: 20 },
      { label: "Intermediate rate", ratePct: 21 },
      { label: "Higher rate", ratePct: 42 },
      { label: "Top rate", ratePct: 47 },
    ],
  },
  "2024-25": {
    rUK: RUK_BANDS,
    scotland: scotland6(),
  },
  "2025-26": {
    rUK: RUK_BANDS,
    scotland: scotland6(),
  },
  "2026-27": {
    rUK: RUK_BANDS,
    scotland: scotland6(),
  },
};

function scotland6(): TaxBand[] {
  return [
    { label: "Starter rate", ratePct: 19 },
    { label: "Basic rate", ratePct: 20 },
    { label: "Intermediate rate", ratePct: 21 },
    { label: "Higher rate", ratePct: 42 },
    { label: "Advanced rate", ratePct: 45 },
    { label: "Top rate", ratePct: 48 },
  ];
}

/** Income Tax rates for a year and region, or null when we have not checked that year. */
export function incomeTaxBandsForTaxYear(taxYear: string, region: TaxRegion): TaxBand[] | null {
  return INCOME_TAX_BANDS[taxYear]?.[region] ?? null;
}

// ── Claim window ───────────────────────────────────────────────────

export type MarYearStatus = "claimable" | "too_old" | "not_started";

/** Last day to claim for a tax year: 5 April, four years after the year ends. */
export function marClaimDeadline(taxYear: string): { year: number; month: 4; day: 5 } {
  return { year: startYearOf(taxYear) + 1 + 4, month: 4, day: 5 };
}

/**
 * Whether a tax year can still be claimed on `now` (read as a UK date):
 * the current tax year and the 4 before it.
 */
export function marYearStatus(taxYear: string, now: Date): MarYearStatus {
  const today = ukDateParts(now);
  const current = getTaxYear(new Date(today.year, today.month - 1, today.day, 12));
  const start = startYearOf(taxYear);
  const currentStart = startYearOf(current);
  if (start > currentStart) return "not_started";
  if (start < currentStart - 4) return "too_old";
  return "claimable";
}

/** The tax years that can be claimed on `now`, newest first (always 5). */
export function marClaimableTaxYears(now: Date): string[] {
  const today = ukDateParts(now);
  const current = getTaxYear(new Date(today.year, today.month - 1, today.day, 12));
  const currentStart = startYearOf(current);
  const out: string[] = [];
  for (let s = currentStart; s >= currentStart - 4; s--) {
    out.push(`${s}-${String(s + 1).slice(2)}`);
  }
  return out;
}

// ── The calculation ────────────────────────────────────────────────

/**
 * What the employer paid for one tax year. Either per-mile rates (the app
 * multiplies them out) or the actual totals from payslips, which is the more
 * accurate figure when it is known (lump sums, miles not claimed, a rate that
 * changed mid-year).
 */
export type EmployerPaid =
  | {
      kind: "rates";
      /** Pence per mile for cars/vans, first 10,000 business miles. 0 if nothing paid. */
      carVanFirst10kPence: number;
      /** Pence per mile after 10,000. Null = same as the first rate. */
      carVanAfter10kPence: number | null;
      /** Pence per mile on a motorcycle. Null = same as carVanFirst10kPence. */
      motorcyclePence?: number | null;
      /** Pence per mile on a cycle. Null = same as carVanFirst10kPence. */
      cyclePence?: number | null;
    }
  | {
      kind: "totals";
      carVanPence: number;
      motorcyclePence: number;
      cyclePence: number;
    };

export interface MarYearInput {
  taxYear: string;
  /** Business miles in the employee's own car(s) and van(s) this tax year. */
  carVanMiles: number;
  /** Business miles on their own motorcycle(s). */
  motorcycleMiles: number;
  /** Business miles on their own cycle(s). */
  cycleMiles?: number;
  employerPaid: EmployerPaid;
  /** True if they already file Self Assessment for this year. Null = not known. */
  filesSelfAssessment?: boolean | null;
  /** Where they pay Income Tax. Null = not known (both estimates shown). */
  taxRegion?: TaxRegion | null;
}

export type MarVehicleKind = "car_van" | "motorcycle" | "cycle";

export interface MarKindResult {
  kind: MarVehicleKind;
  miles: number;
  /** Miles at the first rate and after 10,000 (cars/vans only; others are all "first"). */
  milesAtFirstRate: number;
  milesAfter10k: number;
  amapFirstRatePence: number;
  amapAfter10kRatePence: number;
  /** Approved amount, miles x AMAP (pence). */
  approvedPence: number;
  /** What the employer paid (pence). */
  paidPence: number;
  /** approved - paid when positive, else 0. */
  reliefPence: number;
  /** paid - approved when positive, else 0. */
  taxableExcessPence: number;
}

export type MarRoute = "p87" | "self_assessment" | "none";

export interface MarTaxBack {
  region: TaxRegion;
  bands: (TaxBand & { pence: number })[];
}

export interface MarYearResult {
  taxYear: string;
  /** False when the rates are carried forward from the latest published year. */
  ratesPublished: boolean;
  kinds: MarKindResult[];
  approvedPence: number;
  paidPence: number;
  /** Sum of each kind's relief (kinds are never netted). */
  reliefPence: number;
  /** Sum of each kind's taxable excess. */
  taxableExcessPence: number;
  route: MarRoute;
  /** Why that route, in plain words. */
  routeReason: "files_self_assessment" | "over_p87_limit" | "p87" | "no_relief";
  /**
   * Tax back at each rate. When the region is unknown, both regions are
   * listed. Empty when we have no checked tax rates for the year.
   */
  taxBack: MarTaxBack[];
}

function cleanMiles(m: number): number {
  return Math.max(0, Number.isFinite(m) ? m : 0);
}

function nonNegPence(p: number | null | undefined): number {
  if (p == null || !Number.isFinite(p)) return 0;
  return Math.max(0, p);
}

/**
 * Work out MAR (or the taxable excess) for one tax year.
 * Returns null for a tax year before 2011-12.
 */
export function calculateMileageAllowanceRelief(input: MarYearInput): MarYearResult | null {
  const amap = amapRatesForTaxYear(input.taxYear);
  if (!amap) return null;
  const r = amap.rates;

  const carVanMiles = cleanMiles(input.carVanMiles);
  const motorcycleMiles = cleanMiles(input.motorcycleMiles);
  const cycleMiles = cleanMiles(input.cycleMiles ?? 0);

  const carFirst = Math.min(carVanMiles, AMAP_THRESHOLD_MILES);
  const carAfter = Math.max(0, carVanMiles - AMAP_THRESHOLD_MILES);

  const paid = input.employerPaid;
  let carPaid: number;
  let motoPaid: number;
  let cyclePaid: number;
  if (paid.kind === "totals") {
    carPaid = nonNegPence(paid.carVanPence);
    motoPaid = nonNegPence(paid.motorcyclePence);
    cyclePaid = nonNegPence(paid.cyclePence);
  } else {
    const first = nonNegPence(paid.carVanFirst10kPence);
    const after = paid.carVanAfter10kPence == null ? first : nonNegPence(paid.carVanAfter10kPence);
    const moto = paid.motorcyclePence == null ? first : nonNegPence(paid.motorcyclePence);
    const cyc = paid.cyclePence == null ? first : nonNegPence(paid.cyclePence);
    carPaid = carFirst * first + carAfter * after;
    motoPaid = motorcycleMiles * moto;
    cyclePaid = cycleMiles * cyc;
  }

  const kinds: MarKindResult[] = [];
  const push = (
    kind: MarVehicleKind,
    miles: number,
    milesAtFirstRate: number,
    milesAfter10k: number,
    firstRate: number,
    afterRate: number,
    paidRaw: number,
  ) => {
    if (miles <= 0 && paidRaw <= 0) return;
    const approvedPence = Math.round(milesAtFirstRate * firstRate + milesAfter10k * afterRate);
    const paidPence = Math.round(paidRaw);
    kinds.push({
      kind,
      miles,
      milesAtFirstRate,
      milesAfter10k,
      amapFirstRatePence: firstRate,
      amapAfter10kRatePence: afterRate,
      approvedPence,
      paidPence,
      reliefPence: Math.max(0, approvedPence - paidPence),
      taxableExcessPence: Math.max(0, paidPence - approvedPence),
    });
  };
  push("car_van", carVanMiles, carFirst, carAfter, r.carVanFirst10kPence, r.carVanAfter10kPence, carPaid);
  push("motorcycle", motorcycleMiles, motorcycleMiles, 0, r.motorcyclePence, r.motorcyclePence, motoPaid);
  push("cycle", cycleMiles, cycleMiles, 0, r.cyclePence, r.cyclePence, cyclePaid);

  const sum = (f: (k: MarKindResult) => number) => kinds.reduce((a, k) => a + f(k), 0);
  const reliefPence = sum((k) => k.reliefPence);

  let route: MarRoute;
  let routeReason: MarYearResult["routeReason"];
  if (reliefPence <= 0) {
    route = "none";
    routeReason = "no_relief";
  } else if (input.filesSelfAssessment) {
    route = "self_assessment";
    routeReason = "files_self_assessment";
  } else if (reliefPence > P87_MAX_CLAIM_PENCE) {
    route = "self_assessment";
    routeReason = "over_p87_limit";
  } else {
    route = "p87";
    routeReason = "p87";
  }

  const regions: TaxRegion[] = input.taxRegion ? [input.taxRegion] : ["rUK", "scotland"];
  const taxBack: MarTaxBack[] = [];
  for (const region of regions) {
    const bands = incomeTaxBandsForTaxYear(input.taxYear, region);
    if (!bands) continue;
    taxBack.push({
      region,
      bands: bands.map((b) => ({ ...b, pence: Math.round((reliefPence * b.ratePct) / 100) })),
    });
  }

  return {
    taxYear: input.taxYear,
    ratesPublished: amap.published,
    kinds,
    approvedPence: sum((k) => k.approvedPence),
    paidPence: sum((k) => k.paidPence),
    reliefPence,
    taxableExcessPence: sum((k) => k.taxableExcessPence),
    route,
    routeReason,
    taxBack,
  };
}

// ── API shape: GET /mileage-relief ─────────────────────────────────

export interface MileageReliefYearMiles {
  taxYear: string;
  /** Last day to claim this year (UK date). */
  claimBy: { year: number; month: number; day: number };
  /** Business miles in own cars and vans (one kind, EIM31240). */
  carVanMiles: number;
  /** Business miles on own motorcycles. */
  motorcycleMiles: number;
  /** Trips counted above. */
  businessTrips: number;
  /** Business trips tagged "commute", left out (commuting is not business travel). */
  commuteMilesLeftOut: number;
  /** Business trips tagged with a gig platform for a "both" driver, left out (self-employed). */
  selfEmployedMilesLeftOut: number;
  /** Trips not yet marked business or personal, which count for nothing until they are. */
  unclassifiedTrips: number;
  unclassifiedMiles: number;
}

export interface MileageReliefData {
  workType: string;
  employerMileageRatePence: number | null;
  employerMileageRatePenceAfter10k: number | null;
  /** When the account was made (ISO). */
  joinedAt: string;
  /** The earliest trip on record (ISO), or null. */
  firstTripAt: string | null;
  /** Claimable tax years, newest first. */
  years: MileageReliefYearMiles[];
}
