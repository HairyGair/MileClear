import { describe, it, expect } from "vitest";
import { hasWork, planUpkeep, upkeepDue, UPKEEP_MIN_INTERVAL_MS, UPKEEP_SWEEP_MIN_NATIVE, type UpkeepInput } from "../backgroundUpkeepRule";

const NOW = Date.parse("2026-10-10T09:00:00.000Z");

const idle: UpkeepInput = {
  recordingOpen: false,
  shiftActive: false,
  jsCoords: 0,
  nativeCoords: 0,
  sdkMoving: false,
  pendingUploads: 0,
  pendingEvents: 0,
};

describe("upkeepDue", () => {
  it("runs the first time, then at most once per interval", () => {
    expect(upkeepDue(0, NOW)).toBe(true);
    expect(upkeepDue(NOW - 60_000, NOW)).toBe(false);
    expect(upkeepDue(NOW - UPKEEP_MIN_INTERVAL_MS, NOW)).toBe(true);
  });

  it("treats a clock that went backwards or a garbage stamp as long ago", () => {
    expect(upkeepDue(NOW + 60_000, NOW)).toBe(true);
    expect(upkeepDue(Number.NaN, NOW)).toBe(true);
  });
});

describe("planUpkeep", () => {
  it("does nothing on an idle phone", () => {
    const plan = planUpkeep(idle);
    expect(hasWork(plan)).toBe(false);
  });

  it("retries uploads and sends waiting events whatever the engine is doing", () => {
    const plan = planUpkeep({ ...idle, recordingOpen: true, sdkMoving: true, shiftActive: true, pendingUploads: 2, pendingEvents: 3 });
    expect(plan).toEqual({ sweep: false, drainUploads: true, flushEvents: true });
  });

  it("sweeps a route held only in the engine's store once the engine has parked", () => {
    expect(planUpkeep({ ...idle, nativeCoords: 800 }).sweep).toBe(true);
    expect(planUpkeep({ ...idle, jsCoords: 5, nativeCoords: null }).sweep).toBe(true);
  });

  it("never sweeps a live recording, a shift, or a moving engine", () => {
    expect(planUpkeep({ ...idle, nativeCoords: 800, recordingOpen: true }).sweep).toBe(false);
    expect(planUpkeep({ ...idle, nativeCoords: 800, shiftActive: true }).sweep).toBe(false);
    expect(planUpkeep({ ...idle, nativeCoords: 800, sdkMoving: true }).sweep).toBe(false);
  });

  it("sweeps when the engine's state is unknown (the sweep's own age rule still applies)", () => {
    expect(planUpkeep({ ...idle, nativeCoords: 800, sdkMoving: null }).sweep).toBe(true);
  });

  it("does not sweep the odd stationary fix a parked phone collects", () => {
    expect(planUpkeep({ ...idle, nativeCoords: 1, jsCoords: 1 }).sweep).toBe(false);
    expect(planUpkeep({ ...idle, nativeCoords: UPKEEP_SWEEP_MIN_NATIVE - 1 }).sweep).toBe(false);
    expect(planUpkeep({ ...idle, nativeCoords: UPKEEP_SWEEP_MIN_NATIVE }).sweep).toBe(true);
  });
});
