import { describe, it, expect } from "vitest";
import { combineDayAndTime, isPickerSet } from "../dateTimePick";

describe("combineDayAndTime", () => {
  it("takes the day from the first date and the clock from the second", () => {
    const day = new Date(2026, 8, 28, 13, 50, 12, 345);
    const time = new Date(2026, 9, 3, 8, 35, 59, 999);
    const out = combineDayAndTime(day, time);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(8);
    expect(out.getDate()).toBe(28);
    expect(out.getHours()).toBe(8);
    expect(out.getMinutes()).toBe(35);
    expect(out.getSeconds()).toBe(0);
    expect(out.getMilliseconds()).toBe(0);
  });

  it("keeps a late evening time on the picked day", () => {
    const out = combineDayAndTime(new Date(2026, 0, 31, 0, 1), new Date(2026, 0, 1, 23, 59));
    expect(out.getDate()).toBe(31);
    expect(out.getHours()).toBe(23);
    expect(out.getMinutes()).toBe(59);
  });
});

describe("isPickerSet", () => {
  const d = new Date(2026, 9, 3, 9, 0);

  it("accepts OK", () => {
    expect(isPickerSet({ type: "set" }, d)).toBe(true);
  });

  it("refuses Cancel and back, which still carry the original date", () => {
    expect(isPickerSet({ type: "dismissed" }, d)).toBe(false);
    expect(isPickerSet({ type: "neutralButtonPressed" }, d)).toBe(false);
  });

  it("refuses a missing or invalid date", () => {
    expect(isPickerSet({ type: "set" }, undefined)).toBe(false);
    expect(isPickerSet({ type: "set" }, new Date(NaN))).toBe(false);
    expect(isPickerSet(undefined, d)).toBe(false);
  });
});
