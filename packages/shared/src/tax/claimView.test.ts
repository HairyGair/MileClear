import { describe, expect, it } from "vitest";
import type { RegimeSummary } from "./regime.js";
import { regimeClaimView } from "./claimView.js";

function summary(over: Partial<RegimeSummary> = {}): RegimeSummary {
  return {
    regime: "nz-ird",
    authority: "IRD",
    country: "NZ",
    currency: "NZD",
    distanceBasis: "km",
    taxYear: "2025-26",
    taxYearDescription: "1 April to 31 March",
    start: "2025-03-31T11:00:00.000Z",
    end: "2026-03-31T10:59:59.999Z",
    totalAmountMinor: 1_426_500,
    businessDistance: 15_000,
    totalDistance: 20_000,
    unclassifiedDistance: 0,
    ratesYear: "2025-26",
    provisional: false,
    someWithoutFigure: false,
    vehicles: [
      {
        vehicleId: "v1",
        name: "Toyota Corolla",
        fuelType: "petrol",
        businessDistance: 15_000,
        totalDistance: 20_000,
        noClaimReason: null,
        claim: {
          amountMinor: 1_426_500,
          currency: "NZD",
          ratesYear: "2025-26",
          provisional: false,
          tiers: [
            { label: "Tier 1", distance: 10_500, rateMinor: 120, amountMinor: 1_260_000 },
            { label: "Tier 2", distance: 4_500, rateMinor: 37, amountMinor: 166_500 },
          ],
        },
      },
    ],
    ...over,
  };
}

describe("regimeClaimView (New Zealand)", () => {
  it("leads with the IRD figure in dollars and km", () => {
    const v = regimeClaimView(summary());
    expect(v.title).toBe("Your claim at IRD kilometre rates");
    expect(v.amount).toBe("$14,265.00");
    expect(v.subline).toBe("15,000 km of business driving this tax year (1 April to 31 March).");
    expect(v.ratesNote).toBeNull();
    expect(v.vehicles[0].lines).toEqual([
      "15,000 km business of 20,000 km in all",
      "Tier 1: 10,500 km at $1.20 = $12,600.00",
      "Tier 2: 4,500 km at 37c = $1,665.00",
    ]);
    expect(v.footnote).toContain("14,000 km");
    expect(v.a11yLabel).not.toMatch(/HMRC|£/);
  });

  it("says when last year's rates stand in for this year's", () => {
    const v = regimeClaimView(summary({ taxYear: "2026-27", provisional: true, ratesYear: "2025-26" }));
    expect(v.ratesNote).toBe("Using 2025-26 rates, the 2026-27 rates aren't out yet.");
  });

  it("no figure when nothing can be priced, with the reason in the breakdown", () => {
    const v = regimeClaimView(
      summary({
        totalAmountMinor: 0,
        someWithoutFigure: true,
        vehicles: [
          { vehicleId: "v2", name: "Ford Ranger", fuelType: null, businessDistance: 300, totalDistance: 400, claim: null, noClaimReason: "fuel_unknown" },
        ],
        businessDistance: 300,
      })
    );
    expect(v.amount).toBeNull();
    expect(v.subline).toContain("no figure yet");
    expect(v.vehicles[0].lines[1]).toBe("MileClear can't match this vehicle's fuel type to an IRD rate. Check the fuel type on the vehicle.");
  });

  it("no business driving yet", () => {
    const v = regimeClaimView(summary({ totalAmountMinor: 0, businessDistance: 0, totalDistance: 0, vehicles: [] }));
    expect(v.amount).toBeNull();
    expect(v.subline).toBe("No business driving yet this tax year (1 April to 31 March).");
  });

  it("a car with only personal trips shows no $0.00 and no 0 km business line", () => {
    const v = regimeClaimView(
      summary({
        totalAmountMinor: 0,
        businessDistance: 0,
        totalDistance: 900,
        vehicles: [
          {
            vehicleId: "v1",
            name: "Toyota Corolla",
            fuelType: "petrol",
            businessDistance: 0,
            totalDistance: 900,
            noClaimReason: null,
            claim: {
              amountMinor: 0,
              currency: "NZD",
              ratesYear: "2025-26",
              provisional: false,
              tiers: [
                { label: "Tier 1", distance: 0, rateMinor: 120, amountMinor: 0 },
                { label: "Tier 2", distance: 0, rateMinor: 37, amountMinor: 0 },
              ],
            },
          },
        ],
      })
    );
    expect(v.amount).toBeNull();
    expect(v.subline).toBe("No business driving yet this tax year (1 April to 31 March).");
    expect(v.vehicles).toEqual([]);
  });

  it("asks for unsorted trips to be marked", () => {
    const v = regimeClaimView(summary({ unclassifiedDistance: 432.4 }));
    expect(v.unsortedNote).toBe("432 km not yet marked Business or Personal. Mark them to count any business ones.");
    expect(regimeClaimView(summary()).unsortedNote).toBeNull();
  });

  it("a hybrid gets the petrol hybrid note; the footnote says it's the self-employed figure", () => {
    const s = summary();
    s.vehicles[0].fuelType = "hybrid";
    const v = regimeClaimView(s);
    expect(v.vehicles[0].lines).toContain(
      "Hybrid is worked out at IRD's petrol hybrid rate; if yours is a plug-in or diesel hybrid, check with IRD or your accountant."
    );
    expect(v.footnote).toContain("if you're an employee, your employer reimburses you instead");
    expect(regimeClaimView(summary()).vehicles[0].lines.some((l) => l.includes("hybrid"))).toBe(false);
  });
});
