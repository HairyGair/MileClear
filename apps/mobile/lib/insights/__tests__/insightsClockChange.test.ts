// Clocks go back on Sun 25 Oct 2026 and forward on Sun 28 Mar 2027 (UK).
// Runs in the machine's zone; meaningful when that is Europe/London.
import { describe, it, expect } from "vitest";
import { bucketTrips, getPeriodRange } from "../period";
import { weekStreak } from "../streak";

describe("UK clock changes", () => {
  it("the week of 19 Oct 2026 runs Monday to Monday across the change", () => {
    const now = new Date(2026, 9, 25, 12);
    const w = getPeriodRange("week", 0, now);
    expect(w.start).toEqual(new Date(2026, 9, 19));
    expect(w.end).toEqual(new Date(2026, 9, 26));
    expect(getPeriodRange("week", 1, new Date(2026, 9, 21)).start).toEqual(new Date(2026, 9, 26));
  });

  it("late Sunday trips on the change day land on Sunday, Monday's on next week", () => {
    const now = new Date(2026, 9, 26, 9);
    const trips = [
      { startedAt: new Date(2026, 9, 25, 0, 30).toISOString(), distanceMiles: 1 },
      { startedAt: new Date(2026, 9, 25, 23, 30).toISOString(), distanceMiles: 2 },
      { startedAt: new Date(2026, 9, 26, 0, 15).toISOString(), distanceMiles: 4 },
    ];
    const last = bucketTrips(trips, "week", -1, now);
    expect(last[6].miles).toBe(3);
    expect(last.reduce((s, b) => s + b.miles, 0)).toBe(3);
    const cur = bucketTrips(trips, "week", 0, now);
    expect(cur[0].miles).toBe(4);
  });

  it("October bars count the week of 26 Oct once", () => {
    const now = new Date(2026, 10, 2, 9);
    const trips = [{ startedAt: new Date(2026, 9, 27, 8).toISOString(), distanceMiles: 5 }];
    const b = bucketTrips(trips, "month", -1, now);
    expect(b.length).toBe(5);
    expect(b[4].miles).toBe(5);
  });

  it("a week streak survives both clock changes", () => {
    const dates = [
      new Date(2026, 9, 20, 8), // week of 19 Oct
      new Date(2026, 9, 27, 8), // week of 26 Oct (after clocks go back)
      new Date(2027, 2, 24, 8), // week of 22 Mar 2027
      new Date(2027, 2, 29, 8), // week of 29 Mar (after clocks go forward)
    ];
    expect(weekStreak(dates.slice(0, 2), new Date(2026, 9, 28, 12)).weeks).toBe(2);
    expect(weekStreak(dates.slice(2), new Date(2027, 2, 30, 12)).weeks).toBe(2);
  });
});
