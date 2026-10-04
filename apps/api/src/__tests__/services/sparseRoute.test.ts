/**
 * Sparse recorded trips (4 Oct 2026): a trip caught at only a few GPS points
 * gets the road distance along those points, but only when it is plausible.
 * Raising a GPS jump into a long drive would be an over-claim on a tax record.
 */
import { describe, it, expect } from "vitest";
import { isSparseCandidate, judgeSparseRoute } from "../../services/sparseRoute.js";

describe("isSparseCandidate", () => {
  it("recorded trips with 2-9 points and a real span", () => {
    expect(isSparseCandidate({ isManualEntry: false, coordinateCount: 3, crowMiles: 1.5 })).toBe(true);
    expect(isSparseCandidate({ isManualEntry: false, coordinateCount: 9, crowMiles: 1.5 })).toBe(true);
  });
  it("never manual trips, map-matchable trips, single points or tiny spans", () => {
    expect(isSparseCandidate({ isManualEntry: true, coordinateCount: 3, crowMiles: 1.5 })).toBe(false);
    expect(isSparseCandidate({ isManualEntry: false, coordinateCount: 10, crowMiles: 1.5 })).toBe(false);
    expect(isSparseCandidate({ isManualEntry: false, coordinateCount: 1, crowMiles: 1.5 })).toBe(false);
    expect(isSparseCandidate({ isManualEntry: false, coordinateCount: 3, crowMiles: 0.2 })).toBe(false);
  });
});

describe("judgeSparseRoute", () => {
  const base = { storedMiles: 2.0, crowMiles: 2.0, spanSecs: 12 * 60, routedDurationSecs: 8 * 60 };
  it("adopts a plausible road distance (the 70 mi -> 109.5 mi kind of gap)", () => {
    expect(judgeSparseRoute({ ...base, routedMiles: 3.1 })).toEqual({ accept: true, miles: 3.1 });
  });
  it("never lowers or barely changes a trip", () => {
    expect(judgeSparseRoute({ ...base, routedMiles: 2.05 })).toEqual({ accept: false, reason: "no_gain" });
    expect(judgeSparseRoute({ ...base, routedMiles: 1.5 })).toEqual({ accept: false, reason: "no_gain" });
  });
  it("refuses a route far longer than the straight line", () => {
    expect(judgeSparseRoute({ ...base, routedMiles: 5.5 })).toEqual({ accept: false, reason: "too_long_for_crow" });
  });
  it("refuses an impossible speed over the recorded time", () => {
    expect(judgeSparseRoute({ ...base, spanSecs: 2 * 60, routedMiles: 3.1 })).toEqual({ accept: false, reason: "too_fast" });
  });
  it("refuses a route that takes far longer to drive than the trip took", () => {
    expect(
      judgeSparseRoute({ ...base, spanSecs: 10 * 60, routedDurationSecs: 40 * 60, routedMiles: 3.1 })
    ).toEqual({ accept: false, reason: "too_slow_for_span" });
  });
  it("with no end time, only the distance checks apply", () => {
    expect(judgeSparseRoute({ ...base, spanSecs: null, routedMiles: 3.1 })).toEqual({ accept: true, miles: 3.1 });
  });
});
