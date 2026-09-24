import { describe, it, expect } from "vitest";
import { engineTriggerActivities } from "../engineTriggers";

describe("engineTriggerActivities", () => {
  it("wakes the engine on iPhone for driving and cycling only, never for walking or running", () => {
    const t = engineTriggerActivities("ios", "granted")!;
    expect(t).toContain("in_vehicle");
    expect(t).toContain("on_bicycle"); // motorbikes are often labelled cycling
    expect(t).not.toMatch(/walking|running|on_foot/);
  });
  it("sets nothing on an iPhone without Motion & Fitness, which has no activity to test", () => {
    expect(engineTriggerActivities("ios", "denied")).toBeUndefined();
    expect(engineTriggerActivities("ios", "undetermined")).toBeUndefined();
    expect(engineTriggerActivities("ios", "unavailable")).toBeUndefined();
  });
  it("leaves Android alone: it has no activity to test against", () => {
    expect(engineTriggerActivities("android", "granted")).toBeUndefined();
  });
});
