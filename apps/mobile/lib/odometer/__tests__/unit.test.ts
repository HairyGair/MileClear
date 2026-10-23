import { describe, expect, it } from "vitest";
import { milesInUnit, odometerUnitOf, readingTextToMilesText, unitShort, unitWord } from "../unit";
import { parseReadingInput } from "../logic";

describe("odometer unit", () => {
  it("miles cars are untouched", () => {
    expect(readingTextToMilesText("45100", "miles")).toBe("45100");
    expect(milesInUnit(45_100, "miles")).toBe(45_100);
    expect(unitWord("miles")).toBe("miles");
    expect(unitShort("miles")).toBe("mi");
  });

  it("a km reading is saved as miles and shows as the same km", () => {
    const milesText = readingTextToMilesText("45123", "km");
    const parsed = parseReadingInput(milesText);
    expect(parsed.kind).toBe("ok");
    const miles = parsed.kind === "ok" ? parsed.miles : 0;
    expect(miles).toBeCloseTo(28_038.13, 2);
    expect(Math.round(milesInUnit(miles, "km"))).toBe(45_123);
  });

  it("empty and junk pass through so the usual checks answer", () => {
    expect(readingTextToMilesText("", "km")).toBe("");
    expect(parseReadingInput(readingTextToMilesText(".", "km")).kind).toBe("empty");
  });

  it("anything but km is miles", () => {
    expect(odometerUnitOf("km")).toBe("km");
    expect(odometerUnitOf(undefined)).toBe("miles");
    expect(odometerUnitOf("KM")).toBe("miles");
  });
});
