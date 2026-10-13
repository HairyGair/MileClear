import { describe, it, expect, vi } from "vitest";

vi.mock("react-native", () => ({
  LayoutAnimation: { Types: { easeInEaseOut: "easeInEaseOut" }, configureNext: vi.fn() },
}));

import { MOVE_ONLY_ANIMATION } from "../listTransition";

describe("list transition", () => {
  it("moves things and never fades them (a stuck fade dimmed the Android list)", () => {
    expect(MOVE_ONLY_ANIMATION.update).toBeDefined();
    expect(MOVE_ONLY_ANIMATION.create).toBeUndefined();
    expect(MOVE_ONLY_ANIMATION.delete).toBeUndefined();
  });
});
