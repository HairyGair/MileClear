/**
 * Tests for walk detection.
 *
 * The bias under test is asymmetry: a "walk" verdict suppresses somebody's
 * trip, so it must require positive on-foot evidence, while "unknown" is
 * always safe. Most of these cases exist to prove the rule stays quiet.
 */
import { describe, it, expect } from "vitest";
import {
  summariseMotion,
  computeSustainedSpeedMph,
  decideWalk,
  MOTION_MIN_CONFIDENCE,
} from "./walk.js";

/** Build a straight north-running trace at a constant speed. */
function trace(
  mph: number,
  fixes: number,
  stepSec = 15,
  start = "2026-09-13T09:00:00.000Z"
) {
  const MILES_PER_DEG_LAT = 69.0547;
  const t0 = new Date(start).getTime();
  const out: { lat: number; lng: number; recorded_at: string }[] = [];
  for (let i = 0; i < fixes; i++) {
    const miles = (mph * (i * stepSec)) / 3600;
    out.push({
      lat: 53.5 + miles / MILES_PER_DEG_LAT,
      lng: -0.32,
      recorded_at: new Date(t0 + i * stepSec * 1000).toISOString(),
    });
  }
  return out;
}

function motionFixes(kind: string, n: number, confidence = 100) {
  return Array.from({ length: n }, () => ({
    activity: kind,
    activity_confidence: confidence,
  }));
}

describe("summariseMotion", () => {
  it("counts on-foot kinds together", () => {
    const s = summariseMotion([
      ...motionFixes("walking", 4),
      ...motionFixes("running", 2),
      ...motionFixes("on_foot", 2),
    ]);
    expect(s.fixes).toBe(8);
    expect(s.onFoot).toBe(8);
    expect(s.pctOnFoot).toBe(1);
  });

  it("ignores unknown and unclassified fixes entirely", () => {
    const s = summariseMotion([
      ...motionFixes("unknown", 50),
      ...motionFixes("walking", 6),
      { activity: null },
      {},
    ]);
    expect(s.fixes).toBe(6);
    expect(s.pctOnFoot).toBe(1);
  });

  it("ignores classifications below the confidence floor", () => {
    const s = summariseMotion([
      ...motionFixes("walking", 10, MOTION_MIN_CONFIDENCE - 1),
      ...motionFixes("in_vehicle", 6),
    ]);
    expect(s.fixes).toBe(6);
    expect(s.pctInVehicle).toBe(1);
  });

  it("refuses to compute proportions from too thin a sample", () => {
    const s = summariseMotion(motionFixes("walking", 3));
    expect(s.fixes).toBe(3);
    expect(s.pctOnFoot).toBeNull();
    expect(s.pctInVehicle).toBeNull();
  });

  it("treats a missing confidence as usable", () => {
    const s = summariseMotion(
      Array.from({ length: 6 }, () => ({ activity: "walking" }))
    );
    expect(s.fixes).toBe(6);
  });
});

describe("computeSustainedSpeedMph", () => {
  it("recovers a steady driving speed from geometry alone", () => {
    const v = computeSustainedSpeedMph(trace(30, 20));
    expect(v).toBeGreaterThan(28);
    expect(v).toBeLessThan(32);
  });

  it("recovers a walking pace", () => {
    const v = computeSustainedSpeedMph(trace(3, 40));
    expect(v).toBeGreaterThan(2.5);
    expect(v).toBeLessThan(3.5);
  });

  it("has no opinion when the trip is shorter than one window", () => {
    expect(computeSustainedSpeedMph(trace(30, 2, 5))).toBeNull();
  });

  it("has no opinion on a single fix or an empty trace", () => {
    expect(computeSustainedSpeedMph([])).toBeNull();
    expect(computeSustainedSpeedMph(trace(30, 1))).toBeNull();
  });

  it("has no opinion when timestamps are missing", () => {
    expect(
      computeSustainedSpeedMph([
        { lat: 53.5, lng: -0.3 },
        { lat: 53.6, lng: -0.3 },
      ])
    ).toBeNull();
  });

  it("is not fooled by one implausible jump", () => {
    // A walk with a single cell-tower teleport in the middle.
    const t = trace(3, 40);
    t[20] = { ...t[20], lat: t[20].lat + 3 };
    const v = computeSustainedSpeedMph(t);
    expect(v).not.toBeNull();
    expect(v!).toBeLessThan(12);
  });

  it("reports the sustained speed, not the average, for a stop-start drive", () => {
    // Ten minutes parked, then five minutes at 40 mph.
    const parked = Array.from({ length: 40 }, (_, i) => ({
      lat: 53.5,
      lng: -0.32,
      recorded_at: new Date(Date.UTC(2026, 8, 13, 9, 0, 0) + i * 15000).toISOString(),
    }));
    const moving = trace(40, 20, 15, "2026-09-13T09:10:00.000Z");
    const v = computeSustainedSpeedMph([...parked, ...moving]);
    expect(v).toBeGreaterThan(30);
  });
});

describe("decideWalk - driving evidence wins", () => {
  const base = { distanceMiles: 2, durationSec: 900 };

  it("calls a sustained driving speed a drive", () => {
    expect(
      decideWalk({ ...base, sustainedSpeedMph: 25, motion: null }).verdict
    ).toBe("drive");
  });

  it("calls an in-vehicle trace a drive even at crawling speed", () => {
    const d = decideWalk({
      ...base,
      sustainedSpeedMph: 4,
      motion: summariseMotion(motionFixes("in_vehicle", 20)),
    });
    expect(d.verdict).toBe("drive");
    expect(d.reason).toBe("motion_in_vehicle");
  });

  it("does not call a mixed walk-then-drive trace a walk", () => {
    // Walked to the car, then drove. The driving miles are real.
    const d = decideWalk({
      ...base,
      sustainedSpeedMph: 9,
      motion: summariseMotion([
        ...motionFixes("walking", 14),
        ...motionFixes("in_vehicle", 6),
      ]),
    });
    expect(d.verdict).not.toBe("walk");
  });

  it("never calls a real drive a walk just because motion data is missing", () => {
    expect(
      decideWalk({
        distanceMiles: 40,
        durationSec: 3600,
        sustainedSpeedMph: null,
        motion: null,
        steps: null,
      }).verdict
    ).toBe("unknown");
  });
});

describe("decideWalk - walking pace (15 Sep 2026, the golf round)", () => {
  // Anthony's 18:24 recording: 27 fixes, 16 min, sustained 3.2 mph, p95 3.3,
  // device peak 3.8 mph, coprocessor 76% in_vehicle (trolley), 714 steps.
  const golf = {
    distanceMiles: 1.31,
    durationSec: 16 * 60,
    sustainedSpeedMph: 3.2,
    sustainedSpeedP95Mph: 3.3,
    deviceMaxSpeedMph: 3.8,
    fixes: 27,
    motion: summariseMotion([
      ...motionFixes("in_vehicle", 13),
      ...motionFixes("still", 4),
    ]),
    steps: 714,
  };

  it("calls a long walking-pace recording a walk even when the coprocessor says vehicle", () => {
    const d = decideWalk(golf);
    expect(d.verdict).toBe("walk");
    expect(d.reason).toBe("walk_pace");
  });

  it("still trusts the coprocessor when any window reached running pace (a jam with real driving)", () => {
    const d = decideWalk({ ...golf, sustainedSpeedP95Mph: 15 });
    expect(d.verdict).toBe("drive");
    expect(d.reason).toBe("motion_in_vehicle");
  });

  it("refuses the pace verdict when the device itself saw a driving speed", () => {
    expect(decideWalk({ ...golf, deviceMaxSpeedMph: 14 }).verdict).toBe("drive");
  });

  it("refuses the pace verdict on a short or sparse recording", () => {
    expect(decideWalk({ ...golf, durationSec: 5 * 60 }).verdict).toBe("drive");
    expect(decideWalk({ ...golf, fixes: 10 }).verdict).toBe("drive");
  });

  it("refuses the pace verdict when the window speed is unknown", () => {
    expect(decideWalk({ ...golf, sustainedSpeedP95Mph: null }).verdict).toBe("drive");
  });

  it("gives Android its first walk verdict, from pace alone, when the trace is dense", () => {
    const d = decideWalk({ ...golf, motion: null, steps: null });
    expect(d.verdict).toBe("walk");
    expect(d.reason).toBe("walk_pace");
  });
});

describe("decideWalk - positive on-foot evidence", () => {
  it("calls a walk a walk, however far it went", () => {
    // The 2-mile dog walk the current distance cap never even considers.
    const d = decideWalk({
      distanceMiles: 2.1,
      durationSec: 2700,
      sustainedSpeedMph: 3.2,
      motion: summariseMotion(motionFixes("walking", 60)),
    });
    expect(d.verdict).toBe("walk");
    expect(d.reason).toBe("motion_on_foot");
  });

  it("accepts a step cadence when there is no motion classification", () => {
    const d = decideWalk({
      distanceMiles: 1.4,
      durationSec: 1800,
      sustainedSpeedMph: 3,
      motion: null,
      steps: 3000, // 100/min
    });
    expect(d.verdict).toBe("walk");
    expect(d.reason).toBe("step_cadence");
  });

  it("ignores a step count over too short a window to mean anything", () => {
    expect(
      decideWalk({
        distanceMiles: 0.4,
        durationSec: 60,
        sustainedSpeedMph: 3,
        motion: null,
        steps: 200,
      }).verdict
    ).toBe("unknown");
  });

  it("treats zero steps as no evidence, not as evidence of driving", () => {
    // Motion & Fitness denied reports zero. That must not read as a drive.
    const d = decideWalk({
      distanceMiles: 1,
      durationSec: 1800,
      sustainedSpeedMph: 3,
      motion: null,
      steps: 0,
    });
    expect(d.verdict).toBe("unknown");
  });

  it("does not call a runner a driver", () => {
    const d = decideWalk({
      distanceMiles: 5,
      durationSec: 2400,
      sustainedSpeedMph: 9,
      motion: summariseMotion(motionFixes("running", 40)),
    });
    expect(d.verdict).toBe("walk");
  });

  it("stays quiet on Android, where no motion signal exists", () => {
    const d = decideWalk({
      distanceMiles: 2,
      durationSec: 2400,
      sustainedSpeedMph: 4,
      motion: summariseMotion([]),
      steps: null,
    });
    expect(d.verdict).toBe("unknown");
    expect(d.reason).toBe("no_motion_evidence");
  });

  it("stays quiet when the phone moved faster than a runner but proved nothing", () => {
    const d = decideWalk({
      distanceMiles: 3,
      durationSec: 900,
      sustainedSpeedMph: 14,
      motion: null,
    });
    expect(d.verdict).toBe("unknown");
    expect(d.reason).toBe("too_fast_for_walk");
  });
});
