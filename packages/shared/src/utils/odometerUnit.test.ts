import { describe, expect, it } from "vitest";
import {
  odometerMilesToUnit,
  odometerUnitOf,
  odometerUnitToMiles,
  odometerUnitWords,
} from "./odometerUnit.js";

describe("odometer unit", () => {
  it("miles cars are untouched", () => {
    expect(odometerUnitToMiles(45_100, "miles")).toBe(45_100);
    expect(odometerMilesToUnit(45_100, "miles")).toBe(45_100);
    expect(odometerUnitWords("That's 1,200 miles more than we expected", "miles")).toBe("That's 1,200 miles more than we expected");
  });
  it("a km reading is stored as miles once and shows as the same km", () => {
    const miles = odometerUnitToMiles(45_123, "km");
    expect(miles).toBe(28_038.13);
    expect(Math.round(odometerMilesToUnit(miles, "km"))).toBe(45_123);
  });
  it("km wording", () => {
    expect(odometerUnitWords("That's 1,200 miles more than we expected", "km")).toBe("That's 1,200 km more than we expected");
    expect(odometerUnitWords("That's 1,200 mi more than we estimated. 1 mile.", "km")).toBe("That's 1,200 km more than we estimated. 1 km.");
  });
  it("only km is km", () => {
    expect(odometerUnitOf("km")).toBe("km");
    expect(odometerUnitOf(null)).toBe("miles");
    expect(odometerUnitOf("miles")).toBe("miles");
  });
});
