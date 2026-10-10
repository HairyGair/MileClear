import { describe, it, expect } from "vitest";
import {
  ACHIEVEMENT_TYPES,
  ACHIEVEMENT_META,
  RETIRED_ACHIEVEMENT_TYPES,
  TRIP_COUNT_THRESHOLDS,
  SHIFT_COUNT_THRESHOLDS,
  isRetiredAchievementType,
} from "./index";

describe("achievements: retired duplicates", () => {
  it("retires trips_1 and shifts_1 (same as first_trip and first_shift)", () => {
    expect([...RETIRED_ACHIEVEMENT_TYPES].sort()).toEqual(["shifts_1", "trips_1"]);
    expect(isRetiredAchievementType("trips_1")).toBe(true);
    expect(isRetiredAchievementType("first_trip")).toBe(false);
  });

  it("keeps them out of the list and the labels", () => {
    for (const t of RETIRED_ACHIEVEMENT_TYPES) {
      expect((ACHIEVEMENT_TYPES as readonly string[]).includes(t)).toBe(false);
      expect(t in ACHIEVEMENT_META).toBe(false);
    }
  });

  it("has one label per badge and the count the website quotes", () => {
    expect(Object.keys(ACHIEVEMENT_META).sort()).toEqual([...ACHIEVEMENT_TYPES].sort());
    expect(ACHIEVEMENT_TYPES.length).toBe(37);
  });

  it("no longer awards a count badge for one trip or one shift", () => {
    expect(TRIP_COUNT_THRESHOLDS).not.toContain(1);
    expect(SHIFT_COUNT_THRESHOLDS).not.toContain(1);
  });
});
