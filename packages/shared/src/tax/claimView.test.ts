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
          recordBasis: "records",
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
    expect(v.basisNote).toBe("Worked out from your logbook or full records.");
    expect(v.questions).toEqual([]);
    expect(v.notes.join(" ")).toContain("14,000 km");
    expect(v.a11yLabel).not.toMatch(/HMRC|£/);
  });

  it("says when last year's rates stand in for this year's", () => {
    const v = regimeClaimView(
      summary({
        taxYear: "2026-27",
        provisional: true,
        ratesYear: "2025-26",
        ratesExpected: "IRD publishes the 2026-27 rates after 31 March 2027.",
      })
    );
    expect(v.ratesNote).toBe("Estimate at 2025-26 rates. IRD publishes the 2026-27 rates after 31 March 2027.");
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
    expect(v.vehicles[0].lines[1]).toBe(
      "IRD's kilometre rates only cover petrol, diesel, petrol hybrid and electric vehicles. Check the fuel type on the vehicle; for anything else, use actual costs."
    );
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

  it("a hybrid not answered yet: no figure, asks what kind", () => {
    const s = summary({ totalAmountMinor: 0, someWithoutFigure: true });
    s.vehicles[0] = { ...s.vehicles[0], fuelType: "hybrid", claim: null, noClaimReason: "hybrid_kind_needed" };
    const v = regimeClaimView(s);
    expect(v.amount).toBeNull();
    expect(v.vehicles[0].lines).toContain("Say what kind of hybrid it is to see a figure.");
    expect(v.questions).toEqual([
      {
        vehicleId: "v1",
        vehicleName: "Toyota Corolla",
        field: "nzHybridKind",
        prompt: "What kind of hybrid is it?",
        options: [
          { label: "Petrol hybrid", value: "petrol" },
          { label: "Plug-in hybrid", value: "plugin" },
          { label: "Diesel hybrid", value: "diesel" },
          { label: "Mild hybrid", value: "mild" },
        ],
      },
    ]);
  });

  it("a plug-in hybrid: no figure, check with an accountant", () => {
    const s = summary({ totalAmountMinor: 0, someWithoutFigure: true });
    s.vehicles[0] = { ...s.vehicles[0], fuelType: "hybrid", hybridKind: "plugin", claim: null, noClaimReason: "hybrid_no_rate" };
    const v = regimeClaimView(s);
    expect(v.vehicles[0].lines).toContain("IRD doesn't set a rate for this kind of hybrid. Check with your accountant.");
    expect(v.questions).toEqual([]);
  });

  it("not answered about a logbook: the 25% figure, the question, and the figure with one", () => {
    const s = summary({ totalAmountMinor: 461_500 });
    s.vehicles[0] = {
      ...s.vehicles[0],
      claim: {
        ...s.vehicles[0].claim!,
        amountMinor: 461_500,
        recordBasis: "unanswered",
        amountWithRecordsMinor: 1_426_500,
        tiers: [
          { label: "Tier 1", distance: 3_500, rateMinor: 120, amountMinor: 420_000 },
          { label: "Tier 2", distance: 1_500, rateMinor: 37, amountMinor: 55_500 },
        ],
      },
    };
    const v = regimeClaimView(s);
    expect(v.amount).toBe("$4,615.00");
    expect(v.basisNote).toBe("Worked out at IRD's 25% limit, as no logbook or full records are kept.");
    expect(v.questions).toEqual([
      {
        vehicleId: "v1",
        vehicleName: "Toyota Corolla",
        field: "nzRecordBasis",
        prompt: "Do you keep a logbook (90 days or more) or full records of every trip for this car?",
        options: [
          { label: "Yes", value: "records" },
          { label: "No", value: "none" },
        ],
      },
    ]);
    expect(v.vehicles[0].lines).toContain("At the 25% limit. Worked out from the driving MileClear has recorded for this car. With a logbook or full records it would be $14,265.00.");
  });

  it("said no: the 25% figure, no question", () => {
    const s = summary();
    s.vehicles[0] = { ...s.vehicles[0], claim: { ...s.vehicles[0].claim!, recordBasis: "none" } };
    const v = regimeClaimView(s);
    expect(v.questions).toEqual([]);
    expect(v.basisNote).toContain("25% limit");
  });

  it("the notes cover the method choice, depreciation and GST, partners and employees", () => {
    const notes = regimeClaimView(summary()).notes.join(" ");
    expect(notes).toContain("first year of business use");
    expect(notes).toContain("can't be changed");
    expect(notes).toContain("no GST");
    expect(notes).toContain("partners in a partnership");
    expect(notes).toContain("your employer reimburses you instead");
    expect(notes).toContain("3,500 business km");
  });
});
