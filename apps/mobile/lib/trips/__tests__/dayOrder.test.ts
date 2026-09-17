import { describe, it, expect } from "vitest";
import { groupTripsByDay, dayLabel, type DayRow } from "../dayOrder";

// Local-time constructors so the tests do not depend on the machine's zone.
const local = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

const trip = (id: string, startedAt: string) => ({ id, startedAt });

// A fixed "now": Wednesday 16 September 2026, mid-afternoon.
const NOW = new Date(2026, 8, 16, 15, 0);

const flatten = (rows: DayRow<{ id: string; startedAt: string }>[]) =>
  rows.map((r) => (r.kind === "header" ? `# ${r.label}` : r.trip.id));

describe("groupTripsByDay", () => {
  it("returns nothing for no trips", () => {
    expect(groupTripsByDay([], NOW)).toEqual([]);
  });

  it("puts one day's trips oldest first under a single header", () => {
    // Incoming order is newest first, as the list loads it.
    const rows = groupTripsByDay(
      [
        trip("c", local(2026, 9, 14, 17, 30)),
        trip("b", local(2026, 9, 14, 12, 5)),
        trip("a", local(2026, 9, 14, 8, 0)),
      ],
      NOW
    );
    expect(flatten(rows)).toEqual(["# Mon 14 Sep", "a", "b", "c"]);
    expect(rows[0]).toMatchObject({ kind: "header", key: "day:2026-09-14", dayKey: "2026-09-14" });
  });

  it("keeps days newest first while each day reads oldest first", () => {
    const rows = groupTripsByDay(
      [
        trip("tue-late", local(2026, 9, 15, 19, 0)),
        trip("tue-early", local(2026, 9, 15, 7, 45)),
        trip("mon-late", local(2026, 9, 14, 22, 10)),
        trip("mon-early", local(2026, 9, 14, 6, 30)),
      ],
      NOW
    );
    expect(flatten(rows)).toEqual(["# Yesterday", "tue-early", "tue-late", "# Mon 14 Sep", "mon-early", "mon-late"]);
  });

  it("sorts correctly even when the input days are interleaved", () => {
    const rows = groupTripsByDay(
      [
        trip("mon-2", local(2026, 9, 14, 13, 0)),
        trip("tue-1", local(2026, 9, 15, 9, 0)),
        trip("mon-1", local(2026, 9, 14, 9, 0)),
        trip("tue-2", local(2026, 9, 15, 13, 0)),
      ],
      NOW
    );
    expect(flatten(rows)).toEqual(["# Yesterday", "tue-1", "tue-2", "# Mon 14 Sep", "mon-1", "mon-2"]);
  });

  it("labels today and yesterday by name and older days by weekday and date", () => {
    const rows = groupTripsByDay(
      [
        trip("today", local(2026, 9, 16, 9, 0)),
        trip("yesterday", local(2026, 9, 15, 9, 0)),
        trip("older", local(2026, 9, 1, 9, 0)),
      ],
      NOW
    );
    expect(flatten(rows)).toEqual(["# Today", "today", "# Yesterday", "yesterday", "# Tue 1 Sep", "older"]);
  });

  it("keeps the incoming order for trips with the same start time", () => {
    const same = local(2026, 9, 14, 10, 0);
    const rows = groupTripsByDay([trip("first", same), trip("second", same), trip("third", same)], NOW);
    expect(flatten(rows)).toEqual(["# Mon 14 Sep", "first", "second", "third"]);
  });

  it("drops a trip whose start time does not parse instead of misplacing it", () => {
    const rows = groupTripsByDay([trip("ok", local(2026, 9, 14, 10, 0)), trip("bad", "not a date")], NOW);
    expect(flatten(rows)).toEqual(["# Mon 14 Sep", "ok"]);
  });
});

describe("dayLabel", () => {
  it("spells the month as Sep, not Sept", () => {
    expect(dayLabel(new Date(2026, 8, 7), NOW)).toBe("Mon 7 Sep");
  });

  it("treats yesterday across a month boundary", () => {
    const firstOfMonth = new Date(2026, 9, 1, 8, 0);
    expect(dayLabel(new Date(2026, 8, 30, 23, 59), firstOfMonth)).toBe("Yesterday");
  });
});
