import { describe, expect, it } from "vitest";
import { isGigWorkType, showHowYouCompare, showWeeklyEarningsGoal } from "../movedCards";
import { placeLabel, placesToShow } from "../mostVisited";

describe("showHowYouCompare", () => {
  const base = { isWork: true, isCompanyDriver: false, enoughTrips: true, deductionPence: 1200 };
  it("shows for a Work driver with business mileage", () => {
    expect(showHowYouCompare(base)).toBe(true);
  });
  it("hides in Personal mode, for company drivers, under 10 trips, or with no business mileage", () => {
    expect(showHowYouCompare({ ...base, isWork: false })).toBe(false);
    expect(showHowYouCompare({ ...base, isCompanyDriver: true })).toBe(false);
    expect(showHowYouCompare({ ...base, enoughTrips: false })).toBe(false);
    expect(showHowYouCompare({ ...base, deductionPence: 0 })).toBe(false);
    expect(showHowYouCompare({ ...base, deductionPence: null })).toBe(false);
  });
});

describe("showWeeklyEarningsGoal", () => {
  const base = { isWork: true, isGig: true, isCompanyDriver: false, period: "week" as const, offset: 0, enoughTrips: true };
  it("shows on this week for a gig driver", () => {
    expect(showWeeklyEarningsGoal(base)).toBe(true);
  });
  it("hides for other periods, past weeks, employees, company drivers, Personal and new drivers", () => {
    expect(showWeeklyEarningsGoal({ ...base, period: "month" })).toBe(false);
    expect(showWeeklyEarningsGoal({ ...base, offset: -1 })).toBe(false);
    expect(showWeeklyEarningsGoal({ ...base, isGig: false })).toBe(false);
    expect(showWeeklyEarningsGoal({ ...base, isCompanyDriver: true })).toBe(false);
    expect(showWeeklyEarningsGoal({ ...base, isWork: false })).toBe(false);
    expect(showWeeklyEarningsGoal({ ...base, enoughTrips: false })).toBe(false);
  });
});

describe("isGigWorkType", () => {
  it("treats gig, both and unset as gig", () => {
    expect(isGigWorkType("gig")).toBe(true);
    expect(isGigWorkType("both")).toBe(true);
    expect(isGigWorkType(undefined)).toBe(true);
    expect(isGigWorkType("employee")).toBe(false);
  });
});

describe("placesToShow", () => {
  it("ranks, trims, drops empty names and zero counts, and caps the list", () => {
    const out = placesToShow(
      [
        { name: " Tesco ", count: 3 },
        { name: "", count: 9 },
        { name: "Depot", count: 12 },
        { name: "Gym", count: 0 },
        { name: "A", count: 1 },
        { name: "B", count: 2 },
        { name: "C", count: 4 },
        { name: "D", count: 5 },
      ],
      3
    );
    expect(out).toEqual([
      { name: "Depot", count: 12 },
      { name: "D", count: 5 },
      { name: "C", count: 4 },
    ]);
  });
  it("copes with nothing", () => {
    expect(placesToShow(null)).toEqual([]);
    expect(placesToShow(undefined)).toEqual([]);
  });
  it("labels visits in plain English", () => {
    expect(placeLabel({ name: "Work", count: 1 })).toBe("Work, 1 visit");
    expect(placeLabel({ name: "Work", count: 14 })).toBe("Work, 14 visits");
  });
});
