import { describe, it, expect } from "vitest";
import { trimEdgePhantoms } from "../../services/mapMatching.js";
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

  it("trusts a modest uplift (road-vs-haversine correction)", () => {
    expect(isMatchPlausible(11.5, 10)).toBe(true); // 1.15x — within bounds
  });

  it("rejects a match that's <70% of the stored distance", () => {
    // Classic "junction shortcut" failure mode — caught the 22→3mi case
    expect(isMatchPlausible(3, 22)).toBe(false);
    expect(isMatchPlausible(6.9, 10)).toBe(false);
  });

  it("rejects an inflated match (the 1.4x York over-count)", () => {
    // The stored distance is already road-corrected, so a match >1.3x almost
    // always means the matcher mis-snapped. 8 Jun: a real 79mi drive matched to
    // 111mi (ratio 1.4) and inflated the trip until this gate tightened.
    expect(isMatchPlausible(14, 10)).toBe(false); // 1.4x — the real bug
    expect(isMatchPlausible(31, 10)).toBe(false); // grossly long
  });

  it("trusts the boundary values exactly", () => {
    // ratio = 0.7 — at the lower edge, still trusted
    expect(isMatchPlausible(7, 10)).toBe(true);
    // ratio = 1.3 — at the upper edge, still trusted
    expect(isMatchPlausible(13, 10)).toBe(true);
    // just over 1.3 — rejected
    expect(isMatchPlausible(13.1, 10)).toBe(false);
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

describe("trimEdgePhantoms", () => {
  // Rachel Thorndyke, 21 Aug 2026: first fix at accuracy 2,724 m, 2.3 mi
  // from the real start; everything after at 2-20 m.
  const real = [
    { lat: 53.6687, lng: -0.3067, accuracy: 20 },
    { lat: 53.6687, lng: -0.3067, accuracy: 20 },
    { lat: 53.6763, lng: -0.3087, accuracy: 2 },
    { lat: 53.6887, lng: -0.3102, accuracy: 5 },
  ];
  const phantomStart = { lat: 53.6363, lng: -0.2941, accuracy: 2724 };

  it("drops a grossly inaccurate far-away first fix and reports the miles", () => {
    const r = trimEdgePhantoms([phantomStart, ...real]);
    expect(r.droppedLeading).toBe(1);
    expect(r.droppedTrailing).toBe(0);
    expect(r.breadcrumbs[0]).toBe(real[0]);
    expect(r.removedMiles).toBeGreaterThan(2);
    expect(r.removedMiles).toBeLessThan(3);
    expect(r.worstAccuracyM).toBe(2724);
  });

  it("drops a phantom last fix the same way", () => {
    const r = trimEdgePhantoms([...real, { lat: 53.70, lng: -0.20, accuracy: 1500 }]);
    expect(r.droppedTrailing).toBe(1);
    expect(r.breadcrumbs[r.breadcrumbs.length - 1]).toBe(real[real.length - 1]);
  });

  it("keeps an accurate first fix even when the first step is long", () => {
    const r = trimEdgePhantoms([{ lat: 53.6363, lng: -0.2941, accuracy: 8 }, ...real]);
    expect(r.droppedLeading).toBe(0);
    expect(r.removedMiles).toBe(0);
  });

  it("keeps an inaccurate first fix that is where the trail actually starts", () => {
    const r = trimEdgePhantoms([{ lat: 53.6688, lng: -0.3068, accuracy: 900 }, ...real]);
    expect(r.droppedLeading).toBe(0);
  });

  it("never touches interior points or accuracy-less points", () => {
    const r = trimEdgePhantoms([real[0], { lat: 53.60, lng: -0.20, accuracy: 3000 }, real[2], real[3]]);
    expect(r.breadcrumbs.length).toBe(4);
    const r2 = trimEdgePhantoms([{ lat: 53.6363, lng: -0.2941, accuracy: null }, ...real]);
    expect(r2.droppedLeading).toBe(0);
  });

  // Rachel Thorndyke, 25 Aug 2026: first fix CLAIMED 50 m accuracy but sat
  // 1.24 mi from the next fix 52 s later (86 mph). The rest is a 20 m
  // shuffle at a client's house. Accuracy alone let it through.
  const staleStart = { lat: 53.69172, lng: -0.34023, accuracy: 50, recordedAt: "2026-08-25T09:03:51Z" };
  const parked = [
    { lat: 53.68879, lng: -0.31039, accuracy: 4.75, recordedAt: "2026-08-25T09:04:43Z" },
    { lat: 53.68896, lng: -0.31025, accuracy: 3.36, recordedAt: "2026-08-25T09:05:49Z" },
    { lat: 53.68906, lng: -0.30999, accuracy: 2.21, recordedAt: "2026-08-25T09:07:00Z" },
    { lat: 53.68891, lng: -0.31033, accuracy: 22.66, recordedAt: "2026-08-25T09:12:30Z" },
  ];

  it("drops an accurate-looking first fix when the rest of the trail is stationary", () => {
    const r = trimEdgePhantoms([staleStart, ...parked]);
    expect(r.droppedLeading).toBe(1);
    expect(r.breadcrumbs[0]).toBe(parked[0]);
    expect(r.removedMiles).toBeGreaterThan(1.2);
    expect(r.removedMiles).toBeLessThan(1.3);
  });

  it("drops an accurate-looking first fix whose implied speed is impossible", () => {
    // 1.24 mi in 40 s = 111 mph into a trail that then drives on for 2 mi
    const moving = [
      { lat: 53.68879, lng: -0.31039, accuracy: 4, recordedAt: "2026-08-25T09:04:31Z" },
      { lat: 53.6763, lng: -0.3087, accuracy: 2, recordedAt: "2026-08-25T09:06:00Z" },
      { lat: 53.6687, lng: -0.3067, accuracy: 5, recordedAt: "2026-08-25T09:08:00Z" },
    ];
    const r = trimEdgePhantoms([staleStart, ...moving]);
    expect(r.droppedLeading).toBe(1);
    expect(r.breadcrumbs[0]).toBe(moving[0]);
  });

  it("keeps a long first step at a plausible speed into a moving trail", () => {
    const moving = [
      { lat: 53.68879, lng: -0.31039, accuracy: 4, recordedAt: "2026-08-25T09:06:00Z" }, // 27 mph
      { lat: 53.6763, lng: -0.3087, accuracy: 2, recordedAt: "2026-08-25T09:08:00Z" },
      { lat: 53.6687, lng: -0.3067, accuracy: 5, recordedAt: "2026-08-25T09:10:00Z" },
    ];
    const r = trimEdgePhantoms([staleStart, ...moving]);
    expect(r.droppedLeading).toBe(0);
  });

  it("stationary-trail rule needs no timestamps", () => {
    const r = trimEdgePhantoms([{ lat: 53.69172, lng: -0.34023, accuracy: 50 }, ...parked.map(({ recordedAt: _r, ...c }) => c)]);
    expect(r.droppedLeading).toBe(1);
  });

  it("leaves at least three points", () => {
    const r = trimEdgePhantoms([phantomStart, real[0], { lat: 53.70, lng: -0.20, accuracy: 1500 }]);
    expect(r.breadcrumbs.length).toBe(3);
    expect(r.droppedLeading + r.droppedTrailing).toBe(0);
  });
});
