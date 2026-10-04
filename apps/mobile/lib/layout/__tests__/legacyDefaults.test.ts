import { describe, it, expect } from "vitest";
import { isUntouchedLegacyDefault, LEGACY_DEFAULTS } from "../legacyDefaults";

const work = LEGACY_DEFAULTS.dashboard_work;

describe("isUntouchedLegacyDefault", () => {
  it("recognises the exact old default", () => {
    expect(isUntouchedLegacyDefault(work, work)).toBe(true);
  });

  it("recognises an old default saved before newer sections existed", () => {
    const older = work.filter(
      (s) => !["road_alerts", "sa_countdown", "community_month", "local_benchmark"].includes(s.key)
    );
    expect(isUntouchedLegacyDefault(older, work)).toBe(true);
  });

  it("treats a hidden card as a choice", () => {
    const saved = work.map((s) => (s.key === "benchmark" ? { ...s, visible: false } : s));
    expect(isUntouchedLegacyDefault(saved, work)).toBe(false);
  });

  it("treats a shown default-hidden card as a choice", () => {
    const saved = work.map((s) => (s.key === "community" ? { ...s, visible: true } : s));
    expect(isUntouchedLegacyDefault(saved, work)).toBe(false);
  });

  it("treats a reorder as a choice", () => {
    const saved = [...work];
    [saved[3], saved[4]] = [saved[4], saved[3]];
    expect(isUntouchedLegacyDefault(saved, work)).toBe(false);
  });

  it("treats an unknown key as a choice", () => {
    expect(isUntouchedLegacyDefault([...work, { key: "mystery", visible: true }], work)).toBe(false);
  });

  it("an empty list or a screen with no legacy default is not a match", () => {
    expect(isUntouchedLegacyDefault([], work)).toBe(false);
    expect(isUntouchedLegacyDefault(work, undefined)).toBe(false);
  });
});
