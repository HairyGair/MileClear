import { describe, expect, it } from "vitest";
import { calculateMileageDeduction, getTaxYear, parseTaxYear } from "../utils/index.js";
import { formatMoney, formatRatePerKm } from "../utils/money.js";
import {
  IRD_KM_RATES,
  NZ_REGIME,
  UK_REGIME,
  irdRatesYearFor,
  irdTierSplit,
  irdVehicleClass,
  regimeFor,
} from "./index.js";

describe("regimeFor", () => {
  it("gives HMRC for the UK, the Crown Dependencies, missing and unknown countries", () => {
    for (const c of ["GB", "JE", "GG", "IM", null, undefined, "", "zz"]) {
      expect(regimeFor(c)?.id).toBe("uk-hmrc");
    }
  });
  it("gives IRD for New Zealand, in any case", () => {
    expect(regimeFor("NZ")?.id).toBe("nz-ird");
    expect(regimeFor("nz")?.id).toBe("nz-ird");
  });
  it("gives nothing for a country with no regime yet", () => {
    for (const c of ["AU", "IE", "CA", "US", "DE"]) expect(regimeFor(c)).toBeNull();
  });
});

describe("UK regime is the existing HMRC functions", () => {
  const dates = [
    new Date(2026, 3, 5, 23, 59),
    new Date(2026, 3, 6, 0, 0),
    new Date(2025, 0, 15),
    new Date(2026, 9, 23),
  ];
  it("tax year matches getTaxYear", () => {
    for (const d of dates) expect(UK_REGIME.taxYearOf(d)).toBe(getTaxYear(d));
  });
  it("range matches parseTaxYear", () => {
    for (const y of ["2024-25", "2025-26", "2026-27"]) {
      expect(UK_REGIME.taxYearRange(y)).toEqual(parseTaxYear(y));
    }
  });
  it("claim matches calculateMileageDeduction for every vehicle type, year and distance", () => {
    for (const vehicleType of ["car", "van", "motorbike"] as const) {
      for (const taxYear of ["2024-25", "2025-26", "2026-27", undefined]) {
        for (const miles of [0, 1, 999.4, 10_000, 10_000.5, 23_456.7]) {
          const r = UK_REGIME.mileageClaim({ businessDistance: miles, vehicleType, taxYear });
          expect(r.ok).toBe(true);
          if (!r.ok) continue;
          expect(r.claim.amountMinor).toBe(calculateMileageDeduction(vehicleType, miles, { taxYear }).deductionPence);
          expect(r.claim.currency).toBe("GBP");
        }
      }
    }
  });
  it("splits a car's claim at 10,000 miles", () => {
    const r = UK_REGIME.mileageClaim({ businessDistance: 12_000, vehicleType: "car", taxYear: "2026-27" });
    expect(r.ok && r.claim.tiers.map((t) => [t.distance, t.rateMinor])).toEqual([
      [10_000, 55],
      [2_000, 25],
    ]);
  });
  it("has every UK feature", () => {
    expect(Object.values(UK_REGIME.features).every(Boolean)).toBe(true);
  });
});

describe("NZ tax year (1 April to 31 March, Auckland time)", () => {
  it("31 March 23:59 in Auckland is the old year, 1 April 00:00 the new one", () => {
    // NZDT (UTC+13) until the first Sunday in April 2026 (5 April).
    expect(NZ_REGIME.taxYearOf(new Date("2026-03-31T10:59:00Z"))).toBe("2025-26");
    expect(NZ_REGIME.taxYearOf(new Date("2026-03-31T11:00:00Z"))).toBe("2026-27");
  });
  it("is decided in Auckland, not UTC: 31 March 13:00 UTC is already 1 April there", () => {
    expect(NZ_REGIME.taxYearOf(new Date("2026-03-31T13:00:00Z"))).toBe("2026-27");
  });
  it("mid-year dates", () => {
    expect(NZ_REGIME.taxYearOf(new Date("2026-10-23T09:00:00Z"))).toBe("2026-27");
    expect(NZ_REGIME.taxYearOf(new Date("2026-01-15T00:00:00Z"))).toBe("2025-26");
  });
  it("range runs from Auckland midnight 1 April to the millisecond before the next", () => {
    const r = NZ_REGIME.taxYearRange("2025-26");
    expect(r.start.toISOString()).toBe("2025-03-31T11:00:00.000Z"); // NZDT, UTC+13
    expect(r.end.toISOString()).toBe("2026-03-31T10:59:59.999Z");
    const r2 = NZ_REGIME.taxYearRange("2026-27");
    expect(r2.start.toISOString()).toBe("2026-03-31T11:00:00.000Z");
  });
  it("rejects a bad label", () => {
    expect(() => NZ_REGIME.taxYearRange("2025-27")).toThrow();
    expect(NZ_REGIME.isTaxYearLabel("2025")).toBe(false);
  });
});

describe("NZ tier split", () => {
  it("total at or under 14,000 km: every business km is Tier 1", () => {
    expect(irdTierSplit(6_000, 9_000)).toEqual({ tier1Km: 6_000, tier2Km: 0 });
    expect(irdTierSplit(14_000, 14_000)).toEqual({ tier1Km: 14_000, tier2Km: 0 });
  });
  it("over 14,000 km: Tier 1 is 14,000 times the business share", () => {
    // 20,000 km total, 15,000 business (75%): 10,500 Tier 1, 4,500 Tier 2.
    expect(irdTierSplit(15_000, 20_000)).toEqual({ tier1Km: 10_500, tier2Km: 4_500 });
    // All business: 14,000 and the rest.
    expect(irdTierSplit(18_000, 18_000)).toEqual({ tier1Km: 14_000, tier2Km: 4_000 });
  });
  it("total never below business (bad data treated as all business)", () => {
    expect(irdTierSplit(16_000, 1_000)).toEqual({ tier1Km: 14_000, tier2Km: 2_000 });
  });
});

describe("NZ claim", () => {
  it("2025-26 petrol, under 14,000 km: business km x $1.20", () => {
    const r = NZ_REGIME.mileageClaim({ businessDistance: 5_000, totalDistance: 8_000, fuelType: "petrol", taxYear: "2025-26" });
    expect(r).toEqual({
      ok: true,
      claim: {
        amountMinor: 600_000,
        currency: "NZD",
        ratesYear: "2025-26",
        provisional: false,
        tiers: [
          { label: "Tier 1", distance: 5_000, rateMinor: 120, amountMinor: 600_000 },
          { label: "Tier 2", distance: 0, rateMinor: 37, amountMinor: 0 },
        ],
      },
    });
  });
  it("2025-26 diesel over 14,000 km mixes the tiers", () => {
    const r = NZ_REGIME.mileageClaim({ businessDistance: 15_000, totalDistance: 20_000, fuelType: "diesel", taxYear: "2025-26" });
    // 10,500 x 130c + 4,500 x 38c
    expect(r.ok && r.claim.amountMinor).toBe(10_500 * 130 + 4_500 * 38);
  });
  it("uses each published year's own rates", () => {
    const r = NZ_REGIME.mileageClaim({ businessDistance: 100, totalDistance: 100, fuelType: "electric", taxYear: "2024-25" });
    expect(r.ok && r.claim.amountMinor).toBe(100 * 108);
  });
  it("a year after the latest published uses the latest and says so", () => {
    const r = NZ_REGIME.mileageClaim({ businessDistance: 100, totalDistance: 100, fuelType: "hybrid", taxYear: "2026-27" });
    expect(r.ok && r.claim.ratesYear).toBe("2025-26");
    expect(r.ok && r.claim.provisional).toBe(true);
    expect(r.ok && r.claim.amountMinor).toBe(100 * 90);
  });
  it("a year before the first one held has no figure", () => {
    expect(NZ_REGIME.mileageClaim({ businessDistance: 100, fuelType: "petrol", taxYear: "2023-24" })).toEqual({
      ok: false,
      reason: "no_rates",
    });
    expect(irdRatesYearFor("rubbish")).toBeNull();
  });
  it("no figure for an unknown fuel or a motorbike", () => {
    expect(NZ_REGIME.mileageClaim({ businessDistance: 100, fuelType: "lpg" })).toEqual({ ok: false, reason: "fuel_unknown" });
    expect(NZ_REGIME.mileageClaim({ businessDistance: 100, fuelType: null })).toEqual({ ok: false, reason: "fuel_unknown" });
    expect(NZ_REGIME.mileageClaim({ businessDistance: 100, fuelType: "petrol", vehicleType: "motorbike" })).toEqual({
      ok: false,
      reason: "vehicle_type_unsupported",
    });
  });
  it("maps the app's fuel types to IRD's four", () => {
    expect(irdVehicleClass("petrol")).toBe("petrol");
    expect(irdVehicleClass("diesel")).toBe("diesel");
    expect(irdVehicleClass("hybrid")).toBe("petrol_hybrid");
    expect(irdVehicleClass("electric")).toBe("electric");
    expect(irdVehicleClass("plugin_hybrid")).toBeNull();
  });
  it("holds exactly the IRD 2025-26 figures", () => {
    expect(IRD_KM_RATES["2025-26"]).toEqual({
      petrol: { tier1: 120, tier2: 37 },
      diesel: { tier1: 130, tier2: 38 },
      petrol_hybrid: { tier1: 90, tier2: 24 },
      electric: { tier1: 122, tier2: 23 },
    });
  });
  it("has none of the UK-only features", () => {
    expect(Object.values(NZ_REGIME.features).some(Boolean)).toBe(false);
  });
});

describe("formatMoney", () => {
  it("GBP is formatPence", () => {
    expect(formatMoney(123456, "GBP")).toBe("£1,234.56");
    expect(formatMoney(5)).toBe("£0.05");
  });
  it("dollars, euros, codes", () => {
    expect(formatMoney(123456, "NZD")).toBe("$1,234.56");
    expect(formatMoney(99, "AUD")).toBe("$0.99");
    expect(formatMoney(100000000, "EUR")).toBe("€1,000,000.00");
    expect(formatMoney(123456, "SEK")).toBe("SEK 1,234.56");
    expect(formatMoney(-2550, "NZD")).toBe("-$25.50");
    expect(formatMoney(1500, "JPY")).toBe("JPY 1,500");
  });
  it("per-km rates", () => {
    expect(formatRatePerKm(120, "NZD")).toBe("$1.20");
    expect(formatRatePerKm(37, "NZD")).toBe("37c");
    expect(formatRatePerKm(55, "GBP")).toBe("55p");
  });
});
