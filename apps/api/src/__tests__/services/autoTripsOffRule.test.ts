/**
 * Automatic trips switched off on the phone (28 Sep 2026, a shift-only
 * driver): no journeys to check bar a discarded Start Trip, and no walk count
 * in the evening push. null (an app too old to report the switch) is on.
 */
import { describe, it, expect } from "vitest";
import {
  autoTripsOff,
  digestCountsFor,
  missedJourneySourceAllowed,
} from "../../services/autoTripsOffRule.js";

describe("autoTripsOff", () => {
  it("is off only when the phone said false", () => {
    expect(autoTripsOff(false)).toBe(true);
    expect(autoTripsOff(true)).toBe(false);
    expect(autoTripsOff(null)).toBe(false);
    expect(autoTripsOff(undefined)).toBe(false);
  });
});

describe("missedJourneySourceAllowed", () => {
  const all = ["gap", "trip_start", "recorded", "dropped_walk", "dropped_phantom", "dropped_start_trip"];

  it("allows every source when on or unknown", () => {
    for (const s of all) {
      expect(missedJourneySourceAllowed(s, true)).toBe(true);
      expect(missedJourneySourceAllowed(s, null)).toBe(true);
      expect(missedJourneySourceAllowed(s, undefined)).toBe(true);
    }
  });

  it("allows only a discarded Start Trip when off", () => {
    expect(missedJourneySourceAllowed("dropped_start_trip", false)).toBe(true);
    for (const s of ["gap", "trip_start", "recorded", "dropped_walk", "dropped_phantom", "something_new"]) {
      expect(missedJourneySourceAllowed(s, false)).toBe(false);
    }
  });
});

describe("digestCountsFor", () => {
  const day = { trips: 3, miles: 12.5, walks: 2, unclassified: 1 };

  it("leaves the counts alone when on or unknown", () => {
    expect(digestCountsFor(day, true)).toEqual(day);
    expect(digestCountsFor(day, null)).toEqual(day);
  });

  it("drops the walk count when off", () => {
    expect(digestCountsFor(day, false)).toEqual({ ...day, walks: 0 });
  });

  it("sends nothing when off and walks were the only news", () => {
    expect(digestCountsFor({ trips: 0, miles: 0, walks: 2, unclassified: 0 }, false)).toBeNull();
  });

  it("still sends a trip-less day with trips to sort", () => {
    expect(digestCountsFor({ trips: 0, miles: 0, walks: 2, unclassified: 1 }, false)).toEqual({
      trips: 0, miles: 0, walks: 0, unclassified: 1,
    });
  });
});
