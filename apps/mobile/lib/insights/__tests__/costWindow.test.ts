import { describe, it, expect } from "vitest";
import { costWindow } from "../costWindow";
import { getPeriodRange } from "../period";

const now = new Date(2026, 9, 9, 12);
const r = (p: "week" | "month" | "tax_year", o: number) => getPeriodRange(p, o, now);

describe("running cost window", () => {
  it("follows the week and says so", () => {
    expect(costWindow("week", 0, r("week", 0), r("month", 0)).window.label).toBe("this week");
    expect(costWindow("week", -1, r("week", -1), r("month", 0)).window.label).toBe("last week");
  });
  it("follows the month, naming past months", () => {
    expect(costWindow("month", 0, r("month", 0), r("month", 0)).window.label).toBe("this month");
    expect(costWindow("month", -1, r("month", -1), r("month", 0)).window.label).toBe("September 2026");
  });
  it("Tax year falls back to this month and is labelled as such", () => {
    const c = costWindow("tax_year", 0, r("tax_year", 0), r("month", 0));
    expect(c.fellBackToMonth).toBe(true);
    expect(c.window.label).toBe("this month");
    expect(c.window.period).toBe("month");
  });
});
