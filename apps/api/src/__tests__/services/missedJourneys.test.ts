/**
 * Missed-journey candidate selection, including the wake-lag floor added
 * after Rachel's five phantom 0.3 mi proposals in one day (25 Aug 2026).
 */
import { describe, it, expect } from "vitest";
import {
  selectMissedJourneyCandidates,
  isMovingAtFirstFix,
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
    expect(selectMissedJourneyCandidates(tooSoon)).toEqual({ candidates: [], wakeLagSuppressed: 0, wakeLagMaxMiles: 0, tripStartOffers: 0 });
    expect(selectMissedJourneyCandidates(tooLate)).toEqual({ candidates: [], wakeLagSuppressed: 0, wakeLagMaxMiles: 0, tripStartOffers: 0 });
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

describe("moving at first fix - the gap is the start of the next trip (Anthony, 3 Sep 2026)", () => {
  it("offers a 1.2 mi gap before an auto trip that was already moving as that trip's start, not a separate drive", () => {
    const a = trip("a", { startMin: 0, endMin: 10 });
    const b = { ...trip("b", { startLatOffsetMiles: 1.2, startMin: 40, endMin: 55 }), movingAtFirstFix: true };
    const sel = selectMissedJourneyCandidates([a, b]);
    expect(sel.candidates).toHaveLength(1);
    expect(sel.candidates[0].kind).toBe("trip_start");
    expect(sel.candidates[0].tripId).toBe("b");
    expect(sel.tripStartOffers).toBe(1);
    expect(sel.wakeLagSuppressed).toBe(0);
  });

  it("offers the same gap as a plain missed drive when the next trip started from rest", () => {
    const a = trip("a", { startMin: 0, endMin: 10 });
    const b = { ...trip("b", { startLatOffsetMiles: 1.2, startMin: 40, endMin: 55 }), movingAtFirstFix: false };
    const sel = selectMissedJourneyCandidates([a, b]);
    expect(sel.candidates).toHaveLength(1);
    expect(sel.candidates[0].kind).toBe("gap");
    expect(sel.tripStartOffers).toBe(0);
  });

  it("treats unknown motion (no breadcrumbs to judge from) as a plain gap", () => {
    const a = trip("a", { startMin: 0, endMin: 10 });
    const b = { ...trip("b", { startLatOffsetMiles: 1.2, startMin: 40, endMin: 55 }), movingAtFirstFix: null };
    expect(selectMissedJourneyCandidates([a, b]).candidates[0].kind).toBe("gap");
  });

  it("keeps a long gap as a plain gap even when the next trip was moving: it can hold a real drive as well", () => {
    const a = trip("a", { startMin: 0, endMin: 10 });
    const b = { ...trip("b", { startLatOffsetMiles: 8, startMin: 120, endMin: 140 }), movingAtFirstFix: true };
    const sel = selectMissedJourneyCandidates([a, b]);
    expect(sel.candidates[0].kind).toBe("gap");
    expect(sel.tripStartOffers).toBe(0);
  });

  it("ignores the flag on a manual next trip (a typed start has no wake lag)", () => {
    const a = trip("a", { startMin: 0, endMin: 10 });
    const b = { ...trip("b", { startLatOffsetMiles: 1.2, startMin: 40, endMin: 55, isManualEntry: true }), movingAtFirstFix: true };
    expect(selectMissedJourneyCandidates([a, b]).candidates[0].kind).toBe("gap");
  });
});

describe("isMovingAtFirstFix", () => {
  const t0 = Date.UTC(2026, 8, 3, 13, 0, 0);
  it("says moving when the first fix reports driving speed", () => {
    expect(isMovingAtFirstFix([{ lat: 52.2, lng: -1.9, speed: 8.9, recordedAt: new Date(t0) }])).toBe(true);
  });
  it("says moving when the first two fixes imply driving speed even with no stored speed", () => {
    // ~0.29 mi in 60 s ≈ 17 mph.
    expect(isMovingAtFirstFix([
      { lat: 52.2, lng: -1.9, speed: null, recordedAt: new Date(t0) },
      { lat: 52.2042, lng: -1.9, speed: null, recordedAt: new Date(t0 + 60_000) },
    ])).toBe(true);
  });
  it("says at rest for a slow first fix followed by a short hop", () => {
    expect(isMovingAtFirstFix([
      { lat: 52.2, lng: -1.9, speed: 0.4, recordedAt: new Date(t0) },
      { lat: 52.20005, lng: -1.9, speed: 2, recordedAt: new Date(t0 + 30_000) },
    ])).toBe(false);
  });
  it("says unknown with nothing to judge from", () => {
    expect(isMovingAtFirstFix([])).toBeNull();
    expect(isMovingAtFirstFix([{ lat: 52.2, lng: -1.9, speed: null, recordedAt: new Date(t0) }])).toBeNull();
  });
});
