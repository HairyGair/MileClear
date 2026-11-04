import { describe, it, expect } from "vitest";
import {
  figureText,
  insurancePeriod,
  insuranceProgress,
  isBehind,
  paceLine,
  parseLimitInput,
  parseSetting,
  renewsText,
  startsLater,
  startsText,
} from "../miles";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe("insurancePeriod", () => {
  it("runs from the latest anniversary on or before today to the next", () => {
    const p = insurancePeriod("2026-11-01", at(2027, 3, 15))!;
    expect(p.start).toEqual(new Date(2026, 10, 1));
    expect(p.renews).toEqual(new Date(2027, 10, 1));
    expect(p.days).toBe(365);
    expect(p.dayNumber).toBe(135);
  });

  it("counts the start day as day 1 and the day before renewal as the last", () => {
    expect(insurancePeriod("2026-11-01", at(2026, 11, 1, 0))!.dayNumber).toBe(1);
    expect(insurancePeriod("2026-11-01", at(2027, 10, 31, 23))!.dayNumber).toBe(365);
    expect(insurancePeriod("2026-11-01", at(2027, 11, 1, 0))!.start).toEqual(new Date(2027, 10, 1));
  });

  it("takes a start date in the future as a year that began a year before it", () => {
    const p = insurancePeriod("2026-12-10", at(2026, 11, 4))!;
    expect(p.start).toEqual(new Date(2025, 11, 10));
    expect(p.renews).toEqual(new Date(2026, 11, 10));
  });

  it("renews on 28 Feb in a year with no 29th, and has 366 days over a leap day", () => {
    const p = insurancePeriod("2028-02-29", at(2029, 6, 1))!;
    expect(p.start).toEqual(new Date(2029, 1, 28));
    expect(insurancePeriod("2027-03-01", at(2027, 6, 1))!.days).toBe(366);
  });

  it("is not a period for a bad date", () => {
    expect(insurancePeriod("2026-02-30", at(2026, 6, 1))).toBeNull();
    expect(insurancePeriod("nonsense", at(2026, 6, 1))).toBeNull();
  });
});

describe("insuranceProgress and its words", () => {
  const period = insurancePeriod("2026-11-01", at(2027, 5, 1))!; // day 182 of 365

  it("is under pace with miles in hand", () => {
    const pr = insuranceProgress(10000, 4210, period);
    expect(Math.round(pr.paceMiles)).toBe(4986);
    expect(figureText(pr)).toBe("4,210 of 10,000 miles");
    expect(paceLine(pr)).toBe("776 miles under pace · 31 miles a day left");
    expect(isBehind(pr, period)).toBe(false);
  });

  it("is over pace, and amber once that is more than a day's allowance", () => {
    const pr = insuranceProgress(10000, 5200, period);
    expect(paceLine(pr)).toBe("214 miles over pace · 26 miles a day left");
    expect(isBehind(pr, period)).toBe(true);
    expect(isBehind(insuranceProgress(10000, 5000, period), period)).toBe(false);
  });

  it("says by how much once past the limit, with no daily figure", () => {
    const pr = insuranceProgress(10000, 10120, period);
    expect(pr.perDayLeft).toBeNull();
    expect(pr.fraction).toBe(1);
    expect(paceLine(pr)).toBe("120 miles over your limit");
  });

  it("shows a small daily allowance to one decimal place", () => {
    const pr = insuranceProgress(1000, 980, period);
    expect(paceLine(pr)).toMatch(/· 0\.1 miles a day left$/);
  });

  it("says when the year renews", () => {
    expect(renewsText(period)).toBe("Renews 1 Nov 2027");
  });
});

describe("a policy that starts later", () => {
  it("is not counted until its start day", () => {
    const later = startsLater("2026-12-01", at(2026, 11, 4))!;
    expect(startsText(later)).toBe("Starts 1 Dec 2026");
    expect(startsLater("2026-11-04", at(2026, 11, 4, 23))).toBeNull();
    expect(startsLater("2025-12-01", at(2026, 11, 4))).toBeNull();
  });
});

describe("inputs", () => {
  it("reads a typed limit", () => {
    expect(parseLimitInput("10,000")).toBe(10000);
    expect(parseLimitInput(" 8000 ")).toBe(8000);
    expect(parseLimitInput("0")).toBeNull();
    expect(parseLimitInput("8000.5")).toBeNull();
    expect(parseLimitInput("lots")).toBeNull();
    expect(parseLimitInput("9999999")).toBeNull();
  });

  it("reads the stored setting, and treats anything broken as not set", () => {
    expect(parseSetting('{"limitMiles":10000,"startDate":"2026-11-01","vehicleId":null}')).toEqual({
      limitMiles: 10000,
      startDate: "2026-11-01",
      vehicleId: null,
    });
    expect(parseSetting('{"limitMiles":10000,"startDate":"2026-13-01"}')).toBeNull();
    expect(parseSetting("{")).toBeNull();
    expect(parseSetting(null)).toBeNull();
  });
});
