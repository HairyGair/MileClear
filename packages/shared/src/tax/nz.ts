// New Zealand: Inland Revenue (IRD) kilometre rates for business use of a
// motor vehicle. Checked on IRD's own pages on 23 Oct 2026:
//
//   2025-26: https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/claiming-vehicle-expenses/kilometre-rates-2025-2026
//            and operational statement OS 19/04 KM 2026 (made 2 Jun 2026, in force 4 Jun 2026):
//            https://www.taxtechnical.ird.govt.nz/operational-statements/2026/os-19-04-km-2026
//   2024-25: https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/claiming-vehicle-expenses/kilometre-rates-2024-2025
//
// Operational statements read 23 Oct 2026 (official, quoted):
//   OS 19/04 (KM 2026): https://www.taxtechnical.ird.govt.nz/operational-statements/2026/os-19-04-km-2026
//   OS 19/04a (Aug 2019, still current): https://www.taxtechnical.ird.govt.nz/-/media/project/ir/tt/pdfs/operational-statements/os-1904a.pdf
//
// Vehicles. IRD's schedule lists Petrol, Diesel, Petrol Hybrid and Electric
// only. OS 19/04a para 11: "The cost method must be used for any vehicle type
// not included in the above table", and "The rates do not apply to motor
// cycles or scooters (petrol or electric)". IRD doesn't say which rate a
// plug-in, diesel or mild hybrid uses, so the app asks which kind of hybrid
// it is (Vehicle.nzHybridKind) and only a petrol hybrid gets a figure.
//
// Tiers. OS 19/04a para 8: "The Tier Two rate must be used for the business
// portion of any travel after the vehicle has covered 14,000kms total travel
// in any income year." Example one (60% business, 20,000 km total):
// "Tier 1 14,000 x $1.17 x 60% = 9,828.00", "Tier 2 6,000 x $0.37 x 60% =
// 1,332.00". So with a logbook or full records:
//   total <= 14,000 km: every business km at Tier 1
//   total  > 14,000 km: Tier 1 km = 14,000 x (business / total), the rest Tier 2
//
// No logbook. OS 19/04a para 20: "In the absence of a logbook (or actual
// records), s DE 4(2) limits any deductions to a maximum of 25% ... For the
// Tier-One rate, this equates to the first 3,500 business kilometres (14,000
// x 25%)." Example two (20,000 km total, "at least 25% (or 5,000km)"
// business): "Tier One 3,500 x $0.79 = 2,765.00", "Tier Two 1,500 x $0.30 =
// 450.00". So without one (or before the driver has said which):
//   claimable km = the lesser of business km and 25% of total km
//   Tier 1 km    = the lesser of claimable km and 25% of min(total, 14,000)
//   the rest of the claimable km at Tier 2
// IRD's example only shows business use of exactly 25%; capping business km
// above 25% at 25% of total is our reading of "a maximum of 25%".
//
// Rates are set after each income year ends (OS 19/04 KM 2026: "calculated
// as soon as possible, after the end of the 2025-26 income year"), so a year
// with none published yet uses the latest and says when its own come out.
import type { FuelType } from "../types/index.js";
import { featuresFor } from "../utils/countryFeatures.js";
import type { ClaimTier, MileageClaimInput, MileageClaimResult, TaxRegime } from "./regime.js";
import { startYearOfPairLabel, yearPairLabel } from "./regime.js";
import { zonedMidnight, zonedParts } from "./zonedTime.js";

export type IrdVehicleClass = "petrol" | "diesel" | "petrol_hybrid" | "electric";

/** Vehicle.nzHybridKind: which kind of hybrid (IRD only sets a rate for petrol hybrids). */
export type NzHybridKind = "petrol" | "plugin" | "diesel" | "mild";
export const NZ_HYBRID_KINDS: readonly NzHybridKind[] = ["petrol", "plugin", "diesel", "mild"];
export const NZ_HYBRID_KIND_LABELS: Record<NzHybridKind, string> = {
  petrol: "Petrol hybrid",
  plugin: "Plug-in hybrid",
  diesel: "Diesel hybrid",
  mild: "Mild hybrid",
};

/** Vehicle.nzRecordBasis: "records" = a logbook of 90 days or more, or full
 *  records of every trip; "none" = neither. Null = not answered yet, worked
 *  out like "none" (the 25% limit) until the driver says. */
export type NzRecordBasis = "records" | "none";
export const NZ_RECORD_BASES: readonly NzRecordBasis[] = ["records", "none"];

/** s DE 4(2), OS 19/04a para 20: without a logbook or records, 25% at most. */
export const IRD_NO_RECORDS_SHARE = 0.25;

/** Cents per km. */
interface IrdRate {
  tier1: number;
  tier2: number;
}

/** Published IRD kilometre rates, by income year label ("2025-26" = 1 Apr 2025 to 31 Mar 2026). */
export const IRD_KM_RATES: Record<string, Record<IrdVehicleClass, IrdRate>> = {
  "2024-25": {
    petrol: { tier1: 117, tier2: 37 },
    diesel: { tier1: 126, tier2: 35 },
    petrol_hybrid: { tier1: 86, tier2: 21 },
    electric: { tier1: 108, tier2: 19 },
  },
  "2025-26": {
    petrol: { tier1: 120, tier2: 37 },
    diesel: { tier1: 130, tier2: 38 },
    petrol_hybrid: { tier1: 90, tier2: 24 },
    electric: { tier1: 122, tier2: 23 },
  },
};

export const IRD_TIER1_KM = 14_000;

const NZ_TIME_ZONE = "Pacific/Auckland";

const YEARS = Object.keys(IRD_KM_RATES).sort();
export const IRD_LATEST_RATES_YEAR = YEARS[YEARS.length - 1];

export const IRD_VEHICLE_LABELS: Record<IrdVehicleClass, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  petrol_hybrid: "Petrol hybrid",
  electric: "Electric",
};

/** The app's fuel type as one of IRD's four, or null when IRD has no rate for
 *  it. A hybrid is IRD's petrol hybrid only when the driver said it's a petrol
 *  hybrid (nzHybridKind "petrol"); plug-in, diesel and mild hybrids, and a
 *  hybrid not answered yet, have no IRD rate. */
export function irdVehicleClass(
  fuelType: FuelType | string | null | undefined,
  hybridKind?: NzHybridKind | string | null
): IrdVehicleClass | null {
  switch (fuelType) {
    case "petrol":
      return "petrol";
    case "diesel":
      return "diesel";
    case "hybrid":
      return hybridKind === "petrol" ? "petrol_hybrid" : null;
    case "electric":
      return "electric";
    default:
      return null;
  }
}

/** Which published year's rates a tax year uses: its own, else the latest
 *  (for a year after the latest published one). Null before the first one we hold. */
export function irdRatesYearFor(taxYear: string | undefined): { year: string; provisional: boolean } | null {
  if (!taxYear) return { year: IRD_LATEST_RATES_YEAR, provisional: false };
  if (IRD_KM_RATES[taxYear]) return { year: taxYear, provisional: false };
  const start = startYearOfPairLabel(taxYear);
  const latestStart = startYearOfPairLabel(IRD_LATEST_RATES_YEAR)!;
  if (start != null && start > latestStart) return { year: IRD_LATEST_RATES_YEAR, provisional: true };
  return null;
}

/** Split business km between the tiers (see the header for IRD's rules).
 *  basis "records": the business share of the first 14,000 km at Tier 1.
 *  Anything else (no logbook, or not answered yet): the 25% limit. */
export function irdTierSplit(
  businessKm: number,
  totalKm: number,
  basis: NzRecordBasis | string | null | undefined = "records"
): { tier1Km: number; tier2Km: number } {
  const business = Math.max(0, businessKm);
  const total = Math.max(business, totalKm || 0);
  if (basis !== "records") {
    const claimable = Math.min(business, IRD_NO_RECORDS_SHARE * total);
    const tier1Km = Math.min(claimable, IRD_NO_RECORDS_SHARE * Math.min(total, IRD_TIER1_KM));
    return { tier1Km, tier2Km: claimable - tier1Km };
  }
  if (total <= IRD_TIER1_KM) return { tier1Km: business, tier2Km: 0 };
  const tier1Km = IRD_TIER1_KM * (business / total);
  return { tier1Km, tier2Km: business - tier1Km };
}

/** The claim in cents for a split at a rate (cents per km), rounded per tier. */
export function irdClaimCents(
  split: { tier1Km: number; tier2Km: number },
  rate: { tier1: number; tier2: number }
): { tier1: number; tier2: number; total: number } {
  const tier1 = Math.round(split.tier1Km * rate.tier1);
  const tier2 = Math.round(split.tier2Km * rate.tier2);
  return { tier1, tier2, total: tier1 + tier2 };
}

function nzTaxYearOf(date: Date, timeZone = NZ_TIME_ZONE): string {
  const p = zonedParts(date, timeZone);
  return yearPairLabel(p.month >= 4 ? p.year : p.year - 1);
}

function nzTaxYearRange(label: string): { start: Date; end: Date } {
  const start = startYearOfPairLabel(label);
  if (start == null) throw new Error(`Invalid tax year format: ${label}`);
  const next = zonedMidnight(start + 1, 4, 1, NZ_TIME_ZONE);
  return {
    start: zonedMidnight(start, 4, 1, NZ_TIME_ZONE),
    end: new Date(next.getTime() - 1),
  };
}

export const NZ_REGIME: TaxRegime = {
  id: "nz-ird",
  authority: "IRD",
  country: "NZ",
  currency: "NZD",
  distanceBasis: "km",
  timeZone: NZ_TIME_ZONE,
  taxYearDescription: "1 April to 31 March",
  ratesExpected(taxYear: string): string | null {
    const start = startYearOfPairLabel(taxYear);
    return start == null ? null : `IRD publishes the ${taxYear} rates after 31 March ${start + 1}.`;
  },
  taxYearOf: nzTaxYearOf,
  taxYearRange: nzTaxYearRange,
  isTaxYearLabel: (label) => startYearOfPairLabel(label) != null,
  mileageClaim(input: MileageClaimInput): MileageClaimResult {
    if (input.vehicleType === "motorbike") return { ok: false, reason: "vehicle_type_unsupported" };
    if (input.fuelType === "hybrid" && !input.hybridKind) return { ok: false, reason: "hybrid_kind_needed" };
    const cls = irdVehicleClass(input.fuelType, input.hybridKind);
    if (!cls) return { ok: false, reason: input.fuelType === "hybrid" ? "hybrid_no_rate" : "fuel_unknown" };
    const ratesYear = irdRatesYearFor(input.taxYear);
    if (!ratesYear) return { ok: false, reason: "no_rates" };
    const rate = IRD_KM_RATES[ratesYear.year][cls];
    const totalDistance = input.totalDistance ?? input.businessDistance;
    const recordBasis = input.recordBasis === "records" || input.recordBasis === "none" ? input.recordBasis : null;
    const split = irdTierSplit(input.businessDistance, totalDistance, recordBasis);
    const cents = irdClaimCents(split, rate);
    const tiers: ClaimTier[] = [
      { label: "Tier 1", distance: split.tier1Km, rateMinor: rate.tier1, amountMinor: cents.tier1 },
      { label: "Tier 2", distance: split.tier2Km, rateMinor: rate.tier2, amountMinor: cents.tier2 },
    ];
    // Under the 25% limit: what it would be with a logbook or full records.
    const full =
      recordBasis === "records"
        ? null
        : irdClaimCents(irdTierSplit(input.businessDistance, totalDistance, "records"), rate).total;
    return {
      ok: true,
      claim: {
        amountMinor: cents.total,
        currency: "NZD",
        tiers,
        ratesYear: ratesYear.year,
        provisional: ratesYear.provisional,
        recordBasis: recordBasis ?? "unanswered",
        ...(full != null && full !== cents.total ? { amountWithRecordsMinor: full } : {}),
      },
    };
  },
  features: featuresFor("NZ"),
};
