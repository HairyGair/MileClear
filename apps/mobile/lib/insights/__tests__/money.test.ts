import { describe, expect, it } from "vitest";
import { hasPayRates, hasWeekMoney, payHeadline, weekMoneyHeadline, weeksBackFor } from "../money";

const fp = (p: number) => `£${(p / 100).toFixed(2)}`;
const rates = { totalEarningsPence: 50000, totalBusinessMiles: 400, earningsPerMilePence: 125, earningsPerHourPence: 1450 };

describe("pay rates", () => {
  it("needs paid work and some miles", () => {
    expect(hasPayRates(rates)).toBe(true);
    expect(hasPayRates(null)).toBe(false);
    expect(hasPayRates({ ...rates, totalEarningsPence: 0 })).toBe(false);
    expect(hasPayRates({ ...rates, totalBusinessMiles: 0.4 })).toBe(false);
  });
  it("words per mile and per hour, hour only when known", () => {
    expect(payHeadline(rates, fp)).toBe("£1.25 a mile, £14.50 an hour");
    expect(payHeadline({ ...rates, earningsPerHourPence: 0 }, fp)).toBe("£1.25 a mile");
  });
});

describe("week money", () => {
  const w = { grossEarningsPence: 20000, estimatedFuelCostPence: 3000, estimatedWearCostPence: 1000, netProfitPence: 16000 };
  it("hides an empty week", () => {
    expect(hasWeekMoney(w)).toBe(true);
    expect(hasWeekMoney({ ...w, grossEarningsPence: 0, netProfitPence: -500 })).toBe(false);
    expect(hasWeekMoney({ ...w, grossEarningsPence: 0, earningsCount: 2 })).toBe(true);
    expect(hasWeekMoney(null)).toBe(false);
  });
  it("says left or short", () => {
    expect(weekMoneyHeadline(w, fp)).toBe("£160.00 left after costs");
    expect(weekMoneyHeadline({ ...w, netProfitPence: -200 }, fp)).toBe("£2.00 short after costs");
  });
  it("asks for an older week only in the Week view", () => {
    expect(weeksBackFor("week", 0)).toBe(0);
    expect(weeksBackFor("week", -2)).toBe(2);
    expect(weeksBackFor("month", -2)).toBe(0);
    expect(weeksBackFor("tax_year", -1)).toBe(0);
  });
});
