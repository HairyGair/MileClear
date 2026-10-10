import { describe, it, expect } from "vitest";
import { rateTarget, rateHint } from "../rate";

describe("rateTarget", () => {
  it("opens the Play Store on Android", () => {
    const t = rateTarget("android");
    expect(t.primary).toBe("market://details?id=com.mileclear.app");
    expect(t.fallback).toContain("play.google.com");
    expect(rateHint("android")).toBe("Open the Play Store");
  });
  it("opens the App Store review on iPhone", () => {
    const t = rateTarget("ios");
    expect(t.primary).toContain("itms-apps://");
    expect(t.primary).toContain("action=write-review");
    expect(t.fallback).toContain("apps.apple.com");
    expect(rateHint("ios")).toBe("Open the App Store review screen");
  });
});
