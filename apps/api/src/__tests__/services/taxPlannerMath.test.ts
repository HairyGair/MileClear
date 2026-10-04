import { describe, it, expect } from "vitest";
import {
  billFromProfit,
  buildPaymentSchedule,
  paymentsOnAccountFrom,
  projectToYearEnd,
  resolvePlannerYears,
  taxYearOfDay,
  weeklySetAside,
  type PlannerYear,
  type UkDay,
} from "../../services/taxPlannerMath.js";

const day = (year: number, month: number, d: number): UkDay => ({ year, month, day: d });

function yr(taxYear: string, billPence: number | null, deductedAtSourcePence = 0): PlannerYear {
  return { taxYear, billPence, source: billPence == null ? "unknown" : "estimate", deductedAtSourcePence };
}

describe("taxYearOfDay (6 April boundary)", () => {
  it("5 April is the old year, 6 April the new one", () => {
    expect(taxYearOfDay(day(2027, 4, 5))).toBe("2026-27");
    expect(taxYearOfDay(day(2027, 4, 6))).toBe("2027-28");
    expect(taxYearOfDay(day(2027, 1, 31))).toBe("2026-27");
  });
});

describe("paymentsOnAccountFrom", () => {
  it("none when last year's bill was under £1,000", () => {
    expect(paymentsOnAccountFrom(yr("2025-26", 99_999))).toEqual({ applies: false, reason: "under_threshold" });
  });

  it("applies at exactly £1,000, each half the bill", () => {
    expect(paymentsOnAccountFrom(yr("2025-26", 100_000))).toEqual({ applies: true, eachPence: 50_000 });
  });

  it("none when more than 80% was taken at source (PAYE)", () => {
    // £1,200 SA bill, £6,000 PAYE: 83% at source.
    expect(paymentsOnAccountFrom(yr("2025-26", 120_000, 600_000))).toEqual({
      applies: false,
      reason: "mostly_deducted_at_source",
    });
  });

  it("still applies at exactly 80% at source (the rule is MORE than 80%)", () => {
    // £1,500 bill, £6,000 PAYE: exactly 80%.
    expect(paymentsOnAccountFrom(yr("2025-26", 150_000, 600_000))).toEqual({ applies: true, eachPence: 75_000 });
  });

  it("rounds each half down to the penny", () => {
    expect(paymentsOnAccountFrom(yr("2025-26", 300_001))).toEqual({ applies: true, eachPence: 150_000 });
  });

  it("unknown bill gives an unknown decision", () => {
    expect(paymentsOnAccountFrom(yr("2025-26", null))).toEqual({ applies: null });
  });
});

describe("buildPaymentSchedule", () => {
  it("first payment on account year: January is about 150% (GOV.UK's £3,000 -> £4,500 example)", () => {
    // Started 2025-26 with a £3,000 bill; nothing before.
    const years = [yr("2024-25", 0), yr("2025-26", 300_000), yr("2026-27", 300_000)];
    const plan = buildPaymentSchedule(day(2026, 10, 4), years);
    expect(plan[0]).toMatchObject({ dueDate: "2027-01-31", amountPence: 450_000, firstPaymentOnAccount: true });
    expect(plan[0].parts).toEqual([
      { kind: "balancing", taxYear: "2025-26", amountPence: 300_000 },
      { kind: "poa1", taxYear: "2026-27", amountPence: 150_000 },
    ]);
    expect(plan[1]).toMatchObject({ dueDate: "2027-07-31", amountPence: 150_000, firstPaymentOnAccount: false });
  });

  it("steady state: balancing is the bill less what was paid on account", () => {
    // GOV.UK example 1: £3,000 bill, £900 paid in January and July.
    const years = [yr("2024-25", 180_000), yr("2025-26", 300_000), yr("2026-27", 300_000)];
    const plan = buildPaymentSchedule(day(2026, 10, 4), years);
    expect(plan[0].dueDate).toBe("2027-01-31");
    expect(plan[0].amountPence).toBe(120_000 + 150_000);
    expect(plan[0].firstPaymentOnAccount).toBe(false);
    expect(plan.map((p) => p.dueDate)).toEqual(["2027-01-31", "2027-07-31", "2028-01-31", "2028-07-31"]);
    // 31 Jan 2028: 2026-27 balancing (£3,000 - 2 x £1,500 = £0) + POA1 for 2027-28.
    expect(plan[2].amountPence).toBe(150_000);
    expect(plan[3].amountPence).toBe(150_000);
  });

  it("no payments on account under £1,000: July has nothing due", () => {
    const years = [yr("2024-25", 80_000), yr("2025-26", 80_000), yr("2026-27", 90_000)];
    const plan = buildPaymentSchedule(day(2026, 10, 4), years);
    expect(plan[0].amountPence).toBe(80_000);
    expect(plan[1]).toMatchObject({ dueDate: "2027-07-31", amountPence: 0 });
    expect(plan[1].parts[0]).toMatchObject({ kind: "poa2", amountPence: 0, noPoaReason: "under_threshold" });
  });

  it("more than 80% at source: no payments on account, balancing only", () => {
    const years = [yr("2024-25", 120_000, 600_000), yr("2025-26", 120_000, 600_000), yr("2026-27", 120_000, 600_000)];
    const plan = buildPaymentSchedule(day(2026, 10, 4), years);
    expect(plan[0].amountPence).toBe(120_000);
    expect(plan[0].parts.find((p) => p.kind === "poa1")?.noPoaReason).toBe("mostly_deducted_at_source");
  });

  it("brand new this tax year: nothing until the January after next, then 150%", () => {
    const years = [yr("2024-25", 0), yr("2025-26", 0), yr("2026-27", 400_000)];
    const plan = buildPaymentSchedule(day(2026, 10, 4), years);
    expect(plan[0]).toMatchObject({ dueDate: "2027-01-31", amountPence: 0 });
    expect(plan[1]).toMatchObject({ dueDate: "2027-07-31", amountPence: 0 });
    expect(plan[2]).toMatchObject({ dueDate: "2028-01-31", amountPence: 600_000, firstPaymentOnAccount: true });
    expect(plan[3]).toMatchObject({ dueDate: "2028-07-31", amountPence: 200_000 });
  });

  it("mid-year (May): next is the second payment on account in July", () => {
    // 10 May 2027 is in 2027-28. July 2027 is POA2 towards 2026-27.
    const years = [yr("2025-26", 200_000), yr("2026-27", 300_000), yr("2027-28", 300_000)];
    const plan = buildPaymentSchedule(day(2027, 5, 10), years);
    expect(plan[0]).toMatchObject({ dueDate: "2027-07-31", amountPence: 100_000 });
    expect(plan[0].parts).toEqual([{ kind: "poa2", taxYear: "2026-27", amountPence: 100_000 }]);
    // 31 Jan 2028: 2026-27 balancing £3,000 - £2,000 + POA1 2027-28 £1,500.
    expect(plan[1]).toMatchObject({ dueDate: "2028-01-31", amountPence: 250_000 });
  });

  it("February: January has gone, July is next and the list stops at July after next", () => {
    const years = [yr("2024-25", 300_000), yr("2025-26", 300_000), yr("2026-27", 300_000)];
    const plan = buildPaymentSchedule(day(2027, 2, 1), years);
    expect(plan.map((p) => p.dueDate)).toEqual(["2027-07-31", "2028-01-31", "2028-07-31"]);
  });

  it("tax-year boundary: 5 April and 6 April list the same next date", () => {
    const years5 = [yr("2024-25", 300_000), yr("2025-26", 300_000), yr("2026-27", 300_000)];
    const years6 = [yr("2025-26", 300_000), yr("2026-27", 300_000), yr("2027-28", 300_000)];
    const a = buildPaymentSchedule(day(2027, 4, 5), years5);
    const b = buildPaymentSchedule(day(2027, 4, 6), years6);
    expect(a[0].dueDate).toBe("2027-07-31");
    expect(b[0].dueDate).toBe("2027-07-31");
    expect(b[0].amountPence).toBe(a[0].amountPence);
  });

  it("the due date itself still counts (0 days away)", () => {
    const years = [yr("2024-25", 300_000), yr("2025-26", 300_000), yr("2026-27", 300_000)];
    const plan = buildPaymentSchedule(day(2027, 1, 31), years);
    expect(plan[0]).toMatchObject({ dueDate: "2027-01-31", daysAway: 0 });
  });

  it("an unknown bill makes the payment unknown, never £0", () => {
    const years = [yr("2024-25", null), yr("2025-26", null), yr("2026-27", 300_000)];
    const plan = buildPaymentSchedule(day(2026, 10, 4), years);
    expect(plan[0].amountPence).toBeNull();
  });

  it("overpaid: balancing is £0 and says how much went over", () => {
    const years = [yr("2024-25", 400_000), yr("2025-26", 300_000), yr("2026-27", 300_000)];
    const plan = buildPaymentSchedule(day(2026, 10, 4), years);
    expect(plan[0].parts[0]).toMatchObject({ kind: "balancing", amountPence: 0, overpaidPence: 100_000 });
  });
});

describe("weeklySetAside", () => {
  it("covers the tightest date from nothing put by today", () => {
    const years = [yr("2024-25", 0), yr("2025-26", 300_000), yr("2026-27", 300_000)];
    const plan = buildPaymentSchedule(day(2026, 10, 4), years);
    const { weeklyPence, coversTo } = weeklySetAside(plan);
    // £4,500 in 119 days (17 weeks) = £264.71/week, the tightest.
    expect(weeklyPence).toBe(Math.ceil(450_000 / 17));
    expect(coversTo).toBe("2028-07-31");
  });

  it("is null when the first payment is unknown", () => {
    const years = [yr("2024-25", null), yr("2025-26", null), yr("2026-27", 300_000)];
    expect(weeklySetAside(buildPaymentSchedule(day(2026, 10, 4), years)).weeklyPence).toBeNull();
  });

  it("is 0 when nothing is due", () => {
    const years = [yr("2024-25", 0), yr("2025-26", 0), yr("2026-27", 0)];
    expect(weeklySetAside(buildPaymentSchedule(day(2026, 10, 4), years)).weeklyPence).toBe(0);
  });
});

describe("resolvePlannerYears", () => {
  const base = {
    currentTaxYear: "2026-27",
    enteredBills: {} as Record<string, number>,
    deductedAtSourcePence: 0,
  };

  it("new this tax year: earlier years are £0, this year is the projection", () => {
    const years = resolvePlannerYears({
      ...base,
      firstSelfEmployedTaxYear: "2026-27",
      estimates: { "2026-27": { billPence: 250_000, hasEarnings: true } },
    });
    expect(years.map((y) => [y.taxYear, y.billPence, y.source])).toEqual([
      ["2024-25", 0, "not_self_employed"],
      ["2025-26", 0, "not_self_employed"],
      ["2026-27", 250_000, "projection"],
    ]);
  });

  it("an entered bill beats the estimate", () => {
    const years = resolvePlannerYears({
      ...base,
      firstSelfEmployedTaxYear: "earlier",
      enteredBills: { "2025-26": 412_300 },
      estimates: { "2025-26": { billPence: 100, hasEarnings: true } },
    });
    expect(years[1]).toMatchObject({ billPence: 412_300, source: "entered" });
  });

  it("no earnings recorded is unknown, not £0", () => {
    const years = resolvePlannerYears({
      ...base,
      firstSelfEmployedTaxYear: null,
      estimates: { "2026-27": { billPence: 0, hasEarnings: false } },
    });
    expect(years[2]).toMatchObject({ billPence: null, source: "unknown" });
  });

  it("year before last with nothing recorded is taken to match last year", () => {
    const years = resolvePlannerYears({
      ...base,
      firstSelfEmployedTaxYear: "earlier",
      estimates: { "2025-26": { billPence: 300_000, hasEarnings: true } },
    });
    expect(years[0]).toMatchObject({ taxYear: "2024-25", billPence: 300_000, source: "assumed_same" });
  });
});

describe("projectToYearEnd and billFromProfit", () => {
  it("doubles at the half-way point", () => {
    // 6 April to 5 October 2026 inclusive = 183 of 365 days.
    expect(projectToYearEnd(1_000_000, day(2026, 10, 5), "2026-27")).toBe(Math.round((1_000_000 * 365) / 183));
  });

  it("leaves a finished year alone", () => {
    expect(projectToYearEnd(1_000_000, day(2027, 4, 5), "2026-27")).toBe(1_000_000);
  });

  it("uses at least four weeks early in the year", () => {
    expect(projectToYearEnd(100_000, day(2026, 4, 12), "2026-27")).toBe(Math.round((100_000 * 365) / 28));
  });

  it("bill is income tax + Class 4, no Class 2, less PAYE", () => {
    // £20,000 profit: 20% of £7,430 = £1,486 + 6% of £7,430 = £445.80.
    expect(billFromProfit(2_000_000)).toEqual({ billPence: 148_600 + 44_580, deductedAtSourcePence: 0 });
    expect(billFromProfit(2_000_000, { payeDeductedPence: 50_000 }).billPence).toBe(148_600 + 44_580 - 50_000);
  });
});
