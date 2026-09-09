import { describe, expect, it } from "vitest";
import { decideHeadlessWake, readHeadlessFix } from "../headlessSpeedRule";

describe("readHeadlessFix", () => {
  it("reads a location event's coords", () => {
    expect(readHeadlessFix("location", { coords: { speed: 22.23, accuracy: 3.8 } })).toEqual({
      speedMs: 22.23,
      accuracyM: 3.8,
    });
  });

  it("reads a motionchange event's nested location", () => {
    expect(
      readHeadlessFix("motionchange", { isMoving: false, location: { coords: { speed: 15, accuracy: 10 } } })
    ).toEqual({ speedMs: 15, accuracyM: 10 });
  });

  it("returns null for other events and tolerates missing fields", () => {
    expect(readHeadlessFix("heartbeat", { location: { coords: { speed: 30 } } })).toBeNull();
    expect(readHeadlessFix("location", undefined)).toEqual({ speedMs: null, accuracyM: null });
    expect(readHeadlessFix("location", { coords: { speed: -1, accuracy: "x" } })).toEqual({
      speedMs: -1,
      accuracyM: null,
    });
  });
});

describe("decideHeadlessWake", () => {
  const driving = { speedMs: 22.23, accuracyM: 3.8 };

  it("wakes on a confident driving-speed fix while the SDK is stationary (Jenny, 8 Sep 18:18)", () => {
    expect(decideHeadlessWake({ fix: driving, isMoving: false, enabled: true })).toBe(true);
    expect(decideHeadlessWake({ fix: driving, isMoving: null, enabled: null })).toBe(true);
  });

  it("never wakes when the SDK is already moving or disabled", () => {
    expect(decideHeadlessWake({ fix: driving, isMoving: true, enabled: true })).toBe(false);
    expect(decideHeadlessWake({ fix: driving, isMoving: false, enabled: false })).toBe(false);
  });

  it("ignores slow, loose, or incomplete fixes", () => {
    expect(decideHeadlessWake({ fix: { speedMs: 4, accuracyM: 5 }, isMoving: false, enabled: true })).toBe(false);
    expect(decideHeadlessWake({ fix: { speedMs: 20, accuracyM: 80 }, isMoving: false, enabled: true })).toBe(false);
    expect(decideHeadlessWake({ fix: { speedMs: null, accuracyM: 5 }, isMoving: false, enabled: true })).toBe(false);
    expect(decideHeadlessWake({ fix: { speedMs: 20, accuracyM: null }, isMoving: false, enabled: true })).toBe(false);
    expect(decideHeadlessWake({ fix: null, isMoving: false, enabled: true })).toBe(false);
  });

  it("sits exactly on the thresholds", () => {
    expect(decideHeadlessWake({ fix: { speedMs: 12 * 0.44704, accuracyM: 30 }, isMoving: false, enabled: true })).toBe(
      true
    );
    expect(decideHeadlessWake({ fix: { speedMs: 12 * 0.44704 - 0.01, accuracyM: 30 }, isMoving: false, enabled: true })).toBe(
      false
    );
    expect(decideHeadlessWake({ fix: { speedMs: 20, accuracyM: 30.1 }, isMoving: false, enabled: true })).toBe(false);
  });
});
