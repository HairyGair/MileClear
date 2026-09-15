import { describe, it, expect } from "vitest";
import { startOfWeekLondon } from "../../services/taxSnapshot.js";

describe("startOfWeekLondon", () => {
  it("Tuesday 15 Sep 2026 (BST) is in the week starting Mon 14 Sep 00:00 BST, which is Sun 13 Sep 23:00 UTC", () => {
    expect(startOfWeekLondon(new Date("2026-09-15T21:00:00Z")).toISOString()).toBe("2026-09-13T23:00:00.000Z");
  });
  it("a Monday at 00:30 BST is already in its own week", () => {
    expect(startOfWeekLondon(new Date("2026-09-13T23:30:00Z")).toISOString()).toBe("2026-09-13T23:00:00.000Z");
  });
  it("Sunday 23:30 BST is still last week", () => {
    expect(startOfWeekLondon(new Date("2026-09-13T22:30:00Z")).toISOString()).toBe("2026-09-06T23:00:00.000Z");
  });
  it("in winter (GMT) the Monday starts at 00:00 UTC", () => {
    expect(startOfWeekLondon(new Date("2026-01-14T12:00:00Z")).toISOString()).toBe("2026-01-12T00:00:00.000Z");
  });
});
