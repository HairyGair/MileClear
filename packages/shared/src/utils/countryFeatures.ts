// What a driver can see in their country (23 Oct 2026). The ONE gate for
// UK-only features: screens, cards, jobs and EmSee ask featuresFor(country)
// rather than checking the country themselves, so adding a country later is
// a change here, not a hunt through the app.
//
// Recording, trips, Business/Personal, shifts, earnings, expenses, vehicles
// (typed in), fuel logs, badges and the trip downloads work everywhere.
import { countryOf } from "../data/countries.js";

/**
 * Countries that count as the UK here. The Crown Dependencies (Jersey,
 * Guernsey, Isle of Man) are listed with the UK in admin geography and drive
 * in miles and pounds, so they keep the UK features they have today.
 */
export const UK_COUNTRY_CODES = ["GB", "JE", "GG", "IM"] as const;

const UK = new Set<string>(UK_COUNTRY_CODES);

export function isUk(country: unknown): boolean {
  return UK.has(countryOf(country));
}

export interface CountryFeatures {
  /** HMRC mileage claim figures (55p/25p in £), the Tax tab and pages, tax
   *  year progress, tax readiness, HMRC reconciliation, employer AMAP rates,
   *  UK tax bands and estimates, tax tips. */
  ukTax: boolean;
  /** Self Assessment wizard, checklist, first-return guide, the SA PDF. */
  selfAssessment: boolean;
  /** Making Tax Digital: the HMRC connection, its screens and signposts. */
  mtd: boolean;
  /** Mileage Allowance Relief / P87 for employees. */
  mileageRelief: boolean;
  /** DVLA plate lookup, MOT history, MOT and tax reminders. */
  vehicleLookup: boolean;
  /** Clean Air Zones and Ticket Defender. */
  cleanAirZones: boolean;
  /** Roadworks and road alerts (Street Manager, TfL, Wales, NH). */
  roadAlerts: boolean;
  /** UK fuel prices: nearby, cheapest fuel, price alerts. Fuel logs stay. */
  fuelPrices: boolean;
  /** Bank connection (TrueLayer, UK banks). */
  openBanking: boolean;
}

const ALL_UK: CountryFeatures = {
  ukTax: true,
  selfAssessment: true,
  mtd: true,
  mileageRelief: true,
  vehicleLookup: true,
  cleanAirZones: true,
  roadAlerts: true,
  fuelPrices: true,
  openBanking: true,
};

const NONE: CountryFeatures = {
  ukTax: false,
  selfAssessment: false,
  mtd: false,
  mileageRelief: false,
  vehicleLookup: false,
  cleanAirZones: false,
  roadAlerts: false,
  fuelPrices: false,
  openBanking: false,
};

/** Missing or unknown country is the UK, so older servers and every driver
 *  before the setting see exactly what they saw before. */
export function featuresFor(country: unknown): CountryFeatures {
  return isUk(country) ? ALL_UK : NONE;
}

export type CountryFeature = keyof CountryFeatures;

/** The UK-only features this country doesn't get (empty for the UK). */
export function ukOnlyFeaturesFor(country: unknown): CountryFeature[] {
  const f = featuresFor(country);
  return (Object.keys(f) as CountryFeature[]).filter((k) => !f[k]);
}

/** Shown on a screen opened by a link to a feature the country doesn't have. */
export const NOT_IN_YOUR_COUNTRY = "Not available in your country yet";
