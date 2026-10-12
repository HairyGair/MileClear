import { describe, it, expect } from "vitest";
import {
  mileageRateNote,
  accessLogSentence,
  linkEndsAt,
  mtdQuarters,
  parsePastedInvites,
  practiceInitials,
  practicePeriods,
  quarterContaining,
  quarterDueNext,
  renewedEndsAt,
  requestTitle,
  ukDateKey,
} from "./practice.js";

describe("MTD quarters", () => {
  it("uses the standard quarters and deadlines", () => {
    const q = mtdQuarters(2026);
    expect(q.map((x) => [x.start, x.end, x.due])).toEqual([
      ["2026-04-06", "2026-07-05", "2026-08-07"],
      ["2026-07-06", "2026-10-05", "2026-11-07"],
      ["2026-10-06", "2027-01-05", "2027-02-07"],
      ["2027-01-06", "2027-04-05", "2027-05-07"],
    ]);
  });

  it("finds the quarter a date is in, across the year end", () => {
    expect(quarterContaining("2026-10-11").index).toBe(3);
    expect(quarterContaining("2027-01-05").index).toBe(3);
    expect(quarterContaining("2027-04-05").taxYear).toBe("2026-27");
    expect(quarterContaining("2027-04-06").taxYear).toBe("2027-28");
  });

  it("names the quarter due next, moving on the day after the deadline", () => {
    expect(quarterDueNext("2026-10-11").start).toBe("2026-07-06");
    expect(quarterDueNext("2026-11-07").start).toBe("2026-07-06");
    expect(quarterDueNext("2026-11-08").start).toBe("2026-10-06");
    // Q4 of 2025-26 is due 7 May 2026.
    expect(quarterDueNext("2026-04-20").due).toBe("2026-05-07");
  });

  it("offers due, current, tax year so far and last tax year", () => {
    const p = practicePeriods("2026-10-11");
    expect(p.map((x) => x.key)).toEqual(["due", "current", "tax_year", "last_tax_year"]);
    expect(p[0].label).toBe("Quarter due 7 Nov");
    expect(p[0].range).toBe("6 Jul to 5 Oct");
    expect(p[2]).toMatchObject({ start: "2026-04-06", end: "2026-10-11", taxYear: "2026-27" });
    expect(p[3]).toMatchObject({ start: "2025-04-06", end: "2026-04-05", taxYear: "2025-26" });
  });

  it("drops 'current' when it is the quarter due next", () => {
    const p = practicePeriods("2026-11-20");
    expect(p.map((x) => x.key)).toEqual(["due", "tax_year", "last_tax_year"]);
  });
});

describe("link end dates", () => {
  it("runs to the 31 January deadline for the tax year it starts in", () => {
    expect(linkEndsAt(new Date("2026-10-03T10:00:00Z")).toISOString()).toBe("2028-01-31T23:59:59.999Z");
    expect(linkEndsAt(new Date("2027-03-01T10:00:00Z")).toISOString()).toBe("2028-01-31T23:59:59.999Z");
    expect(linkEndsAt(new Date("2027-04-10T10:00:00Z")).toISOString()).toBe("2029-01-31T23:59:59.999Z");
  });

  it("keep sharing adds one year", () => {
    const now = new Date("2027-12-20T00:00:00Z");
    const ends = new Date("2028-01-31T23:59:59.999Z");
    expect(renewedEndsAt(ends, now).toISOString()).toBe("2029-01-31T23:59:59.999Z");
  });

  it("uses UK dates", () => {
    // 23:30 UTC on 5 April 2027 is 00:30 on 6 April in BST.
    expect(ukDateKey(new Date("2027-04-05T23:30:00Z"))).toBe("2027-04-06");
  });
});

describe("practice initials", () => {
  it.each([
    ["Smith & Co", "S&C"],
    ["Taylor Price Associates", "TPA"],
    ["Jones Accountancy Ltd", "JA"],
    ["The Books LLP", "BO"],
    ["  ", "?"],
  ])("%s -> %s", (name, want) => {
    expect(practiceInitials(name)).toBe(want);
  });
});

describe("request wording", () => {
  it("counts trips and names the period", () => {
    expect(requestTitle({ type: "sort_trips", countAtSend: 12 })).toBe("Please sort your trips (12)");
    expect(
      requestTitle({ type: "add_earnings", periodStart: "2026-07-06", periodEnd: "2026-10-05" })
    ).toBe("Please add your earnings for 6 Jul to 5 Oct");
  });
});

describe("access log sentences", () => {
  it("names the staff member and the firm", () => {
    expect(
      accessLogSentence({ action: "viewed_trips", practiceName: "Smith & Co", actorName: "Jane Smith" })
    ).toBe("Jane at Smith & Co looked at your trips");
    expect(
      accessLogSentence({
        action: "exported_csv",
        practiceName: "Smith & Co",
        actorName: null,
        detail: { taxYear: "2026-27" },
      })
    ).toBe("Smith & Co downloaded your 2026-27 trips (CSV)");
    expect(accessLogSentence({ action: "stopped_sharing", practiceName: "Smith & Co" })).toBe(
      "You stopped sharing with Smith & Co"
    );
  });
});

describe("pasted invite lists", () => {
  it("reads one per line with optional names, and commas on one line", () => {
    const rows = parsePastedInvites("dave@example.com, Dave Mills\n\nnot-an-email\na@x.com, b@y.com\n");
    expect(rows).toEqual([
      { line: 1, raw: "dave@example.com, Dave Mills", email: "dave@example.com", name: "Dave Mills", valid: true },
      { line: 3, raw: "not-an-email", email: "not-an-email", name: null, valid: false },
      { line: 4, raw: "a@x.com", email: "a@x.com", name: null, valid: true },
      { line: 4, raw: "b@y.com", email: "b@y.com", name: null, valid: true },
    ]);
  });
});

describe("mileage rate note", () => {
  it("uses the tax-year rates for the vehicles driven", () => {
    expect(mileageRateNote("2026-27", ["car"])).toBe("At 55p a mile (2026-27), 25p after 10,000");
    expect(mileageRateNote("2025-26", ["van"])).toBe("At 45p a mile (2025-26), 25p after 10,000");
    expect(mileageRateNote("2026-27", ["motorbike"])).toBe("At 24p a mile for a motorbike (2026-27)");
    expect(mileageRateNote("2026-27", ["car", "motorbike"])).toBe(
      "55p a mile by car or van (25p after 10,000), 24p a mile by motorbike (2026-27)"
    );
    expect(mileageRateNote("2026-27", [])).toBe("At 55p a mile (2026-27), 25p after 10,000");
  });
});
