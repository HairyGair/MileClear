// Tax rules by country (23 Oct 2026, going beyond the UK). One regime per
// tax authority: its tax year, its currency, the distance its rates are set
// in, and how a mileage claim is worked out. regimeFor(country) picks it.
//
// The UK regime is a thin wrapper over the existing HMRC functions
// (getTaxYear, parseTaxYear, calculateMileageDeduction) and changes nothing:
// the UK screens and services keep calling those functions directly. New
// country code paths (New Zealand first) go through the regime instead.
import type { CountryFeatures } from "../utils/countryFeatures.js";
import type { FuelType } from "../types/index.js";

export type RegimeId = "uk-hmrc" | "nz-ird";

export type RegimeVehicleType = "car" | "van" | "motorbike";

export interface MileageClaimInput {
  /** Business distance in the regime's distance basis (miles for the UK, km for NZ). */
  businessDistance: number;
  /** All distance the vehicle travelled in the tax year, business and private, same basis.
   *  NZ's tier 1 is set by this; the UK ignores it. */
  totalDistance?: number;
  fuelType?: FuelType | string | null;
  vehicleType?: RegimeVehicleType | string | null;
  /** Regime tax-year label, e.g. "2025-26". Missing = the latest rates. */
  taxYear?: string;
}

export interface ClaimTier {
  /** "First 10,000 miles", "Tier 1" ... */
  label: string;
  /** Distance claimed at this rate, in the regime's basis. */
  distance: number;
  /** Rate in minor units per mile or km (pence, cents). */
  rateMinor: number;
  amountMinor: number;
}

export interface MileageClaim {
  amountMinor: number;
  currency: string;
  tiers: ClaimTier[];
  /** The tax year whose published rates were used. */
  ratesYear: string;
  /** True when the claim's own year has no published rates yet and
   *  ratesYear's were used instead. */
  provisional: boolean;
}

/** Why there is no claim figure (shown as plain words, never a guessed amount). */
export type NoClaimReason =
  | "no_rates"
  | "fuel_unknown"
  | "vehicle_type_unsupported";

export type MileageClaimResult =
  | { ok: true; claim: MileageClaim }
  | { ok: false; reason: NoClaimReason };

export interface TaxRegime {
  id: RegimeId;
  /** The tax authority's short name: "HMRC", "IRD". */
  authority: string;
  /** Main country code. */
  country: string;
  currency: string;
  /** The distance the rates are set in. */
  distanceBasis: "miles" | "km";
  /** Where the tax year's dates are decided. */
  timeZone: string;
  /** e.g. "6 April to 5 April". */
  taxYearDescription: string;
  /** The tax-year label (e.g. "2025-26") that `date` falls in. */
  taxYearOf(date: Date, timeZone?: string): string;
  /** Start and end (inclusive, to the millisecond) of a tax-year label. Throws on a bad label. */
  taxYearRange(label: string): { start: Date; end: Date };
  /** True when `label` is a well-formed tax-year label for this regime. */
  isTaxYearLabel(label: string): boolean;
  mileageClaim(input: MileageClaimInput): MileageClaimResult;
  /** Which UK-only features apply (the UK has all, others none). */
  features: CountryFeatures;
}

/** "2025-26" style labels: start year, two-digit end year. Shared by UK and NZ. */
export function yearPairLabel(startYear: number): string {
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

/** The start year of a "2025-26" label, or null when it isn't one. */
export function startYearOfPairLabel(label: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return null;
  const start = Number(m[1]);
  if (m[2] !== String(start + 1).slice(2)) return null;
  return start;
}
