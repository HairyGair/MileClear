import { describe, it, expect } from "vitest";
import { haversineDistance } from "@mileclear/shared";
import { decideAppendDistance, hasSetDistanceMarker, type StoredFix } from "../../services/appendDistance.js";

const t0 = Date.parse("2026-10-14T09:07:17Z");
const line = (n: number, miles: number, startLat = 51.4211, stepMs = 10_000): StoredFix[] =>
  Array.from({ length: n }, (_, i) => ({
    lat: startLat + (i * (miles / 69.09)) / (n - 1),
    lng: -0.28962,
    speed: 12,
    accuracy: 4,
    recordedAt: new Date(t0 + i * stepMs),
  }));
const home = (i: number, stepMs = 10_000): StoredFix => ({
  lat: 51.42827, lng: -0.31077, speed: 0, accuracy: 50, recordedAt: new Date(t0 + i * stepMs + 5000),
});
const miles = (cs: StoredFix[]) =>
  cs.slice(1).reduce((s, c, k) => s + haversineDistance(cs[k].lat, cs[k].lng, c.lat, c.lng), 0);
const plain = { gpsQuality: null, originalStartLat: null, isManualEntry: false };

describe("decideAppendDistance", () => {
  const drive = line(30, 2.25);
  const katy = [drive[0], home(0), ...drive.slice(1, 10), home(9), ...drive.slice(10, 20), home(19), ...drive.slice(20)];

  it("Katy b7b5f5fe: the counted jumps come off, back to about 2.25", () => {
    const d = decideAppendDistance(Math.round(miles(katy) * 100) / 100, katy, plain);
    expect(d.recompute).toBe(true);
    if (d.recompute) {
      expect(d.newMiles).toBeGreaterThan(2.2);
      expect(d.newMiles).toBeLessThan(2.3);
      expect(d.dropped).toBe(3);
    }
  });

  it("late start (3.90 on a 2.40 trail): untouched, even with a jump in the trail", () => {
    const trail = line(30, 2.4);
    expect(decideAppendDistance(3.9, trail, plain)).toMatchObject({ recompute: false, reason: "little_removed" });
    const gq = { gpsQuality: { lateStartBackfill: { addedMiles: 1.5 } }, originalStartLat: null, isManualEntry: false };
    expect(decideAppendDistance(9, katy, gq)).toMatchObject({ recompute: false, reason: "late_start" });
  });

  it("start edit (7.30 on a 3.30 trail): untouched", () => {
    const trail = line(30, 3.3);
    expect(decideAppendDistance(7.3, trail, plain)).toMatchObject({ recompute: false, reason: "little_removed" });
    expect(decideAppendDistance(9, katy, { ...plain, originalStartLat: 51.4 })).toMatchObject({
      recompute: false,
      reason: "start_moved",
    });
    expect(
      decideAppendDistance(9, katy, { ...plain, gpsQuality: { startExtendedSource: "missed_journey_trip_start", startExtendedMiles: 2 } })
    ).toMatchObject({ recompute: false, reason: "start_extended" });
  });

  it("30 mi map-matched plus a merge (31.5 on a 20.68 trail, a fix dropped for accuracy): untouched", () => {
    const trail = line(120, 20.68, 51.3, 30_000);
    trail[60] = { ...trail[60], accuracy: 80 };
    expect(decideAppendDistance(31.5, trail, plain)).toMatchObject({ recompute: false, reason: "little_removed" });
  });

  it("a figure below the raw trail was already filtered on the phone: untouched", () => {
    expect(decideAppendDistance(3.2, katy, plain)).toMatchObject({ recompute: false, reason: "client_below_raw_trail" });
  });

  it("never raises a figure", () => {
    expect(decideAppendDistance(1.1, katy, plain).recompute).toBe(false);
  });

  it("names the markers it respects", () => {
    expect(hasSetDistanceMarker({ ...plain, isManualEntry: true })).toBe("manual");
    expect(hasSetDistanceMarker(plain)).toBeNull();
  });
});

describe("decideAppendDistance across repeated merges (review probe I, 14 Oct 2026)", () => {
  // A sparse 10-mile drive the phone map-matched at 1.3x the straight line,
  // with one stale fix in it that the phone counted, then "Still on a job"
  // merges of 1-mile legs (1.3 on the phone). Between merges the phone copies
  // the server's figure back (sync/hydrate) and adds the next leg to it.
  const DEG_PER_MILE = 1 / 69.09;
  const baseMiles = 10 / 1.3;
  const n = 17;
  const base: StoredFix[] = Array.from({ length: n }, (_, i) => ({
    lat: 51.3 + (i * baseMiles * DEG_PER_MILE) / (n - 1),
    lng: -0.2,
    speed: 13,
    accuracy: 5,
    recordedAt: new Date(t0 + i * 30_000),
  }));
  // Half a mile east of the trail, 5 s after fix 8: 0.71 mi of jump.
  const stale: StoredFix = {
    lat: base[8].lat, lng: -0.2 + 0.5 / 43.2, speed: 0, accuracy: 50,
    recordedAt: new Date(base[8].recordedAt.getTime() + 5000),
  };
  const leg = (k: number): StoredFix[] =>
    Array.from({ length: 4 }, (_, i) => ({
      lat: base[n - 1].lat + (k - 1 + (i + 1) / 4) * DEG_PER_MILE,
      lng: -0.2,
      speed: 13,
      accuracy: 5,
      recordedAt: new Date(t0 + n * 30_000 + (k - 1) * 600_000 + i * 30_000),
    }));
  const round2 = (x: number) => Math.round(x * 100) / 100;

  it("takes the jump off once; later merges keep every leg's miles", () => {
    const keptMiles = miles(base);
    const jump = miles([...base.slice(0, 9), stale, ...base.slice(9)]) - keptMiles;
    expect(jump).toBeGreaterThan(0.6);

    let trail = [...base.slice(0, 9), stale, ...base.slice(9)];
    let correct = round2(1.3 * keptMiles);
    let phone = round2(correct + jump); // the phone counted the jump
    let gpsQuality: Record<string, unknown> = {};

    for (let pass = 1; pass <= 3; pass++) {
      if (pass > 1) {
        trail = [...trail, ...leg(pass - 1)];
        correct = round2(correct + 1.3);
        phone = round2(phone + 1.3);
      }
      const d = decideAppendDistance(phone, trail, { gpsQuality, originalStartLat: null, isManualEntry: false });
      const stored = d.recompute ? d.newMiles : phone;
      if (d.recompute) gpsQuality = { ...gpsQuality, appendOutlierCut: d.cut };
      expect(Math.abs(stored - correct)).toBeLessThanOrEqual(0.05);
      phone = stored; // hydration copies the server's figure back
    }
  });

  it("a replayed PATCH gets the first cut's answer, and a second cut never stacks", () => {
    const trail = [...base.slice(0, 9), stale, ...base.slice(9)];
    const client = round2(1.3 * miles(base) + (miles(trail) - miles(base)));
    const first = decideAppendDistance(client, trail, plain);
    expect(first.recompute).toBe(true);
    if (!first.recompute) return;
    const gq = { appendOutlierCut: first.cut };
    const again = decideAppendDistance(client, trail, { ...plain, gpsQuality: gq });
    expect(again).toMatchObject({ recompute: true, reason: "replayed_inflated", newMiles: first.newMiles });
    // The lowered figure sent back with no new jumps: left alone.
    expect(decideAppendDistance(first.newMiles, trail, { ...plain, gpsQuality: gq }).recompute).toBe(false);
  });
});
