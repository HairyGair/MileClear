import { describe, it, expect } from "vitest";
import {
  plausibleMissedJourneyTimes,
  ASSUMED_MPH,
  MAX_PLAUSIBLE_BRACKET_MS,
  MIN_TRAVEL_MS,
} from "../missedJourneyTimes";

const at = (iso: string) => new Date(iso);

describe("plausibleMissedJourneyTimes", () => {
  it("leaves a normal bracket alone", () => {
    const r = plausibleMissedJourneyTimes({
      departedAt: at("2026-09-14T09:27:00Z"),
      arrivedAt: at("2026-09-14T09:52:00Z"),
      estimatedMiles: 1.3,
    });
    expect(r.adjusted).toBe(false);
    expect(r.endedAt.toISOString()).toBe("2026-09-14T09:52:00.000Z");
  });

  it("leaves a bracket exactly at the threshold alone", () => {
    const dep = at("2026-09-14T09:00:00Z");
    const r = plausibleMissedJourneyTimes({
      departedAt: dep,
      arrivedAt: new Date(dep.getTime() + MAX_PLAUSIBLE_BRACKET_MS),
      estimatedMiles: 1.0,
    });
    expect(r.adjusted).toBe(false);
  });

  // Rachel Thorndyke, 12 Sep 2026: Maydale Farm 19:51 -> Home 08:05, 1.43 mi.
  it("derives a duration for an overnight bracket", () => {
    const r = plausibleMissedJourneyTimes({
      departedAt: at("2026-09-12T19:51:00Z"),
      arrivedAt: at("2026-09-13T08:05:00Z"),
      estimatedMiles: 1.43,
    });
    expect(r.adjusted).toBe(true);
    expect(r.startedAt.toISOString()).toBe("2026-09-12T19:51:00.000Z");
    // 1.43 mi at 20 mph = 4.29 min
    const mins = (r.endedAt.getTime() - r.startedAt.getTime()) / 60000;
    expect(mins).toBeCloseTo((1.43 / ASSUMED_MPH) * 60, 2);
    expect(mins).toBeLessThan(10);
  });

  it("never produces a zero-length trip", () => {
    const r = plausibleMissedJourneyTimes({
      departedAt: at("2026-09-12T19:51:00Z"),
      arrivedAt: at("2026-09-13T08:05:00Z"),
      estimatedMiles: 0,
    });
    expect(r.adjusted).toBe(true);
    expect(r.endedAt.getTime() - r.startedAt.getTime()).toBe(MIN_TRAVEL_MS);
  });

  it("never pushes the end past the bracket", () => {
    // Absurd distance for the bracket: clamp to arrivedAt.
    const r = plausibleMissedJourneyTimes({
      departedAt: at("2026-09-12T00:00:00Z"),
      arrivedAt: at("2026-09-12T04:00:00Z"),
      estimatedMiles: 5000,
    });
    expect(r.endedAt.toISOString()).toBe("2026-09-12T04:00:00.000Z");
  });

  it("is inert on a reversed or zero bracket", () => {
    const r = plausibleMissedJourneyTimes({
      departedAt: at("2026-09-12T10:00:00Z"),
      arrivedAt: at("2026-09-12T10:00:00Z"),
      estimatedMiles: 1,
    });
    expect(r.adjusted).toBe(false);
  });
});
