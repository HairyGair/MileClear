/**
 * recordedDuplicate: two recordings that were at the same places at the same
 * moments are one drive. Checked against the shapes found in the 28 Sep 2026
 * sweep: a shift recording and the automatic engine's copy of the same
 * afternoon (4cc04bac), a second finalize of the same drive a couple of
 * minutes shorter (0419feba), and a long whole-day copy with legs inside it
 * (833a3d27). And the cases that must never match: a later drive down the same
 * road, a shared account in a different car at the same time, and a longer
 * recording that only overlaps.
 */
import { describe, it, expect } from "vitest";
import {
  coveredShare,
  isRecordedCopy,
  planCleanup,
  MATCH_RADIUS_M,
  type CleanupTrip,
  type DuplicateFix,
} from "../../services/recordedDuplicate.js";

const T0 = Date.UTC(2026, 8, 26, 15, 35);
// ~15 m/s heading north-east from central Birmingham, one fix per `stepS`.
function route(startS: number, endS: number, stepS: number, offsetM = 0, from = { lat: 52.48, lng: -1.9 }): DuplicateFix[] {
  const out: DuplicateFix[] = [];
  for (let s = startS; s <= endS; s += stepS) {
    const metres = s * 15;
    out.push({
      t: T0 + s * 1000,
      lat: from.lat + (metres * 0.7) / 111_320 + offsetM / 111_320,
      lng: from.lng + (metres * 0.7) / (111_320 * Math.cos((from.lat * Math.PI) / 180)),
    });
  }
  return out;
}

describe("coveredShare / isRecordedCopy", () => {
  it("the shift copy of an afternoon already saved by the engine is a copy (4cc04bac, 26 Sep)", () => {
    const engine = route(180, 19_500, 4); // 15:38 onwards, 20 m sampling
    const shift = route(0, 19_300, 7); // 15:35 onwards, 50 m sampling, ends a bit earlier
    const c = coveredShare(shift, [{ id: "engine", fixes: engine }]);
    // The shift started three minutes before the engine did, so its first
    // minute of fixes has no counterpart; everything else does.
    expect(c.share).toBeGreaterThan(0.98);
    expect(isRecordedCopy(c)).toBe(true);
    expect(c.bestTripId).toBe("engine");
  });

  it("a second finalize starting two minutes in is a copy (0419feba, 21 Sep)", () => {
    const first = route(0, 420, 6);
    const second = route(132, 420, 9);
    expect(isRecordedCopy(coveredShare(second, [{ id: "first", fixes: first }]))).toBe(true);
  });

  it("legs inside a whole-day copy are copies of it, and it is not a copy of any one leg", () => {
    const day = route(0, 12_000, 5);
    const legA = route(1_000, 2_000, 8);
    const legB = route(6_000, 7_500, 8);
    expect(isRecordedCopy(coveredShare(legA, [{ id: "day", fixes: day }]))).toBe(true);
    expect(isRecordedCopy(coveredShare(legB, [{ id: "day", fixes: day }]))).toBe(true);
    const dayVsLegs = coveredShare(day, [
      { id: "a", fixes: legA },
      { id: "b", fixes: legB },
    ]);
    expect(dayVsLegs.share).toBeLessThan(0.3);
    expect(isRecordedCopy(dayVsLegs)).toBe(false);
  });

  it("never matches the same road driven again later", () => {
    const morning = route(0, 1_800, 5);
    const evening = morning.map((f) => ({ ...f, t: f.t + 8 * 3600 * 1000 }));
    expect(coveredShare(evening, [{ id: "morning", fixes: morning }]).share).toBe(0);
  });

  it("never matches a different car on a different road at the same time (shared account)", () => {
    const mine = route(0, 1_800, 5);
    const theirs = route(0, 1_800, 5, 2_000); // 2 km away, parallel
    expect(coveredShare(theirs, [{ id: "mine", fixes: mine }]).share).toBe(0);
  });

  it("a fix just outside the radius is not matched", () => {
    const a: DuplicateFix[] = [{ t: T0, lat: 52.48, lng: -1.9 }];
    const near: DuplicateFix[] = [{ t: T0 + 30_000, lat: 52.48 + (MATCH_RADIUS_M - 10) / 111_320, lng: -1.9 }];
    const far: DuplicateFix[] = [{ t: T0 + 30_000, lat: 52.48 + (MATCH_RADIUS_M + 10) / 111_320, lng: -1.9 }];
    expect(coveredShare(near, [{ id: "a", fixes: a }]).matched).toBe(1);
    expect(coveredShare(far, [{ id: "a", fixes: a }]).matched).toBe(0);
  });

  it("nine in ten fixes matched is not enough when the rest is real driving (0657b418, 9 Sep)", () => {
    // The shift recorded 12:31-19:44; the engine's copy ran from 12:07 to
    // 20:03. 92% of the engine's fixes match, but its extra 43 minutes are
    // miles nobody else recorded.
    const shift = route(1_440, 27_840, 5);
    const engine = route(0, 28_980, 11);
    const c = coveredShare(engine, [{ id: "shift", fixes: shift }]);
    expect(c.share).toBeGreaterThanOrEqual(0.9);
    expect(c.unmatchedMiles).toBeGreaterThan(10);
    expect(isRecordedCopy(c)).toBe(false);
  });

  it("a copy whose only unmatched fixes sit at a parked kerb is still a copy", () => {
    const saved = route(0, 1_200, 5);
    const parked = Array.from({ length: 6 }, (_, i) => ({ ...saved[saved.length - 1], t: saved[saved.length - 1].t + (i + 3) * 60_000 }));
    const copy = [...route(0, 1_200, 7), ...parked];
    const c = coveredShare(copy, [{ id: "saved", fixes: saved }]);
    expect(c.unmatchedMiles).toBeLessThan(0.05);
    expect(isRecordedCopy(c)).toBe(true);
  });

  it("a longer recording that only overlaps keeps its unmatched stretch and is not a copy", () => {
    const saved = route(0, 1_200, 5);
    const longer = route(0, 3_000, 5);
    const c = coveredShare(longer, [{ id: "saved", fixes: saved }]);
    expect(c.share).toBeGreaterThan(0.3);
    expect(isRecordedCopy(c)).toBe(false);
  });

  it("counts a fix once when several trips match it, and names the biggest matcher", () => {
    const a = route(0, 600, 5);
    const b = route(0, 300, 5);
    const subject = route(0, 600, 10);
    const c = coveredShare(subject, [
      { id: "b", fixes: b },
      { id: "a", fixes: a },
    ]);
    expect(c.matched).toBe(c.fixes);
    expect(c.share).toBe(1);
    expect(c.bestTripId).toBe("a");
  });

  it("does not judge a trip with fewer than two usable fixes, or one with nothing to compare", () => {
    expect(isRecordedCopy(coveredShare(route(0, 0, 5), [{ id: "x", fixes: route(0, 600, 5) }]))).toBe(false);
    expect(isRecordedCopy(coveredShare(route(0, 600, 5), []))).toBe(false);
    const broken = [{ t: NaN, lat: 52, lng: -1 }, { t: T0, lat: NaN, lng: -1 }];
    expect(coveredShare(broken, [{ id: "x", fixes: route(0, 600, 5) }]).fixes).toBe(0);
  });
});

const trip = (id: string, fixes: DuplicateFix[], o: Partial<CleanupTrip> = {}): CleanupTrip => ({
  id,
  createdAt: new Date(T0 + 86_400_000),
  startedAt: new Date(fixes[0].t),
  endedAt: new Date(fixes[fixes.length - 1].t),
  distanceMiles: 10,
  classification: "unclassified",
  classificationSource: null,
  notes: null,
  businessPurpose: null,
  platformTag: null,
  projectLabel: null,
  category: null,
  odometerStart: null,
  odometerEnd: null,
  driverEdited: false,
  fixes,
  ...o,
});

describe("planCleanup", () => {
  it("keeps the fuller recording and removes the copy inside it", () => {
    const d = planCleanup([
      trip("leg", route(1_000, 2_000, 8), { distanceMiles: 8.8 }),
      trip("day", route(0, 12_000, 5), { distanceMiles: 91.6 }),
    ]);
    expect(d.remove.map((r) => [r.trip.id, r.keeper.id])).toEqual([["leg", "day"]]);
    expect(d.skipped).toEqual([]);
  });

  it("removes the second of two identical recordings, keeping the one saved first", () => {
    const fixes = route(0, 900, 5);
    const d = planCleanup([
      trip("later", fixes, { createdAt: new Date(T0 + 2 * 86_400_000) }),
      trip("earlier", fixes, { createdAt: new Date(T0 + 86_400_000) }),
    ]);
    expect(d.remove.map((r) => r.trip.id)).toEqual(["later"]);
  });

  it("never removes a copy the driver classified differently from the keeper", () => {
    const d = planCleanup([
      trip("day", route(0, 12_000, 5), { classification: "unclassified" }),
      trip("leg", route(1_000, 2_000, 8), { classification: "business", classificationSource: "user" }),
    ]);
    expect(d.remove).toEqual([]);
    expect(d.skipped.map((s) => [s.trip.id, s.reason])).toEqual([["leg", "classified_differently"]]);
  });

  it("removes a copy classified the same way as its keeper", () => {
    const d = planCleanup([
      trip("day", route(0, 12_000, 5), { classification: "personal", classificationSource: "user" }),
      trip("leg", route(1_000, 2_000, 8), { classification: "personal", classificationSource: "user" }),
    ]);
    expect(d.remove.map((r) => r.trip.id)).toEqual(["leg"]);
  });

  it("never removes a copy carrying a note, purpose or odometer the keeper lacks", () => {
    const d = planCleanup([
      trip("day", route(0, 12_000, 5)),
      trip("noted", route(1_000, 2_000, 8), { notes: "Collected parcels" }),
      trip("odo", route(3_000, 4_000, 8), { odometerStart: 1200, odometerEnd: 1210 }),
      trip("purpose", route(5_000, 6_000, 8), { businessPurpose: "client_visit" }),
    ]);
    expect(d.remove).toEqual([]);
    expect(d.skipped.map((s) => s.reason)).toEqual([
      "driver_details_differ",
      "driver_details_differ",
      "driver_details_differ",
    ]);
  });

  it("never removes against a keeper that recorded through the night (4cc04bac, 21-22 Sep)", () => {
    const d = planCleanup([
      trip("overnight", route(0, 29 * 3600, 20), { distanceMiles: 74.7 }),
      trip("evening", route(1_000, 5_000, 8), { distanceMiles: 40.4 }),
    ]);
    expect(d.remove).toEqual([]);
    expect(d.skipped[0].reason).toBe("keeper_spans_12h");
  });

  it("never removes against a keeper whose stated window runs a day, even with a short trail (31161476, 4-5 Sep)", () => {
    const keeperFixes = route(0, 4_000, 5);
    const d = planCleanup([
      trip("dayLong", keeperFixes, { startedAt: new Date(keeperFixes[0].t - 24 * 3600 * 1000) }),
      trip("leg", route(1_000, 2_000, 8)),
    ]);
    expect(d.remove).toEqual([]);
    expect(d.skipped[0].reason).toBe("keeper_spans_12h");
  });

  it("never removes a copy whose start or end the driver moved", () => {
    const d = planCleanup([
      trip("day", route(0, 12_000, 5)),
      trip("leg", route(1_000, 2_000, 8), { driverEdited: true }),
    ]);
    expect(d.remove).toEqual([]);
    expect(d.skipped[0].reason).toBe("driver_edited");
  });

  it("never removes a copy holding materially more miles than its keeper", () => {
    const d = planCleanup([
      trip("keeper", route(0, 1_200, 5), { distanceMiles: 5 }),
      trip("copy", route(0, 1_200, 9), { distanceMiles: 9 }),
    ]);
    expect(d.remove).toEqual([]);
    expect(d.skipped[0].reason).toBe("longer_than_keeper");
  });

  it("never removes either of two separate drives", () => {
    const d = planCleanup([
      trip("morning", route(0, 1_800, 5)),
      trip("elsewhere", route(0, 1_800, 5, 2_000)),
    ]);
    expect(d.remove).toEqual([]);
    expect(d.skipped).toEqual([]);
  });

  it("a skipped copy stays kept, so nothing is removed against it", () => {
    const d = planCleanup([
      trip("day", route(0, 12_000, 5), { distanceMiles: 90 }),
      // classified differently: kept
      trip("leg", route(1_000, 3_000, 6), { distanceMiles: 20, classification: "business" }),
    ]);
    expect(d.remove).toEqual([]);
    expect(d.skipped).toHaveLength(1);
  });
});
