import { describe, it, expect } from "vitest";
import {
  amapRatesForTaxYear,
  calculateMileageAllowanceRelief,
  incomeTaxBandsForTaxYear,
  marClaimDeadline,
  marClaimableTaxYears,
  marYearStatus,
  P87_MAX_CLAIM_PENCE,
  type MarYearInput,
} from "./mileageRelief.js";

function rates(first: number, after: number | null = null) {
  return { kind: "rates" as const, carVanFirst10kPence: first, carVanAfter10kPence: after };
}

function calc(input: Partial<MarYearInput> & { taxYear: string }) {
  const res = calculateMileageAllowanceRelief({
    carVanMiles: 0,
    motorcycleMiles: 0,
    employerPaid: rates(0),
    ...input,
  });
  if (!res) throw new Error("expected a result");
  return res;
}

describe("amapRatesForTaxYear (EIM31240)", () => {
  it("45p / 25p / 24p / 20p from 2011-12 to 2025-26", () => {
    for (const ty of ["2011-12", "2019-20", "2022-23", "2025-26"]) {
      const r = amapRatesForTaxYear(ty)!;
      expect(r.published).toBe(true);
      expect(r.rates).toEqual({ carVanFirst10kPence: 45, carVanAfter10kPence: 25, motorcyclePence: 24, cyclePence: 20 });
    }
  });
  it("55p / 25p / 24p / 20p from 2026-27", () => {
    const r = amapRatesForTaxYear("2026-27")!;
    expect(r.published).toBe(true);
    expect(r.rates).toEqual({ carVanFirst10kPence: 55, carVanAfter10kPence: 25, motorcyclePence: 24, cyclePence: 20 });
  });
  it("carries 2026-27 rates forward but flags them unpublished", () => {
    const r = amapRatesForTaxYear("2027-28")!;
    expect(r.published).toBe(false);
    expect(r.rates.carVanFirst10kPence).toBe(55);
  });
  it("returns null before 2011-12", () => {
    expect(amapRatesForTaxYear("2010-11")).toBeNull();
  });
  it("rejects a malformed tax year", () => {
    expect(() => amapRatesForTaxYear("2025-27")).toThrow();
  });
});

describe("HMRC's own worked examples", () => {
  // EIM31355 example two: 12,000 miles at 35p in 2025-26 -> MAR £800.
  it("EIM31355 example two: relief £800", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 12_000, employerPaid: rates(35) });
    expect(r.approvedPence).toBe(500_000);
    expect(r.paidPence).toBe(420_000);
    expect(r.reliefPence).toBe(80_000);
    expect(r.taxableExcessPence).toBe(0);
    expect(r.kinds[0].milesAtFirstRate).toBe(10_000);
    expect(r.kinds[0].milesAfter10k).toBe(2_000);
  });
  // EIM31355 example one: 5,000 miles at 49p -> taxable excess £200.
  it("EIM31355 example one: taxable excess £200, no relief", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 5_000, employerPaid: rates(49) });
    expect(r.approvedPence).toBe(225_000);
    expect(r.paidPence).toBe(245_000);
    expect(r.reliefPence).toBe(0);
    expect(r.taxableExcessPence).toBe(20_000);
    expect(r.route).toBe("none");
  });
  // EIM31360: £70/month lump sum + 35p on 8,000 miles -> excess £40.
  it("EIM31360: lump sum counts as paid (totals mode)", () => {
    const r = calc({
      taxYear: "2025-26",
      carVanMiles: 8_000,
      employerPaid: { kind: "totals", carVanPence: 70 * 12 * 100 + 8_000 * 35, motorcyclePence: 0, cyclePence: 0 },
    });
    expect(r.paidPence).toBe(364_000);
    expect(r.approvedPence).toBe(360_000);
    expect(r.taxableExcessPence).toBe(4_000);
    expect(r.reliefPence).toBe(0);
  });
  // EIM31370: car 6,000 + van 5,000 at 45p -> one kind, one 10k limit, excess £200.
  it("EIM31370: car and van share one 10,000 mile limit", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 11_000, employerPaid: rates(45) });
    expect(r.approvedPence).toBe(475_000);
    expect(r.paidPence).toBe(495_000);
    expect(r.taxableExcessPence).toBe(20_000);
  });
  // EIM31375: car 9,500 at 38p (MAR £665), cycle 700 at 22p (excess £14), not netted.
  it("EIM31375: kinds are worked out separately and never netted", () => {
    const r = calc({
      taxYear: "2025-26",
      carVanMiles: 9_500,
      cycleMiles: 700,
      employerPaid: { kind: "rates", carVanFirst10kPence: 38, carVanAfter10kPence: null, cyclePence: 22 },
    });
    const car = r.kinds.find((k) => k.kind === "car_van")!;
    const cycle = r.kinds.find((k) => k.kind === "cycle")!;
    expect(car.reliefPence).toBe(66_500);
    expect(cycle.taxableExcessPence).toBe(1_400);
    expect(r.reliefPence).toBe(66_500);
    expect(r.taxableExcessPence).toBe(1_400);
  });
});

describe("calculateMileageAllowanceRelief", () => {
  it("brief example: 6,000 miles in 2025-26 at 25p -> £2,700 / £1,500 / £1,200, £240 at basic rate", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 6_000, employerPaid: rates(25), taxRegion: "rUK" });
    expect(r.approvedPence).toBe(270_000);
    expect(r.paidPence).toBe(150_000);
    expect(r.reliefPence).toBe(120_000);
    expect(r.route).toBe("p87");
    expect(r.taxBack).toHaveLength(1);
    const bands = r.taxBack[0].bands;
    expect(bands.find((b) => b.label === "Basic rate")!.pence).toBe(24_000);
    expect(bands.find((b) => b.label === "Higher rate")!.pence).toBe(48_000);
    expect(bands.find((b) => b.label === "Additional rate")!.pence).toBe(54_000);
  });

  it("uses 55p for 2026-27", () => {
    const r = calc({ taxYear: "2026-27", carVanMiles: 6_000, employerPaid: rates(25) });
    expect(r.approvedPence).toBe(330_000);
    expect(r.reliefPence).toBe(180_000);
  });

  it("2026-27 over 10,000 miles: 55p then 25p", () => {
    const r = calc({ taxYear: "2026-27", carVanMiles: 12_500, employerPaid: rates(0) });
    expect(r.approvedPence).toBe(10_000 * 55 + 2_500 * 25);
  });

  it("exactly 10,000 miles is all at the first rate", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 10_000, employerPaid: rates(0) });
    expect(r.kinds[0].milesAfter10k).toBe(0);
    expect(r.approvedPence).toBe(450_000);
  });

  it("employer paying nothing: full approved amount is relief", () => {
    const r = calc({ taxYear: "2024-25", carVanMiles: 3_000, employerPaid: rates(0) });
    expect(r.reliefPence).toBe(135_000);
  });

  it("employer paying exactly AMAP: no relief, no excess", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 14_000, employerPaid: rates(45, 25) });
    expect(r.reliefPence).toBe(0);
    expect(r.taxableExcessPence).toBe(0);
    expect(r.route).toBe("none");
    expect(r.routeReason).toBe("no_relief");
  });

  it("employer second tier applies after 10,000 miles", () => {
    // 15,000 miles; employer 40p then 20p. AMAP 4,500+1,250=5,750; paid 4,000+1,000=5,000.
    const r = calc({ taxYear: "2025-26", carVanMiles: 15_000, employerPaid: rates(40, 20) });
    expect(r.approvedPence).toBe(575_000);
    expect(r.paidPence).toBe(500_000);
    expect(r.reliefPence).toBe(75_000);
  });

  it("flat employer rate (after10k null) applies to every mile", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 12_000, employerPaid: rates(30, null) });
    expect(r.paidPence).toBe(360_000);
  });

  it("motorcycle at 24p flat, employer rate defaults to the first rate", () => {
    const r = calc({ taxYear: "2025-26", motorcycleMiles: 2_000, employerPaid: rates(15) });
    expect(r.kinds).toHaveLength(1);
    expect(r.kinds[0].kind).toBe("motorcycle");
    expect(r.approvedPence).toBe(48_000);
    expect(r.paidPence).toBe(30_000);
    expect(r.reliefPence).toBe(18_000);
  });

  it("motorcycle miles do not count towards the car 10,000 limit", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 9_000, motorcycleMiles: 5_000, employerPaid: rates(0) });
    const car = r.kinds.find((k) => k.kind === "car_van")!;
    expect(car.milesAfter10k).toBe(0);
    expect(car.approvedPence).toBe(405_000);
  });

  it("fractional miles round to whole pence once per kind", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 10.33, employerPaid: rates(10) });
    expect(r.approvedPence).toBe(465); // 10.33 * 45 = 464.85
    expect(r.paidPence).toBe(103); // 103.3
    expect(r.reliefPence).toBe(362);
  });

  it("negative or NaN inputs are treated as zero", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: -5, motorcycleMiles: Number.NaN, employerPaid: rates(-3) });
    expect(r.kinds).toHaveLength(0);
    expect(r.reliefPence).toBe(0);
  });

  it("no miles but money paid: all of it is taxable excess", () => {
    const r = calc({
      taxYear: "2025-26",
      employerPaid: { kind: "totals", carVanPence: 10_000, motorcyclePence: 0, cyclePence: 0 },
    });
    expect(r.taxableExcessPence).toBe(10_000);
  });

  it("returns null before 2011-12", () => {
    expect(
      calculateMileageAllowanceRelief({ taxYear: "2009-10", carVanMiles: 100, motorcycleMiles: 0, employerPaid: rates(0) }),
    ).toBeNull();
  });
});

describe("claim route (P87 or Self Assessment)", () => {
  it("£2,500 exactly can go on a P87", () => {
    const r = calc({
      taxYear: "2025-26",
      carVanMiles: 10_000,
      employerPaid: { kind: "totals", carVanPence: 450_000 - P87_MAX_CLAIM_PENCE, motorcyclePence: 0, cyclePence: 0 },
    });
    expect(r.reliefPence).toBe(250_000);
    expect(r.route).toBe("p87");
  });
  it("over £2,500 needs Self Assessment", () => {
    const r = calc({
      taxYear: "2025-26",
      carVanMiles: 10_000,
      employerPaid: { kind: "totals", carVanPence: 450_000 - P87_MAX_CLAIM_PENCE - 1, motorcyclePence: 0, cyclePence: 0 },
    });
    expect(r.route).toBe("self_assessment");
    expect(r.routeReason).toBe("over_p87_limit");
  });
  it("someone who files Self Assessment claims there whatever the amount", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 100, employerPaid: rates(0), filesSelfAssessment: true });
    expect(r.route).toBe("self_assessment");
    expect(r.routeReason).toBe("files_self_assessment");
  });
});

describe("tax back estimate", () => {
  it("lists both regions when the region is unknown", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 1_000, employerPaid: rates(0) });
    expect(r.taxBack.map((t) => t.region)).toEqual(["rUK", "scotland"]);
  });
  it("Scotland 2025-26: 19 / 20 / 21 / 42 / 45 / 48", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 1_000, employerPaid: rates(0), taxRegion: "scotland" });
    expect(r.reliefPence).toBe(45_000);
    expect(r.taxBack[0].bands.map((b) => b.ratePct)).toEqual([19, 20, 21, 42, 45, 48]);
    expect(r.taxBack[0].bands.map((b) => b.pence)).toEqual([8_550, 9_000, 9_450, 18_900, 20_250, 21_600]);
  });
  it("Scotland 2022-23 and 2023-24 used different higher and top rates", () => {
    expect(incomeTaxBandsForTaxYear("2022-23", "scotland")!.map((b) => b.ratePct)).toEqual([19, 20, 21, 41, 46]);
    expect(incomeTaxBandsForTaxYear("2023-24", "scotland")!.map((b) => b.ratePct)).toEqual([19, 20, 21, 42, 47]);
  });
  it("rest of the UK is 20 / 40 / 45 in every claimable year", () => {
    for (const ty of ["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"]) {
      expect(incomeTaxBandsForTaxYear(ty, "rUK")!.map((b) => b.ratePct)).toEqual([20, 40, 45]);
    }
  });
  it("no estimate for a year whose rates we have not checked", () => {
    expect(incomeTaxBandsForTaxYear("2027-28", "rUK")).toBeNull();
    const r = calc({ taxYear: "2027-28", carVanMiles: 100, employerPaid: rates(0) });
    expect(r.taxBack).toEqual([]);
    expect(r.ratesPublished).toBe(false);
  });
  it("no relief means every estimate is zero", () => {
    const r = calc({ taxYear: "2025-26", carVanMiles: 1_000, employerPaid: rates(60), taxRegion: "rUK" });
    expect(r.taxBack[0].bands.every((b) => b.pence === 0)).toBe(true);
  });
});

describe("claim window (current year + 4 previous)", () => {
  // 4 Oct 2026 is in 2026-27.
  const now = new Date("2026-10-04T12:00:00Z");
  it("lists the five claimable years, newest first", () => {
    expect(marClaimableTaxYears(now)).toEqual(["2026-27", "2025-26", "2024-25", "2023-24", "2022-23"]);
  });
  it("status of years around the window", () => {
    expect(marYearStatus("2026-27", now)).toBe("claimable");
    expect(marYearStatus("2022-23", now)).toBe("claimable");
    expect(marYearStatus("2021-22", now)).toBe("too_old");
    expect(marYearStatus("2027-28", now)).toBe("not_started");
  });
  it("deadline is 5 April four years after the year ends", () => {
    expect(marClaimDeadline("2022-23")).toEqual({ year: 2027, month: 4, day: 5 });
    expect(marClaimDeadline("2025-26")).toEqual({ year: 2030, month: 4, day: 5 });
  });
  it("2022-23 is claimable on 5 April 2027 and too old on 6 April 2027 (UK time)", () => {
    // 5 April 2027 23:30 BST = 22:30 UTC, still 5 April in the UK.
    expect(marYearStatus("2022-23", new Date("2027-04-05T22:30:00Z"))).toBe("claimable");
    // 6 April 2027 00:30 BST = 5 April 23:30 UTC, already 6 April in the UK.
    expect(marYearStatus("2022-23", new Date("2027-04-05T23:30:00Z"))).toBe("too_old");
  });
});
