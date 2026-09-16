import { describe, it, expect } from "vitest";
import { parseReportedDate, formatReportedDate } from "../../lib/reportedDate.js";

// A missing-trip report that said only "To Peterborough" cost an hour on the
// wrong day (16 Sep 2026). The form now sends the calendar day the user picked.
describe("parseReportedDate", () => {
  it("accepts a real calendar day", () => {
    expect(parseReportedDate("2026-09-14")).toBe("2026-09-14");
    expect(parseReportedDate("2024-02-29")).toBe("2024-02-29");
  });

  it("rejects days that do not exist", () => {
    expect(parseReportedDate("2026-02-30")).toBeNull();
    expect(parseReportedDate("2026-13-01")).toBeNull();
    expect(parseReportedDate("2025-02-29")).toBeNull();
    expect(parseReportedDate("2026-00-10")).toBeNull();
  });

  it("rejects the wrong shape and non-strings", () => {
    expect(parseReportedDate("14/09/2026")).toBeNull();
    expect(parseReportedDate("2026-9-4")).toBeNull();
    expect(parseReportedDate("2026-09-14T00:00:00Z")).toBeNull();
    expect(parseReportedDate(undefined)).toBeNull();
    expect(parseReportedDate(20260914)).toBeNull();
  });
});

describe("formatReportedDate", () => {
  it("prints the day the way the admin pages show it", () => {
    expect(formatReportedDate("2026-09-14")).toBe("Mon 14 Sep");
    expect(formatReportedDate("2026-08-06")).toBe("Thu 6 Aug");
  });

  it("says no date when a report predates the picker", () => {
    expect(formatReportedDate(null)).toBe("no date");
    expect(formatReportedDate(undefined)).toBe("no date");
    expect(formatReportedDate("garbage")).toBe("no date");
  });
});
