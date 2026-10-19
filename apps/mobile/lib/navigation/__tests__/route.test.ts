import { describe, it, expect } from "vitest";
import { distanceMeters, offset, projectOnSegment, bearingDiff } from "../geo";
import {
  distanceToStep,
  prepareRoute,
  remainingSeconds,
  snapToRoute,
  speedLimitAt,
  stepIndexAt,
} from "../route";
import { buildRoute, READING, roundaboutArc, routeLine, pointAt } from "./fixtures";

describe("geo", () => {
  it("distance and offset agree", () => {
    const b = offset(READING, 90, 1000);
    expect(distanceMeters(READING, b)).toBeCloseTo(1000, 0);
  });
  it("projects onto a segment and clamps at its ends", () => {
    const a = READING;
    const b = offset(a, 90, 200);
    const mid = offset(offset(a, 90, 100), 0, 30);
    const p = projectOnSegment(mid, a, b);
    expect(p.t).toBeCloseTo(0.5, 2);
    expect(p.distance).toBeCloseTo(30, 0);
    const beyond = offset(b, 90, 50);
    expect(projectOnSegment(beyond, a, b).t).toBe(1);
  });
  it("bearing difference wraps", () => {
    expect(bearingDiff(350, 10)).toBe(20);
    expect(bearingDiff(90, 270)).toBe(180);
  });
});

// Out 300 m east, U-turn, back 300 m west on the same road, then left.
const uturnRoute = buildRoute(READING, [
  { step: { type: "depart", streetName: "Kings Road" }, pieces: [{ bearing: 90, metres: 300 }] },
  { step: { type: "uturn", streetName: "Kings Road" }, pieces: [{ bearing: 270, metres: 300 }] },
  { step: { type: "turn", modifier: "left", streetName: "Queens Road" }, pieces: [{ bearing: 180, metres: 400 }] },
]);

describe("prepareRoute", () => {
  it("measures the line and places each manoeuvre on it", () => {
    const r = prepareRoute(uturnRoute);
    expect(r.total).toBeCloseTo(1000, -1);
    expect(r.stepAlong[0]).toBe(0);
    expect(r.stepAlong[1]).toBeCloseTo(300, 0);
    expect(r.stepAlong[2]).toBeCloseTo(600, 0);
    expect(r.stepAlong[3]).toBeCloseTo(1000, -1);
  });
});

describe("snapToRoute", () => {
  const r = prepareRoute(uturnRoute);
  const line = routeLine(uturnRoute);

  it("on the outbound leg it stays outbound, though the return leg is on top of it", () => {
    const at150 = pointAt(line, 150).p;
    const snap = snapToRoute(r, { ...at150, courseDeg: 90, speedMps: 13, atMs: 2000 }, { along: 140, atMs: 1000 });
    expect(snap!.along).toBeCloseTo(150, -1);
  });

  it("on the way back the same spot is the return leg", () => {
    const at150 = pointAt(line, 150).p; // same place as along 450
    const snap = snapToRoute(r, { ...at150, courseDeg: 270, speedMps: 13, atMs: 2000 }, { along: 440, atMs: 1000 });
    expect(snap!.along).toBeCloseTo(450, -1);
  });

  it("stopped (no direction) on the return leg still does not jump back to the outbound pass", () => {
    const at150 = pointAt(line, 150).p;
    const snap = snapToRoute(r, { ...at150, courseDeg: null, speedMps: 0, atMs: 2000 }, { along: 450, atMs: 1000 });
    expect(snap!.along).toBeCloseTo(450, -1);
  });

  it("with no anchor, picks the earliest pass", () => {
    const at150 = pointAt(line, 150).p;
    const snap = snapToRoute(r, { ...at150, atMs: 0 }, null);
    expect(snap!.along).toBeCloseTo(150, -1);
  });

  it("reports how far off the line a fix is", () => {
    const off = offset(pointAt(line, 100).p, 0, 60);
    const snap = snapToRoute(r, { ...off, atMs: 2000 }, { along: 90, atMs: 1000 });
    expect(snap!.distance).toBeCloseTo(60, 0);
  });

  it("the search window grows with time, for a tunnel", () => {
    const later = pointAt(line, 900).p;
    // One second after along 100 the car cannot be at 900: the window stops short.
    const soon = snapToRoute(r, { ...later, atMs: 1000 + 1000 }, { along: 100, atMs: 1000 });
    expect(soon!.along).toBeLessThan(600);
    // Forty seconds later it can.
    const after = snapToRoute(r, { ...later, atMs: 1000 + 40_000 }, { along: 100, atMs: 1000 });
    expect(after!.along).toBeCloseTo(900, -1);
    expect(after!.distance).toBeLessThan(2);
  });
});

describe("loop through a roundabout", () => {
  // South to a roundabout, 3rd exit (west then... clockwise sweep 270), onwards.
  const route = buildRoute(READING, [
    { step: { type: "depart", streetName: "London Road" }, pieces: [{ bearing: 0, metres: 400 }] },
    {
      step: { type: "roundabout", exit: 3, streetName: "Bath Road" },
      pieces: [...roundaboutArc(0, 270), { bearing: 270, metres: 500 }],
    },
  ]);
  const r = prepareRoute(route);
  const line = routeLine(route);

  it("tracks progress round the island in order", () => {
    let anchor = { along: 380, atMs: 0 };
    let last = 380;
    for (let s = 390; s < 520; s += 5) {
      const { p, bearing } = pointAt(line, s);
      const snap = snapToRoute(r, { ...p, courseDeg: bearing, speedMps: 6, atMs: anchor.atMs + 1000 }, anchor);
      expect(snap!.along).toBeGreaterThanOrEqual(last - 1);
      last = snap!.along;
      anchor = { along: snap!.along, atMs: anchor.atMs + 1000 };
    }
  });
});

describe("steps and time", () => {
  const r = prepareRoute(uturnRoute);
  it("current step and distance to the next manoeuvre", () => {
    expect(stepIndexAt(r, 0)).toBe(0);
    expect(stepIndexAt(r, 299)).toBe(0);
    expect(stepIndexAt(r, 301)).toBe(1);
    expect(distanceToStep(r, 1, 100)).toBeCloseTo(200, 0);
    expect(distanceToStep(r, 9, 990)).toBeGreaterThanOrEqual(0);
  });
  it("time left counts the unfinished step and every later one", () => {
    const full = remainingSeconds(r, 0, 0);
    expect(full).toBeCloseTo(uturnRoute.durationSeconds, 0);
    const half = remainingSeconds(r, 0, 150);
    expect(full - half).toBeCloseTo(uturnRoute.steps[0].durationSeconds / 2, 0);
  });
  it("speed limit by segment", () => {
    const withLimits = prepareRoute({
      ...uturnRoute,
      speedLimitsMph: [
        { startIndex: 0, endIndex: 10, mph: 30 },
        { startIndex: 10, endIndex: 20, mph: null },
      ],
    });
    expect(speedLimitAt(withLimits, 3)).toBe(30);
    expect(speedLimitAt(withLimits, 12)).toBeNull();
    expect(speedLimitAt(withLimits, 40)).toBeNull();
  });
});
