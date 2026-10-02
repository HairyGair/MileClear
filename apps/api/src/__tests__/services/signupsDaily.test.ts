import { describe, it, expect } from "vitest";
import {
  bucketSignupsDaily,
  londonDayKey,
  londonDayKeys,
  londonDayStart,
  signupsDailyRangeStart,
} from "../../services/signupsDaily.js";

describe("londonDayKey", () => {
  it("puts 23:30 UTC in summer on the next UK day (BST)", () => {
    expect(londonDayKey(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
  });
  it("keeps 23:30 UTC in winter on the same UK day (GMT)", () => {
    expect(londonDayKey(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-01");
  });
});

describe("londonDayStart", () => {
  it("is 23:00 UTC the day before during BST", () => {
    expect(londonDayStart("2026-07-02").toISOString()).toBe("2026-07-01T23:00:00.000Z");
  });
  it("is midnight UTC during GMT", () => {
    expect(londonDayStart("2026-12-01").toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
  it("handles the day the clocks go back (25 Oct 2026 starts in BST)", () => {
    expect(londonDayStart("2026-10-25").toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(londonDayStart("2026-10-26").toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
  it("handles the day the clocks go forward (29 Mar 2026 starts in GMT)", () => {
    expect(londonDayStart("2026-03-29").toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(londonDayStart("2026-03-30").toISOString()).toBe("2026-03-29T23:00:00.000Z");
  });
});

describe("londonDayKeys", () => {
  it("ends on today's UK day, oldest first", () => {
    const keys = londonDayKeys(3, new Date("2026-10-01T23:30:00Z")); // 00:30 on 2 Oct in the UK
    expect(keys).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  });
  it("crosses a month and the clock change without skipping or repeating a day", () => {
    const keys = londonDayKeys(5, new Date("2026-10-27T10:00:00Z"));
    expect(keys).toEqual(["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
  });
});

describe("bucketSignupsDaily", () => {
  it("fills missing days with 0 and totals only in-range sign-ups", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const r = bucketSignupsDaily(
      [
        new Date("2026-10-02T08:00:00Z"),
        new Date("2026-10-02T09:00:00Z"),
        new Date("2026-09-30T10:00:00Z"),
        new Date("2026-09-01T10:00:00Z"), // outside the 4-day range
      ],
      4,
      now
    );
    expect(r.days).toEqual([
      { date: "2026-09-29", count: 0 },
      { date: "2026-09-30", count: 1 },
      { date: "2026-10-01", count: 0 },
      { date: "2026-10-02", count: 2 },
    ]);
    expect(r.total).toBe(3);
  });

  it("buckets across the BST to GMT change on UK days", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const r = bucketSignupsDaily(
      [
        new Date("2026-10-24T23:30:00Z"), // 00:30 BST on Sun 25 Oct
        new Date("2026-10-25T23:30:00Z"), // 23:30 GMT on Sun 25 Oct
        new Date("2026-10-26T00:10:00Z"), // 00:10 GMT on Mon 26 Oct
      ],
      3,
      now
    );
    expect(r.days).toEqual([
      { date: "2026-10-24", count: 0 },
      { date: "2026-10-25", count: 2 },
      { date: "2026-10-26", count: 1 },
    ]);
  });

  it("range start matches the oldest bucket, so the query covers every counted day", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const start = signupsDailyRangeStart(10, now);
    expect(start.toISOString()).toBe("2026-06-30T23:00:00.000Z");
    const r = bucketSignupsDaily([start, new Date(start.getTime() - 1)], 10, now);
    expect(r.total).toBe(1);
    expect(r.days[0]).toEqual({ date: "2026-07-01", count: 1 });
  });
});
