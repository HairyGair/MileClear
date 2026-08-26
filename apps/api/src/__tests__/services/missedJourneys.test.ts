/**
 * Missed-journey candidate selection, including the wake-lag floor added
 * after Rachel's five phantom 0.3 mi proposals in one day (25 Aug 2026).
 */
import { describe, it, expect } from "vitest";
import {
  selectMissedJourneyCandidates,
  MISSED_WAKE_LAG_MILES,
  MISSED_MIN_MILES,
  type MissedJourneyTripInput,
} from "../../services/missedJourneys.js";

// Roughly 69 statute miles per degree of latitude, so 0.01 deg is ~0.69 mi.
const MILES_PER_DEG_LAT = 69.09;
const BASE_LAT = 52.2;
const BASE_LNG = -1.9;

function trip(
  id: string,
  opts: {
    startLatOffsetMiles?: number;
    startMin: number;
    endMin: number;
    isManualEntry?: boolean;
  }
): MissedJourneyTripInput {
  const startLat = BASE_LAT + (opts.startLatOffsetMiles ?? 0) / MILES_PER_DEG_LAT;
  const t0 = Date.UTC(2026, 7, 25, 8, 0, 0);
  return {
    id,
    startLat,
    startLng: BASE_LNG,
    startAddress: `start ${id}`,
    // Every trip ends back at the base point so the gap to the next trip's
    // start is exactly that trip's startLatOffsetMiles.
    endLat: BASE_LAT,
    endLng: BASE_LNG,
    endAddress: `end ${id}`,
    startedAt: new Date(t0 + opts.startMin * 60000),
    endedAt: new Date(t0 + opts.endMin * 60000),
    isManualEntry: opts.isManualEntry ?? false,
  };
}

describe("selectMissedJourneyCandidates", () => {
  it("suppresses a 0.4 mi gap before an auto-captured trip as wake lag", () => {
    const trips = [
      trip("a", { startMin: 0, endMin: 10 }),
      trip("b", { startMin: 30, endMin: 40, startLatOffsetMiles: 0.4 }),
    ];
    const r = selectMissedJourneyCandidates(trips);
    expect(r.candidates).toEqual([]);
    expect(r.wakeLagSuppressed).toBe(1);
    expect(r.wakeLagMaxMiles).toBe(0.4);
  });

  it("keeps a 0.4 mi gap before a manual trip (no wake lag on a typed start)", () => {
    const trips = [
      trip("a", { startMin: 0, endMin: 10 }),
      trip("b", { startMin: 30, endMin: 40, startLatOffsetMiles: 0.4, isManualEntry: true }),
    ];
    const r = selectMissedJourneyCandidates(trips);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].key).toBe("a:b");
    expect(r.candidates[0].estimatedMiles).toBe(0.4);
    expect(r.wakeLagSuppressed).toBe(0);
  });

  it("keeps a 0.8 mi gap before an auto-captured trip", () => {
    const trips = [
      trip("a", { startMin: 0, endMin: 10 }),
      trip("b", { startMin: 30, endMin: 40, startLatOffsetMiles: 0.8 }),
    ];
    const r = selectMissedJourneyCandidates(trips);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].estimatedMiles).toBe(0.8);
    expect(r.wakeLagSuppressed).toBe(0);
  });

  it("still applies the 0.3 mi floor to a manual trip (jitter, not wake lag)", () => {
    const trips = [
      trip("a", { startMin: 0, endMin: 10 }),
      trip("b", { startMin: 30, endMin: 40, startLatOffsetMiles: 0.2, isManualEntry: true }),
    ];
    const r = selectMissedJourneyCandidates(trips);
    expect(r.candidates).toEqual([]);
    expect(r.wakeLagSuppressed).toBe(0);
  });

  it("time-gap floors are unchanged: under 5 min and over 24 h are skipped, and not counted as wake lag", () => {
    const tooSoon = [
      trip("a", { startMin: 0, endMin: 10 }),
      trip("b", { startMin: 13, endMin: 40, startLatOffsetMiles: 0.8 }),
    ];
    const tooLate = [
      trip("a", { startMin: 0, endMin: 10 }),
      trip("b", { startMin: 10 + 24 * 60 + 1, endMin: 10 + 24 * 60 + 30, startLatOffsetMiles: 0.8 }),
    ];
    const justInside = [
      trip("a", { startMin: 0, endMin: 10 }),
      trip("b", { startMin: 15, endMin: 40, startLatOffsetMiles: 0.8 }),
    ];
    expect(selectMissedJourneyCandidates(tooSoon)).toEqual({ candidates: [], wakeLagSuppressed: 0, wakeLagMaxMiles: 0 });
    expect(selectMissedJourneyCandidates(tooLate)).toEqual({ candidates: [], wakeLagSuppressed: 0, wakeLagMaxMiles: 0 });
    expect(selectMissedJourneyCandidates(justInside).candidates).toHaveLength(1);
  });

  it("aggregates across a day of short hops (Rachel's case)", () => {
    const trips = [
      trip("t1", { startMin: 0, endMin: 10 }),
      trip("t2", { startMin: 40, endMin: 50, startLatOffsetMiles: 0.3 }),
      trip("t3", { startMin: 90, endMin: 100, startLatOffsetMiles: 0.35 }),
      trip("t4", { startMin: 150, endMin: 160, startLatOffsetMiles: 0.5 }),
      trip("t5", { startMin: 200, endMin: 210, startLatOffsetMiles: 2.0 }),
    ];
    const r = selectMissedJourneyCandidates(trips);
    expect(r.candidates.map((c) => c.key)).toEqual(["t4:t5"]);
    expect(r.wakeLagSuppressed).toBe(3);
    expect(r.wakeLagMaxMiles).toBe(0.5);
  });

  it("skips a pair when trip A has no end", () => {
    const a = trip("a", { startMin: 0, endMin: 10 });
    a.endLat = null; a.endLng = null; a.endedAt = null;
    const r = selectMissedJourneyCandidates([a, trip("b", { startMin: 30, endMin: 40, startLatOffsetMiles: 2 })]);
    expect(r.candidates).toEqual([]);
  });

  it("exposes the floors it uses", () => {
    expect(MISSED_MIN_MILES).toBe(0.3);
    expect(MISSED_WAKE_LAG_MILES).toBe(0.6);
  });
});
