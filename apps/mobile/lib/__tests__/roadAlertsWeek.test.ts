import { describe, it, expect } from "vitest";
import type { RoadAlertItem } from "@mileclear/shared";
import { weekAheadStartLine, weekAheadTitle, withoutWeekAhead } from "../roadAlertsWeek";

const item = (id: string, memberIds?: string[]): RoadAlertItem =>
  ({ id, memberIds, startAt: "2026-10-20T07:00:00Z" }) as RoadAlertItem;

describe("weekAheadTitle", () => {
  it("next week on a Sunday (UK), this week otherwise", () => {
    expect(weekAheadTitle(new Date("2026-10-18T17:00:00Z"))).toBe("Coming up next week");
    expect(weekAheadTitle(new Date("2026-10-21T09:00:00Z"))).toBe("Coming up this week");
    // 23:30 UTC Saturday is 00:30 Sunday BST.
    expect(weekAheadTitle(new Date("2026-10-17T23:30:00Z"))).toBe("Coming up next week");
  });
});

describe("withoutWeekAhead", () => {
  it("drops upcoming cards that share any event with a week-ahead card", () => {
    const upcoming = [item("a", ["sm:1"]), item("b", ["sm:2", "sm:3"]), item("c")];
    const week = [item("x", ["sm:3", "sm:9"])];
    expect(withoutWeekAhead(upcoming, week).map((i) => i.id)).toEqual(["a", "c"]);
    expect(withoutWeekAhead(upcoming, []).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("weekAheadStartLine", () => {
  it("day and time in UK time, with the works company when known", () => {
    expect(weekAheadStartLine({ startAt: "2026-10-20T07:00:00Z", promoter: "BT" })).toMatch(/^Starts Tue 20 Oct.*08:00 \(BT works\)$/);
    expect(weekAheadStartLine({ startAt: null, promoter: null })).toBeNull();
  });
});
