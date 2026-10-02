import { describe, it, expect } from "vitest";
import {
  PEER_FLOOR,
  RANGE_FLOOR,
  aheadOfPerTen,
  assembleLocalBenchmark,
  buildStat,
  choosePeerGroup,
  claimPenceForSegments,
  completeWeeksWindow,
  familiesOf,
  groupDistributions,
  isEligiblePeer,
  median,
  quantile,
  taxYearBoundaryInWindow,
  viewerFamily,
  weeklyValues,
  type DriverWindowStats,
} from "../../services/localBenchmarkMath.js";

function driver(id: string, over: Partial<DriverWindowStats> = {}): DriverWindowStats {
  return {
    userId: id,
    area: "LS",
    region: "Yorkshire and the Humber",
    families: ["work", "personal"],
    weeksActive: 4,
    totalMiles: 800,
    businessMiles: 600,
    claimPence: 600 * 55,
    trips: 40,
    classifiedTrips: 32,
    ...over,
  };
}

const NOW = new Date("2026-10-02T12:00:00Z"); // a Friday

describe("completeWeeksWindow", () => {
  it("ends on the Monday starting the current week and spans 4 whole weeks", () => {
    const w = completeWeeksWindow(NOW);
    expect(w.end.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(w.start.toISOString()).toBe("2026-08-31T00:00:00.000Z");
    expect(w.start.getUTCDay()).toBe(1);
  });

  it("on a Monday, the week that just started is excluded", () => {
    const w = completeWeeksWindow(new Date("2026-09-28T08:00:00Z"));
    expect(w.end.toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("on a Sunday, ends at the previous Monday", () => {
    const w = completeWeeksWindow(new Date("2026-10-04T23:00:00Z"));
    expect(w.end.toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });
});

describe("taxYearBoundaryInWindow", () => {
  it("finds 6 April inside a window that straddles it", () => {
    const start = new Date(2026, 2, 23);
    const end = new Date(2026, 3, 20);
    const b = taxYearBoundaryInWindow(start, end);
    expect(b?.getTime()).toBe(new Date(2026, 3, 6).getTime());
  });

  it("is null for a window inside one tax year", () => {
    expect(taxYearBoundaryInWindow(new Date(2026, 7, 31), new Date(2026, 8, 28))).toBeNull();
  });

  it("is null when the window starts exactly on 6 April (no earlier side)", () => {
    expect(taxYearBoundaryInWindow(new Date(2026, 3, 6), new Date(2026, 4, 4))).toBeNull();
  });
});

describe("claimPenceForSegments (tax-year rates)", () => {
  it("values 2026-27 car miles at 55p and 2025-26 at 45p", () => {
    expect(claimPenceForSegments([{ taxYear: "2026-27", vehicleType: "car", miles: 100, priorMiles: 0 }])).toBe(5500);
    expect(claimPenceForSegments([{ taxYear: "2025-26", vehicleType: "car", miles: 100, priorMiles: 0 }])).toBe(4500);
  });

  it("splits a window across 6 April into each year's rate", () => {
    const pence = claimPenceForSegments([
      { taxYear: "2025-26", vehicleType: "car", miles: 50, priorMiles: 0 },
      { taxYear: "2026-27", vehicleType: "car", miles: 50, priorMiles: 0 },
    ]);
    expect(pence).toBe(50 * 45 + 50 * 55);
  });

  it("applies the after-10,000 rate once earlier miles this tax year pass the threshold", () => {
    // 9,950 already claimed: 50 at 55p, then 50 at 25p.
    expect(claimPenceForSegments([{ taxYear: "2026-27", vehicleType: "van", miles: 100, priorMiles: 9_950 }])).toBe(
      50 * 55 + 50 * 25,
    );
    // Already past 10k: all at 25p.
    expect(claimPenceForSegments([{ taxYear: "2026-27", vehicleType: "car", miles: 100, priorMiles: 12_000 }])).toBe(2500);
  });

  it("motorbikes are a flat 24p in both years", () => {
    expect(claimPenceForSegments([{ taxYear: "2025-26", vehicleType: "motorbike", miles: 100, priorMiles: 20_000 }])).toBe(2400);
    expect(claimPenceForSegments([{ taxYear: "2026-27", vehicleType: "motorbike", miles: 100, priorMiles: 0 }])).toBe(2400);
  });

  it("ignores empty segments", () => {
    expect(claimPenceForSegments([{ taxYear: "2026-27", vehicleType: "car", miles: 0, priorMiles: 0 }])).toBe(0);
    expect(claimPenceForSegments([])).toBe(0);
  });
});

describe("mode families", () => {
  it("both drivers sit in both pools", () => {
    expect(familiesOf("both")).toEqual(["work", "personal"]);
    expect(familiesOf("work")).toEqual(["work"]);
    expect(familiesOf("personal")).toEqual(["personal"]);
    expect(familiesOf(null)).toEqual(["work", "personal"]);
  });

  it("viewer family follows the requested dashboard, else dashboardMode", () => {
    expect(viewerFamily("both")).toBe("work");
    expect(viewerFamily("personal")).toBe("personal");
    expect(viewerFamily("work", "personal")).toBe("personal");
  });

  it("work compares business miles, personal compares all miles", () => {
    const d = driver("a");
    expect(weeklyValues(d, "work").miles).toBe(150);
    expect(weeklyValues(d, "personal").miles).toBe(200);
    expect(weeklyValues(d, "work").classifiedPct).toBe(80);
  });
});

describe("eligibility", () => {
  it("needs 2 of 4 weeks and the right family", () => {
    expect(isEligiblePeer(driver("a", { weeksActive: 1 }), "work")).toBe(false);
    expect(isEligiblePeer(driver("a", { weeksActive: 2 }), "work")).toBe(true);
    expect(isEligiblePeer(driver("a", { families: ["personal"] }), "work")).toBe(false);
  });
});

describe("median / quantile / rank", () => {
  it("median handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("quantile interpolates", () => {
    expect(quantile([0, 10, 20, 30, 40], 0.25)).toBe(10);
    expect(quantile([0, 10, 20, 30], 0.25)).toBe(7.5);
    expect(quantile([], 0.5)).toBeNull();
  });

  it("aheadOfPerTen counts drivers below, ties as half", () => {
    expect(aheadOfPerTen([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 7.5)).toBe(7);
    expect(aheadOfPerTen([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 8)).toBe(8); // 7 below + a tie
    expect(aheadOfPerTen([5, 5], 5)).toBe(5);
    expect(aheadOfPerTen([], 5)).toBeNull();
  });
});

describe("buildStat privacy", () => {
  it("returns nothing under the 5-driver floor", () => {
    expect(buildStat("miles", [1, 2, 3, 4], 2, [1, 3, 4])).toBeNull();
  });

  it("hides the middle-half range under 10 drivers", () => {
    const s = buildStat("miles", [100, 120, 140, 160, 180], 150, [100, 120, 140, 180])!;
    expect(s.median).toBe(140);
    expect(s.low).toBeNull();
    expect(s.high).toBeNull();
  });

  it("shows a rounded range from 10 drivers, never min or max", () => {
    const g = [12, 33, 51, 77, 98, 121, 143, 166, 182, 213];
    const s = buildStat("miles", g, 150, g.filter((v) => v !== 143))!;
    expect(s.low).not.toBeNull();
    expect(s.high).not.toBeNull();
    expect(s.low! % 5).toBe(0);
    expect(s.high! % 5).toBe(0);
    expect(s.low).toBeGreaterThan(Math.min(...g));
    expect(s.high).toBeLessThan(Math.max(...g));
    expect(Object.keys(s).sort()).toEqual(["high", "low", "median", "you", "youAheadOfPerTen"]);
  });

  it("rounds money to whole pounds", () => {
    const s = buildStat("claimPence", [9_412, 9_533, 9_651, 10_022, 11_090], 8_049, null)!;
    expect(s.median % 100).toBe(0);
    expect(s.you).toBe(8_000);
    expect(s.youAheadOfPerTen).toBeNull();
  });
});

describe("choosePeerGroup fallbacks", () => {
  const home = { area: "LS", region: "Yorkshire and the Humber" };

  it("uses the area with 5 eligible drivers", () => {
    const all = Array.from({ length: PEER_FLOOR }, (_, i) => driver(`u${i}`));
    expect(choosePeerGroup(all, home, "work")?.level).toBe("area");
  });

  it("falls back to the region when the area is under floor", () => {
    const all = [
      ...Array.from({ length: 3 }, (_, i) => driver(`ls${i}`)),
      ...Array.from({ length: 3 }, (_, i) => driver(`bd${i}`, { area: "BD" })),
    ];
    const g = choosePeerGroup(all, home, "work");
    expect(g?.level).toBe("region");
    expect(g?.members).toHaveLength(6);
  });

  it("falls back to the UK, then to nothing", () => {
    const elsewhere = Array.from({ length: 5 }, (_, i) =>
      driver(`b${i}`, { area: "B", region: "West Midlands" }),
    );
    expect(choosePeerGroup(elsewhere, home, "work")?.level).toBe("national");
    expect(choosePeerGroup(elsewhere.slice(0, 4), home, "work")).toBeNull();
  });

  it("does not count drivers who only drove in one week, or the other mode", () => {
    const all = [
      ...Array.from({ length: 4 }, (_, i) => driver(`ok${i}`)),
      driver("oneweek", { weeksActive: 1 }),
      driver("personal", { families: ["personal"] }),
    ];
    expect(choosePeerGroup(all, home, "work")).toBeNull();
    // ok0-3 + personal are in the personal pool.
    expect(choosePeerGroup(all, home, "personal")?.level).toBe("area");
  });

  it("an unknown home goes straight to the UK", () => {
    const all = Array.from({ length: 5 }, (_, i) => driver(`u${i}`));
    expect(choosePeerGroup(all, { area: null, region: null }, "work")?.level).toBe("national");
  });
});

describe("assembleLocalBenchmark", () => {
  const window = completeWeeksWindow(NOW);
  const home = { area: "LS", areaName: "Leeds", region: "Yorkshire and the Humber" };

  it("says not enough drivers and returns no figures under the floor", () => {
    const out = assembleLocalBenchmark({ userId: "me", family: "work", home, you: driver("me"), group: null, window, now: NOW });
    expect(out.available).toBe(false);
    expect(out.reason).toBe("not_enough_drivers");
    expect(out.peerCount).toBeNull();
    expect(out.weeklyMiles).toBeNull();
    expect(out.area).toEqual({ code: "LS", name: "Leeds", region: "Yorkshire and the Humber" });
  });

  it("labels the area and ranks the viewer against the others", () => {
    const peers = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((m, i) =>
      driver(`p${i}`, { businessMiles: m * 4 }),
    );
    const me = driver("me", { businessMiles: 650 * 4, classifiedTrips: 16 });
    const choice = choosePeerGroup([...peers, me], home, "work")!;
    const out = assembleLocalBenchmark({
      userId: "me",
      family: "work",
      home,
      you: me,
      group: groupDistributions(choice, "work"),
      window,
      now: NOW,
    });
    expect(out.available).toBe(true);
    expect(out.level).toBe("area");
    expect(out.scopeLabel).toBe("Leeds (LS)");
    expect(out.peerCount).toBe(11);
    expect(out.weeklyMiles!.you).toBe(650);
    expect(out.weeklyMiles!.youAheadOfPerTen).toBe(6);
    expect(out.weeklyMiles!.low).not.toBeNull();
    expect(out.classifiedPct!.you).toBe(40);
    expect(out.classifiedPct!.median).toBe(80);
  });

  it("does not rank a viewer with under 2 active weeks but still shows their figures", () => {
    const peers = Array.from({ length: 5 }, (_, i) => driver(`p${i}`));
    const me = driver("me", { weeksActive: 1, businessMiles: 40 });
    const out = assembleLocalBenchmark({
      userId: "me",
      family: "work",
      home,
      you: me,
      group: groupDistributions(choosePeerGroup(peers, home, "work")!, "work"),
      window,
      now: NOW,
    });
    expect(out.youWeeksActive).toBe(1);
    expect(out.weeklyMiles!.you).toBe(10);
    expect(out.weeklyMiles!.youAheadOfPerTen).toBeNull();
  });

  it("uses the region label on fallback and keeps the range hidden under 10", () => {
    const peers = Array.from({ length: 6 }, (_, i) => driver(`p${i}`, { area: i < 3 ? "LS" : "HX" }));
    const out = assembleLocalBenchmark({
      userId: "me",
      family: "work",
      home,
      you: null,
      group: groupDistributions(choosePeerGroup(peers, home, "work")!, "work"),
      window,
      now: NOW,
    });
    expect(out.level).toBe("region");
    expect(out.scopeLabel).toBe("Yorkshire and the Humber");
    expect(out.peerCount).toBeLessThan(RANGE_FLOOR);
    expect(out.weeklyMiles!.low).toBeNull();
    expect(out.weeklyMiles!.you).toBeNull();
  });
});
