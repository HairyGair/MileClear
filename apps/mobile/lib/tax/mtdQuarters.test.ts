import { describe, it, expect } from "vitest";
import { taxYearOfPeriodStart } from "./mtdQuarters";

describe("taxYearOfPeriodStart", () => {
  it("puts standard quarters in the year they start in", () => {
    expect(taxYearOfPeriodStart("2026-04-06")).toBe("2026-27");
    expect(taxYearOfPeriodStart("2026-07-06")).toBe("2026-27");
    expect(taxYearOfPeriodStart("2026-10-06")).toBe("2026-27");
    expect(taxYearOfPeriodStart("2027-01-06")).toBe("2026-27");
  });
  it("puts a calendar quarter starting 1 April in the new year", () => {
    expect(taxYearOfPeriodStart("2026-04-01")).toBe("2026-27");
    expect(taxYearOfPeriodStart("2026-07-01")).toBe("2026-27");
    expect(taxYearOfPeriodStart("2027-01-01")).toBe("2026-27");
  });
  it("handles date-times and the year rollover", () => {
    expect(taxYearOfPeriodStart("2026-04-01T00:00:00.000Z")).toBe("2026-27");
    expect(taxYearOfPeriodStart("2099-04-01")).toBe("2099-00");
    expect(taxYearOfPeriodStart("2027-03-31")).toBe("2026-27");
  });
  it("returns empty for nonsense", () => {
    expect(taxYearOfPeriodStart("soon")).toBe("");
  });
});
