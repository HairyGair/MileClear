import { describe, it, expect } from "vitest";
import {
  weeksMissingEarnings,
  weekStartOf,
  londonDay,
  isSelfEmployedWorkType,
} from "../../services/hmrc/preSendChecks.js";
import { cumulativeStartFor } from "../../services/hmrc/cumulativeStart.js";

describe("weeksMissingEarnings", () => {
  it("lists weeks with Business trips and no earnings", () => {
    expect(
      weeksMissingEarnings(["2026-09-14", "2026-09-22"], [{ start: "2026-09-14", end: "2026-09-20" }]),
    ).toEqual(["2026-09-21"]);
  });
  it("lets a monthly earning cover every week it overlaps", () => {
    expect(weeksMissingEarnings(["2026-09-02", "2026-09-24"], [{ start: "2026-09-01", end: "2026-09-30" }])).toEqual([]);
  });
  it("returns nothing with no trips", () => {
    expect(weeksMissingEarnings([], [])).toEqual([]);
  });
  it("finds the Monday, with Sunday belonging to the week before", () => {
    expect(weekStartOf("2026-09-20")).toBe("2026-09-14");
    expect(weekStartOf("2026-09-21")).toBe("2026-09-21");
  });
});

describe("londonDay", () => {
  it("uses the UK calendar, so a 23:30 UTC summer trip is the next day", () => {
    expect(londonDay(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(londonDay(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-01");
  });
});

describe("isSelfEmployedWorkType", () => {
  it("is true for gig and both only", () => {
    expect(isSelfEmployedWorkType("gig")).toBe(true);
    expect(isSelfEmployedWorkType("both")).toBe(true);
    expect(isSelfEmployedWorkType("employee")).toBe(false);
    expect(isSelfEmployedWorkType("company")).toBe(false);
    expect(isSelfEmployedWorkType(null)).toBe(false);
  });
});

describe("cumulativeStartFor", () => {
  it("keeps 6 April for standard quarters and anything else", () => {
    expect(cumulativeStartFor("2026-27", "2026-04-06")).toBe("2026-04-06");
    expect(cumulativeStartFor("2026-27", "2026-07-06")).toBe("2026-04-06");
    expect(cumulativeStartFor("2026-27")).toBe("2026-04-06");
  });
  it("starts on 1 April for calendar quarters", () => {
    expect(cumulativeStartFor("2026-27", "2026-04-01")).toBe("2026-04-01");
  });
  it("ignores a 1 April in a different year", () => {
    expect(cumulativeStartFor("2026-27", "2025-04-01")).toBe("2026-04-06");
  });
});
