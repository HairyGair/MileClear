import { describe, it, expect } from "vitest";
import { detectionOffAction, readDetectionSwitch, shouldDiscardAutoRoute } from "../detectionOffRule";
import { QUICK_TRIP_LOCK_ID } from "../enginePowerRule";

describe("readDetectionSwitch", () => {
  it("reads a missing row as on, the default every install starts with", () => {
    expect(readDetectionSwitch(null)).toBe(true);
    expect(readDetectionSwitch(undefined)).toBe(true);
  });

  it("only '1' is on once the row exists", () => {
    expect(readDetectionSwitch("1")).toBe(true);
    expect(readDetectionSwitch("0")).toBe(false);
    expect(readDetectionSwitch("")).toBe(false);
  });
});

describe("detectionOffAction", () => {
  it("does nothing while Automatic trips is on, shift or not", () => {
    expect(detectionOffAction({ switchOn: true, activeShiftId: null })).toBe("on");
    expect(detectionOffAction({ switchOn: true, activeShiftId: "shift-uuid" })).toBe("on");
  });

  it("stops the engine when off and nothing the driver started is running (28 Sep 2026, shift-only driver)", () => {
    expect(detectionOffAction({ switchOn: false, activeShiftId: null })).toBe("stop_engine");
    expect(detectionOffAction({ switchOn: false, activeShiftId: undefined })).toBe("stop_engine");
    expect(detectionOffAction({ switchOn: false, activeShiftId: "   " })).toBe("stop_engine");
  });

  it("waits for a shift to end before stopping", () => {
    expect(detectionOffAction({ switchOn: false, activeShiftId: "shift-uuid" })).toBe("wait_for_lock");
  });

  it("waits for a Start Trip to end before stopping", () => {
    expect(detectionOffAction({ switchOn: false, activeShiftId: QUICK_TRIP_LOCK_ID })).toBe("wait_for_lock");
  });
});

describe("shouldDiscardAutoRoute", () => {
  it("throws away automatic routes only when switched off", () => {
    expect(shouldDiscardAutoRoute(false)).toBe(true);
    expect(shouldDiscardAutoRoute(true)).toBe(false);
  });
});
