/**
 * The battery-optimisation nudge rule, checked against the phone that found
 * it: SteveG's Honor X5C, 1 Sep 2026, whose App launch manager ended the
 * recorder between his morning and afternoon drives.
 */
import { describe, it, expect } from "vitest";
import {
  batteryNudgeDecision,
  batteryNudgeCopy,
  brandName,
  isHuaweiFamily,
  BATTERY_NUDGE_SNOOZE_MS,
} from "../batteryOptimisationRule";

const NOW = new Date("2026-09-01T21:00:00Z").getTime();
const honor = { manufacturer: "HONOR", model: "NLA-LX1", seen: false };

describe("batteryNudgeDecision", () => {
  it("sends SteveG's Honor to the vendor power manager", () => {
    const d = batteryNudgeDecision({
      platform: "android",
      state: { ignoring: true, vendor: honor },
      dismissedAt: null,
      now: NOW,
    });
    expect(d).toEqual({ show: true, reason: "vendor_power_manager", screen: "vendor" });
  });

  it("prefers the vendor screen even when stock says exempt", () => {
    // The stock allow-list is not evidence of safety on a Honor.
    const d = batteryNudgeDecision({
      platform: "android",
      state: { ignoring: true, vendor: honor },
      dismissedAt: null,
      now: NOW,
    });
    expect(d.screen).toBe("vendor");
  });

  it("falls back to the stock screen once the vendor one has been seen", () => {
    const d = batteryNudgeDecision({
      platform: "android",
      state: { ignoring: false, vendor: { ...honor, seen: true } },
      dismissedAt: null,
      now: NOW,
    });
    expect(d).toEqual({ show: true, reason: "optimised", screen: "stock" });
  });

  it("stops once the vendor screen is seen and stock is exempt", () => {
    const d = batteryNudgeDecision({
      platform: "android",
      state: { ignoring: true, vendor: { ...honor, seen: true } },
      dismissedAt: null,
      now: NOW,
    });
    expect(d).toEqual({ show: false, reason: "exempt", screen: null });
  });

  it("nudges a Pixel only when it is on Optimised", () => {
    const optimised = batteryNudgeDecision({
      platform: "android",
      state: { ignoring: false, vendor: null },
      dismissedAt: null,
      now: NOW,
    });
    expect(optimised).toEqual({ show: true, reason: "optimised", screen: "stock" });
    const unrestricted = batteryNudgeDecision({
      platform: "android",
      state: { ignoring: true, vendor: null },
      dismissedAt: null,
      now: NOW,
    });
    expect(unrestricted.show).toBe(false);
    expect(unrestricted.reason).toBe("exempt");
  });

  it("never shows on iOS", () => {
    const d = batteryNudgeDecision({
      platform: "ios",
      state: { ignoring: false, vendor: honor },
      dismissedAt: null,
      now: NOW,
    });
    expect(d).toEqual({ show: false, reason: "not_android", screen: null });
  });

  it("stays quiet when the module could not answer", () => {
    const d = batteryNudgeDecision({ platform: "android", state: null, dismissedAt: null, now: NOW });
    expect(d).toEqual({ show: false, reason: "unknown", screen: null });
  });

  it("treats an unknown stock answer as not-optimised, not as a fault", () => {
    const d = batteryNudgeDecision({
      platform: "android",
      state: { ignoring: null, vendor: null },
      dismissedAt: null,
      now: NOW,
    });
    expect(d.show).toBe(false);
  });

  it("snoozes for seven days after a dismiss, then returns", () => {
    const state = { ignoring: false, vendor: null };
    const inside = batteryNudgeDecision({
      platform: "android",
      state,
      dismissedAt: NOW - BATTERY_NUDGE_SNOOZE_MS + 1000,
      now: NOW,
    });
    expect(inside).toEqual({ show: false, reason: "snoozed", screen: null });
    const after = batteryNudgeDecision({
      platform: "android",
      state,
      dismissedAt: NOW - BATTERY_NUDGE_SNOOZE_MS - 1000,
      now: NOW,
    });
    expect(after.show).toBe(true);
  });
});

describe("brandName / isHuaweiFamily", () => {
  it("normalises RNBG's manufacturer strings", () => {
    expect(brandName("HONOR")).toBe("Honor");
    expect(brandName("samsung")).toBe("Samsung");
    expect(brandName("Xiaomi")).toBe("Xiaomi");
    expect(brandName("")).toBe("Your phone");
    expect(brandName(null)).toBe("Your phone");
  });

  it("puts Honor and Huawei in the same family, nobody else", () => {
    expect(isHuaweiFamily("HONOR")).toBe(true);
    expect(isHuaweiFamily("HUAWEI")).toBe(true);
    expect(isHuaweiFamily("samsung")).toBe(false);
    expect(isHuaweiFamily(null)).toBe(false);
  });
});

describe("batteryNudgeCopy", () => {
  it("spells out the three toggles for a Honor", () => {
    const c = batteryNudgeCopy("vendor", "HONOR");
    expect(c.body).toContain("Honor's power manager");
    expect(c.body).toContain("Manage automatically");
    expect(c.body).toContain("all three");
  });

  it("uses generic vendor copy for other brands", () => {
    const c = batteryNudgeCopy("vendor", "samsung");
    expect(c.body).toContain("Samsung's power manager");
    expect(c.body).not.toContain("Manage automatically");
  });

  it("names the stock setting for the stock screen", () => {
    const c = batteryNudgeCopy("stock", "Google");
    expect(c.body).toContain("Don't optimise");
    expect(c.body).not.toContain("Google");
  });

  it("uses no em dashes anywhere", () => {
    for (const [screen, m] of [["vendor", "HONOR"], ["vendor", "samsung"], ["stock", null]] as const) {
      const c = batteryNudgeCopy(screen, m);
      expect(c.title + c.body).not.toMatch(/—/);
    }
  });
});
