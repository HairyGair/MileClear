import { describe, it, expect } from "vitest";
import {
  planAutoSplit,
  partitionAtCuts,
  legDistanceMiles,
  AUTO_SPLIT_MIN_DWELL_SEC,
  AUTO_SPLIT_MAX_CUTS,
  type SplitCoord,
} from "../../services/tripSplit.js";

// ---------------------------------------------------------------------------
// Route builder. One coord every 10s; speeds in m/s (13.4 ≈ 30 mph driving,
// 0.4 ≈ 0.9 mph stopped). Driving ticks advance ~40 m, so 45 driving ticks is
// roughly a mile — comfortably over AUTO_SPLIT_MIN_LEG_MILES either side.
// ---------------------------------------------------------------------------
const T0 = new Date("2026-08-27T06:57:00Z").getTime();
const DRIVING = 13.4;
const STOPPED = 0.4;

function route(segments: Array<{ n: number; speed: number }>): SplitCoord[] {
  const out: SplitCoord[] = [];
  let lat = 53.6705;
  let i = 0;
  for (const seg of segments) {
    for (let k = 0; k < seg.n; k++) {
      if (seg.speed > 2) lat += 0.00036; // ~40 m per driving tick
      out.push({ lat, lng: -0.3271, speed: seg.speed, recordedAt: new Date(T0 + i * 10_000) });
      i++;
    }
  }
  return out;
}

describe("planAutoSplit", () => {
  it("cuts a trip at a visit long enough to be unambiguous", () => {
    // 50 driving ticks, 40 stopped ticks (~6.5 min), 50 driving ticks.
    const coords = route([
      { n: 50, speed: DRIVING },
      { n: 40, speed: STOPPED },
      { n: 50, speed: DRIVING },
    ]);
    const cuts = planAutoSplit(coords);
    expect(cuts).toHaveLength(1);
    const legs = partitionAtCuts(coords, cuts);
    expect(legs).toHaveLength(2);
    expect(legDistanceMiles(legs[0])).toBeGreaterThan(0.25);
    expect(legDistanceMiles(legs[1])).toBeGreaterThan(0.25);
  });

  it("leaves a junction pause alone", () => {
    // 15 stopped ticks = 140s, under the 240s bar the manual flow sets at 60s.
    const coords = route([
      { n: 50, speed: DRIVING },
      { n: 15, speed: STOPPED },
      { n: 50, speed: DRIVING },
    ]);
    expect(planAutoSplit(coords)).toEqual([]);
  });

  it("is stricter than the user-confirmed threshold", () => {
    expect(AUTO_SPLIT_MIN_DWELL_SEC).toBeGreaterThan(60);
  });

  it("refuses a cut that would leave a leg with no distance in it", () => {
    // Rachel's 5ee5995d, 26 Aug: a 1,180s dwell after arriving, with only a
    // few metres of jitter behind it. Splitting there manufactures a leg that
    // never went anywhere.
    const coords = route([
      { n: 60, speed: DRIVING },
      { n: 120, speed: STOPPED },
      { n: 6, speed: STOPPED },
    ]);
    expect(planAutoSplit(coords)).toEqual([]);
  });

  it("drops the cut that starves a middle leg rather than splitting anyway", () => {
    // Two long stops three driving ticks apart: the leg between them is real
    // in time but ~120 m long, which is not a journey.
    const coords = route([
      { n: 50, speed: DRIVING },
      { n: 40, speed: STOPPED },
      { n: 3, speed: DRIVING },
      { n: 40, speed: STOPPED },
      { n: 50, speed: DRIVING },
    ]);
    const cuts = planAutoSplit(coords);
    expect(cuts).toHaveLength(1);
    const legs = partitionAtCuts(coords, cuts);
    for (const leg of legs) expect(legDistanceMiles(leg)).toBeGreaterThanOrEqual(0.25);
  });

  it("never proposes more cuts than the cap", () => {
    const segments: Array<{ n: number; speed: number }> = [{ n: 50, speed: DRIVING }];
    for (let i = 0; i < AUTO_SPLIT_MAX_CUTS + 3; i++) {
      segments.push({ n: 40, speed: STOPPED });
      segments.push({ n: 50, speed: DRIVING });
    }
    expect(planAutoSplit(route(segments)).length).toBeLessThanOrEqual(AUTO_SPLIT_MAX_CUTS);
  });

  it("ignores a trail too short to hold two legs", () => {
    expect(planAutoSplit(route([{ n: 6, speed: DRIVING }]))).toEqual([]);
  });

  it("splits on silence, not just on slow fixes", () => {
    // The other half of the weld: the phone sleeps through the visit and wakes
    // half a mile down the road. Two coords, 14 minutes apart, far apart —
    // build 85's client rule rejects this because of the distance, which is
    // exactly why the server has to judge it on the stop, not the wake.
    const before = route([{ n: 50, speed: DRIVING }]);
    const gapStart = before[before.length - 1];
    const after: SplitCoord[] = [];
    for (let i = 0; i < 50; i++) {
      after.push({
        lat: gapStart.lat + 0.008 + i * 0.00036,
        lng: -0.3271,
        speed: DRIVING,
        recordedAt: new Date(gapStart.recordedAt.getTime() + 14 * 60_000 + i * 10_000),
      });
    }
    const cuts = planAutoSplit([...before, ...after]);
    expect(cuts).toEqual([before.length - 1]);
  });
});
