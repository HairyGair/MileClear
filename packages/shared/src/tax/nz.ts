// New Zealand: Inland Revenue (IRD) kilometre rates for business use of a
// motor vehicle. Checked on IRD's own pages on 23 Oct 2026:
//
//   2025-26: https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/claiming-vehicle-expenses/kilometre-rates-2025-2026
//            and operational statement OS 19/04 KM 2026 (made 2 Jun 2026, in force 4 Jun 2026):
//            https://www.taxtechnical.ird.govt.nz/operational-statements/2026/os-19-04-km-2026
//   2024-25: https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/claiming-vehicle-expenses/kilometre-rates-2024-2025
//
// IRD lists four vehicle types only: petrol, diesel, petrol hybrid, electric.
// The app's fuel types are petrol, diesel, electric and hybrid, so each maps
// to one of them; "hybrid" is worked out at IRD's petrol hybrid rate, and a
// plug-in or diesel hybrid driver is told to check with IRD or an accountant.
// IRD's pages don't say whether the kilometre rates cover motorbikes, so a
// motorbike gets no figure. 2026-27 rates were
// not published on 23 Oct 2026 (IRD sets each year's rates after it ends), so
// the current year uses the latest published rates and says so.
//
// The tiers, in IRD's words: Tier 1 is for "the business portion of the first
// 14,000 kilometres travelled by the vehicle in an income year", private use
// included; Tier 2 is for the business portion "when overall vehicle travel
// (both business and private) exceeds 14,000 kilometres". IRD gives no
// formula, so the business portion is taken as the vehicle's business share
// of its total travel:
//   total <= 14,000 km: every business km at Tier 1
//   total  > 14,000 km: Tier 1 km = 14,000 x (business / total), the rest Tier 2
import type { FuelType } from "../types/index.js";
import { featuresFor } from "../utils/countryFeatures.js";
import type { ClaimTier, MileageClaimInput, MileageClaimResult, TaxRegime } from "./regime.js";
import { startYearOfPairLabel, yearPairLabel } from "./regime.js";
import { zonedMidnight, zonedParts } from "./zonedTime.js";

export type IrdVehicleClass = "petrol" | "diesel" | "petrol_hybrid" | "electric";

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

/** The app's fuel type as one of IRD's four, or null when IRD has no rate for it.
 *  The app's "hybrid" is IRD's petrol hybrid rate (the app can't tell a plug-in
 *  or diesel hybrid apart; the card and help tell those drivers to check). Null
 *  only for a value outside the app's fuel types. */
export function irdVehicleClass(fuelType: FuelType | string | null | undefined): IrdVehicleClass | null {
  switch (fuelType) {
    case "petrol":
      return "petrol";
    case "diesel":
      return "diesel";
    case "hybrid":
      return "petrol_hybrid";
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

/** Split business km between the tiers (see the header for IRD's rule). */
export function irdTierSplit(businessKm: number, totalKm: number): { tier1Km: number; tier2Km: number } {
  const business = Math.max(0, businessKm);
  const total = Math.max(business, totalKm || 0);
  if (total <= IRD_TIER1_KM) return { tier1Km: business, tier2Km: 0 };
  const tier1Km = IRD_TIER1_KM * (business / total);
  return { tier1Km, tier2Km: business - tier1Km };
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
  taxYearOf: nzTaxYearOf,
  taxYearRange: nzTaxYearRange,
  isTaxYearLabel: (label) => startYearOfPairLabel(label) != null,
  mileageClaim(input: MileageClaimInput): MileageClaimResult {
    if (input.vehicleType === "motorbike") return { ok: false, reason: "vehicle_type_unsupported" };
    const cls = irdVehicleClass(input.fuelType);
    if (!cls) return { ok: false, reason: "fuel_unknown" };
    const ratesYear = irdRatesYearFor(input.taxYear);
    if (!ratesYear) return { ok: false, reason: "no_rates" };
    const rate = IRD_KM_RATES[ratesYear.year][cls];
    const { tier1Km, tier2Km } = irdTierSplit(input.businessDistance, input.totalDistance ?? input.businessDistance);
    const t1 = Math.round(tier1Km * rate.tier1);
    const t2 = Math.round(tier2Km * rate.tier2);
    const tiers: ClaimTier[] = [
      { label: "Tier 1", distance: tier1Km, rateMinor: rate.tier1, amountMinor: t1 },
      { label: "Tier 2", distance: tier2Km, rateMinor: rate.tier2, amountMinor: t2 },
    ];
    return {
      ok: true,
      claim: {
        amountMinor: t1 + t2,
        currency: "NZD",
        tiers,
        ratesYear: ratesYear.year,
        provisional: ratesYear.provisional,
      },
    };
  },
  features: featuresFor("NZ"),
};
