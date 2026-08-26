/**
 * routedDurationUsable — the gate on standing a routed drive time in for a
 * manually-entered trip's missing end time.
 *
 * Written after a dry run over the real backfill set showed why the gate has
 * to exist: delivery drivers routinely log a round trip as one row (stored
 * 6.7mi, routed 0.1mi because both addresses geocode to the same town), and
 * loose destinations like "Evesham" resolve to a town centre rather than the
 * drop. Using those durations would have stamped 400mph trips into the data
 * that feeds earnings per hour and the weekly P&L.
 */
import { describe, it, expect } from "vitest";
import { routedDurationUsable } from "../../services/routing.js";

const ok = (o: Partial<Parameters<typeof routedDurationUsable>[0]> = {}) =>
  routedDurationUsable({ routedMiles: 34.5, routedSecs: 2_700, storedMiles: 34.5, ...o });

describe("routedDurationUsable", () => {
  it("accepts a route that matches the recorded journey", () => {
    expect(ok()).toBe(true);
  });

  it("tolerates the small gap between a typed distance and the routed one", () => {
    // User typed 34 for a route we price at 34.5: same journey, fine.
    expect(ok({ storedMiles: 34 })).toBe(true);
    expect(ok({ storedMiles: 40 })).toBe(true); // 16% over
  });

  it("refuses a round trip logged as one row", () => {
    // The real shape: stored is roughly double the one-way route.
    expect(ok({ routedMiles: 5.7, routedSecs: 637, storedMiles: 9.6 })).toBe(false);
    expect(ok({ routedMiles: 7.1, routedSecs: 713, storedMiles: 13.1 })).toBe(false);
  });

  it("refuses the loose-geocode case that would imply an absurd speed", () => {
    // eff8dd16: "Papa Johns, Evesham" -> "Evesham", 6.7mi stored, 0.1mi routed.
    expect(ok({ routedMiles: 0.1, routedSecs: 37, storedMiles: 6.7 })).toBe(false);
  });

  it("refuses a route between two points that are effectively the same place", () => {
    expect(ok({ routedMiles: 0.05, routedSecs: 12, storedMiles: 0.05 })).toBe(false);
  });

  it("refuses anything longer than a single day's drive", () => {
    expect(ok({ routedMiles: 700, routedSecs: 13 * 60 * 60, storedMiles: 700 })).toBe(false);
  });

  it("refuses a trip with no usable stored distance", () => {
    expect(ok({ storedMiles: 0 })).toBe(false);
    expect(ok({ storedMiles: NaN })).toBe(false);
  });

  it("refuses non-finite routing output rather than trusting it", () => {
    expect(ok({ routedSecs: NaN })).toBe(false);
    expect(ok({ routedMiles: Infinity })).toBe(false);
  });

  it("holds the implied speed inside a band a car could actually drive", () => {
    // Matching distances but a duration implying 138mph.
    expect(ok({ routedMiles: 23, routedSecs: 600, storedMiles: 23 })).toBe(false);
    // ...and one implying 2mph, which is a walk, not a drive.
    expect(ok({ routedMiles: 2, routedSecs: 3_600, storedMiles: 2 })).toBe(false);
  });

  it("accepts a slow town crawl and a fast motorway run", () => {
    expect(ok({ routedMiles: 3, routedSecs: 1_800, storedMiles: 3 })).toBe(true); // 6mph
    expect(ok({ routedMiles: 70, routedSecs: 3_600, storedMiles: 70 })).toBe(true); // 70mph
  });
});
