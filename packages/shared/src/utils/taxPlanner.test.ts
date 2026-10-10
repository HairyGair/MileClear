import { describe, it, expect } from "vitest";
import { nextPayment, accountantWeeklyFee } from "./taxPlanner.js";
import type { TaxPlannerPayment } from "../types/index.js";

const pay = (dueDate: string, amountPence: number | null): TaxPlannerPayment => ({
  dueDate,
  daysAway: 10,
  amountPence,
  parts: [],
  firstPaymentOnAccount: false,
});

describe("nextPayment", () => {
  it("skips zero payments", () => {
    expect(nextPayment([pay("2027-01-31", 0), pay("2027-07-31", 500)])?.dueDate).toBe("2027-07-31");
  });
  it("returns a payment whose amount is unknown", () => {
    expect(nextPayment([pay("2027-01-31", null), pay("2027-07-31", 500)])?.dueDate).toBe("2027-01-31");
  });
  it("is null when nothing is due", () => {
    expect(nextPayment([])).toBeNull();
    expect(nextPayment([pay("2027-01-31", 0)])).toBeNull();
  });
});

describe("accountantWeeklyFee", () => {
  it("rounds the annual fee over 52 weeks", () => {
    expect(accountantWeeklyFee(52000)).toBe(1000);
    expect(accountantWeeklyFee(50000)).toBe(962);
  });
  it("is 0 with no fee", () => {
    expect(accountantWeeklyFee(null)).toBe(0);
    expect(accountantWeeklyFee(undefined)).toBe(0);
    expect(accountantWeeklyFee(0)).toBe(0);
  });
});
