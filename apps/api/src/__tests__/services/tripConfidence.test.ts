import { describe, it, expect } from "vitest";
import { computeTripConfidence } from "../../services/tripConfidence.js";

const trackedBase = {
  isManualEntry: false,
  coordinateCount: 30,
  hasMatchedPolyline: true,
  distanceMiles: 12,
  durationSecs: 1800,
  hasEndCoords: true,
  gpsQuality: null,
} as const;

const manualBase = {
  isManualEntry: true,
  coordinateCount: 0,
  hasMatchedPolyline: false,
  distanceMiles: 12,
  durationSecs: 1800,
  hasEndCoords: true,
  gpsQuality: null,
} as const;

describe("computeTripConfidence", () => {
  describe("tracked trips", () => {
    it("returns high for a well-tracked + map-matched trip", () => {
      const result = computeTripConfidence({ ...trackedBase });
      expect(result.level).toBe("high");
      expect(result.reasons.some((r) => r.includes("GPS samples"))).toBe(true);
      expect(result.reasons.some((r) => r.includes("map-matching"))).toBe(true);
    });

    it("downgrades to medium when no map-match exists", () => {
      const result = computeTripConfidence({
        ...trackedBase,
        hasMatchedPolyline: false,
      });
      expect(result.level).toBe("medium");
      expect(result.reasons.some((r) => r.includes("No road-network match"))).toBe(true);
    });

    it("downgrades to medium when sample count is small but match exists", () => {
      const result = computeTripConfidence({
        ...trackedBase,
        coordinateCount: 8,
      });
      expect(result.level).toBe("medium");
      expect(result.reasons.some((r) => r.includes("sparse trail"))).toBe(true);
    });

    it("returns low when sparse trail AND no match", () => {
      const result = computeTripConfidence({
        ...trackedBase,
        coordinateCount: 5,
        hasMatchedPolyline: false,
      });
      expect(result.level).toBe("low");
    });

    it("returns low when zero GPS samples", () => {
      const result = computeTripConfidence({
        ...trackedBase,
        coordinateCount: 0,
        hasMatchedPolyline: false,
      });
      expect(result.level).toBe("low");
      expect(result.reasons.some((r) => r.includes("No GPS samples"))).toBe(true);
    });

    it("downgrades on unrealistically high avg speed", () => {
      const result = computeTripConfidence({
        ...trackedBase,
        distanceMiles: 100,
        durationSecs: 1800, // 200 mph
      });
      expect(result.level).toBe("low");
      expect(result.reasons.some((r) => r.includes("unrealistically high"))).toBe(true);
    });

    it("downgrades on suspiciously low avg speed", () => {
      const result = computeTripConfidence({
        ...trackedBase,
        distanceMiles: 0.05,
        durationSecs: 1800, // 0.1 mph
      });
      expect(result.level).toBe("low");
    });

    it("downgrades from high to medium when avg GPS accuracy is poor", () => {
      const result = computeTripConfidence({
        ...trackedBase,
        gpsQuality: { avgAccuracyMeters: 80 },
      });
      expect(result.level).toBe("medium");
      expect(result.reasons.some((r) => r.includes("80 m"))).toBe(true);
    });

    it("does not downgrade when avg accuracy is good", () => {
      const result = computeTripConfidence({
        ...trackedBase,
        gpsQuality: { avgAccuracyMeters: 10 },
      });
      expect(result.level).toBe("high");
    });
  });

  describe("manual trips", () => {
    it("returns medium for manual with end coords + sane speed", () => {
      const result = computeTripConfidence({ ...manualBase });
      expect(result.level).toBe("medium");
      expect(result.reasons[0]).toContain("road-routing");
    });

    it("returns low when missing end coords", () => {
      const result = computeTripConfidence({
        ...manualBase,
        hasEndCoords: false,
      });
      expect(result.level).toBe("low");
      expect(result.reasons[0]).toContain("No end location");
    });

    it("returns low when manual avg speed is implausible", () => {
      const result = computeTripConfidence({
        ...manualBase,
        distanceMiles: 200,
        durationSecs: 1800, // 400 mph
      });
      expect(result.level).toBe("low");
    });

    it("ignores speed sanity when duration is missing", () => {
      const result = computeTripConfidence({
        ...manualBase,
        durationSecs: null,
      });
      expect(result.level).toBe("medium");
    });
  });
});
