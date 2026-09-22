import { describe, expect, it } from "vitest";
import {
  decideSpeedStart,
  isNearMiss,
  SPEED_START_LOOSE_ACCURACY_M,
  SPEED_START_TIGHT_ACCURACY_M,
} from "../speedStartRule";

const mph = (n: number) => n * 0.44704;

describe("decideSpeedStart", () => {
  it("starts on a tight fix above 12 mph, as before 22 Sep 2026", () => {
    expect(decideSpeedStart(mph(12), 30)).toEqual({ start: true, tier: "tight" });
    expect(decideSpeedStart(mph(50), 4)).toEqual({ start: true, tier: "tight" });
  });

  it("starts on a looser fix only when it is clearly faster than a run or a bike", () => {
    expect(decideSpeedStart(mph(15), 50)).toEqual({ start: true, tier: "loose" });
    expect(decideSpeedStart(mph(14.9), 40)).toEqual({ start: false, reason: "accuracy" });
    expect(decideSpeedStart(mph(40), 50.1)).toEqual({ start: false, reason: "accuracy" });
  });

  // Every refusal logged on 22 Sep 2026, the first full day of the data: none
  // became a trip.
  it("starts on the fixes Samantha Birch, Michelle Rustage and Abdifatah Abdulle lost", () => {
    const refused: Array<[number, number]> = [
      [19, 33], // Samantha 12:30
      [28, 38], [24, 49], [26, 34], [22, 47], [27, 49], [30, 34], [28, 50], [21, 44], // Michelle
      [23, 33], // Abdifatah
    ];
    for (const [speed, acc] of refused) {
      expect(decideSpeedStart(mph(speed), acc).start, `${speed} mph at ${acc} m`).toBe(true);
    }
    // His second fix was 55 m: still refused, but the 33 m one before it starts.
    expect(decideSpeedStart(mph(23), 55).start).toBe(false);
  });

  it("refuses slow, missing or non-numeric fixes", () => {
    expect(decideSpeedStart(mph(11.9), 5)).toEqual({ start: false, reason: "too_slow" });
    expect(decideSpeedStart(-1, 5)).toEqual({ start: false, reason: "too_slow" });
    expect(decideSpeedStart(null, 5)).toEqual({ start: false, reason: "no_fix" });
    expect(decideSpeedStart(mph(30), null)).toEqual({ start: false, reason: "no_fix" });
    expect(decideSpeedStart(Number.NaN, 5)).toEqual({ start: false, reason: "no_fix" });
  });

  it("keeps the loose tier strictly looser than the tight one", () => {
    expect(SPEED_START_LOOSE_ACCURACY_M).toBeGreaterThan(SPEED_START_TIGHT_ACCURACY_M);
  });
});

describe("isNearMiss", () => {
  it("is a driving-speed fix refused only for its accuracy", () => {
    expect(isNearMiss(mph(40), 80)).toBe(true);
    expect(isNearMiss(mph(13), 40)).toBe(true);
  });

  it("is not a start, a slow fix, or a missing one", () => {
    expect(isNearMiss(mph(40), 10)).toBe(false);
    expect(isNearMiss(mph(5), 80)).toBe(false);
    expect(isNearMiss(null, 80)).toBe(false);
  });
});
