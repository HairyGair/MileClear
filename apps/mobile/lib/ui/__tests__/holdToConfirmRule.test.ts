import { describe, it, expect } from "vitest";
import {
  blend,
  contrastRatio,
  DEFAULT_EARLY_RELEASE_HINT,
  DEFAULT_HOLD_HINT,
  fillCopyFrame,
  holdHintText,
  isEarlyRelease,
} from "../holdToConfirmRule";

// The theme's values (lib/theme.ts imports react-native, so they are copied).
const BG = "#030712";
const AMBER = "#f5a623";
const AMBER_DIM_ALPHA = 0.12;

describe("HoldToConfirm label colours", () => {
  const resting = blend(AMBER, AMBER_DIM_ALPHA, BG);

  it("the old navy resting label was unreadable on the resting button (Tom, 14 Oct)", () => {
    expect(contrastRatio(BG, resting)).toBeLessThan(1.5);
  });

  it("an amber resting label reads clearly on the resting button", () => {
    expect(contrastRatio(AMBER, resting)).toBeGreaterThanOrEqual(4.5);
  });

  it("navy reads clearly where the amber fill sits behind it", () => {
    expect(contrastRatio(BG, AMBER)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("holdHintText", () => {
  const base = { loading: false, holding: false, releasedEarly: false };

  it("says to press and hold at rest", () => {
    expect(holdHintText(base)).toBe(DEFAULT_HOLD_HINT);
    expect(holdHintText({ ...base, hint: "Press and hold to end the trip" })).toBe("Press and hold to end the trip");
  });

  it("says why nothing happened when a press is let go too soon", () => {
    expect(holdHintText({ ...base, releasedEarly: true })).toBe(DEFAULT_EARLY_RELEASE_HINT);
    expect(holdHintText({ ...base, releasedEarly: true, earlyReleaseHint: "Keep holding to end the trip" })).toBe(
      "Keep holding to end the trip"
    );
  });

  it("stays quiet while holding or saving (the button's own label speaks then)", () => {
    expect(holdHintText({ ...base, holding: true, releasedEarly: true })).toBeNull();
    expect(holdHintText({ ...base, loading: true })).toBeNull();
  });
});

describe("fillCopyFrame", () => {
  it("moves the navy copy back by the border so it sits exactly on the amber label", () => {
    // The resting row measured 1 px in from the button's outer edge (its border).
    expect(fillCopyFrame({ x: 1, y: 9, width: 320, height: 38 }, 1)).toEqual({ left: 0, top: 8, width: 320, height: 38 });
  });
});

describe("isEarlyRelease", () => {
  it("is an early release only when the hold did not complete and the button is not saving", () => {
    expect(isEarlyRelease(false, false)).toBe(true);
    expect(isEarlyRelease(true, false)).toBe(false);
    expect(isEarlyRelease(false, true)).toBe(false);
  });
});
