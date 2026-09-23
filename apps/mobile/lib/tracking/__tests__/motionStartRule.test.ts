import { describe, expect, it } from "vitest";
import { decideMotionStart, ON_FOOT_OVERRIDE_SPEED_MS } from "../motionStartRule";

const ON_FOOT = new Set(["on_foot", "walking", "running"]);
const base = { onFoot: ON_FOOT, minConfidence: 75 };

const mph = (n: number) => n * 0.44704;

describe("decideMotionStart", () => {
  it("records when the phone says nothing about the activity", () => {
    expect(decideMotionStart({ ...base, activityType: null, confidence: null, speedMs: null }).skip).toBe(false);
  });

  it("records when the activity is driving", () => {
    expect(
      decideMotionStart({ ...base, activityType: "in_vehicle", confidence: 90, speedMs: mph(30) }).skip
    ).toBe(false);
  });

  it("still refuses a confident walk, which is the whole point of the rule", () => {
    const d = decideMotionStart({ ...base, activityType: "walking", confidence: 90, speedMs: mph(3) });
    expect(d).toEqual({ skip: true, reason: "on_foot" });
  });

  it("refuses a walk that came with no speed at all", () => {
    expect(decideMotionStart({ ...base, activityType: "on_foot", confidence: 80, speedMs: null }).skip).toBe(true);
  });

  it("ignores a low-confidence on-foot verdict, as before", () => {
    expect(decideMotionStart({ ...base, activityType: "walking", confidence: 40, speedMs: mph(3) }).skip).toBe(
      false
    );
  });

  it("overrides an on-foot verdict when the fix is already at driving speed", () => {
    // Nobody walks at 30 mph. Before 21 Sep 2026 this was recorded as a walk
    // and the drive waited for the next fix to be force-started by speed.
    expect(decideMotionStart({ ...base, activityType: "walking", confidence: 99, speedMs: mph(30) }).skip).toBe(
      false
    );
  });

  it("puts the override exactly on the force-start threshold", () => {
    expect(
      decideMotionStart({ ...base, activityType: "walking", confidence: 99, speedMs: ON_FOOT_OVERRIDE_SPEED_MS })
        .skip
    ).toBe(false);
    expect(
      decideMotionStart({
        ...base,
        activityType: "walking",
        confidence: 99,
        speedMs: ON_FOOT_OVERRIDE_SPEED_MS - 0.01,
      }).skip
    ).toBe(true);
  });

  it("does not let a nonsense speed override the verdict", () => {
    expect(
      decideMotionStart({ ...base, activityType: "walking", confidence: 99, speedMs: Number.NaN }).skip
    ).toBe(true);
    expect(
      decideMotionStart({ ...base, activityType: "walking", confidence: 99, speedMs: Number.POSITIVE_INFINITY })
        .skip
    ).toBe(true);
  });

  it("treats a missing confidence as good enough to believe, as the caller always has", () => {
    expect(decideMotionStart({ ...base, activityType: "running", confidence: null, speedMs: mph(6) }).skip).toBe(
      true
    );
  });
});

describe("decideMotionStart - slow start with no vehicle reading (23 Sep 2026)", () => {
  const ios = { ...base, requireVehicleWhenSlow: true };

  it("refuses a walking-pace start labelled still", () => {
    expect(decideMotionStart({ ...ios, activityType: "still", confidence: 90, speedMs: 1.4 })).toEqual({
      skip: true,
      reason: "slow_without_vehicle",
    });
  });

  it("still records a slow start the phone says is a vehicle", () => {
    expect(decideMotionStart({ ...ios, activityType: "in_vehicle", confidence: 80, speedMs: 2 }).skip).toBe(false);
  });

  it("records a slow-labelled start once it is at driving speed", () => {
    expect(decideMotionStart({ ...ios, activityType: "still", confidence: 90, speedMs: mph(15) }).skip).toBe(false);
  });

  it("records when the speed is unknown, including RNBG's -1", () => {
    expect(decideMotionStart({ ...ios, activityType: "still", confidence: 90, speedMs: null }).skip).toBe(false);
    expect(decideMotionStart({ ...ios, activityType: "still", confidence: 90, speedMs: -1 }).skip).toBe(false);
  });

  it("never applies on Android", () => {
    expect(decideMotionStart({ ...base, activityType: null, confidence: null, speedMs: 1.4 }).skip).toBe(false);
  });
});
