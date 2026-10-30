import { describe, it, expect } from "vitest";
import { balanceRows } from "./mtdBalance";
import type { HmrcBalance } from "../api/hmrc";

const none: HmrcBalance = {
  overduePence: 0,
  overdueSince: null,
  dueNowPence: 0,
  dueNowDate: null,
  comingUpPence: 0,
  comingUpDate: null,
  totalPence: 0,
  creditPence: 0,
  nothingYet: false,
};

describe("balanceRows", () => {
  it("shows nothing when nothing is owed", () => {
    expect(balanceRows(none)).toEqual([]);
    expect(balanceRows({ ...none, totalPence: -5000, creditPence: 5000 })).toEqual([]);
  });

  it("lists overdue, to pay and coming up in that order, with UK dates", () => {
    const rows = balanceRows({
      ...none,
      overduePence: 12050,
      overdueSince: "2026-07-31",
      dueNowPence: 100001,
      dueNowDate: "2027-01-31",
      comingUpPence: 45000,
      comingUpDate: "2027-07-31",
    });
    expect(rows.map((r) => r.label)).toEqual(["Overdue", "To pay", "Coming up"]);
    expect(rows[0].when).toBe("due 31 Jul 2026");
    expect(rows[1].when).toBe("by 31 Jan 2027");
    expect(rows[2].pence).toBe(45000);
  });

  it("leaves the date off when HMRC gave none", () => {
    expect(balanceRows({ ...none, dueNowPence: 100 })[0].when).toBeNull();
  });
});
