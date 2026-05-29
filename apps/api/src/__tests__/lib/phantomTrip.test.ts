/**
 * Tests for phantom-trip detection and the real-movement-evidence override
 * that rescues genuine sparse-GPS drives (audit Track A #5/#7, golf-club case).
 */
import { describe, it, expect } from "vitest";
import { looksLikePhantomTrip, hasRealMovementEvidence } from "../../lib/phantomTrip.js";

const base = {
  startedAt: "2026-05-29T15:00:00.000Z",
  endedAt: "2026-05-29T15:12:00.000Z", // 12 min
  isManualEntry: false,
};

describe("looksLikePhantomTrip - crow-flies signature", () => {
  it("flags an auto trip with <3 coords and >=1 mile", () => {
    expect(
      looksLikePhantomTrip({ ...base, distanceMiles: 2, coordinateCount: 2 })
    ).toBe(true);
  });

  it("does not flag a manual entry", () => {
    expect(
      looksLikePhantomTrip({ ...base, isManualEntry: true, distanceMiles: 2, coordinateCount: 2 })
    ).toBe(false);
  });

  it("does not flag a dense auto trip", () => {
    expect(
      looksLikePhantomTrip({ ...base, distanceMiles: 2, coordinateCount: 20 })
    ).toBe(false);
  });

  it("RESCUES a sparse trip when real-movement evidence is present", () => {
    expect(
      looksLikePhantomTrip({
        ...base,
        distanceMiles: 2,
        coordinateCount: 2,
        hasRealMovementEvidence: true,
      })
    ).toBe(false);
  });
});

describe("looksLikePhantomTrip - walking signature", () => {
  const walk = {
    ...base,
    endedAt: "2026-05-29T15:30:00.000Z", // 30 min
    distanceMiles: 0.5, // <1 mile, long duration => avg ~1mph
  };

  it("flags a slow short walk", () => {
    expect(looksLikePhantomTrip({ ...walk, coordinateCount: 40 })).toBe(true);
  });

  it("real-movement evidence does NOT rescue the walking signature", () => {
    // A stationary GPS-drift walk also has many raw coords, so evidence must
    // not suppress this branch.
    expect(
      looksLikePhantomTrip({ ...walk, coordinateCount: 40, hasRealMovementEvidence: true })
    ).toBe(true);
  });
});

describe("hasRealMovementEvidence", () => {
  it("true when OSRM map-match succeeded", () => {
    expect(hasRealMovementEvidence({ matchSucceeded: true })).toBe(true);
    expect(hasRealMovementEvidence({ distanceSource: "match" })).toBe(true);
  });

  it("true when the raw trace was dense (weak-signal filtering)", () => {
    // golf-club shape: many raw fixes captured, most dropped as low-accuracy
    expect(hasRealMovementEvidence({ rawCoords: 30, keptCoords: 2 })).toBe(true);
    expect(hasRealMovementEvidence({ rawCount: 30 })).toBe(true); // alias tolerated
  });

  it("false for a genuine 2-point chord (no dense trace, no match)", () => {
    expect(
      hasRealMovementEvidence({ rawCoords: 2, keptCoords: 2, matchSucceeded: false })
    ).toBe(false);
  });

  it("false on malformed / missing blob (fail safe)", () => {
    expect(hasRealMovementEvidence(null)).toBe(false);
    expect(hasRealMovementEvidence(undefined)).toBe(false);
    expect(hasRealMovementEvidence("nonsense")).toBe(false);
    expect(hasRealMovementEvidence({})).toBe(false);
  });
});
