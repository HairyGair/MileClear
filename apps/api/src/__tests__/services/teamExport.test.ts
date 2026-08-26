import { describe, it, expect } from "vitest";
import { londonMonthBounds, taxYearSegmentsForMonth, previousMonth } from "../../services/teamExport.js";

// Two things here are easy to get wrong and silent when wrong, so they are
// pinned rather than trusted:
//
//   1. Month boundaries are UK-LOCAL. A UTC boundary drops or duplicates
//      trips at every month edge while London is on BST.
//   2. The HMRC 10,000-mile allowance resets on 6 APRIL, mid-month. Treating
//      April as one tax year charges the whole month against last year's
//      running total, so a driver who had already passed 10,000 miles is
//      paid 25p for a month that should mostly be 55p.

const londonWallTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);

describe("londonMonthBounds", () => {
  it("starts and ends at London midnight in GMT months", () => {
    const { start, end } = londonMonthBounds("2026-01");
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("starts an hour before UTC midnight during BST", () => {
    // 1 July 00:00 London is 30 June 23:00 UTC. A naive UTC bound would hand
    // the last hour of June to July.
    const { start, end } = londonMonthBounds("2026-07");
    expect(start.toISOString()).toBe("2026-06-30T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T23:00:00.000Z");
    expect(londonWallTime(start)).toBe("01/07/2026, 00:00");
  });

  it("rolls over the year in December", () => {
    const { end } = londonMonthBounds("2026-12");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rejects a malformed month", () => {
    expect(() => londonMonthBounds("2026-13")).toThrow();
    expect(() => londonMonthBounds("nonsense")).toThrow();
  });
});

describe("taxYearSegmentsForMonth", () => {
  it("returns a single segment for an ordinary month", () => {
    const segs = taxYearSegmentsForMonth("2026-07");
    expect(segs).toHaveLength(1);
    expect(segs[0].taxYear).toBe("2026-27");
  });

  it("puts January to March in the tax year that began the previous April", () => {
    for (const m of ["2026-01", "2026-02", "2026-03"]) {
      const segs = taxYearSegmentsForMonth(m);
      expect(segs).toHaveLength(1);
      expect(segs[0].taxYear).toBe("2025-26");
    }
  });

  it("splits April at 6 April into two tax years", () => {
    const segs = taxYearSegmentsForMonth("2026-04");
    expect(segs).toHaveLength(2);

    expect(segs[0].taxYear).toBe("2025-26");
    expect(londonWallTime(segs[0].segStart)).toBe("01/04/2026, 00:00");
    expect(londonWallTime(segs[0].segEnd)).toBe("06/04/2026, 00:00");

    expect(segs[1].taxYear).toBe("2026-27");
    expect(londonWallTime(segs[1].segStart)).toBe("06/04/2026, 00:00");
    expect(londonWallTime(segs[1].segEnd)).toBe("01/05/2026, 00:00");
  });

  it("resets the mileage allowance on 6 April rather than inheriting last year's", () => {
    // The second segment must measure its running total from 6 April 2026,
    // not from 6 April 2025. This is the difference between 55p and 25p for
    // most of the month for a high-mileage driver.
    const [, afterBoundary] = taxYearSegmentsForMonth("2026-04");
    expect(londonWallTime(afterBoundary.tyStart)).toBe("06/04/2026, 00:00");
  });

  it("leaves no gap or overlap between segments", () => {
    const segs = taxYearSegmentsForMonth("2026-04");
    expect(segs[0].segEnd.getTime()).toBe(segs[1].segStart.getTime());
    const { start, end } = londonMonthBounds("2026-04");
    expect(segs[0].segStart.getTime()).toBe(start.getTime());
    expect(segs[segs.length - 1].segEnd.getTime()).toBe(end.getTime());
  });
});

describe("previousMonth", () => {
  it("steps back a month and across a year boundary", () => {
    expect(previousMonth("2026-07")).toBe("2026-06");
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});
