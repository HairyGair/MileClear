import { describe, expect, it } from "vitest";
import { nzBalanceDateAskDue, nzBalanceDateWindowYear } from "../nzBalanceDate";

describe("New Zealand balance-date odometer ask", () => {
  it("runs 25 March to 15 April in New Zealand time", () => {
    // 24 Mar 2027 23:59 NZDT = 24 Mar 10:59Z: not yet.
    expect(nzBalanceDateWindowYear(new Date("2027-03-24T10:59:00Z"))).toBeNull();
    // 25 Mar 2027 00:00 NZDT = 24 Mar 11:00Z: in, even though it's still the 24th in the UK.
    expect(nzBalanceDateWindowYear(new Date("2027-03-24T11:00:00Z"))).toBe(2027);
    expect(nzBalanceDateWindowYear(new Date("2027-04-15T11:00:00Z"))).toBe(2027); // 15 Apr 23:00 NZST
    expect(nzBalanceDateWindowYear(new Date("2027-04-15T12:00:00Z"))).toBeNull(); // 16 Apr 00:00 NZST
    expect(nzBalanceDateWindowYear(new Date("2027-07-01T00:00:00Z"))).toBeNull();
  });

  it("only for New Zealand drivers, once a year", () => {
    const now = new Date("2027-03-30T00:00:00Z");
    expect(nzBalanceDateAskDue({ country: "NZ", now, doneYear: null })).toBe(true);
    expect(nzBalanceDateAskDue({ country: "NZ", now, doneYear: "2026" })).toBe(true);
    expect(nzBalanceDateAskDue({ country: "NZ", now, doneYear: "2027" })).toBe(false);
    expect(nzBalanceDateAskDue({ country: "GB", now, doneYear: null })).toBe(false);
    expect(nzBalanceDateAskDue({ country: "AU", now, doneYear: null })).toBe(false);
  });
});
