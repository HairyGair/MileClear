import { describe, it, expect } from "vitest";
import { shouldShowRateNotice, ukMonth, ukDate } from "../rateNotice";

const at = (iso: string) => Date.parse(iso);

describe("shouldShowRateNotice", () => {
  const now = at("2026-11-15T12:00:00Z");
  it("shows to a driver who has not dismissed it", () => {
    for (const persona of ["gig", "employee", "both"]) {
      expect(shouldShowRateNotice({ persona, dismissedMonth: null, now })).toBe(true);
    }
  });
  it("is hidden once dismissed this month", () => {
    expect(shouldShowRateNotice({ persona: "gig", dismissedMonth: "2026-11", now })).toBe(false);
  });
  it("comes back the month after a dismissal", () => {
    expect(shouldShowRateNotice({ persona: "gig", dismissedMonth: "2026-10", now })).toBe(true);
    expect(
      shouldShowRateNotice({ persona: "gig", dismissedMonth: "2026-11", now: at("2026-12-01T09:00:00Z") })
    ).toBe(true);
  });
  it("is hidden for personal and company-car drivers", () => {
    expect(shouldShowRateNotice({ persona: "personal", dismissedMonth: null, now })).toBe(false);
    expect(shouldShowRateNotice({ persona: "company", dismissedMonth: null, now })).toBe(false);
  });
  it("is hidden from 6 April 2027 and shown the day before", () => {
    expect(shouldShowRateNotice({ persona: "gig", dismissedMonth: null, now: at("2027-04-05T12:00:00Z") })).toBe(true);
    expect(shouldShowRateNotice({ persona: "gig", dismissedMonth: null, now: at("2027-04-06T12:00:00Z") })).toBe(false);
    expect(shouldShowRateNotice({ persona: "gig", dismissedMonth: null, now: at("2027-09-01T12:00:00Z") })).toBe(false);
  });
  it("uses UK time for the month boundary and the cut-over", () => {
    // 23:30 UTC on 31 Mar is already 1 April in BST
    expect(ukMonth(at("2027-03-31T23:30:00Z"))).toBe("2027-04");
    // 23:30 UTC on 5 April is 00:30 on 6 April in BST: gone
    expect(ukDate(at("2027-04-05T23:30:00Z"))).toBe("2027-04-06");
    expect(shouldShowRateNotice({ persona: "gig", dismissedMonth: null, now: at("2027-04-05T23:30:00Z") })).toBe(false);
  });
});
