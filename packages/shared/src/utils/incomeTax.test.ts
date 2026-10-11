import { describe, it, expect } from "vitest";
import { estimateUkTax } from "./index.js";
import {
  getIncomeTaxRates,
  higherRateStartsAtPence,
  incomeTaxOn,
  marginalIncomeTaxSlices,
  personalAllowanceFor,
  taxRegionFor,
} from "./incomeTax.js";

// Worked by hand from the gov.uk table "Income Tax rates and allowances:
// current and past" (bands as taxable income after the £12,570 allowance):
//   rest of UK:      20% to £37,700, 40% to £125,140, 45% above
//   Scotland 2025-26: 19% to £2,827, 20% to £14,921, 21% to £31,092,
//                     42% to £62,430, 45% to £125,140, 48% above
//   Scotland 2026-27: 19% to £3,967, 20% to £16,956, 21% to £31,092,
//                     42% to £62,430, 45% to £125,140, 48% above
const tax = (profitPounds: number, taxYear: string, scottishTaxpayer: boolean) =>
  estimateUkTax(profitPounds * 100, { taxYear, scottishTaxpayer }).incomeTaxPence;

describe("Income Tax, rest of UK (both years)", () => {
  for (const ty of ["2025-26", "2026-27"]) {
    it(`${ty}: £30k, £50k, £80k, £130k`, () => {
      // 17,430 x 20% = 3,486
      expect(tax(30_000, ty, false)).toBe(348_600);
      // 37,430 x 20% = 7,486
      expect(tax(50_000, ty, false)).toBe(748_600);
      // 37,700 x 20% = 7,540 + 29,730 x 40% = 11,892 -> 19,432
      expect(tax(80_000, ty, false)).toBe(1_943_200);
      // No allowance left. 7,540 + 87,440 x 40% = 34,976 + 4,860 x 45% = 2,187 -> 44,703
      expect(tax(130_000, ty, false)).toBe(4_470_300);
    });
  }

  it("shrinks the allowance over £100,000 (£110k: allowance £7,570)", () => {
    // taxable 102,430: 7,540 + 64,730 x 40% = 25,892 -> 33,432
    expect(tax(110_000, "2026-27", false)).toBe(3_343_200);
  });
});

describe("Income Tax, Scotland 2026-27", () => {
  it("£30k", () => {
    // 3,967 x 19% = 753.73; 12,989 x 20% = 2,597.80; 474 x 21% = 99.54 -> 3,451.07
    expect(tax(30_000, "2026-27", true)).toBe(345_107);
  });
  it("£50k", () => {
    // 753.73 + 2,597.80 + 14,136 x 21% = 2,968.56 + 6,338 x 42% = 2,661.96 -> 8,982.05
    expect(tax(50_000, "2026-27", true)).toBe(898_205);
  });
  it("£80k", () => {
    // 6,320.09 + 31,338 x 42% = 13,161.96 + 5,000 x 45% = 2,250 -> 21,732.05
    expect(tax(80_000, "2026-27", true)).toBe(2_173_205);
  });
  it("£130k", () => {
    // 19,482.05 + 62,710 x 45% = 28,219.50 + 4,860 x 48% = 2,332.80 -> 50,034.35
    expect(tax(130_000, "2026-27", true)).toBe(5_003_435);
  });
  it("£110k loses part of the allowance at 45%", () => {
    // taxable 102,430: 19,482.05 + 40,000 x 45% = 18,000 -> 37,482.05
    expect(tax(110_000, "2026-27", true)).toBe(3_748_205);
  });
});

describe("Income Tax, Scotland 2025-26", () => {
  it("£30k", () => {
    // 2,827 x 19% = 537.13; 12,094 x 20% = 2,418.80; 2,509 x 21% = 526.89 -> 3,482.82
    expect(tax(30_000, "2025-26", true)).toBe(348_282);
  });
  it("£50k", () => {
    // 2,955.93 + 16,171 x 21% = 3,395.91 + 6,338 x 42% = 2,661.96 -> 9,013.80
    expect(tax(50_000, "2025-26", true)).toBe(901_380);
  });
  it("£80k", () => {
    // 6,351.84 + 13,161.96 + 2,250 -> 21,763.80
    expect(tax(80_000, "2025-26", true)).toBe(2_176_380);
  });
  it("£130k", () => {
    // 19,513.80 + 28,219.50 + 2,332.80 -> 50,066.10
    expect(tax(130_000, "2025-26", true)).toBe(5_006_610);
  });
});

describe("Scottish profit on top of other income", () => {
  it("£10k profit on a £40k salary, 2026-27", () => {
    // tax(50k) 8,982.05 - tax(40k) 5,551.07 = 3,430.98
    const r = estimateUkTax(1_000_000, { otherIncomePence: 4_000_000, taxYear: "2026-27", scottishTaxpayer: true });
    expect(r.incomeTaxPence).toBe(343_098);
  });

  it("marginal slices add up to the extra tax", () => {
    const rates = getIncomeTaxRates("2026-27", "scotland");
    const slices = marginalIncomeTaxSlices(1_000_000, 4_000_000, rates);
    const sum = slices.reduce((s, x) => s + x.taxPence, 0);
    expect(Math.round(sum)).toBe(343_098);
    expect(slices.filter((s) => s.taxablePence > 0).map((s) => s.label)).toEqual(["Intermediate rate", "Higher rate"]);
  });
});

describe("NI is UK-wide", () => {
  it("Class 4 is the same in Scotland", () => {
    for (const p of [3_000_000, 5_000_000, 8_000_000, 13_000_000]) {
      const a = estimateUkTax(p, { taxYear: "2026-27" });
      const b = estimateUkTax(p, { taxYear: "2026-27", scottishTaxpayer: true });
      expect(b.class4NiPence).toBe(a.class4NiPence);
      expect(b.class2NiPence).toBe(0);
    }
  });
});

describe("rates lookup", () => {
  it("not answered means rest of UK", () => {
    expect(taxRegionFor(null)).toBe("rUK");
    expect(taxRegionFor(undefined)).toBe("rUK");
    expect(taxRegionFor(false)).toBe("rUK");
    expect(taxRegionFor(true)).toBe("scotland");
    expect(estimateUkTax(5_000_000, { taxYear: "2026-27", scottishTaxpayer: null })).toEqual(
      estimateUkTax(5_000_000, { taxYear: "2026-27" }),
    );
  });

  it("checked years are not provisional; unchecked years are", () => {
    expect(getIncomeTaxRates("2025-26", "scotland").provisional).toBe(false);
    expect(getIncomeTaxRates("2026-27", "scotland").provisional).toBe(false);
    const next = getIncomeTaxRates("2027-28", "scotland");
    expect(next.provisional).toBe(true);
    expect(next.bands).toEqual(getIncomeTaxRates("2026-27", "scotland").bands);
  });

  it("allowance taper", () => {
    const r = getIncomeTaxRates("2026-27");
    expect(personalAllowanceFor(10_000_000, r)).toBe(1_257_000);
    expect(personalAllowanceFor(11_000_000, r)).toBe(757_000);
    expect(personalAllowanceFor(12_514_000, r)).toBe(0);
    expect(incomeTaxOn(1_257_000, r)).toBe(0);
  });

  it("where the 40%+ rate starts", () => {
    expect(higherRateStartsAtPence(getIncomeTaxRates("2026-27", "rUK"))).toEqual({ incomePence: 5_027_000, rate: 0.4 });
    expect(higherRateStartsAtPence(getIncomeTaxRates("2026-27", "scotland"))).toEqual({ incomePence: 4_366_200, rate: 0.42 });
  });
});
