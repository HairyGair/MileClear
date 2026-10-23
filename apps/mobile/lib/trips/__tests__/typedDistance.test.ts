import { describe, expect, it } from "vitest";
import { MAX_TYPED_TRIP_MILES, typedDistanceRejected, typedTripMiles } from "../typedDistance";

describe("typedTripMiles", () => {
  it("reads miles as typed, to 2 places", () => {
    expect(typedTripMiles("12.4")).toBe(12.4);
    expect(typedTripMiles("12,45")).toBe(12.45);
    expect(typedTripMiles("12.345")).toBe(12.35);
    expect(typedTripMiles("1,000")).toBe(1000);
    expect(typedTripMiles("48 mi")).toBe(48);
  });

  it("converts a km box to miles", () => {
    expect(typedTripMiles("16.09344", "km")).toBe(10);
    expect(typedTripMiles("100", "km")).toBe(62.14);
    expect(typedTripMiles("20 km", "km")).toBe(12.43);
  });

  it("caps after converting: 1200 km is a trip, 1200 miles is not", () => {
    expect(typedTripMiles("1200", "km")).toBe(745.65);
    expect(typedTripMiles("1200", "miles")).toBeNull();
    expect(typedTripMiles("1609", "km")).toBe(999.79);
    expect(typedTripMiles("1700", "km")).toBeNull();
    expect(typedTripMiles(String(MAX_TYPED_TRIP_MILES))).toBe(1000);
  });

  it("refuses nothing, zero and junk", () => {
    expect(typedTripMiles("")).toBeNull();
    expect(typedTripMiles("0")).toBeNull();
    expect(typedTripMiles("0", "km")).toBeNull();
    expect(typedTripMiles("lots")).toBeNull();
    expect(typedTripMiles("12.4.5")).toBeNull();
  });
});

describe("typedDistanceRejected", () => {
  it("blocks a save while a typed box holds a figure that can't be saved", () => {
    // Typed "120" then "1200" into a miles box: the 120 must not save.
    expect(typedDistanceRejected({ typed: true, text: "1200", unit: "miles" })).toBe(true);
    expect(typedDistanceRejected({ typed: true, text: "0", unit: "km" })).toBe(true);
    expect(typedDistanceRejected({ typed: true, text: "abc", unit: "miles" })).toBe(true);
  });

  it("lets a good figure, an empty box or an untouched box through", () => {
    expect(typedDistanceRejected({ typed: true, text: "1200", unit: "km" })).toBe(false);
    expect(typedDistanceRejected({ typed: true, text: "", unit: "miles" })).toBe(false);
    expect(typedDistanceRejected({ typed: false, text: "1200", unit: "miles" })).toBe(false);
  });
});
