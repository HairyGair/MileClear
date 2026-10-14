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
