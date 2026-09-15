/**
 * Evening digest: the text a driver reads at 20:30 and the window that
 * decides which hourly tick sends it. Pure functions, no mocks.
 */
import { describe, it, expect } from "vitest";

import {
  buildDigestBody,
  digestAction,
  eveningDigestDryRun,
  formatDigestMiles,
  inDigestWindow,
  localClock,
  localDayBounds,
} from "../../jobs/eveningDigest.js";

describe("buildDigestBody", () => {
  it("plural trips and miles, no walks, no unclassified", () => {
    expect(buildDigestBody({ trips: 4, miles: 21.34, walks: 0, unclassified: 0 })).toBe(
      "Today: 4 trips, 21.3 miles."
    );
  });

  it("singular trip", () => {
    expect(buildDigestBody({ trips: 1, miles: 3.2, walks: 0, unclassified: 0 })).toBe(
      "Today: 1 trip, 3.2 miles."
    );
  });

  it("exactly one mile reads as a mile", () => {
    expect(buildDigestBody({ trips: 1, miles: 1, walks: 0, unclassified: 0 })).toBe(
      "Today: 1 trip, 1 mile."
    );
    // 1.04 rounds to "1" in the display, so the word must follow the display.
    expect(buildDigestBody({ trips: 1, miles: 1.04, walks: 0, unclassified: 0 })).toBe(
      "Today: 1 trip, 1 mile."
    );
  });

  it("walks ignored, singular and plural", () => {
    expect(buildDigestBody({ trips: 4, miles: 21, walks: 2, unclassified: 0 })).toBe(
      "Today: 4 trips, 21 miles. 2 walks ignored."
    );
    expect(buildDigestBody({ trips: 4, miles: 21, walks: 1, unclassified: 0 })).toBe(
      "Today: 4 trips, 21 miles. 1 walk ignored."
    );
  });

  it("unclassified to sort", () => {
    expect(buildDigestBody({ trips: 4, miles: 21, walks: 2, unclassified: 3 })).toBe(
      "Today: 4 trips, 21 miles. 2 walks ignored. 3 to sort."
    );
    expect(buildDigestBody({ trips: 2, miles: 8.5, walks: 0, unclassified: 1 })).toBe(
      "Today: 2 trips, 8.5 miles. 1 to sort."
    );
  });

  it("no trips but a dropped walk still says something", () => {
    expect(buildDigestBody({ trips: 0, miles: 0, walks: 1, unclassified: 0 })).toBe(
      "Today: no trips. 1 walk ignored."
    );
  });

  it("formats miles like the app: one decimal, en-GB grouping", () => {
    expect(formatDigestMiles(1234.56)).toBe("1,234.6");
    expect(formatDigestMiles(0.25)).toBe("0.3");
    expect(formatDigestMiles(12)).toBe("12");
  });
});

describe("digestAction", () => {
  it("opens the unclassified filter only when there is something to sort", () => {
    expect(digestAction({ trips: 3, miles: 10, walks: 0, unclassified: 0 })).toBe("open_trips");
    expect(digestAction({ trips: 3, miles: 10, walks: 0, unclassified: 2 })).toBe(
      "open_unclassified_trips"
    );
  });
});

describe("inDigestWindow", () => {
  it("is 20:30 to 21:29 inclusive", () => {
    expect(inDigestWindow({ hour: 20, minute: 29 })).toBe(false);
    expect(inDigestWindow({ hour: 20, minute: 30 })).toBe(true);
    expect(inDigestWindow({ hour: 20, minute: 59 })).toBe(true);
    expect(inDigestWindow({ hour: 21, minute: 0 })).toBe(true);
    expect(inDigestWindow({ hour: 21, minute: 29 })).toBe(true);
    expect(inDigestWindow({ hour: 21, minute: 30 })).toBe(false);
    expect(inDigestWindow({ hour: 8, minute: 45 })).toBe(false);
    expect(inDigestWindow({ hour: 0, minute: 0 })).toBe(false);
  });
});

describe("localClock (Europe/London)", () => {
  it("reads BST: 19:45Z in September is 20:45 local, inside the window", () => {
    const c = localClock(new Date("2026-09-15T19:45:00Z"));
    expect(c).toEqual({ year: 2026, month: 9, day: 15, hour: 20, minute: 45 });
    expect(inDigestWindow(c)).toBe(true);
  });

  it("reads GMT: 20:45Z in January is 20:45 local, inside the window", () => {
    const c = localClock(new Date("2026-01-15T20:45:00Z"));
    expect(c).toEqual({ year: 2026, month: 1, day: 15, hour: 20, minute: 45 });
    expect(inDigestWindow(c)).toBe(true);
  });

  it("20:45Z in September is 21:45 local, outside the window", () => {
    expect(inDigestWindow(localClock(new Date("2026-09-15T20:45:00Z")))).toBe(false);
  });

  it("midnight is hour 0, not 24", () => {
    expect(localClock(new Date("2026-01-15T00:00:00Z")).hour).toBe(0);
    expect(localClock(new Date("2026-09-14T23:00:00Z")).hour).toBe(0);
  });
});

describe("localDayBounds (Europe/London)", () => {
  it("BST day runs 23:00Z to 23:00Z", () => {
    const b = localDayBounds(new Date("2026-09-15T19:45:00Z"));
    expect(b.key).toBe("2026-09-15");
    expect(b.start.toISOString()).toBe("2026-09-14T23:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-09-15T23:00:00.000Z");
  });

  it("GMT day runs 00:00Z to 00:00Z", () => {
    const b = localDayBounds(new Date("2026-01-15T20:45:00Z"));
    expect(b.key).toBe("2026-01-15");
    expect(b.start.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-01-16T00:00:00.000Z");
  });

  it("23:30Z in BST already belongs to the next local day", () => {
    const b = localDayBounds(new Date("2026-09-15T23:30:00Z"));
    expect(b.key).toBe("2026-09-16");
    expect(b.start.toISOString()).toBe("2026-09-15T23:00:00.000Z");
  });

  it("the clocks-go-back day is 25 hours long", () => {
    // Last Sunday of October 2026 is the 25th.
    const b = localDayBounds(new Date("2026-10-25T12:00:00Z"));
    expect(b.key).toBe("2026-10-25");
    expect(b.start.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("the clocks-go-forward day is 23 hours long", () => {
    // Last Sunday of March 2026 is the 29th.
    const b = localDayBounds(new Date("2026-03-29T12:00:00Z"));
    expect(b.key).toBe("2026-03-29");
    expect(b.start.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-03-29T23:00:00.000Z");
  });
});

describe("eveningDigestDryRun", () => {
  it("is dry run unless the env var is exactly 0", () => {
    expect(eveningDigestDryRun({})).toBe(true);
    expect(eveningDigestDryRun({ EVENING_DIGEST_DRY_RUN: "1" })).toBe(true);
    expect(eveningDigestDryRun({ EVENING_DIGEST_DRY_RUN: "false" })).toBe(true);
    expect(eveningDigestDryRun({ EVENING_DIGEST_DRY_RUN: "0" })).toBe(false);
  });
});
