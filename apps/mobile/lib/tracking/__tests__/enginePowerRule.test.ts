import { describe, it, expect } from "vitest";
import {
  shouldRearmOnExit,
  decideEnginePower,
  enginePowerConfig,
  parseEnginePower,
  serializeEnginePower,
  shouldPaceDownOnEnter,
  QUICK_TRIP_LOCK_ID,
  NORMAL_DISTANCE_FILTER_M,
} from "../enginePowerRule";

const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const ACC = { navigation: -2, medium: 10 };

describe("decideEnginePower", () => {
  it("is normal with no pause and no lock", () => {
    expect(decideEnginePower({ pausedUntil: null, now: NOW, activeShiftId: null })).toEqual({
      mode: "normal",
      reason: null,
    });
    expect(decideEnginePower({ pausedUntil: undefined, now: NOW, activeShiftId: undefined })).toEqual({
      mode: "normal",
      reason: null,
    });
  });

  it("is low while a pause is running (Peter Hazelgrove, paused for a week)", () => {
    expect(decideEnginePower({ pausedUntil: NOW + 7 * 24 * HOUR, now: NOW, activeShiftId: null })).toEqual({
      mode: "low",
      reason: "paused",
    });
  });

  it("is normal once the pause has expired, even with the row still stored", () => {
    expect(decideEnginePower({ pausedUntil: NOW - 1, now: NOW, activeShiftId: null })).toEqual({
      mode: "normal",
      reason: null,
    });
  });

  it("treats a pause ending exactly now as ended", () => {
    expect(decideEnginePower({ pausedUntil: NOW, now: NOW, activeShiftId: null }).mode).toBe("normal");
  });

  it("never holds a phone low on a malformed pause value", () => {
    expect(decideEnginePower({ pausedUntil: Number.NaN, now: NOW, activeShiftId: null }).mode).toBe("normal");
    expect(
      decideEnginePower({ pausedUntil: Number.POSITIVE_INFINITY, now: NOW, activeShiftId: null }).mode
    ).toBe("normal");
  });

  it("is low for a real shift", () => {
    expect(
      decideEnginePower({ pausedUntil: null, now: NOW, activeShiftId: "8b0c1b8e-1111-4a4a-9c9c-000000000001" })
    ).toEqual({ mode: "low", reason: "shift" });
  });

  it("is low for a Start Trip, told apart from a shift", () => {
    expect(decideEnginePower({ pausedUntil: null, now: NOW, activeShiftId: QUICK_TRIP_LOCK_ID })).toEqual({
      mode: "low",
      reason: "quick_trip",
    });
  });

  it("ignores an empty or whitespace lock value", () => {
    expect(decideEnginePower({ pausedUntil: null, now: NOW, activeShiftId: "" }).mode).toBe("normal");
    expect(decideEnginePower({ pausedUntil: null, now: NOW, activeShiftId: "  " }).mode).toBe("normal");
  });

  it("reports the pause first when a pause and a shift overlap", () => {
    expect(
      decideEnginePower({ pausedUntil: NOW + HOUR, now: NOW, activeShiftId: "shift-1" }).reason
    ).toBe("paused");
  });

  it("falls to the shift when the pause ends mid-shift", () => {
    expect(decideEnginePower({ pausedUntil: NOW - HOUR, now: NOW, activeShiftId: "shift-1" })).toEqual({
      mode: "low",
      reason: "shift",
    });
  });
});

describe("decideEnginePower with Automatic trips off (28 Sep 2026)", () => {
  it("is low when switched off and nothing is running", () => {
    expect(decideEnginePower({ pausedUntil: null, now: NOW, activeShiftId: null, detectionOff: true })).toEqual({
      mode: "low",
      reason: "off",
    });
  });

  it("keeps the more specific reason while a pause, shift or Start Trip runs", () => {
    expect(
      decideEnginePower({ pausedUntil: NOW + HOUR, now: NOW, activeShiftId: null, detectionOff: true }).reason
    ).toBe("paused");
    expect(decideEnginePower({ pausedUntil: null, now: NOW, activeShiftId: "s1", detectionOff: true }).reason).toBe(
      "shift"
    );
    expect(
      decideEnginePower({ pausedUntil: null, now: NOW, activeShiftId: QUICK_TRIP_LOCK_ID, detectionOff: true }).reason
    ).toBe("quick_trip");
  });

  it("is normal when on, or when the caller does not say", () => {
    expect(decideEnginePower({ pausedUntil: null, now: NOW, activeShiftId: null, detectionOff: false }).mode).toBe(
      "normal"
    );
    expect(decideEnginePower({ pausedUntil: null, now: NOW, activeShiftId: null }).mode).toBe("normal");
  });

  it("round-trips the off reason through storage", () => {
    expect(parseEnginePower(serializeEnginePower({ mode: "low", reason: "off" }))).toEqual({ mode: "low", reason: "off" });
  });
});

describe("enginePowerConfig", () => {
  it("normal on iOS is today's launch capture config plus the explicit significant-changes default", () => {
    expect(enginePowerConfig("normal", "ios", ACC)).toEqual({
      desiredAccuracy: -2,
      distanceFilter: 20,
      useSignificantChangesOnly: false,
    });
  });

  it("normal on Android is exactly today's launch capture config, nothing added", () => {
    expect(enginePowerConfig("normal", "android", ACC)).toEqual({
      desiredAccuracy: -2,
      distanceFilter: NORMAL_DISTANCE_FILTER_M,
    });
  });

  it("low on iOS uses significant changes and no navigation accuracy", () => {
    const low = enginePowerConfig("low", "ios", ACC);
    expect(low.useSignificantChangesOnly).toBe(true);
    expect(low.desiredAccuracy).toBe(10);
    expect(low.distanceFilter as number).toBeGreaterThan(NORMAL_DISTANCE_FILTER_M);
  });

  it("low on Android never touches significant changes (it would drop the foreground service)", () => {
    const low = enginePowerConfig("low", "android", ACC);
    expect(low).not.toHaveProperty("useSignificantChangesOnly");
    expect(low.desiredAccuracy).toBe(10);
    expect(low.distanceFilter as number).toBeGreaterThan(NORMAL_DISTANCE_FILTER_M);
  });

  it("low and normal set the same keys, so leaving low restores every one of them", () => {
    for (const platform of ["ios", "android"]) {
      expect(Object.keys(enginePowerConfig("low", platform, ACC)).sort()).toEqual(
        Object.keys(enginePowerConfig("normal", platform, ACC)).sort()
      );
    }
  });

  it("touches nothing that keeps the engine able to wake", () => {
    for (const platform of ["ios", "android"]) {
      const low = enginePowerConfig("low", platform, ACC);
      for (const k of ["stopOnTerminate", "startOnBoot", "enableHeadless", "foregroundService", "preventSuspend", "disableMotionActivityUpdates", "stationaryRadius", "triggerActivities"]) {
        expect(low).not.toHaveProperty(k);
      }
    }
  });
});

describe("stored engine power", () => {
  it("round-trips every state", () => {
    for (const s of [
      { mode: "normal", reason: null },
      { mode: "low", reason: "paused" },
      { mode: "low", reason: "shift" },
      { mode: "low", reason: "quick_trip" },
    ] as const) {
      expect(parseEnginePower(serializeEnginePower(s))).toEqual(s);
    }
  });

  it("reads anything absent or unreadable as normal", () => {
    expect(parseEnginePower(null)).toEqual({ mode: "normal", reason: null });
    expect(parseEnginePower(undefined)).toEqual({ mode: "normal", reason: null });
    expect(parseEnginePower("")).toEqual({ mode: "normal", reason: null });
    expect(parseEnginePower("garbage")).toEqual({ mode: "normal", reason: null });
  });

  it("keeps low with an unknown reason as low", () => {
    expect(parseEnginePower("low:whatever")).toEqual({ mode: "low", reason: null });
  });
});

describe("shouldPaceDownOnEnter", () => {
  it("paces down only on the way into low, with no recording open", () => {
    expect(shouldPaceDownOnEnter("normal", "low", false)).toBe(true);
    expect(shouldPaceDownOnEnter("normal", "low", true)).toBe(false);
    expect(shouldPaceDownOnEnter("low", "normal", false)).toBe(false);
    expect(shouldPaceDownOnEnter("low", "low", false)).toBe(false);
    expect(shouldPaceDownOnEnter("normal", "normal", false)).toBe(false);
  });
});


describe("shouldRearmOnExit", () => {
  it("re-arms when a shift or pause ends with the car parked and nothing recording", () => {
    expect(shouldRearmOnExit("low", "normal", false, false)).toBe(true);
  });
  it("never touches a moving SDK, an open recording, or an unknown state", () => {
    expect(shouldRearmOnExit("low", "normal", false, true)).toBe(false);
    expect(shouldRearmOnExit("low", "normal", true, false)).toBe(false);
    expect(shouldRearmOnExit("low", "normal", false, null)).toBe(false);
  });
  it("only on the way out of low power", () => {
    expect(shouldRearmOnExit("normal", "normal", false, false)).toBe(false);
    expect(shouldRearmOnExit("normal", "low", false, false)).toBe(false);
  });
});
