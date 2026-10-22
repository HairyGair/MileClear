import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));

import { isBankDated, parseArrears, payoutPeriod } from "../../services/payoutWeek.js";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const day = (x: Date) => x.toISOString().slice(0, 10);
const period = (paid: string, arrears: boolean) => {
  const p = payoutPeriod(d(paid), arrears);
  return [day(p.periodStart), day(p.periodEnd)];
};

describe("payoutPeriod", () => {
  it("keeps the day paid when the app pays straight away", () => {
    expect(period("2026-10-22", false)).toEqual(["2026-10-22", "2026-10-22"]);
  });

  it("dates a week-behind payout to the 7 days before it landed", () => {
    // Deliveroo paid Monday 19 Oct for the week 12-18 Oct.
    expect(period("2026-10-19", true)).toEqual(["2026-10-12", "2026-10-18"]);
  });

  it("ignores the time of day the money landed", () => {
    const p = payoutPeriod(new Date("2026-10-19T16:45:00.000Z"), true);
    expect([day(p.periodStart), day(p.periodEnd)]).toEqual(["2026-10-12", "2026-10-18"]);
  });

  it("never goes back into the previous quarter (6th or 1st of Jan, Apr, Jul, Oct)", () => {
    expect(period("2026-07-08", true)).toEqual(["2026-07-06", "2026-07-07"]);
    expect(period("2026-07-03", true)).toEqual(["2026-07-01", "2026-07-02"]);
    expect(period("2026-10-01", true)).toEqual(["2026-10-01", "2026-10-01"]);
    expect(period("2027-01-04", true)).toEqual(["2027-01-01", "2027-01-03"]);
    expect(period("2026-07-14", true)).toEqual(["2026-07-07", "2026-07-13"]);
  });

  it("never goes back past 6 April into the previous tax year", () => {
    expect(period("2027-04-08", true)).toEqual(["2027-04-06", "2027-04-07"]);
    expect(period("2027-04-06", true)).toEqual(["2027-04-06", "2027-04-06"]);
    expect(period("2027-04-13", true)).toEqual(["2027-04-06", "2027-04-12"]);
    expect(period("2027-04-14", true)).toEqual(["2027-04-07", "2027-04-13"]);
  });
});

describe("isBankDated", () => {
  it("is true on either set of bank dates and false once changed by hand", () => {
    const paid = d("2026-10-19");
    expect(isBankDated({ periodStart: d("2026-10-19"), periodEnd: d("2026-10-19") }, paid)).toBe(true);
    expect(isBankDated({ periodStart: d("2026-10-12"), periodEnd: d("2026-10-18") }, paid)).toBe(true);
    expect(isBankDated({ periodStart: d("2026-10-13"), periodEnd: d("2026-10-19") }, paid)).toBe(false);
  });
});

describe("parseArrears", () => {
  it("keeps known apps once, drops Other, Freelance and junk", () => {
    expect(parseArrears(["deliveroo", "uber", "deliveroo", "other", "freelance", "nope", 3])).toEqual(["uber", "deliveroo"]);
    expect(parseArrears(null)).toEqual([]);
    expect(parseArrears("deliveroo")).toEqual([]);
  });
});
