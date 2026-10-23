import { describe, expect, it } from "vitest";
import { checkReading, liveHint } from "../logic";
import { milesInUnit, odometerInUnit, odometerUnitOf, readingForSave, readingTextToMilesText, unitShort, unitWord } from "../unit";
import { odometerUnitWords } from "@mileclear/shared";
import type { VehicleOdometer } from "../../api/odometer";

// Every Update odometer sheet (vehicle screen, odometer log, readings list,
// Home ask) reads the unit from GET /vehicles/:id/odometer and saves through
// readingForSave, so a km entry is converted once wherever it's typed.

const odo = (unit: "miles" | "km" | null): VehicleOdometer => ({
  odometerUnit: unit,
  current: {
    miles: 28_000,
    isEstimated: true,
    tripMilesSince: 100,
    basis: { readingMiles: 27_900, readAt: "2026-06-01T00:00:00Z", source: "user", sourceId: "r1" },
  },
  readings: [
    { id: "r1", readingMiles: 27_900, readAt: "2026-06-01T00:00:00Z", source: "user", sourceId: "r1", used: true, rejectReason: null },
  ],
});

describe("odometer unit", () => {
  it("miles cars are untouched", () => {
    expect(readingForSave("45100", "miles")).toBe(45_100);
    expect(readingTextToMilesText("45100", "miles")).toBe("45100");
    expect(milesInUnit(45_100, "miles")).toBe(45_100);
    expect(odometerInUnit(odo("miles"), "miles")).toEqual(odo("miles"));
    expect(unitWord("miles")).toBe("miles");
    expect(unitShort("miles")).toBe("mi");
  });

  it("a km entry is stored as miles once and shows as the same km", () => {
    const stored = readingForSave("45123", "km");
    expect(stored).toBe(28_038.13);
    expect(Math.round(milesInUnit(stored!, "km"))).toBe(45_123);
    // Saving the stored figure again as miles doesn't convert it a second time.
    expect(readingForSave(String(stored), "miles")).toBe(stored);
  });

  it("the unit comes with the odometer: null and missing are miles", () => {
    expect(odometerUnitOf(odo("km").odometerUnit)).toBe("km");
    expect(odometerUnitOf(odo(null).odometerUnit)).toBe("miles");
    expect(odometerUnitOf(undefined)).toBe("miles");
  });

  it("a km car's checks run in km and say km", () => {
    const view = odometerInUnit(odo("km"), "km")!;
    expect(Math.round(view.current!.miles)).toBe(45_062);
    expect(Math.round(view.readings[0].readingMiles)).toBe(44_901);
    // 46,000 km typed: about 940 km over the estimate, close enough, no question.
    const ok = checkReading({ text: "46000", readAt: new Date(), now: new Date(Date.now() + 60_000), estimateMiles: view.current!.miles, readings: view.readings, mot: null });
    expect(ok.kind).toBe("ok");
    // 44,000 km typed is below the 44,901 km reading: blocked, in km.
    const low = liveHint({ text: "44000", estimateMiles: view.current!.miles, earlier: { readingMiles: view.readings[0].readingMiles, readAt: view.readings[0].readAt } });
    expect(odometerUnitWords(low.message!, "km")).toContain("44,901");
    // 50,000 km is about 4,940 km over: the question says km.
    const far = checkReading({ text: "50000", readAt: new Date(), now: new Date(Date.now() + 60_000), estimateMiles: view.current!.miles, readings: view.readings, mot: null });
    expect(far.kind).toBe("confirm");
    if (far.kind === "confirm") expect(odometerUnitWords(far.title, "km")).toMatch(/^That's 4,938 km more than we expected$/);
  });

  it("empty and junk aren't saved", () => {
    expect(readingForSave("", "km")).toBeNull();
    expect(readingForSave(".", "km")).toBeNull();
  });
});
