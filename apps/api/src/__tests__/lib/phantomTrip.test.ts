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

describe("looksLikePhantomTrip - teleport / cell-tower signature", () => {
  // Rachel Thorndyke, 26 Aug 2026. Two "trips" arrived while she was parked at
  // a farm: one cell-tower fix a mile and a half out, one real fix, nothing in
  // between. Both carried lowConfidence, which used to buy an exemption from
  // the crow-flies rule, so both were counted as business mileage.
  const teleport41a50632 = {
    startedAt: "2026-08-26T17:25:08.000Z",
    endedAt: "2026-08-26T17:25:09.000Z",
    isManualEntry: false,
    distanceMiles: 1.56,
    coordinateCount: 2,
    lowConfidence: true,
    maxSpeedMph: null,
    avgAccuracyM: 1174,
  };
  const teleportD109f586 = {
    startedAt: "2026-08-26T18:07:16.000Z",
    endedAt: "2026-08-26T18:07:19.000Z",
    isManualEntry: false,
    distanceMiles: 1.96,
    coordinateCount: 2,
    lowConfidence: true,
    maxSpeedMph: 3,
    avgAccuracyM: 1195,
  };

  it("flags a mile and a half covered in one second", () => {
    expect(looksLikePhantomTrip(teleport41a50632)).toBe(true);
  });

  it("flags it in three seconds too, with a walking speed on the fix", () => {
    expect(looksLikePhantomTrip(teleportD109f586)).toBe(true);
  });

  it("outranks lowConfidence, dense raw traces and a claimed driving speed", () => {
    expect(
      looksLikePhantomTrip({
        ...teleport41a50632,
        lowConfidence: true,
        hasRealMovementEvidence: true,
        maxSpeedMph: 60,
      })
    ).toBe(true);
  });

  it("flags a zero-duration chord, where speed cannot be computed at all", () => {
    expect(
      looksLikePhantomTrip({
        ...teleport41a50632,
        endedAt: teleport41a50632.startedAt,
      })
    ).toBe(true);
  });

  it("flags two cell-tower fixes minutes apart, where the speed looks fine", () => {
    // 0.9 mi in 6 minutes is 9 mph — nothing the speed rules would object to.
    // The accuracy is the tell: neither fix was ever GPS.
    expect(
      looksLikePhantomTrip({
        startedAt: "2026-08-26T18:00:00.000Z",
        endedAt: "2026-08-26T18:06:00.000Z",
        isManualEntry: false,
        distanceMiles: 0.9,
        coordinateCount: 2,
        avgAccuracyM: 1400,
        maxSpeedMph: 2,
        lowConfidence: true,
      })
    ).toBe(true);
  });

  it("spares Jenkins: Liverpool to Leeds, 58 miles, middle lost to suspension", () => {
    expect(
      looksLikePhantomTrip({
        startedAt: "2026-08-03T09:00:00.000Z",
        endedAt: "2026-08-03T12:10:00.000Z",
        isManualEntry: false,
        distanceMiles: 58.24,
        coordinateCount: 2,
        lowConfidence: true,
        avgAccuracyM: 12,
      })
    ).toBe(false);
  });

  it("spares a sparse drive whose fixes were genuinely GPS", () => {
    expect(
      looksLikePhantomTrip({
        startedAt: "2026-08-26T18:00:00.000Z",
        endedAt: "2026-08-26T18:09:00.000Z",
        isManualEntry: false,
        distanceMiles: 2.4,
        coordinateCount: 2,
        lowConfidence: true,
        avgAccuracyM: 18,
        maxSpeedMph: 31,
      })
    ).toBe(false);
  });

  it("spares a manual entry typed at one instant", () => {
    expect(
      looksLikePhantomTrip({ ...teleport41a50632, isManualEntry: true })
    ).toBe(false);
  });

  it("ignores a teleport too short to matter", () => {
    expect(
      looksLikePhantomTrip({ ...teleport41a50632, distanceMiles: 0.1 })
    ).toBe(false);
  });
});

describe("looksLikePhantomTrip - never got going", () => {
  // Rachel Thorndyke, 27 Aug 2026. She deleted this one by hand: 0.49 miles
  // over 5m34s in a farmyard while she worked, top speed 5 mph. The walking
  // rule missed it because the AVERAGE came out at 5.28 mph, just over its bar.
  const farmyardDrift = {
    startedAt: "2026-08-27T16:07:14.000Z",
    endedAt: "2026-08-27T16:12:48.000Z",
    isManualEntry: false,
    distanceMiles: 0.49,
    coordinateCount: 7,
    maxSpeedMph: 5,
    avgAccuracyM: 22,
  };

  it("flags a short trip that never got above walking pace", () => {
    expect(looksLikePhantomTrip(farmyardDrift)).toBe(true);
  });

  it("does not hinge on the average, which was over the walking bar", () => {
    const durationHours = (5 * 60 + 34) / 3600;
    expect(farmyardDrift.distanceMiles / durationHours).toBeGreaterThan(5);
  });

  it("spares a short trip that did reach a driving speed", () => {
    expect(looksLikePhantomTrip({ ...farmyardDrift, maxSpeedMph: 22 })).toBe(false);
  });

  it("spares a long slow crawl, where the distance says a journey happened", () => {
    // Two miles at a top speed of 5 mph is odd, but it is two miles.
    expect(
      looksLikePhantomTrip({ ...farmyardDrift, distanceMiles: 2.0, maxSpeedMph: 5 })
    ).toBe(false);
  });

  it("says nothing when the device reported no speed at all", () => {
    // Absent is not slow. Older rows and some engines send nothing.
    expect(
      looksLikePhantomTrip({
        ...farmyardDrift,
        maxSpeedMph: null,
        startedAt: "2026-08-27T16:07:14.000Z",
        endedAt: "2026-08-27T16:09:14.000Z", // 2 min, under the walking rule's window
      })
    ).toBe(false);
  });

  it("spares a manual entry", () => {
    expect(looksLikePhantomTrip({ ...farmyardDrift, isManualEntry: true })).toBe(false);
  });
});
