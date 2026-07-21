import { describe, it, expect } from "vitest";
import {
  detectDwells,
  partitionAtCuts,
  legDistanceMiles,
  encodePolyline,
  SplitValidationError,
  type SplitCoord,
} from "../../services/tripSplit.js";
import { decodePolyline } from "../../services/mapMatching.js";

// ---------------------------------------------------------------------------
// Synthetic route builder. Coords 10s apart, heading north; speed in m/s
// (13.4 m/s ≈ 30 mph driving, 0.4 m/s ≈ 0.9 mph stopped).
// ---------------------------------------------------------------------------
const T0 = new Date("2026-07-18T17:47:00Z").getTime();
const DRIVING = 13.4;
const STOPPED = 0.4;

function route(segments: Array<{ n: number; speed: number }>): SplitCoord[] {
  const out: SplitCoord[] = [];
  let lat = 50.85;
  let i = 0;
  for (const seg of segments) {
    for (let k = 0; k < seg.n; k++) {
      // Move only while driving so dwells cluster in place like real stops.
      if (seg.speed > 2) lat += 0.0006; // ~40m per 10s tick
      out.push({
        lat,
        lng: 0.57,
        speed: seg.speed,
        recordedAt: new Date(T0 + i * 10_000),
      });
      i++;
    }
  }
  return out;
}

describe("detectDwells", () => {
  it("finds a mid-route stop >= 60s and cuts at its middle", () => {
    // 5min drive, 90s stop, 5min drive
    const coords = route([
      { n: 30, speed: DRIVING },
      { n: 9, speed: STOPPED },
      { n: 30, speed: DRIVING },
    ]);
    const dwells = detectDwells(coords);
    expect(dwells).toHaveLength(1);
    expect(dwells[0].dwellSec).toBeGreaterThanOrEqual(60);
    // Cut lands inside the stopped run (indices 30..38)
    expect(dwells[0].cutIndex).toBeGreaterThanOrEqual(30);
    expect(dwells[0].cutIndex).toBeLessThanOrEqual(38);
    expect(dwells[0].timestamp).toEqual(coords[dwells[0].cutIndex].recordedAt);
  });

  it("ignores stops shorter than the minimum dwell (traffic lights)", () => {
    // 40s stop only
    const coords = route([
      { n: 30, speed: DRIVING },
      { n: 4, speed: STOPPED },
      { n: 30, speed: DRIVING },
    ]);
    expect(detectDwells(coords)).toHaveLength(0);
  });

  it("ignores leading and trailing stillness (parking at the ends)", () => {
    const coords = route([
      { n: 12, speed: STOPPED },
      { n: 30, speed: DRIVING },
      { n: 12, speed: STOPPED },
    ]);
    expect(detectDwells(coords)).toHaveLength(0);
  });

  it("finds every drop in a multi-drop run (Will's 5-stop shape)", () => {
    const segs: Array<{ n: number; speed: number }> = [];
    for (let d = 0; d < 5; d++) {
      segs.push({ n: 24, speed: DRIVING }); // 4min hop
      segs.push({ n: 11, speed: STOPPED }); // ~110s drop
    }
    segs.push({ n: 24, speed: DRIVING }); // back to base
    const dwells = detectDwells(route(segs));
    expect(dwells).toHaveLength(5);
    // Chronological
    const idx = dwells.map((d) => d.cutIndex);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("falls back to haversine speed when stored speed is null", () => {
    const coords = route([
      { n: 30, speed: DRIVING },
      { n: 9, speed: STOPPED },
      { n: 30, speed: DRIVING },
    ]).map((c) => ({ ...c, speed: null }));
    const dwells = detectDwells(coords);
    expect(dwells).toHaveLength(1);
  });

  it("returns nothing for trails too short to split", () => {
    const coords = route([{ n: 6, speed: DRIVING }]);
    expect(detectDwells(coords)).toEqual([]);
  });
});

describe("partitionAtCuts", () => {
  const coords = route([{ n: 40, speed: DRIVING }]);

  it("splits into legs that cover every coord exactly once", () => {
    const legs = partitionAtCuts(coords, [12, 25]);
    expect(legs).toHaveLength(3);
    expect(legs.flat()).toHaveLength(coords.length);
    expect(legs[0][legs[0].length - 1]).toBe(coords[12]);
    expect(legs[1][0]).toBe(coords[13]);
  });

  it("dedupes and sorts cut indices", () => {
    const legs = partitionAtCuts(coords, [25, 12, 25]);
    expect(legs).toHaveLength(3);
  });

  it("rejects a cut at the route edge", () => {
    expect(() => partitionAtCuts(coords, [0])).toThrow(SplitValidationError);
    expect(() => partitionAtCuts(coords, [39])).toThrow(SplitValidationError);
  });

  it("rejects legs with too few coords", () => {
    expect(() => partitionAtCuts(coords, [2])).toThrow(SplitValidationError);
  });
});

describe("legDistanceMiles", () => {
  it("sums haversine over the leg and legs ≈ whole", () => {
    const coords = route([{ n: 60, speed: DRIVING }]);
    const whole = legDistanceMiles(coords);
    const legs = partitionAtCuts(coords, [29]);
    const sum = legs.reduce((s, l) => s + legDistanceMiles(l), 0);
    expect(whole).toBeGreaterThan(0.5);
    // Legs lose only the single hop across the cut boundary.
    expect(Math.abs(whole - sum)).toBeLessThan(0.1);
  });
});

describe("encodePolyline", () => {
  it("round-trips through the existing decoder", () => {
    const points = [
      { lat: 50.85123, lng: 0.57219 },
      { lat: 50.85234, lng: 0.57345 },
      { lat: 50.8571, lng: 0.579 },
      { lat: -1.00005, lng: -0.5 },
    ];
    const decoded = decodePolyline(encodePolyline(points));
    expect(decoded).toHaveLength(points.length);
    for (let i = 0; i < points.length; i++) {
      expect(decoded[i].lat).toBeCloseTo(points[i].lat, 4);
      expect(decoded[i].lng).toBeCloseTo(points[i].lng, 4);
    }
  });

  it("matches Google's reference example", () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const encoded = encodePolyline([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
    expect(encoded).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });
});
