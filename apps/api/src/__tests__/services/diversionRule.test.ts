/**
 * Diversion labels (5 Oct 2026). Synthetic coordinates only (a made-up grid
 * around 52.0 N, 1.0 W): the repo is public.
 *
 * Usual route: due east along 52.0000 from -1.0000 to -0.9700 (~2 km).
 * Closure: the middle of that road, -0.9900 to -0.9850.
 * Diversion: north 500 m, east, back south, so it never comes near it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: { findFirst: vi.fn(), findMany: vi.fn() },
    tripCoordinate: { findMany: vi.fn() },
    streetWorksEvent: { findMany: vi.fn() },
    tripDiversion: { create: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));

import {
  judgeDiversion,
  pointToSegmentMetres,
  type ClosureInput,
  type DiversionTripInput,
} from "../../services/diversionRule.js";
import { runDiversionHook, isTripDiversionsEnabled } from "../../services/diversions.js";
import { prisma } from "../../lib/prisma.js";
import type { LatLng } from "../../services/roadCorridor.js";

const START: LatLng = [52.0, -1.0];
const END: LatLng = [52.0, -0.97];
const NORTH = 52.0045; // ~500 m north

/** Points every ~`stepM` metres along a polyline of corners. */
function walk(corners: LatLng[], stepM = 50): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const [a, b] = [corners[i], corners[i + 1]];
    const dLat = (b[0] - a[0]) * 111320;
    const dLng = (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
    const n = Math.max(1, Math.round(Math.hypot(dLat, dLng) / stepM));
    for (let s = 0; s < n; s++) out.push([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]);
  }
  out.push(corners[corners.length - 1]);
  return out;
}

const USUAL_LINE = walk([START, END]);
const DIVERSION_LINE = walk([START, [NORTH, -1.0], [NORTH, -0.97], END]);

const TRIP_TIME = new Date("2026-10-06T08:00:00Z");
const day = 86400000;

function trip(over: Partial<DiversionTripInput> = {}): DiversionTripInput {
  return {
    id: "trip-now",
    startLat: START[0],
    startLng: START[1],
    endLat: END[0],
    endLng: END[1],
    distanceMiles: 1.9,
    startedAt: TRIP_TIME,
    endedAt: new Date(TRIP_TIME.getTime() + 10 * 60000),
    points: DIVERSION_LINE,
    ...over,
  };
}

function history(n: number, over: Partial<DiversionTripInput> = {}): DiversionTripInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `past-${i}`,
    startLat: START[0] + 0.0002,
    startLng: START[1],
    endLat: END[0],
    endLng: END[1] - 0.0002,
    distanceMiles: 1.25 + i * 0.01,
    startedAt: new Date(TRIP_TIME.getTime() - (i + 1) * day),
    endedAt: new Date(TRIP_TIME.getTime() - (i + 1) * day + 8 * 60000),
    points: USUAL_LINE,
    ...over,
  }));
}

function closure(over: Partial<ClosureInput> = {}): ClosureInput {
  return {
    reference: "TEST-REF-1",
    trafficManagement: "road_closure",
    streetName: "Test Road",
    town: "Testtown",
    promoter: "Test Utilities",
    startAt: new Date(TRIP_TIME.getTime() - 2 * day),
    endAt: new Date(TRIP_TIME.getTime() + 2 * day),
    lines: [[[52.0, -0.99], [52.0, -0.985]]],
    points: [],
    ...over,
  };
}

describe("judgeDiversion", () => {
  it("labels a longer trip that went round a closure on the usual route", () => {
    const d = judgeDiversion(trip(), history(5), [closure()]);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.diversion.streetName).toBe("Test Road");
    expect(d.diversion.promoter).toBe("Test Utilities");
    expect(d.diversion.closureRef).toBe("TEST-REF-1");
    expect(d.diversion.usualMiles).toBeCloseTo(1.27, 2);
    expect(d.diversion.extraMiles).toBeCloseTo(0.63, 2);
  });

  it("does not label a trip that drove through the closed stretch", () => {
    const d = judgeDiversion(trip({ points: USUAL_LINE }), history(5), [closure()]);
    expect(d).toMatchObject({ ok: false, reason: "drove_through_closure" });
  });

  it("needs at least three past trips between the same places", () => {
    expect(judgeDiversion(trip(), history(2), [closure()])).toMatchObject({ ok: false, reason: "not_enough_history" });
  });

  it("ignores past trips from somewhere else, older than 90 days, thin or already diversions", () => {
    const elsewhere = history(3, { startLat: START[0] + 0.01 });
    const old = history(3, { startedAt: new Date(TRIP_TIME.getTime() - 120 * day) });
    const thin = history(3, { points: USUAL_LINE.slice(0, 5) });
    const diverted = history(3, { isDiversion: true });
    const d = judgeDiversion(trip(), [...elsewhere, ...old, ...thin, ...diverted], [closure()]);
    expect(d).toMatchObject({ ok: false, reason: "not_enough_history" });
  });

  it("does not label a small difference", () => {
    // 0.3 mi longer: over 15% but under the 0.5 mi floor.
    expect(judgeDiversion(trip({ distanceMiles: 1.57 }), history(5), [closure()])).toMatchObject({
      ok: false,
      reason: "not_longer",
    });
  });

  it("does not label when the closure was not active at the trip's time", () => {
    const ended = closure({ endAt: new Date(TRIP_TIME.getTime() - day) });
    const future = closure({ startAt: new Date(TRIP_TIME.getTime() + day) });
    expect(judgeDiversion(trip(), history(5), [ended, future])).toMatchObject({ ok: false, reason: "no_active_closure" });
  });

  it("ignores lane closures", () => {
    const lane = closure({ trafficManagement: "lane_closure" });
    expect(judgeDiversion(trip(), history(5), [lane])).toMatchObject({ ok: false, reason: "no_active_closure" });
  });

  it("ignores a closure that is not on the usual route", () => {
    const parallel = closure({ lines: [[[52.0015, -0.99], [52.0015, -0.985]]] }); // ~170 m north
    expect(judgeDiversion(trip(), history(5), [parallel])).toMatchObject({
      ok: false,
      reason: "closure_not_on_usual_route",
    });
  });

  it("does not label a trip far longer than usual (a different journey)", () => {
    expect(judgeDiversion(trip({ distanceMiles: 6 }), history(5), [closure()])).toMatchObject({
      ok: false,
      reason: "much_longer",
    });
  });
});

describe("pointToSegmentMetres", () => {
  it("measures across a segment", () => {
    const d = pointToSegmentMetres([52.0009, -0.99], [52.0, -1.0], [52.0, -0.98]);
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
  });
});

describe("runDiversionHook", () => {
  const saved = process.env.TRIP_DIVERSIONS;
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (saved === undefined) delete process.env.TRIP_DIVERSIONS;
    else process.env.TRIP_DIVERSIONS = saved;
  });

  it("does nothing without TRIP_DIVERSIONS=1", async () => {
    delete process.env.TRIP_DIVERSIONS;
    expect(isTripDiversionsEnabled()).toBe(false);
    await runDiversionHook({ tripId: "t", userId: "u" });
    expect(prisma.trip.findFirst).not.toHaveBeenCalled();
    expect(prisma.tripDiversion.create).not.toHaveBeenCalled();
  });

  it("never throws when the lookup fails", async () => {
    process.env.TRIP_DIVERSIONS = "1";
    vi.mocked(prisma.trip.findFirst).mockRejectedValueOnce(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runDiversionHook({ tripId: "t", userId: "u" })).resolves.toBeUndefined();
    expect(prisma.trip.findFirst).toHaveBeenCalled();
    err.mockRestore();
  });
});
