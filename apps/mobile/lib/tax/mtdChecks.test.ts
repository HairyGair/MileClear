import { describe, it, expect } from "vitest";
import {
  countUnmarkedTrips,
  weeksMissingEarnings,
  buildPreSendChecks,
  buildFigureSources,
  profitPenceFromStoredPeriod,
  updateNumber,
  periodSentence,
  weekStartOf,
  nextUpdates,
  finishTheYearDeadline,
} from "./mtdChecks";
import type { PeriodSubmissionPayload } from "../api/hmrc";

const t = (day: string, classification: string) => ({ startedAt: `${day}T12:00:00`, classification });
const e = (s: string, en: string) => ({ periodStart: s, periodEnd: en });
const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;

describe("countUnmarkedTrips", () => {
  it("counts only unclassified trips inside the period, both ends included", () => {
    const trips = [
      t("2026-07-06", "unclassified"),
      t("2026-10-05", "unclassified"),
      t("2026-07-05", "unclassified"),
      t("2026-10-06", "unclassified"),
      t("2026-08-01", "business"),
    ];
    expect(countUnmarkedTrips(trips, "2026-07-06", "2026-10-05")).toBe(2);
  });
});

describe("weeksMissingEarnings", () => {
  it("lists weeks with Business trips and no earnings", () => {
    const trips = [t("2026-09-14", "business"), t("2026-09-22", "business"), t("2026-09-23", "personal")];
    const weeks = weeksMissingEarnings(trips, [e("2026-09-14", "2026-09-20")], "2026-07-06", "2026-10-05");
    expect(weeks).toEqual(["2026-09-21"]);
  });
  it("lets a monthly earning cover every week it overlaps", () => {
    const trips = [t("2026-09-02", "business"), t("2026-09-24", "business")];
    expect(weeksMissingEarnings(trips, [e("2026-09-01", "2026-09-30")], "2026-07-06", "2026-10-05")).toEqual([]);
  });
  it("ignores weeks with only personal trips", () => {
    expect(weeksMissingEarnings([t("2026-09-02", "personal")], [], "2026-07-06", "2026-10-05")).toEqual([]);
  });
  it("finds the Monday", () => {
    expect(weekStartOf("2026-09-20")).toBe("2026-09-14");
    expect(weekStartOf("2026-09-21")).toBe("2026-09-21");
  });
});

describe("buildPreSendChecks", () => {
  const base = { excludedMotorPence: 0, serverWarnings: [], fromDay: "2026-07-06", toDay: "2026-10-05", formatPence: fmt };
  it("warns, with Mark and Add actions", () => {
    const c = buildPreSendChecks({ ...base, unmarkedCount: 14, missingWeeks: ["2026-09-14", "2026-09-21"] });
    expect(c[0]).toMatchObject({ id: "unmarked", kind: "warn", title: "14 trips aren't marked yet" });
    expect(c[0].action?.target).toBe("trips-to-sort");
    expect(c[1].title).toBe("2 weeks with trips but no earnings");
    expect(c[1].detail).toContain("14 Sep, 21 Sep");
    expect(c[1].action?.target).toBe("earnings");
  });
  it("shows a pass and the motor note, singular wording", () => {
    const c = buildPreSendChecks({ ...base, unmarkedCount: 1, missingWeeks: [], excludedMotorPence: 118420 });
    expect(c[0].title).toBe("1 trip isn't marked yet");
    expect(c[1].kind).toBe("ok");
    expect(c[2].detail).toContain("£1184.20");
  });
  it("hides the unmarked row at zero and carries server warnings", () => {
    const c = buildPreSendChecks({ ...base, unmarkedCount: 0, missingWeeks: [], serverWarnings: ["Something."] });
    expect(c.map((x) => x.id)).toEqual(["earnings", "warning-0"]);
  });
});

function preview(over: Partial<PeriodSubmissionPayload["breakdown"]["mileage"]> = {}): PeriodSubmissionPayload {
  return {
    periodDates: { periodStartDate: "2026-04-06", periodEndDate: "2026-10-05" },
    periodIncome: { turnover: 22480.6 },
    periodExpenses: { carVanTravelExpenses: 4436.5, adminCosts: 96, otherExpenses: 0 },
    breakdown: {
      income: { turnoverPence: 2248060, otherPence: 0, earningCount: 618, perPlatform: [{ platform: "uber", pence: 1361020, count: 3 }] },
      mileage: {
        businessMilesThisPeriod: 7950,
        businessMilesPriorInTaxYear: 0,
        deductionPence: 437250,
        rateFirst10kPence: 55,
        rateAfter10kPence: 25,
        vehicleType: "car",
        crossesTenKThreshold: false,
        tripCount: 1284,
        ...over,
      },
      expenses: { carVanTravelPence: 443650, adminCostsPence: 9600, otherExpensesPence: 0, excludedNonAmapPence: 0, expenseCount: 4 },
      warnings: [],
    },
  };
}

describe("buildFigureSources", () => {
  it("explains earnings, miles and parking", () => {
    const s = buildFigureSources(preview());
    expect(s.map((x) => x.id)).toEqual(["earnings", "car", "phone"]);
    expect(s[0].lines[0]).toEqual({ label: "Uber", pence: 1361020 });
    expect(s[0].note).toBe("From 618 earnings in MileClear");
    expect(s[1].lines[0]).toEqual({ label: "7,950 business miles × 55p", pence: 437250 });
    expect(s[1].lines[1].pence).toBe(6400);
    expect(s[1].note).toBe("Miles from 1,284 Business trips");
    expect(s[2].pence).toBe(9600);
  });
  it("splits two bands when crossing 10,000", () => {
    const p = preview({ businessMilesThisPeriod: 11240, deductionPence: 10000 * 55 + 1240 * 25 });
    p.periodExpenses.carVanTravelExpenses = (10000 * 55 + 1240 * 25) / 100;
    const car = buildFigureSources(p).find((x) => x.id === "car")!;
    expect(car.lines).toEqual([
      { label: "10,000 miles × 55p", pence: 550000 },
      { label: "1,240 miles × 25p", pence: 31000 },
    ]);
  });
});

describe("profitPenceFromStoredPeriod", () => {
  it("subtracts numeric expenses from turnover", () => {
    expect(
      profitPenceFromStoredPeriod({ periodIncome: { turnover: 100.1 }, periodExpenses: { adminCosts: 10.05, carVanTravelExpenses: 20 } }),
    ).toBe(7005);
  });
  it("returns null with no turnover", () => {
    expect(profitPenceFromStoredPeriod({})).toBeNull();
    expect(profitPenceFromStoredPeriod(null)).toBeNull();
  });
});

describe("updateNumber and periodSentence", () => {
  it("finds the position among the year's obligations", () => {
    const obs = [
      { start: "2026-04-06", end: "2026-07-05" },
      { start: "2026-07-06", end: "2026-10-05" },
      { start: "2026-10-06", end: "2027-01-05" },
      { start: "2027-01-06", end: "2027-04-05" },
    ];
    expect(updateNumber(obs, "2026-10-05")).toEqual({ number: 2, of: 4 });
    expect(updateNumber(obs, "2026-11-05")).toBeNull();
  });
  it("lists the updates still to come by month name", () => {
    const obs = [
      { start: "2026-04-06", end: "2026-07-05", due: "2026-08-07" },
      { start: "2026-07-06", end: "2026-10-05", due: "2026-11-07" },
      { start: "2026-10-06", end: "2027-01-05", due: "2027-02-07" },
      { start: "2027-01-06", end: "2027-04-05", due: "2027-05-07" },
    ];
    expect(nextUpdates(obs, "2026-10-05")).toEqual([
      { due: "7 February 2027", title: "October to January update", last: false },
      { due: "7 May 2027", title: "January to April update", last: true },
    ]);
    expect(nextUpdates(obs, "2027-04-05")).toEqual([]);
    expect(finishTheYearDeadline("2026-27")).toBe("31 January 2028");
  });
  it("writes the period", () => {
    expect(periodSentence("2026-04-06", "2026-10-05")).toBe("6 April to 5 October 2026");
  });
});
