/**
 * The stale-shift rule. The motivating case is the Android driver of 22 Sep
 * 2026 whose shift started at 07:19Z and was still open 36 hours later with
 * nothing recorded; the guard case is a real 10-hour working day.
 */
import { describe, it, expect } from "vitest";
import {
  staleShiftDecision,
  lastDrivingFixMs,
  DRIVING_SPEED_MS,
  type ShiftFix,
} from "../staleShiftRule";

const START = Date.parse("2026-09-22T07:19:00Z");
const mins = (n: number) => n * 60_000;
const hours = (n: number) => n * 3_600_000;

/** A drive of `n` fixes, 10 s apart, heading north at ~13 m/s (~30 mph). */
function drive(fromMs: number, n: number, speed: number | null = 13): ShiftFix[] {
  return Array.from({ length: n }, (_, i) => ({
    lat: 51.5 + (i * 130) / 111_000,
    lng: -0.12,
    speed,
    accuracy: 10,
    recordedAtMs: fromMs + i * 10_000,
  }));
}

describe("a fresh shift is left alone", () => {
  it("keeps a shift started ten minutes ago with nothing recorded", () => {
    expect(
      staleShiftDecision({ nowMs: START + mins(10), shiftStartedMs: START, lastDrivingMs: null })
    ).toEqual({ action: "keep", reason: "too_young" });
  });

  it("keeps a shift just under three hours old", () => {
    expect(
      staleShiftDecision({ nowMs: START + hours(3) - 1, shiftStartedMs: START, lastDrivingMs: null })
    ).toEqual({ action: "keep", reason: "too_young" });
  });
});

describe("a long shift with recent driving stays open", () => {
  it("does not end a real 10-hour working day that drove within the hour", () => {
    // Drives every hour of the day; the last one finished 40 minutes ago.
    const fixes = Array.from({ length: 10 }, (_, h) => drive(START + hours(h), 30)).flat();
    const now = START + hours(10);
    const last = lastDrivingFixMs(fixes);
    expect(last).not.toBeNull();
    expect(now - last!).toBeLessThan(hours(1));
    expect(staleShiftDecision({ nowMs: now, shiftStartedMs: START, lastDrivingMs: last })).toEqual({
      action: "keep",
      reason: "recent_driving",
    });
  });

  it("keeps a day with a long lunch break under three hours", () => {
    const now = START + hours(8);
    expect(
      staleShiftDecision({ nowMs: now, shiftStartedMs: START, lastDrivingMs: now - hours(2.5) })
    ).toEqual({ action: "keep", reason: "recent_driving" });
  });

  it("counts driving from a trip end when the breadcrumbs are gone", () => {
    const now = START + hours(10);
    expect(
      staleShiftDecision({ nowMs: now, shiftStartedMs: START, lastDrivingMs: now - mins(20) })
    ).toEqual({ action: "keep", reason: "recent_driving" });
  });

  it("recognises driving from geometry when the phone reports no speed", () => {
    const fixes = drive(START + hours(5), 20, null);
    expect(lastDrivingFixMs(fixes)).toBe(fixes[fixes.length - 1].recordedAtMs);
  });
});

describe("a long shift with no driving ends", () => {
  it("ends the 22 Sep shift: open 36 hours, nothing recorded", () => {
    expect(
      staleShiftDecision({ nowMs: START + hours(36), shiftStartedMs: START, lastDrivingMs: null })
    ).toEqual({ action: "end", hoursOpen: 36, hoursSinceDriving: 36 });
  });

  it("ends as soon as three hours pass with nothing recorded", () => {
    expect(
      staleShiftDecision({ nowMs: START + hours(3), shiftStartedMs: START, lastDrivingMs: null })
    ).toEqual({ action: "end", hoursOpen: 3, hoursSinceDriving: 3 });
  });

  it("ends a day whose last drive was over three hours ago", () => {
    const fixes = drive(START + hours(1), 30);
    const last = lastDrivingFixMs(fixes)!;
    const now = last + hours(3.5);
    const d = staleShiftDecision({ nowMs: now, shiftStartedMs: START, lastDrivingMs: last });
    expect(d.action).toBe("end");
    if (d.action === "end") expect(d.hoursSinceDriving).toBe(3.5);
  });

  it("ignores a phone sitting still on a desk: jitter is not driving", () => {
    // Slow wander, poor accuracy, and a lone jump across an hour-long gap.
    const fixes: ShiftFix[] = [
      { lat: 51.5, lng: -0.12, speed: 0, accuracy: 30, recordedAtMs: START + mins(5) },
      { lat: 51.5003, lng: -0.12, speed: 0.2, accuracy: 35, recordedAtMs: START + mins(9) },
      { lat: 51.52, lng: -0.12, speed: 9, accuracy: 900, recordedAtMs: START + mins(30) },
      { lat: 51.51, lng: -0.12, speed: 0, accuracy: 20, recordedAtMs: START + mins(95) },
    ];
    expect(lastDrivingFixMs(fixes)).toBeNull();
    expect(
      staleShiftDecision({
        nowMs: START + hours(4),
        shiftStartedMs: START,
        lastDrivingMs: lastDrivingFixMs(fixes),
      }).action
    ).toBe("end");
  });

  it("treats driving from before the shift started as no driving", () => {
    const d = staleShiftDecision({
      nowMs: START + hours(4),
      shiftStartedMs: START,
      lastDrivingMs: START - hours(1),
    });
    expect(d).toEqual({ action: "end", hoursOpen: 4, hoursSinceDriving: 4 });
  });
});

describe("missing or broken data never ends a shift by accident", () => {
  it("keeps a shift with no start time", () => {
    expect(
      staleShiftDecision({ nowMs: START + hours(40), shiftStartedMs: null, lastDrivingMs: null })
    ).toEqual({ action: "keep", reason: "no_start_time" });
  });

  it("keeps a shift whose start time is unparseable", () => {
    expect(
      staleShiftDecision({ nowMs: START + hours(40), shiftStartedMs: NaN, lastDrivingMs: null })
    ).toEqual({ action: "keep", reason: "no_start_time" });
  });

  it("keeps a shift that starts in the future (phone clock wrong)", () => {
    expect(
      staleShiftDecision({ nowMs: START, shiftStartedMs: START + hours(5), lastDrivingMs: null })
    ).toEqual({ action: "keep", reason: "clock_skew" });
  });

  it("keeps a shift whose last driving is in the future", () => {
    expect(
      staleShiftDecision({
        nowMs: START + hours(5),
        shiftStartedMs: START,
        lastDrivingMs: START + hours(6),
      })
    ).toEqual({ action: "keep", reason: "recent_driving" });
  });

  it("finds no driving in an empty or unusable breadcrumb list", () => {
    expect(lastDrivingFixMs([])).toBeNull();
    expect(
      lastDrivingFixMs([
        { lat: NaN, lng: 0, speed: DRIVING_SPEED_MS + 5, accuracy: 5, recordedAtMs: START },
        { lat: 51.5, lng: -0.1, speed: DRIVING_SPEED_MS + 5, accuracy: 5, recordedAtMs: NaN },
      ])
    ).toBeNull();
  });
});
