import { describe, expect, it } from "vitest";
import {
  odometerBoxText,
  odometerBoxValue,
  odometerBoxReduce,
  odometerBoxMiles,
  ODOMETER_BOX_EMPTY,
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
  it("miles: exactly parseFloat, as before (0, negatives, NaN, prefill)", () => {
    const m = (text: string, touched = true) => odometerBoxValue(text, { unit: "miles", touched, loadedMiles: 45_100.5 });
    expect(odometerBoxText(45_100.5, "miles")).toBe("45100.5");
    expect(m("45100.5", false)).toBe(45_100.5);
    expect(m("45200")).toBe(45_200);
    expect(m("0")).toBe(0);
    expect(m("-5")).toBe(-5);
    expect(m("abc")).toBeNaN();
  });
  it("km: prefilled in km; untouched goes back as stored, typed is converted once", () => {
    const stored = 28_038.07;
    expect(odometerBoxText(stored, "km")).toBe("45123");
    expect(odometerBoxValue("45123", { unit: "km", touched: false, loadedMiles: stored })).toBe(stored);
    expect(odometerBoxValue("45200", { unit: "km", touched: true, loadedMiles: stored })).toBe(odometerUnitToMiles(45_200, "km"));
    expect(odometerBoxValue("45123", { unit: "km", touched: true, loadedMiles: null })).toBe(28_038.13);
    expect(odometerBoxValue("0", { unit: "km", touched: true })).toBe(0);
  });
});

describe("odometer box state", () => {
  const load = (miles: number | null) => odometerBoxReduce(ODOMETER_BOX_EMPTY, { type: "load", miles });

  it("UK / miles: filled at once as before, the late car list changes nothing, typing wins", () => {
    let s = load(45_100);
    expect(s.text).toBe("45100");
    expect(odometerBoxMiles(s)).toBe(45_100);
    s = odometerBoxReduce(s, { type: "carUnit", unit: "miles" });
    expect(s.text).toBe("45100");
    // Typed before or after the cars load: what's typed is what's saved.
    s = odometerBoxReduce(load(45_100), { type: "type", text: "45250" });
    s = odometerBoxReduce(s, { type: "carUnit", unit: "miles" });
    expect(odometerBoxMiles(s)).toBe(45_250);
    // 0 and negatives pass through as before (the server or the form's own check answers).
    expect(odometerBoxMiles(odometerBoxReduce(load(10), { type: "type", text: "0" }))).toBe(0);
    expect(odometerBoxMiles(odometerBoxReduce(load(10), { type: "type", text: "-5" }))).toBe(-5);
  });

  it("a load with the car's unit already known fills in that unit at once", () => {
    const s = odometerBoxReduce(ODOMETER_BOX_EMPTY, { type: "load", miles: 28_038.07, unit: "km" });
    expect(s).toEqual({ text: "45123", loadedMiles: 28_038.07, unit: "km", touched: false });
    expect(odometerBoxReduce(ODOMETER_BOX_EMPTY, { type: "load", miles: 45_100, unit: "miles" }).text).toBe("45100");
  });

  it("km car: re-filled in km once the cars load, untouched goes back as stored", () => {
    const s = odometerBoxReduce(load(28_038.07), { type: "carUnit", unit: "km" });
    expect(s.text).toBe("45123");
    expect(odometerBoxMiles(s)).toBe(28_038.07);
  });

  it("switching between a miles and a km car while untouched never misreads it", () => {
    let s = odometerBoxReduce(load(28_038.07), { type: "carUnit", unit: "km" });
    s = odometerBoxReduce(s, { type: "carUnit", unit: "miles" });
    expect(s.text).toBe("28038.07");
    expect(odometerBoxMiles(s)).toBe(28_038.07);
    s = odometerBoxReduce(s, { type: "carUnit", unit: "km" });
    expect(odometerBoxMiles(s)).toBe(28_038.07);
  });

  it("a typed box converts in the unit it was typed in, whatever car is picked after", () => {
    let s = odometerBoxReduce(load(28_038.07), { type: "carUnit", unit: "km" });
    s = odometerBoxReduce(s, { type: "type", text: "45200" });
    s = odometerBoxReduce(s, { type: "carUnit", unit: "miles" });
    expect(s.unit).toBe("km");
    expect(odometerBoxMiles(s)).toBe(odometerUnitToMiles(45_200, "km"));
    // Typed in miles before a km car's unit arrived: read as miles.
    let t = odometerBoxReduce(load(null), { type: "type", text: "30000" });
    t = odometerBoxReduce(t, { type: "carUnit", unit: "km" });
    expect(odometerBoxMiles(t)).toBe(30_000);
  });
});
