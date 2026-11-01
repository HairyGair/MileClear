import { describe, it, expect } from "vitest";
import {
  summariseQuarters,
  quarterLabel,
  daysLeftText,
  daysLeftTone,
  formatDueLong,
  formatDueShort,
  yearEndDeadline,
  type ObligationLike,
} from "./mtdQuarters";

const ob = (
  status: "Open" | "Fulfilled",
  start: string,
  end: string,
  due: string,
  receivedDate?: string,
): ObligationLike => ({ status, start, end, due, receivedDate });

const YEAR: ObligationLike[] = [
  ob("Fulfilled", "2026-04-06", "2026-07-05", "2026-08-07", "2026-07-20"),
  ob("Open", "2026-07-06", "2026-10-05", "2026-11-07"),
  ob("Open", "2026-10-06", "2027-01-05", "2027-02-07"),
  ob("Open", "2027-01-06", "2027-04-05", "2027-05-07"),
];

describe("quarterLabel", () => {
  it("names the months from the dates", () => {
    expect(quarterLabel("2026-07-06", "2026-10-05")).toBe("July to October");
    expect(quarterLabel("2026-10-06", "2027-01-05")).toBe("October to January");
  });
  it("handles calendar quarters", () => {
    expect(quarterLabel("2026-07-01", "2026-09-30")).toBe("July to September");
  });
});

describe("summariseQuarters", () => {
  it("one due: the second quarter is next", () => {
    const s = summariseQuarters(YEAR, new Date(2026, 10, 1));
    expect(s.total).toBe(4);
    expect(s.sentCount).toBe(1);
    expect(s.next?.label).toBe("July to October");
    expect(s.next?.state).toBe("due");
    expect(s.next?.daysLeft).toBe(6);
    expect(s.following?.label).toBe("October to January");
    expect(s.upToDate).toBe(false);
    expect(s.overdue).toHaveLength(0);
    expect(s.quarters.map((q) => q.state)).toEqual(["sent", "due", "upcoming", "upcoming"]);
    expect(s.style).toBe("standard");
  });

  it("overdue: past the due date, counted late", () => {
    const s = summariseQuarters(YEAR, new Date(2026, 10, 10));
    expect(s.next?.state).toBe("overdue");
    expect(s.next?.daysLeft).toBe(-3);
    expect(s.overdue).toHaveLength(1);
  });

  it("due today is not late", () => {
    const s = summariseQuarters(YEAR, new Date(2026, 10, 7, 23, 0));
    expect(s.next?.state).toBe("due");
    expect(s.next?.daysLeft).toBe(0);
  });

  it("up to date while the next period is still running", () => {
    const s = summariseQuarters(YEAR, new Date(2026, 8, 1));
    expect(s.next).toBeNull();
    expect(s.upToDate).toBe(true);
    expect(s.allSent).toBe(false);
    expect(s.following?.label).toBe("July to October");
  });

  it("all sent", () => {
    const all = YEAR.map((o) => ({ ...o, status: "Fulfilled" as const, receivedDate: o.due }));
    const s = summariseQuarters(all, new Date(2027, 4, 20));
    expect(s.allSent).toBe(true);
    expect(s.upToDate).toBe(true);
    expect(s.sentCount).toBe(4);
    expect(s.next).toBeNull();
    expect(s.following).toBeNull();
  });

  it("flags updates sent after the due date", () => {
    const s = summariseQuarters(
      [ob("Fulfilled", "2026-04-06", "2026-07-05", "2026-08-07", "2026-08-09T10:00:00Z"), ...YEAR.slice(1)],
      new Date(2026, 10, 1),
    );
    expect(s.quarters[0].late).toBe(true);
    expect(s.quarters[0].sentOn).toBe("2026-08-09");
  });

  it("an open and a fulfilled obligation for the same period count once, as sent", () => {
    const s = summariseQuarters([ob("Open", "2026-04-06", "2026-07-05", "2026-08-07"), ...YEAR], new Date(2026, 10, 1));
    expect(s.total).toBe(4);
    expect(s.quarters[0].state).toBe("sent");
  });

  it("an overdue quarter from the previous tax year stays visible as next", () => {
    const s = summariseQuarters(
      [ob("Open", "2026-01-06", "2026-04-05", "2026-05-07"), ...YEAR],
      new Date(2026, 10, 1),
      "2026-27",
    );
    expect(s.next?.label).toBe("January to April");
    expect(s.next?.state).toBe("overdue");
    expect(s.total).toBe(4);
    expect(s.overdue).toHaveLength(1);
  });

  it("reads calendar quarters", () => {
    const cal = [
      ob("Fulfilled", "2026-04-01", "2026-06-30", "2026-07-31", "2026-07-30"),
      ob("Open", "2026-07-01", "2026-09-30", "2026-10-31"),
    ];
    const s = summariseQuarters(cal, new Date(2026, 9, 10));
    expect(s.style).toBe("calendar");
    expect(s.next?.label).toBe("July to September");
  });

  it("nothing listed: no quarters, not 'all sent'", () => {
    const s = summariseQuarters([], new Date(2026, 10, 1));
    expect(s.total).toBe(0);
    expect(s.allSent).toBe(false);
    expect(s.upToDate).toBe(false);
    expect(s.next).toBeNull();
  });

  it("ignores obligations with unreadable dates", () => {
    const s = summariseQuarters([{ status: "Open", start: "x", end: "y", due: "z" }], new Date(2026, 10, 1));
    expect(s.total).toBe(0);
  });
});

describe("words", () => {
  it("days left", () => {
    expect(daysLeftText(6)).toBe("6 days left");
    expect(daysLeftText(1)).toBe("1 day left");
    expect(daysLeftText(0)).toBe("Due today");
    expect(daysLeftText(-3)).toBe("3 days late");
    expect(daysLeftText(-1)).toBe("1 day late");
  });
  it("tone", () => {
    expect(daysLeftTone(-1)).toBe("late");
    expect(daysLeftTone(14)).toBe("soon");
    expect(daysLeftTone(15)).toBe("calm");
  });
  it("dates", () => {
    const now = new Date(2026, 10, 1);
    expect(formatDueLong("2026-11-07", now)).toBe("Saturday 7 November");
    expect(formatDueShort("2027-02-07", now)).toBe("7 February 2027");
  });
  it("year-end deadline", () => {
    expect(yearEndDeadline("2026-27")).toBe("2028-01-31");
    expect(yearEndDeadline("bad")).toBeNull();
  });
});
