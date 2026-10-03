import { describe, it, expect } from "vitest";
import { regionForPoints, isRealPoint, zoomForRegion } from "../tripRegion";

describe("regionForPoints", () => {
  it("frames a manual trip's two pins (Liverpool to Old Trafford)", () => {
    const r = regionForPoints([
      { lat: 53.492, lng: -2.985 },
      { lat: 53.462, lng: -2.291 },
    ])!;
    expect(r.latitude).toBeCloseTo(53.477, 3);
    expect(r.longitude).toBeCloseTo(-2.638, 3);
    expect(r.latitudeDelta).toBeCloseTo(0.042, 3);
    expect(r.longitudeDelta).toBeCloseTo(0.9716, 3);
  });

  it("keeps a minimum span for a very short trip or a single point", () => {
    const r = regionForPoints([{ lat: 53.4, lng: -2.9 }])!;
    expect(r.latitudeDelta).toBe(0.005);
    expect(r.longitudeDelta).toBe(0.005);
    expect(r.latitude).toBe(53.4);
  });

  it("ignores 0,0, NaN and out-of-range points instead of zooming out to the world", () => {
    const r = regionForPoints([
      { lat: 0, lng: 0 },
      { lat: NaN, lng: -2.9 },
      { lat: 53.49, lng: -2.98 },
      { lat: 123, lng: 4 },
      null,
      { lat: 53.46, lng: -2.29 },
    ])!;
    expect(r.latitude).toBeCloseTo(53.475, 3);
    expect(r.longitudeDelta).toBeLessThan(1);
  });

  it("returns null with no usable points", () => {
    expect(regionForPoints([])).toBeNull();
    expect(regionForPoints([{ lat: 0, lng: 0 }])).toBeNull();
  });
});

describe("isRealPoint", () => {
  it("accepts a UK fix and refuses placeholders", () => {
    expect(isRealPoint({ lat: 53.4, lng: -2.9 })).toBe(true);
    expect(isRealPoint({ lat: 0, lng: 0 })).toBe(false);
    expect(isRealPoint({ lat: Infinity, lng: 0 })).toBe(false);
    expect(isRealPoint(undefined)).toBe(false);
  });
});

describe("zoomForRegion", () => {
  const elisa = regionForPoints([
    { lat: 53.492, lng: -2.985 },
    { lat: 53.462, lng: -2.291 },
  ])!;

  it("frames a 37 mile trip at county level on a phone-width card, never the world", () => {
    const z = zoomForRegion(elisa, 343, 120);
    expect(z).toBeGreaterThan(8);
    expect(z).toBeLessThan(9);
    // At that zoom the card shows more longitude than the trip spans.
    const shownLng = (343 * 360) / (256 * Math.pow(2, z));
    expect(shownLng).toBeGreaterThan(0.694);
  });

  it("zooms in for a short hop and is capped at street level", () => {
    const tiny = regionForPoints([{ lat: 53.4, lng: -2.9 }])!;
    expect(zoomForRegion(tiny, 343, 120)).toBeLessThanOrEqual(16);
    expect(zoomForRegion(tiny, 343, 120)).toBeGreaterThan(13);
  });

  it("never goes below a whole-country view", () => {
    const huge = regionForPoints([
      { lat: 50, lng: -6 },
      { lat: 58.6, lng: 1.7 },
    ])!;
    expect(zoomForRegion(huge, 100, 60)).toBe(3);
  });
});
