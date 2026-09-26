import { describe, expect, it } from "vitest";
import { shouldConfirmCoarseFix } from "../speedStartRule";
import { canStartConfirm, decideHeadlessWake, HEADLESS_CONFIRM_WINDOW_MS, isConfirming } from "../headlessSpeedRule";

const mph = (n: number) => n * 0.44704;
const T0 = new Date("2026-09-26T07:21:43Z").getTime();

describe("shouldConfirmCoarseFix", () => {
  it("looks again at Samantha Birch's refused fix, 26 Sep 2026 (40 mph at 200 m)", () => {
    expect(shouldConfirmCoarseFix(mph(40), 200)).toBe(true);
  });

  it("covers the 23 Sep refusals at 26-39 mph and 66-150 m", () => {
    expect(shouldConfirmCoarseFix(mph(26), 66)).toBe(true);
    expect(shouldConfirmCoarseFix(mph(39), 150)).toBe(true);
  });

  it("does not confirm what would already start a recording", () => {
    expect(shouldConfirmCoarseFix(mph(40), 20)).toBe(false);
    expect(shouldConfirmCoarseFix(mph(20), 45)).toBe(false);
  });

  it("ignores junk: absurd speed, hopeless accuracy, walking pace, missing values", () => {
    expect(shouldConfirmCoarseFix(mph(101), 496)).toBe(false);
    expect(shouldConfirmCoarseFix(mph(120), 100)).toBe(false);
    expect(shouldConfirmCoarseFix(mph(40), 501)).toBe(false);
    expect(shouldConfirmCoarseFix(mph(14), 60)).toBe(false);
    expect(shouldConfirmCoarseFix(null, 60)).toBe(false);
    expect(shouldConfirmCoarseFix(mph(40), null)).toBe(false);
  });

  it("sits on its edges", () => {
    expect(shouldConfirmCoarseFix(mph(15), 500)).toBe(true);
    expect(shouldConfirmCoarseFix(mph(100), 51)).toBe(true);
  });
});

describe("the confirm window", () => {
  it("runs for ten minutes from the start", () => {
    expect(isConfirming(T0, T0)).toBe(true);
    expect(isConfirming(T0, T0 + HEADLESS_CONFIRM_WINDOW_MS - 1)).toBe(true);
    expect(isConfirming(T0, T0 + HEADLESS_CONFIRM_WINDOW_MS)).toBe(false);
    expect(isConfirming(0, T0)).toBe(false);
    expect(isConfirming(T0, T0 - 1000)).toBe(false);
  });

  it("allows one confirm per window, and a clock that went backwards never blocks", () => {
    expect(canStartConfirm(0, T0)).toBe(true);
    expect(canStartConfirm(T0, T0 + 60_000)).toBe(false);
    expect(canStartConfirm(T0, T0 + HEADLESS_CONFIRM_WINDOW_MS)).toBe(true);
    expect(canStartConfirm(T0, T0 - 60_000)).toBe(true);
  });

  it("lets a good fix open a recording while the SDK reads moving, only when confirming", () => {
    const good = { speedMs: mph(30), accuracyM: 10 };
    expect(decideHeadlessWake({ fix: good, isMoving: true, enabled: true })).toBe(false);
    expect(decideHeadlessWake({ fix: good, isMoving: true, enabled: true, confirming: true })).toBe(true);
    // Confirming never lets a coarse fix through, and never overrides a disabled SDK.
    expect(decideHeadlessWake({ fix: { speedMs: mph(40), accuracyM: 200 }, isMoving: true, enabled: true, confirming: true })).toBe(false);
    expect(decideHeadlessWake({ fix: good, isMoving: true, enabled: false, confirming: true })).toBe(false);
  });
});
