// Figures and copy for the New Zealand landing page (/nz, 23 Oct 2026). Every
// IRD number comes from the shared tables in packages/shared/src/tax, so the
// page, the app's claim card and the logbook always agree; when IRD publishes
// a new year's rates, adding them there updates this page too.
import {
  IRD_KM_RATES,
  IRD_LATEST_RATES_YEAR,
  IRD_TIER1_KM,
  IRD_VEHICLE_LABELS,
  NZ_CLAIM_HELP_ENTRY,
  NZ_LOGBOOK_HELP_ENTRY,
  NZ_LOGBOOK_MIN_DAYS,
  NZ_LOGBOOK_REUSE_CHANGE_PERCENT,
  NZ_LOGBOOK_REUSE_YEARS,
  NZ_NO_LOGBOOK_CAP_PERCENT,
  formatMoney,
  formatRatePerKm,
  irdTierSplit,
  type IrdVehicleClass,
} from "@mileclear/shared";
import { NZ_PRO_PRICE_MONTHLY, NZ_PRO_PRICE_YEARLY } from "@/data/nzPricing";

export const NZ_PAGE_URL = "https://mileclear.com/nz";

/** IRD's pages, named and linked on the page. */
export const IRD_SOURCES = {
  rates: {
    label: `IRD kilometre rates for ${IRD_LATEST_RATES_YEAR}`,
    href: "https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/claiming-vehicle-expenses/kilometre-rates-2025-2026",
  },
  vehicleExpenses: {
    label: "IRD: claiming vehicle expenses",
    href: "https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/claiming-vehicle-expenses",
  },
  logbook: {
    label: "IRD: use a logbook",
    href: "https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/claiming-vehicle-expenses/use-a-logbook",
  },
} as const;

const ORDER: IrdVehicleClass[] = ["petrol", "diesel", "petrol_hybrid", "electric"];

export interface RateRow {
  vehicle: string;
  tier1: string;
  tier2: string;
}

/** The latest published year's rates, one row per IRD vehicle type. */
export function latestRateRows(): RateRow[] {
  const year = IRD_KM_RATES[IRD_LATEST_RATES_YEAR];
  return ORDER.map((v) => ({
    vehicle: IRD_VEHICLE_LABELS[v],
    tier1: formatRatePerKm(year[v].tier1, "NZD"),
    tier2: formatRatePerKm(year[v].tier2, "NZD"),
  }));
}

/** The year after the latest published one ("2026-27" after "2025-26"). */
export function nextRatesYear(): string {
  const start = Number(IRD_LATEST_RATES_YEAR.slice(0, 4)) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Tier 1 business km without a logbook: 25% of the first 14,000 km. */
export const NO_LOGBOOK_TIER1_KM = (IRD_TIER1_KM * NZ_NO_LOGBOOK_CAP_PERCENT) / 100;

const km = (n: number) => `${Math.round(n).toLocaleString("en-NZ")} km`;

/** IRD's worked example (20,000 km in the year, 60% business), at the latest
 *  published petrol rates. */
export function workedExample() {
  const totalKm = 20_000;
  const businessShare = 0.6;
  const { tier1Km, tier2Km } = irdTierSplit(totalKm * businessShare, totalKm);
  const rate = IRD_KM_RATES[IRD_LATEST_RATES_YEAR].petrol;
  const tier1 = Math.round(tier1Km * rate.tier1);
  const tier2 = Math.round(tier2Km * rate.tier2);
  return {
    totalKm: km(totalKm),
    businessPercent: `${businessShare * 100}%`,
    tier1Km: km(tier1Km),
    tier2Km: km(tier2Km),
    tier1Rate: formatRatePerKm(rate.tier1, "NZD"),
    tier2Rate: formatRatePerKm(rate.tier2, "NZD"),
    tier1Amount: formatMoney(tier1, "NZD"),
    tier2Amount: formatMoney(tier2, "NZD"),
    total: formatMoney(tier1 + tier2, "NZD"),
  };
}

export const LOGBOOK_RULES = {
  minDays: NZ_LOGBOOK_MIN_DAYS,
  reuseYears: NZ_LOGBOOK_REUSE_YEARS,
  reuseChangePercent: NZ_LOGBOOK_REUSE_CHANGE_PERCENT,
  capPercent: NZ_NO_LOGBOOK_CAP_PERCENT,
};

export interface Faq {
  q: string;
  a: string;
}

/** The FAQ. The first two are the app's own help answers, so the page and
 *  the app say the same thing. */
export function nzFaqs(): Faq[] {
  return [
    { q: NZ_CLAIM_HELP_ENTRY.q, a: NZ_CLAIM_HELP_ENTRY.a },
    { q: NZ_LOGBOOK_HELP_ENTRY.q, a: NZ_LOGBOOK_HELP_ENTRY.a },
    {
      q: "Does MileClear show kilometres?",
      a: "Yes. Choose Kilometres in Settings > Distances and your trips and totals show km. The claim and the 90-day logbook are always in km, as IRD's rates are.",
    },
    {
      q: "What if I don't keep a logbook?",
      a: `IRD limits the claim to ${NZ_NO_LOGBOOK_CAP_PERCENT}% business use without a logbook or full records. At kilometre rates that means Tier 1 on at most ${km(NO_LOGBOOK_TIER1_KM)} of business driving, then Tier 2. A ${NZ_LOGBOOK_MIN_DAYS}-day logbook sets your real business share, so it usually pays to keep one.`,
    },
    {
      q: "Can I switch between kilometre rates and actual costs?",
      a: "No. IRD has you choose the method for each vehicle in the first year you use it for business, and that choice stays for as long as you own it. If you claimed actual costs that year, you stay on actual costs.",
    },
    {
      q: "Is MileClear free?",
      a: `Recording your drives, your trips, Business or Personal and the claim figure are free, with no monthly trip limit. The ${NZ_LOGBOOK_MIN_DAYS}-day logbook and the downloads are part of Pro: ${NZ_PRO_PRICE_MONTHLY} a month or ${NZ_PRO_PRICE_YEARLY} a year, in the App Store.`,
    },
  ];
}
