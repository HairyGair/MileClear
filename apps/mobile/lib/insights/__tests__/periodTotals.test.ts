import { describe, it, expect } from "vitest";
import { totalsFromRecap, previousFromRecap, totalsFromStats, totalsFromTripSummary } from "../periodTotals";
import { shareHeading, sharePeriodTotalLabel } from "../shareLabels";
import { getPeriodRange } from "../period";

const recap: any = {
  totalMiles: 120, businessMiles: 80, totalTrips: 12, businessTrips: 7, deductionPence: 3600,
  earningsPence: 5000, earningsCount: 2, busiestDayLabel: "Monday 6 Oct", busiestDayMiles: 40,
  previous: { totalMiles: 100, businessMiles: 60, personalMiles: 40, totalTrips: 10, businessTrips: 5, deductionPence: 2700, earningsPence: 0 },
};

describe("period totals", () => {
  it("Work reads the business figures, Personal the totals", () => {
    expect(totalsFromRecap(recap, "work")).toMatchObject({ miles: 80, trips: 7, claimPence: 3600 });
    expect(totalsFromRecap(recap, "personal")).toMatchObject({ miles: 120, trips: 12 });
  });
  it("previous comes from the same response and is null when not asked for", () => {
    expect(previousFromRecap(recap, "work")).toMatchObject({ miles: 60, trips: 5 });
    expect(previousFromRecap({ ...recap, previous: undefined }, "work")).toBeNull();
  });
  it("tax year claim is the stats claim", () => {
    const t = totalsFromStats({ totalMiles: 900, businessMiles: 700, deductionPence: 13933 }, 50, "work");
    expect(t).toMatchObject({ miles: 700, trips: 50, claimPence: 13933 });
  });
  it("a past tax year has no claim", () => {
    const t = totalsFromTripSummary({ totalMiles: 5, totalTrips: 2, businessMiles: 4, businessTrips: 1 }, "personal");
    expect(t.claimPence).toBeNull();
    expect(t.miles).toBe(5);
  });
});

describe("share labels", () => {
  const now = new Date(2026, 9, 9, 12);
  it("names the week, month and tax year shown", () => {
    expect(shareHeading("week", 0, getPeriodRange("week", 0, now), now)).toBe("Week of 5 Oct 2026");
    expect(shareHeading("month", -1, getPeriodRange("month", -1, now), now)).toBe("September 2026");
    expect(shareHeading("tax_year", 0, getPeriodRange("tax_year", 0, now), now)).toBe("Tax year 2026-27");
    expect(shareHeading("tax_year", -1, getPeriodRange("tax_year", -1, now), now)).toBe("Tax year 2025-26");
  });
  it("uses the right year for a past month across New Year", () => {
    const jan = new Date(2027, 0, 10, 12);
    expect(shareHeading("month", -1, getPeriodRange("month", -1, jan), jan)).toBe("December 2026");
  });
  it("labels the total as the period's miles", () => {
    expect(sharePeriodTotalLabel("month", 0, getPeriodRange("month", 0, now), now)).toBe("miles in October 2026");
    expect(sharePeriodTotalLabel("tax_year", 0, getPeriodRange("tax_year", 0, now), now)).toBe("miles in tax year 2026-27");
  });
});
