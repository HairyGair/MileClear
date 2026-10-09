import { describe, it, expect } from "vitest";
import {
  dateColumnRange,
  dateOnlyParts,
  previousBounds,
  ukDayBounds,
  ukMidnight,
  ukMonthBounds,
  ukParts,
  ukWeekBounds,
} from "../../lib/ukTime.js";

describe("ukTime", () => {
  it("UK midnight is 23:00 UTC the day before in BST, 00:00 UTC in GMT", () => {
    expect(ukMidnight(2026, 10, 5).toISOString()).toBe("2026-10-04T23:00:00.000Z");
    expect(ukMidnight(2026, 1, 12).toISOString()).toBe("2026-01-12T00:00:00.000Z");
  });

  it("handles the clock-change days", () => {
    // Clocks go back 25 Oct 2026: that day starts in BST.
    expect(ukMidnight(2026, 10, 25).toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(ukMidnight(2026, 10, 26).toISOString()).toBe("2026-10-26T00:00:00.000Z");
    // Clocks go forward 29 Mar 2026: that day starts in GMT.
    expect(ukMidnight(2026, 3, 29).toISOString()).toBe("2026-03-29T00:00:00.000Z");
  });

  it("weeks run Monday to Sunday in UK time", () => {
    // Friday 9 Oct 2026, 09:41 BST
    const w = ukWeekBounds(new Date("2026-10-09T08:41:00Z"));
    expect(w.start.toISOString()).toBe("2026-10-04T23:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-11T22:59:59.999Z");
    const last = ukWeekBounds(new Date("2026-10-09T08:41:00Z"), 1);
    expect(last.start.toISOString()).toBe("2026-09-27T23:00:00.000Z");
    expect(previousBounds("weekly", new Date("2026-10-09T08:41:00Z"))).toEqual(last);
  });

  it("a trip at 00:30 BST on a Monday belongs to that Monday's week", () => {
    const t = new Date("2026-10-04T23:30:00Z");
    expect(ukWeekBounds(t).start.toISOString()).toBe("2026-10-04T23:00:00.000Z");
    expect(ukParts(t)).toMatchObject({ dow: 1, hour: 0, dateKey: "2026-10-05" });
  });

  it("a Sunday stays in the week that started the Monday before", () => {
    const w = ukWeekBounds(new Date("2026-10-11T12:00:00Z"));
    expect(w.start.toISOString()).toBe("2026-10-04T23:00:00.000Z");
  });

  it("months and days", () => {
    const m = ukMonthBounds(new Date("2026-10-09T08:41:00Z"));
    expect(m.start.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(m.end.toISOString()).toBe("2026-10-31T23:59:59.999Z");
    expect(ukMonthBounds(new Date("2026-01-15T12:00:00Z"), 1).start.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(ukDayBounds(new Date("2026-10-09T08:41:00Z")).start.toISOString()).toBe("2026-10-08T23:00:00.000Z");
  });

  it("DATE columns compare as calendar dates and read in UTC", () => {
    const r = dateColumnRange(ukWeekBounds(new Date("2026-10-09T08:41:00Z")));
    expect(r.gte.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(r.lte.toISOString()).toBe("2026-10-11T00:00:00.000Z");
    // Sunday 4 Oct as Prisma returns it: Sunday, whatever the server timezone.
    expect(dateOnlyParts(new Date("2026-10-04T00:00:00Z"))).toEqual({ dow: 0, dateKey: "2026-10-04" });
  });
});
