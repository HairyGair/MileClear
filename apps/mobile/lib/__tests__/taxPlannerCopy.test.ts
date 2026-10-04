import { describe, it, expect } from "vitest";
import {
  daysAwayLabel,
  longDate,
  nextPayment,
  noPoaText,
  partHint,
  partLabel,
  previousTaxYear,
} from "../taxPlanner/copy";

describe("tax planner copy", () => {
  it("formats due dates in full", () => {
    expect(longDate("2027-01-31")).toBe("31 January 2027");
    expect(longDate("2027-07-31")).toBe("31 July 2027");
  });

  it("counts down in plain words", () => {
    expect(daysAwayLabel(0)).toBe("Due today");
    expect(daysAwayLabel(1)).toBe("Tomorrow");
    expect(daysAwayLabel(3)).toBe("In 3 days");
    expect(daysAwayLabel(14)).toBe("In 2 weeks");
    expect(daysAwayLabel(119)).toBe("In 4 months");
  });

  it("labels each part", () => {
    expect(partLabel({ kind: "balancing", taxYear: "2025-26" })).toBe("Rest of your 2025-26 bill");
    expect(partLabel({ kind: "poa1", taxYear: "2026-27" })).toBe("1st payment on account for 2026-27");
    expect(partLabel({ kind: "poa2", taxYear: "2026-27" })).toBe("2nd payment on account for 2026-27");
  });

  it("explains a missing payment on account from the year it was based on", () => {
    expect(partHint({ kind: "poa2", taxYear: "2026-27", amountPence: 0, noPoaReason: "under_threshold" })).toBe(
      "Nothing in advance: your 2025-26 bill was under £1,000."
    );
    expect(noPoaText("mostly_deducted_at_source", "2025-26")).toMatch(/80%/);
  });

  it("previous tax year", () => {
    expect(previousTaxYear("2026-27")).toBe("2025-26");
  });

  it("the headline skips dates with nothing due but stops at an unknown", () => {
    const base = { daysAway: 1, parts: [], firstPaymentOnAccount: false };
    expect(
      nextPayment([
        { ...base, dueDate: "2027-01-31", amountPence: 0 },
        { ...base, dueDate: "2027-07-31", amountPence: null },
        { ...base, dueDate: "2028-01-31", amountPence: 5 },
      ])?.dueDate
    ).toBe("2027-07-31");
  });

  it("no em or en dashes anywhere a driver reads", () => {
    const all = [
      partHint({ kind: "balancing", taxYear: "2025-26", amountPence: 1 }),
      partHint({ kind: "balancing", taxYear: "2025-26", amountPence: 0, overpaidPence: 5 }),
      partHint({ kind: "poa1", taxYear: "2026-27", amountPence: 5 }),
      noPoaText("no_bill", "2025-26"),
    ].join(" ");
    expect(all).not.toMatch(/[—–]/);
  });
});
