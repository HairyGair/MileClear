import { describe, expect, it } from "vitest";
import { DOOR_ROW_IDS } from "../doorPrefs";
import { doorSwitches, hiddenSummary } from "../doorSettings";

describe("doorSwitches", () => {
  it("lists every door row in order, all on when nothing is hidden", () => {
    const rows = doorSwitches([]);
    expect(rows.map((r) => r.id)).toEqual([...DOOR_ROW_IDS]);
    expect(rows.every((r) => r.shown)).toBe(true);
  });
  it("marks hidden rows off", () => {
    const rows = doorSwitches(["earnings", "fuel"]);
    expect(rows.find((r) => r.id === "earnings")?.shown).toBe(false);
    expect(rows.find((r) => r.id === "fuel")?.shown).toBe(false);
    expect(rows.find((r) => r.id === "tax")?.shown).toBe(true);
  });
  it("gives every row a label, hint and icon with no dashes", () => {
    for (const r of doorSwitches([])) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.hint.length).toBeGreaterThan(0);
      expect(`${r.label}${r.hint}`).not.toMatch(/[—–]/);
    }
  });
});

describe("hiddenSummary", () => {
  it("says it in plain words", () => {
    expect(hiddenSummary([])).toBe("All shortcuts can show on Home.");
    expect(hiddenSummary(["tax"])).toBe("1 shortcut is hidden.");
    expect(hiddenSummary(["tax", "fuel"])).toBe("2 shortcuts are hidden.");
  });
});

import { availableDoorRows } from "../doors";

describe("availableDoorRows", () => {
  it("matches who can see which shortcut", () => {
    expect(availableDoorRows({ mode: "personal", persona: "personal" })).not.toContain("earnings");
    expect(availableDoorRows({ mode: "personal", persona: "personal" })).not.toContain("tax");
    expect(availableDoorRows({ mode: "work", persona: "gig" })).toContain("earnings");
    expect(availableDoorRows({ mode: "work", persona: "company" })).not.toContain("tax");
    expect(doorSwitches([], ["insights"]).map((r) => r.id)).toEqual(["insights"]);
  });
});
