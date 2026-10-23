import { describe, expect, it } from "vitest";
import {
  KM_PER_MILE,
  distanceIn,
  distanceToMiles,
  distanceUnitLabel,
  distanceUnitOf,
  formatDistance,
  formatDistanceNumber,
  kmToMiles,
  milesToKm,
} from "./distanceUnit.js";
import { formatMiles } from "./index.js";

describe("miles and kilometres", () => {
  it("uses the exact international mile", () => {
    expect(KM_PER_MILE).toBe(1.609344);
    expect(milesToKm(1)).toBe(1.609344);
    expect(milesToKm(10)).toBeCloseTo(16.09344, 10);
    expect(kmToMiles(1.609344)).toBe(1);
  });

  it("round-trips a typed figure back to the same miles", () => {
    for (const m of [0, 0.3, 1, 12.7, 250, 9999.9]) {
      expect(distanceToMiles(distanceIn(m, "km"), "km")).toBeCloseTo(m, 10);
      expect(distanceToMiles(distanceIn(m, "miles"), "miles")).toBe(m);
    }
  });

  it("leaves miles alone for a miles driver", () => {
    expect(distanceIn(12.3, "miles")).toBe(12.3);
    expect(distanceToMiles(12.3, "miles")).toBe(12.3);
  });

  it("reads anything but km as miles", () => {
    expect(distanceUnitOf("km")).toBe("km");
    expect(distanceUnitOf("miles")).toBe("miles");
    expect(distanceUnitOf(undefined)).toBe("miles");
    expect(distanceUnitOf(null)).toBe("miles");
    expect(distanceUnitOf("KM")).toBe("miles");
    expect(distanceUnitOf(1)).toBe("miles");
  });
});

describe("distanceUnitLabel", () => {
  it("has a short, word and spoken form", () => {
    expect(distanceUnitLabel("miles")).toBe("mi");
    expect(distanceUnitLabel("miles", "word")).toBe("miles");
    expect(distanceUnitLabel("miles", "spoken")).toBe("miles");
    expect(distanceUnitLabel("km")).toBe("km");
    expect(distanceUnitLabel("km", "word")).toBe("km");
    expect(distanceUnitLabel("km", "spoken")).toBe("kilometres");
  });
});

describe("formatDistance", () => {
  it("matches formatMiles for miles", () => {
    for (const m of [0, 1, 12.34, 1234.56, 10000]) {
      expect(formatDistance(m, "miles")).toBe(formatMiles(m));
    }
  });

  it("converts and groups en-GB for km", () => {
    expect(formatDistance(1, "km")).toBe("1.6 km");
    expect(formatDistance(10, "km")).toBe("16.1 km");
    expect(formatDistance(1000, "km")).toBe("1,609.3 km");
    expect(formatDistance(0, "km")).toBe("0 km");
  });

  it("supports fixed decimals, labels, nbsp and bare", () => {
    expect(formatDistance(5, "miles", { fixed: true })).toBe("5.0 mi");
    expect(formatDistance(5, "km", { fixed: true })).toBe("8.0 km");
    expect(formatDistance(5, "km", { decimals: 0 })).toBe("8 km");
    expect(formatDistance(5, "miles", { style: "word" })).toBe("5 miles");
    expect(formatDistance(5, "km", { style: "spoken" })).toBe("8 kilometres");
    expect(formatDistance(5, "km", { nbsp: true })).toBe("8 km");
    expect(formatDistance(5, "km", { bare: true })).toBe("8");
    expect(formatDistanceNumber(12345, "miles", { decimals: 0 })).toBe("12,345");
  });
});
