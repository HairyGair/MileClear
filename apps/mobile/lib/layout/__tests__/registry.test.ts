import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  LayoutAnimation: { configureNext: () => {}, Presets: { easeInEaseOut: {} } },
  Platform: { OS: "ios" },
  UIManager: {},
}));
vi.mock("../../db/index", () => ({ getDatabase: async () => ({}) }));

import { OLD_HOME_SCREENS, SCREEN_LABELS, SECTION_REGISTRY } from "../index";

describe("layout registry after the Home redesign", () => {
  it("only knows Profile and the menu", () => {
    expect(Object.keys(SECTION_REGISTRY).sort()).toEqual(["avatar_menu", "profile"]);
    expect(Object.keys(SCREEN_LABELS).sort()).toEqual(["avatar_menu", "profile"]);
  });
  it("has no old Home card keys", () => {
    const keys = Object.values(SECTION_REGISTRY).flat().map((s) => s.key);
    for (const gone of ["work_hero", "work_cta", "journey_map", "community_month", "local_benchmark", "personal_cta"]) {
      expect(keys).not.toContain(gone);
    }
  });
  it("keeps Profile sections with unique keys", () => {
    const keys = SECTION_REGISTRY.profile.map((s) => s.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("remembers the old Home screens so their saved rows can be cleared", () => {
    expect([...OLD_HOME_SCREENS]).toEqual(["dashboard_work", "dashboard_personal"]);
  });
});
