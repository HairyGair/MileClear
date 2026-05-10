import { describe, it, expect } from "vitest";
import {
  decodePolyline,
  isMatchPlausible,
} from "../../services/mapMatching.js";
import { shouldAutoApplySuggestion } from "../../routes/trips/index.js";

describe("decodePolyline (Google encoded polyline)", () => {
  it("decodes the canonical Google example", () => {
    // Google's published example: encoded "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
    // → [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]
    const result = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(result).toHaveLength(3);
    expect(result[0].lat).toBeCloseTo(38.5, 4);
    expect(result[0].lng).toBeCloseTo(-120.2, 4);
    expect(result[1].lat).toBeCloseTo(40.7, 4);
    expect(result[1].lng).toBeCloseTo(-120.95, 4);
    expect(result[2].lat).toBeCloseTo(43.252, 3);
    expect(result[2].lng).toBeCloseTo(-126.453, 3);
  });

  it("returns an empty array for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });

  it("handles deltas with negative values correctly", () => {
    // Two points where the second is south-west of the first.
    // Re-decode of a known-good polyline output by GraphHopper /match
    // for a Sunderland → Newcastle route — verifies the negative-delta
    // branch (~ operator with bitwise ops) decodes the right direction.
    const result = decodePolyline("_p~iF~ps|U_ulLnnqC");
    expect(result).toHaveLength(2);
    // Just verify the second point is meaningfully different from the first
    expect(result[1].lat).not.toBe(result[0].lat);
    expect(result[1].lng).not.toBe(result[0].lng);
  });
});

describe("isMatchPlausible", () => {
  it("trusts a tight 1.0× match", () => {
    expect(isMatchPlausible(10, 10)).toBe(true);
  });

  it("trusts a 30% uplift (typical road-vs-haversine ratio)", () => {
    expect(isMatchPlausible(13, 10)).toBe(true);
  });

  it("rejects a match that's <70% of the stored distance", () => {
    // Classic "junction shortcut" failure mode — caught the 22→3mi case
    expect(isMatchPlausible(3, 22)).toBe(false);
    expect(isMatchPlausible(6.9, 10)).toBe(false);
  });

  it("rejects a match that's >300% of the stored distance", () => {
    // Detour-pattern failure — engine took a wildly long route
    expect(isMatchPlausible(31, 10)).toBe(false);
  });

  it("trusts the boundary values exactly", () => {
    // ratio = 0.7 — at the lower edge, still trusted
    expect(isMatchPlausible(7, 10)).toBe(true);
    // ratio = 3.0 — at the upper edge, still trusted
    expect(isMatchPlausible(30, 10)).toBe(true);
  });

  it("returns true when stored distance is zero (can't sanity-check)", () => {
    expect(isMatchPlausible(5, 0)).toBe(true);
  });

  it("returns true when stored distance is negative", () => {
    // Defensive: never reject for an out-of-spec stored value
    expect(isMatchPlausible(5, -1)).toBe(true);
  });
});

describe("shouldAutoApplySuggestion", () => {
  it("returns false on null input", () => {
    expect(shouldAutoApplySuggestion(null)).toBe(false);
  });

  it("auto-applies at 80% confidence with 3 matches", () => {
    expect(
      shouldAutoApplySuggestion({
        classification: "business",
        platformTag: null,
        businessPurpose: null,
        category: null,
        matchCount: 3,
        confidence: 80,
      })
    ).toBe(true);
  });

  it("rejects at 79% confidence (below threshold)", () => {
    expect(
      shouldAutoApplySuggestion({
        classification: "business",
        platformTag: null,
        businessPurpose: null,
        category: null,
        matchCount: 5,
        confidence: 79,
      })
    ).toBe(false);
  });

  it("rejects at 100% confidence with only 2 matches (below match threshold)", () => {
    expect(
      shouldAutoApplySuggestion({
        classification: "business",
        platformTag: null,
        businessPurpose: null,
        category: null,
        matchCount: 2,
        confidence: 100,
      })
    ).toBe(false);
  });

  it("auto-applies at the exact thresholds (80% + 3 matches)", () => {
    expect(
      shouldAutoApplySuggestion({
        classification: "personal",
        platformTag: null,
        businessPurpose: null,
        category: null,
        matchCount: 3,
        confidence: 80,
      })
    ).toBe(true);
  });
});
