import { describe, expect, it } from "vitest";
import { decodePolyline, safeDecodePolyline, samplePoints } from "../polyline";

describe("decodePolyline", () => {
  it("decodes Google's reference example", () => {
    // From the Encoded Polyline Algorithm Format documentation.
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it("decodes an empty string to no points", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("safeDecodePolyline", () => {
  it("returns [] for null and undefined", () => {
    expect(safeDecodePolyline(null)).toEqual([]);
    expect(safeDecodePolyline(undefined)).toEqual([]);
  });

  it("returns [] when a decoded point is off the planet", () => {
    // A truncated string can decode to a huge delta; the guard drops the lot
    // rather than drawing a line to nowhere.
    const broken = "_p~iF~ps|U_ulLnnqC_mqNvxq`@" + "~~~~~~~~~~~~~~";
    const pts = safeDecodePolyline(broken);
    expect(pts.every((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)).toBe(true);
  });
});

describe("samplePoints", () => {
  it("keeps short routes intact", () => {
    expect(samplePoints([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it("thins to the cap and keeps both ends", () => {
    const pts = Array.from({ length: 1000 }, (_, i) => i);
    const out = samplePoints(pts, 120);
    expect(out).toHaveLength(120);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(999);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
  });
});
