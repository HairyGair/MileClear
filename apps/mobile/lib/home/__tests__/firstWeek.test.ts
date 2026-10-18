import { describe, it, expect } from "vitest";
import { firstWeekClaimPence, selectFirstWeek, type FirstWeekInputs } from "../firstWeek";
import { selectAsk } from "../ask";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const GIG = { workType: "gig", employerMileageRatePence: null, employerMileageRatePenceAfter10k: null };

const base: FirstWeekInputs = {
  persona: "gig",
  createdAt: new Date(NOW - 3 * DAY).toISOString(),
  now: NOW,
  local: { trips: 3, miles: 24.2, sorted: 0 },
  doneBefore: false,
  rates: GIG,
};

describe("selectFirstWeek", () => {
  it("shows a new gig driver their trips, miles and what they could claim", () => {
    const v = selectFirstWeek(base);
    expect(v).toMatchObject({
      title: "Your first 3 trips: 24 miles.",
      value: "If they were for work, that's up to £13 you can claim.",
      isAsk: true,
    });
    expect(v!.title + " " + v!.value).not.toMatch(/deduction|—| - /i);
  });

  it("waits for three trips", () => {
    expect(selectFirstWeek({ ...base, local: { trips: 2, miles: 20, sorted: 0 } })).toBeNull();
    expect(selectFirstWeek({ ...base, local: null })).toBeNull();
  });

  it("is gone for good after the first sort, either way", () => {
    expect(selectFirstWeek({ ...base, local: { trips: 4, miles: 30, sorted: 1 } })).toBeNull();
    expect(selectFirstWeek({ ...base, doneBefore: true })).toBeNull();
  });

  it("is gone once the account is 14 days old", () => {
    expect(selectFirstWeek({ ...base, createdAt: new Date(NOW - 13.9 * DAY).toISOString() })).not.toBeNull();
    expect(selectFirstWeek({ ...base, createdAt: new Date(NOW - 14 * DAY).toISOString() })).toBeNull();
    expect(selectFirstWeek({ ...base, createdAt: null })).toBeNull();
  });

  it("gives Personal mode the miles only and no sort ask", () => {
    const v = selectFirstWeek({ ...base, persona: "personal" });
    expect(v).toMatchObject({ title: "Your first 3 trips: 24 miles.", value: null, isAsk: false });
  });

  it("gives company-car drivers the miles only, still as the sort ask", () => {
    expect(selectFirstWeek({ ...base, persona: "company" })).toMatchObject({ value: null, isAsk: true });
  });

  it("values employees at their employer's rate when they have one", () => {
    const v = selectFirstWeek({
      ...base,
      persona: "employee",
      local: { trips: 5, miles: 100, sorted: 0 },
      rates: { workType: "employee", employerMileageRatePence: 30, employerMileageRatePenceAfter10k: null },
    });
    expect(v!.value).toBe("If they were for work, that's up to £30 you can claim.");
  });

  it("leaves the money out under £1", () => {
    expect(selectFirstWeek({ ...base, local: { trips: 3, miles: 1.5, sorted: 0 } })).toMatchObject({
      title: "Your first 3 trips: 2 miles.",
      value: null,
    });
  });
});

describe("firstWeekClaimPence", () => {
  it("uses the rate for the tax year it is now (55p from 6 Apr 2026, 45p before)", () => {
    expect(firstWeekClaimPence(10, GIG, NOW)).toBe(550);
    expect(firstWeekClaimPence(10, GIG, Date.parse("2026-03-01T12:00:00Z"))).toBe(450);
  });
});

describe("first_week in the ask order", () => {
  it("comes before every other ask a new driver could get, and stands down when red", () => {
    const eligible = { first_week: true, acquisition: true, vehicle: true, pro: true };
    expect(selectAsk({ statusRed: false, quietToday: false, eligible })).toBe("first_week");
    expect(selectAsk({ statusRed: true, quietToday: false, eligible })).toBeNull();
  });
});
