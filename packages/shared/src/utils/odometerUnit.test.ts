import { describe, expect, it } from "vitest";
import {
  odometerBoxText,
  odometerBoxToMiles,
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

describe("odometer boxes (fuel and trip forms)", () => {
  it("miles: as before", () => {
    expect(odometerBoxText(45_100.5, "miles")).toBe("45100.5");
    expect(odometerBoxToMiles("45100.5", "miles", 45_100.5)).toEqual({ ok: true, miles: 45_100.5 });
    expect(odometerBoxToMiles("45200", "miles", 45_100)).toEqual({ ok: true, miles: 45_200 });
    expect(odometerBoxToMiles("", "miles", 45_100)).toEqual({ ok: true, miles: null });
    expect(odometerBoxToMiles("-3", "miles")).toEqual({ ok: false });
  });
  it("km: prefilled in km; untouched goes back unchanged, changed is converted once", () => {
    const stored = 28_038.07;
    expect(odometerBoxText(stored, "km")).toBe("45123");
    expect(odometerBoxToMiles("45123", "km", stored)).toEqual({ ok: true, miles: stored });
    expect(odometerBoxToMiles("45200", "km", stored)).toEqual({ ok: true, miles: odometerUnitToMiles(45_200, "km") });
    expect(odometerBoxToMiles("45123", "km", null)).toEqual({ ok: true, miles: 28_038.13 });
  });
});
