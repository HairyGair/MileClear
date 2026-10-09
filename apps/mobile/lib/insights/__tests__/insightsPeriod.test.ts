import { describe, it, expect } from "vitest";
import { getPeriodRange, bucketTrips, chartLabel, taxYearName, taxYearStartYear, summaryTitle } from "../period";
import { weekStreak, weekStreakLine } from "../streak";
import { getMilestoneRoad, getMilestoneRoadOrStart, newlyPassed, highestPassed, milesToGoText, MILESTONES } from "../milestones";
import { buildSummarySentence, buildFigures, compareUpsellText } from "../summary";
import { nextBadges, badgeIcon } from "../badges";
import { buildRecords } from "../records";

// Friday 9 Oct 2026, 14:00 local.
const NOW = new Date(2026, 9, 9, 14, 0, 0);

describe("period ranges", () => {
  it("week starts on Monday and offsets step back by 7 days", () => {
    const w = getPeriodRange("week", 0, NOW);
    expect(w.start).toEqual(new Date(2026, 9, 5));
    expect(w.end).toEqual(new Date(2026, 9, 12));
    expect(w.label).toBe("This week");
    const prev = getPeriodRange("week", -1, NOW);
    expect(prev.start).toEqual(new Date(2026, 8, 28));
    expect(prev.label).toBe("Last week");
    expect(getPeriodRange("week", -2, NOW).label).toBe("21 Sep to 27 Sep");
  });

  it("Sunday belongs to the week that started the Monday before", () => {
    const sunday = new Date(2026, 9, 11, 9);
    expect(getPeriodRange("week", 0, sunday).start).toEqual(new Date(2026, 9, 5));
  });

  it("month offsets cross year ends", () => {
    const jan = new Date(2026, 0, 10);
    const prev = getPeriodRange("month", -1, jan);
    expect(prev.start).toEqual(new Date(2025, 11, 1));
    expect(prev.end).toEqual(new Date(2026, 0, 1));
    expect(prev.label).toBe("December 2025");
    expect(getPeriodRange("month", 0, NOW).label).toBe("This month");
  });

  it("tax year turns over on 6 April", () => {
    expect(taxYearStartYear(new Date(2026, 3, 5))).toBe(2025);
    expect(taxYearStartYear(new Date(2026, 3, 6))).toBe(2026);
    const t = getPeriodRange("tax_year", 0, NOW);
    expect(t.start).toEqual(new Date(2026, 3, 6));
    expect(t.label).toBe("6 April 2026 to now");
    const last = getPeriodRange("tax_year", -1, NOW);
    expect(last.start).toEqual(new Date(2025, 3, 6));
    expect(last.end).toEqual(new Date(2026, 3, 6));
    expect(taxYearName(2025)).toBe("2025-26");
    expect(summaryTitle("tax_year", -1, last, NOW)).toBe("Tax year 2025-26");
  });
});

describe("bars", () => {
  const trips = [
    { startedAt: new Date(2026, 9, 5, 8).toISOString(), distanceMiles: 20 }, // Mon
    { startedAt: new Date(2026, 9, 5, 18).toISOString(), distanceMiles: 5 }, // Mon
    { startedAt: new Date(2026, 9, 9, 9).toISOString(), distanceMiles: 3 }, // Fri (today)
    { startedAt: new Date(2026, 8, 30, 9).toISOString(), distanceMiles: 50 }, // last week
  ];

  it("week: seven days, Monday first, today marked, future flagged", () => {
    const b = bucketTrips(trips, "week", 0, NOW);
    expect(b).toHaveLength(7);
    expect(b[0].miles).toBe(25);
    expect(b[0].trips).toBe(2);
    expect(b[4].miles).toBe(3);
    expect(b[4].isCurrent).toBe(true);
    expect(b[5].isFuture).toBe(true);
    expect(b.reduce((s, x) => s + x.miles, 0)).toBe(28);
  });

  it("week: offset -1 picks last week only", () => {
    const b = bucketTrips(trips, "week", -1, NOW);
    expect(b[2].miles).toBe(50);
    expect(b.reduce((s, x) => s + x.miles, 0)).toBe(50);
  });

  it("month: one bar per week, trips land in the right week", () => {
    const b = bucketTrips(trips, "month", 0, NOW);
    expect(b.length).toBe(5); // 1 Oct 2026 is a Thursday: weeks of 28 Sep, 5, 12, 19, 26
    expect(b[0].miles).toBe(0 + 0); // 30 Sep is September, not October
    expect(b[1].miles).toBe(28);
    expect(b[0].label).toBe("w/c 1");
  });

  it("tax year: April to March, 1-5 April sit outside", () => {
    const edge = [
      { startedAt: new Date(2026, 3, 3, 9).toISOString(), distanceMiles: 99 }, // previous tax year
      { startedAt: new Date(2026, 3, 10, 9).toISOString(), distanceMiles: 10 },
      { startedAt: new Date(2026, 9, 2, 9).toISOString(), distanceMiles: 7 },
    ];
    const b = bucketTrips(edge, "tax_year", 0, NOW);
    expect(b).toHaveLength(12);
    expect(b[0].miles).toBe(10);
    expect(b[6].miles).toBe(7);
    expect(b[6].isCurrent).toBe(true);
    expect(b[7].isFuture).toBe(true);
  });

  it("chart label reads as a sentence", () => {
    const b = bucketTrips(trips, "week", 0, NOW);
    expect(chartLabel(b, "week", 0)).toBe("This week, 28 miles. Monday 25, Friday 3.");
    expect(chartLabel(bucketTrips([], "week", 0, NOW), "week", 0)).toBe("This week, no driving yet.");
  });
});

describe("week streak", () => {
  const d = (y: number, m: number, day: number) => new Date(y, m, day, 10);

  it("counts consecutive weeks including this one", () => {
    const s = weekStreak([d(2026, 9, 6), d(2026, 9, 1), d(2026, 8, 22), d(2026, 8, 15)], NOW);
    // weeks of 5 Oct, 28 Sep, 21 Sep, 14 Sep
    expect(s.weeks).toBe(4);
    expect(s.doneThisWeek).toBe(true);
    expect(s.best).toBe(4);
  });

  it("stays alive when only this week is empty", () => {
    const s = weekStreak([d(2026, 8, 30), d(2026, 8, 23)], NOW);
    expect(s.weeks).toBe(2);
    expect(s.doneThisWeek).toBe(false);
    expect(weekStreakLine(s)).toEqual({ title: "2 weeks in a row", nudge: "Drive this week to make it 3." });
  });

  it("breaks after a missed full week", () => {
    const s = weekStreak([d(2026, 9, 6), d(2026, 8, 15)], NOW);
    expect(s.weeks).toBe(1);
    expect(weekStreakLine(s).title).toBe("1 week in a row");
  });

  it("is zero with no trips and gives a start line", () => {
    const s = weekStreak([], NOW);
    expect(s.weeks).toBe(0);
    expect(weekStreakLine(s).title).toBe("Start a run: drive this week");
    expect(s.dots).toHaveLength(7);
    expect(s.dots[6].isCurrent).toBe(true);
  });

  it("two trips in one week count once, and Sunday joins the same week", () => {
    const s = weekStreak([d(2026, 9, 5), d(2026, 9, 11), d(2026, 9, 6)], new Date(2026, 9, 11, 20));
    expect(s.weeks).toBe(1);
  });
});

describe("milestones", () => {
  it("renames the 250 mi milestone so it differs from the Road Warrior badge", () => {
    expect(MILESTONES.find((m) => m.miles === 250)?.label).toBe("Long Way Round");
    expect(MILESTONES.some((m) => m.label === "Road Warrior")).toBe(false);
  });

  it("finds the next milestone, progress and miles to go", () => {
    const r = getMilestoneRoad(322)!;
    expect(r.next.miles).toBe(500);
    expect(r.lastAchieved?.miles).toBe(250);
    expect(r.milesToGo).toBe(178);
    expect(r.progress).toBeCloseTo((322 - 250) / 250);
  });

  it("starts the first road at zero and ends when everything is passed", () => {
    expect(getMilestoneRoad(2)).toBeNull();
    const start = getMilestoneRoadOrStart(2)!;
    expect(start.next.miles).toBe(10);
    expect(start.progress).toBeCloseTo(0.2);
    expect(getMilestoneRoadOrStart(60000)).toBeNull();
  });

  it("celebrates only a milestone above the last one seen, never on first visit", () => {
    expect(newlyPassed(510, null)).toBeNull();
    expect(newlyPassed(510, 250)?.label).toBe("Explorer");
    expect(newlyPassed(510, 500)).toBeNull();
    expect(highestPassed(4)).toBeNull();
  });

  it("words the distance to go", () => {
    expect(milesToGoText(178.4)).toBe("178 miles to go");
    expect(milesToGoText(4.26)).toBe("4.3 miles to go");
    expect(milesToGoText(0.4)).toBe("Less than a mile to go");
    expect(milesToGoText(1200)).toBe("1,200 miles to go");
  });
});

describe("summary sentence", () => {
  const base = {
    period: "week" as const,
    offset: 0,
    miles: 182,
    trips: 6,
    prevMiles: 142,
    showComparison: true,
    tripsEver: 80,
  };

  it("Pro sees the comparison", () => {
    expect(buildSummarySentence(base).text).toBe("Busy week: 182 miles over 6 trips, 40 miles more than last week.");
    expect(buildSummarySentence({ ...base, miles: 100, trips: 4 }).text).toBe(
      "Quieter week: 100 miles, 42 miles fewer than last week."
    );
    expect(buildSummarySentence({ ...base, miles: 143 }).kind).toBe("same");
  });

  it("free drivers never see the previous period in the sentence", () => {
    const s = buildSummarySentence({ ...base, showComparison: false });
    expect(s.text).toBe("182 miles over 6 trips this week.");
    expect(s.text).not.toMatch(/last week|more than|fewer/);
  });

  it("appends the busiest day only when it is over half", () => {
    const withDay = buildSummarySentence({ ...base, showComparison: false, busiestDay: "Monday 5 Oct", busiestDayMiles: 120 });
    expect(withDay.text.endsWith("Monday did most of it.")).toBe(true);
    const spread = buildSummarySentence({ ...base, showComparison: false, busiestDay: "Monday 5 Oct", busiestDayMiles: 60 });
    expect(spread.text).not.toMatch(/did most/);
  });

  it("handles empty, quiet and first-week states without zeros", () => {
    expect(buildSummarySentence({ ...base, tripsEver: 0, trips: 0, miles: 0 }).kind).toBe("empty");
    expect(buildSummarySentence({ ...base, trips: 0, miles: 0 }).text).toBe("No trips this week yet. Last week: 142 miles.");
    expect(buildSummarySentence({ ...base, trips: 0, miles: 0, showComparison: false }).text).toBe("No trips this week yet.");
    expect(buildSummarySentence({ ...base, trips: 0, miles: 0, offset: -1 }).text).toBe("No trips last week. Last week: 142 miles.");
    const first = buildSummarySentence({ ...base, tripsEver: 3, trips: 3, miles: 22 });
    expect(first.text).toBe("Your first week with MileClear: 3 trips, 22 miles.");
  });

  it("tax year has no comparison clause", () => {
    const s = buildSummarySentence({ ...base, period: "tax_year", miles: 4200, trips: 300, prevMiles: 3000 });
    expect(s.text).toBe("4,200 miles over 300 trips this tax year.");
  });

  it("figures: comparison is Pro only, zeros are dropped, arrows are neutral data", () => {
    const f = (over: object) =>
      buildFigures({
        mode: "personal",
        period: "week",
        miles: 182,
        trips: 6,
        prevMiles: 142,
        showComparison: true,
        claimPence: null,
        formatPence: (p) => `£${(p / 100).toFixed(2)}`,
        ...over,
      });
    expect(f({}).map((x) => x.key)).toEqual(["trips", "compare", "avg"]);
    expect(f({}).find((x) => x.key === "compare")).toMatchObject({ value: "40 mi", arrow: "up", label: "vs last week" });
    expect(f({ showComparison: false }).map((x) => x.key)).toEqual(["trips", "avg"]);
    expect(f({ trips: 0, miles: 0 })).toEqual([]);
    const work = f({ mode: "work", claimPence: 8190 });
    expect(work.map((x) => x.key)).toEqual(["trips", "compare", "claim"]);
    expect(work[2].value).toBe("£81.90");
    expect(compareUpsellText("week")).toBe("Compare with last week with Pro");
    expect(compareUpsellText("month")).toBe("Compare with last month with Pro");
  });
});

describe("badges", () => {
  const stats = { totalMiles: 460, totalTrips: 48, totalShifts: 3, longestStreakDays: 2 };
  const types = ["first_trip", "miles_250", "miles_500", "miles_1000", "trips_50", "trips_100", "shifts_10", "streak_3", "earned_100"];

  it("lists the nearest unearned badges first with plain progress", () => {
    const n = nextBadges(types, new Set(["first_trip", "miles_250"]), stats, "work", 3);
    expect(n.map((b) => b.type)).toEqual(["trips_50", "miles_500", "streak_3"]);
    expect(n[0].progressText).toBe("2 more trips");
    expect(n[1].progressText).toBe("40 mi to go");
  });

  it("personal mode skips shift, streak and earnings badges", () => {
    const n = nextBadges(types, new Set(), stats, "personal", 10);
    expect(n.every((b) => /^(miles|trips)_/.test(b.type))).toBe(true);
  });

  it("first-ever driver sees the first trip badge", () => {
    const n = nextBadges(["first_trip", "miles_50"], new Set(), { totalMiles: 0, totalTrips: 0, totalShifts: 0, longestStreakDays: 0 }, "personal", 3);
    expect(n[0].type).toBe("first_trip");
  });

  it("every badge type has an icon", () => {
    expect(badgeIcon("miles_500")).toBe("map");
    expect(badgeIcon("something_new")).toBe("ribbon");
  });
});

describe("records", () => {
  const rec = {
    mostMilesInDay: 168.94,
    mostMilesInDayDate: new Date(2026, 9, 5, 12).toISOString(),
    mostTripsInShift: 0,
    mostTripsInShiftDate: null,
    longestSingleTrip: 84.6,
    longestSingleTripDate: new Date(2026, 5, 1, 12).toISOString(),
    longestStreakDays: 15,
  };
  const week = { start: new Date(2026, 9, 5), end: new Date(2026, 9, 12) };

  it("personal mode never has trips per shift, shows the best streak and tags a new record", () => {
    const cells = buildRecords(rec, "personal", week);
    expect(cells.map((c) => c.key)).toEqual(["bestDay", "longestTrip", "bestStreak"]);
    expect(cells[0]).toMatchObject({ value: "168.9", dateLabel: "5 Oct", isNew: true });
    expect(cells[1].isNew).toBe(false);
    expect(cells[0].spoken).toBe("Best day, 168.9 miles, 5 Oct, new");
  });

  it("work mode hides zero records and keeps the streak", () => {
    const cells = buildRecords(rec, "work", week);
    expect(cells.map((c) => c.key)).toEqual(["bestDay", "longestTrip", "bestStreak"]);
    const withShift = buildRecords({ ...rec, mostTripsInShift: 9, mostTripsInShiftDate: new Date(2026, 8, 1).toISOString() }, "work", week);
    expect(withShift.find((c) => c.key === "tripsInShift")?.label).toBe("Most trips in a shift");
  });
});
