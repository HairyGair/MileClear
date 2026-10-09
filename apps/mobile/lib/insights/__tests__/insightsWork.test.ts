import { describe, it, expect } from "vitest";
import {
  computeTaxYearProgress,
  boundaryLine,
  milesLine,
  formatRatePence,
} from "../taxYearProgress";
import {
  buildLeague,
  hasLeague,
  maskLeagueForFree,
  formatPerMile,
  leagueSubline,
} from "../platformLeague";
import { buildDrivePattern, blockLabel, levelFor, MIN_TRIPS } from "../drivePattern";

const base = { taxYear: "2026-27", vehicleType: "car" as const, employerRatePence: null };

describe("tax year progress", () => {
  it("shows nothing before the first business mile", () => {
    expect(computeTaxYearProgress({ ...base, businessMiles: 0 })).toBeNull();
  });
  it("builds a bar and counts down to the 10,000 line", () => {
    const p = computeTaxYearProgress({ ...base, businessMiles: 6420 })!;
    expect(p.showBar).toBe(true);
    expect(p.over).toBe(false);
    expect(p.fraction).toBeCloseTo(0.642);
    expect(p.milesToGo).toBe(3580);
    expect(p.rateFirstPence).toBe(55);
    expect(p.rateAfterPence).toBe(25);
    expect(boundaryLine(p)).toBe("3,580 miles until the 10,000 line, when each mile drops to 25p");
  });
  it("is not over at exactly 10,000, and is over just past it", () => {
    const at = computeTaxYearProgress({ ...base, businessMiles: 10000 })!;
    expect(at.over).toBe(false);
    expect(at.fraction).toBe(1);
    expect(at.milesToGo).toBe(0);
    const past = computeTaxYearProgress({ ...base, businessMiles: 10000.5 })!;
    expect(past.over).toBe(true);
    expect(past.fraction).toBe(1);
    expect(boundaryLine(past)).toBe("Over 10,000: each extra mile is now 25p");
  });
  it("uses the rates for the tax year", () => {
    const old = computeTaxYearProgress({ ...base, taxYear: "2025-26", businessMiles: 12000 })!;
    expect(old.rateFirstPence).toBe(45);
    expect(old.rateAfterPence).toBe(25);
  });
  it("has no 10,000 line for employer rates or motorbikes", () => {
    const emp = computeTaxYearProgress({ ...base, employerRatePence: 30, businessMiles: 12000 })!;
    expect(emp.showBar).toBe(false);
    expect(emp.over).toBe(false);
    expect(boundaryLine(emp)).toBeNull();
    const bike = computeTaxYearProgress({ ...base, vehicleType: "motorbike", businessMiles: 12000 })!;
    expect(bike.showBar).toBe(false);
    expect(boundaryLine(bike)).toBeNull();
  });
  it("words", () => {
    const p = computeTaxYearProgress({ ...base, businessMiles: 1 })!;
    expect(milesLine(p)).toBe("1 business mile since 6 April.");
    expect(formatRatePence(25)).toBe("25p");
  });
});

describe("platform league", () => {
  const rows = [
    { platform: "uber", grossPence: 12000, trips: 40, miles: 100 },
    { platform: "deliveroo", grossPence: 8000, trips: 30, miles: 40 },
    { platform: "stuart", grossPence: 5000, trips: 2, miles: 5 },
    { platform: "evri", grossPence: 0, trips: 9, miles: 50 },
    { platform: "dpd", grossPence: 900, trips: 9, miles: 0 },
  ];
  it("ranks by pay per mile, few-trip platforms next, rows with no pay per mile last (as the server does)", () => {
    const league = buildLeague(rows);
    expect(league.map((r) => r.platform)).toEqual(["deliveroo", "uber", "stuart", "dpd", "evri"]);
    expect(league.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(league[0].perMilePence).toBe(200);
    expect(league[2].fewTrips).toBe(true);
    expect(league[0].barFraction).toBe(1);
  });
  it("a league needs two platforms", () => {
    expect(hasLeague(buildLeague([rows[0]]))).toBe(false);
    expect(hasLeague(buildLeague(rows))).toBe(true);
  });
  it("free preview keeps order and names and leaks no figure", () => {
    const masked = maskLeagueForFree(buildLeague(rows));
    expect(masked.map((r) => r.label)).toEqual(["Deliveroo", "Uber / Uber Eats", "Stuart", "DPD", "Evri"]);
    expect(masked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    for (const r of masked) {
      expect(r.perMilePence).toBeNull();
      expect(r.trips).toBeNull();
      expect(r.miles).toBeNull();
      expect(r.hours).toBeNull();
      expect(r.barFraction).toBeNull();
      expect(leagueSubline(r)).toBeNull();
    }
  });
  it("formats", () => {
    expect(formatPerMile(142)).toBe("£1.42/mi");
    expect(leagueSubline(buildLeague(rows)[1])).toBe("40 trips, 100 mi");
  });
});

describe("when you drive", () => {
  // Fridays (5) 16-19 busy, a few other trips, Sundays (0) none.
  const cells = [
    { dayOfWeek: 5, hour: 16, tripCount: 6 },
    { dayOfWeek: 5, hour: 17, tripCount: 4 },
    { dayOfWeek: 5, hour: 9, tripCount: 1 },
    { dayOfWeek: 1, hour: 8, tripCount: 2 },
    { dayOfWeek: 2, hour: 8, tripCount: 2 },
    { dayOfWeek: 3, hour: 8, tripCount: 2 },
    { dayOfWeek: 4, hour: 8, tripCount: 2 },
    { dayOfWeek: 6, hour: 12, tripCount: 1 },
  ];
  it("hides under 10 trips", () => {
    expect(buildDrivePattern(cells.slice(2, 5))).toBeNull();
    expect(MIN_TRIPS).toBe(10);
  });
  it("builds the plain line", () => {
    const p = buildDrivePattern(cells)!;
    expect(p.totalTrips).toBe(20);
    expect(p.line).toBe("You drive most on Fridays, 4pm to 8pm. Quietest: Sundays.");
    expect(p.levels[4][4]).toBe(4);
    expect(p.levels[6].every((l) => l === 0)).toBe(true);
  });
  it("leaves out the quietest day on a tie", () => {
    const p = buildDrivePattern([{ dayOfWeek: 5, hour: 16, tripCount: 12 }])!;
    expect(p.quietestRow).toBeNull();
    expect(p.line).toBe("You drive most on Fridays, 4pm to 8pm.");
  });
  it("labels blocks and levels", () => {
    expect(blockLabel(0)).toBe("12am to 4am");
    expect(blockLabel(3)).toBe("12pm to 4pm");
    expect(blockLabel(5)).toBe("8pm to 12am");
    expect(levelFor(0, 10)).toBe(0);
    expect(levelFor(1, 10)).toBe(1);
    expect(levelFor(5, 10)).toBe(2);
    expect(levelFor(7, 10)).toBe(3);
    expect(levelFor(10, 10)).toBe(4);
  });
});

import { leagueFromEntries } from "../platformLeague";

describe("platform league: free order matches Pro order", () => {
  // The same platforms as the server would rank them (rankPlatforms).
  const server = [
    { platform: "deliveroo", rank: 1, earningsPerMilePence: 200, trips: 30, businessMiles: 100, drivingHours: 8, fewTrips: false },
    { platform: "uber", rank: 2, earningsPerMilePence: 150, trips: 40, businessMiles: 100, drivingHours: 9, fewTrips: false },
    { platform: "stuart", rank: 3, earningsPerMilePence: 400, trips: 2, businessMiles: 10, drivingHours: 1, fewTrips: true },
    { platform: "amazon_flex", rank: 4, earningsPerMilePence: null, trips: 0, businessMiles: 0, drivingHours: 0, fewTrips: true },
  ];
  const raw = [
    { platform: "amazon_flex", grossPence: 5000, trips: 0, miles: 0 },
    { platform: "stuart", grossPence: 4000, trips: 2, miles: 10 },
    { platform: "uber", grossPence: 15000, trips: 40, miles: 100 },
    { platform: "deliveroo", grossPence: 20000, trips: 30, miles: 100 },
  ];
  it("ranks from raw totals in the server's order", () => {
    expect(buildLeague(raw).map((r) => r.platform)).toEqual(server.map((s) => s.platform));
    expect(leagueFromEntries(server).map((r) => r.platform)).toEqual(server.map((s) => s.platform));
  });
  it("a platform with no miles goes last and has no pay per mile", () => {
    const last = buildLeague(raw)[3];
    expect(last.platform).toBe("amazon_flex");
    expect(last.perMilePence).toBeNull();
  });
  it("breaks pay-per-mile ties by earnings, then name", () => {
    const tie = buildLeague([
      { platform: "uber", grossPence: 10000, trips: 10, miles: 100 },
      { platform: "bolt", grossPence: 20000, trips: 10, miles: 200 },
    ]);
    expect(tie.map((r) => r.platform)).toEqual(["bolt", "uber"]);
  });
  it("keeps the server order as sent and scales bars to the best ranked platform", () => {
    const rows = leagueFromEntries(server);
    expect(rows[0].barFraction).toBe(1);
    expect(rows[1].barFraction).toBeCloseTo(0.75);
    expect(rows[3].barFraction).toBeNull();
    expect(rows[0].hours).toBe(8);
  });
});

import { leagueHasNoEarnings } from "../platformLeague";

describe("platform league: no earnings in the window", () => {
  it("free: no rows means no earnings", () => {
    expect(leagueHasNoEarnings([])).toBe(true);
  });
  it("Pro: platforms driven for but none paid is the empty state", () => {
    const league = buildLeague([
      { platform: "uber", grossPence: 0, trips: 3, miles: 20 },
      { platform: "deliveroo", grossPence: 0, trips: 1, miles: 5 },
    ]);
    expect(leagueHasNoEarnings(league)).toBe(true);
  });
  it("not when one platform was paid, or a paid platform has no tagged trips", () => {
    const paid = buildLeague([{ platform: "uber", grossPence: 3000, trips: 3, miles: 20 }]);
    expect(leagueHasNoEarnings(paid)).toBe(false);
    const untagged = buildLeague([{ platform: "uber", grossPence: 3000, trips: 0, miles: 0 }]);
    expect(leagueHasNoEarnings(untagged)).toBe(false);
  });
  it("never for masked free rows (they only exist with earnings)", () => {
    const masked = maskLeagueForFree(buildLeague([{ platform: "uber", grossPence: 3000, trips: 3, miles: 20 }]));
    expect(leagueHasNoEarnings(masked)).toBe(false);
  });
});
