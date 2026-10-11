/**
 * End-of-year tax return: transport calls (with HMRC mocked at hmrcCall) and
 * the pure rules (annual mapping, quarters check, calculation summary).
 *
 * QQ is HMRC's reserved dummy NINO prefix, so the test NINO can't be anyone's.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/hmrc/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/hmrc/client.js")>();
  return { ...actual, hmrcCall: vi.fn() };
});

import { hmrcCall, HmrcError } from "../../services/hmrc/client.js";
import {
  submitAnnualSubmission,
  retrieveAnnualSubmission,
  deleteAnnualSubmission,
  isEmptyAnnualSubmission,
} from "../../services/hmrc/annualSubmission.js";
import { buildAnnualSubmission, TRADING_ALLOWANCE_PENCE } from "../../services/hmrc/annualMapping.js";
import {
  summariseQuarterlyStatus,
  findSubmittedTaxReturn,
  summariseTaxReturnCalculation,
  taxReturnBlocker,
  retrieveTaxReturnCalculation,
  submitFinalDeclaration,
  plainTaxReturnError,
  taxYearBounds,
} from "../../services/hmrc/taxReturn.js";

const NINO = "QQ123456C";
const BIZ = "XAIS12345678901";
const ctx = {
  client: {} as never,
  server: {} as never,
};
const mockCall = vi.mocked(hmrcCall);

beforeEach(() => {
  mockCall.mockReset();
});

// A trimmed Individual Calculations 8.0 retrieve response for 2025-26,
// shaped like HMRC's published example (def3).
const FINAL_CALC = {
  metadata: {
    calculationId: "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c",
    taxYear: "2025-26",
    calculationType: "intent-to-finalise",
    periodFrom: "2025-04-06",
    periodTo: "2026-04-05",
  },
  inputs: {},
  calculation: {
    allowancesAndDeductions: { personalAllowance: 12570 },
    businessProfitAndLoss: [
      { incomeSourceId: "XAIS12345678901", incomeSourceType: "self-employment", taxableProfit: 20000, netProfit: 20000 },
    ],
    incomeSummaryTotals: { totalSelfEmploymentProfit: 20000 },
    taxCalculation: {
      incomeTax: {
        totalIncomeReceivedFromAllSources: 20000,
        totalAllowancesAndDeductions: 12570,
        totalTaxableIncome: 7430,
        incomeTaxCharged: 1486,
        incomeTaxDueAfterReliefs: 1486,
        totalIncomeTaxDue: 1486,
        payPensionsProfit: {
          incomeReceived: 20000,
          allowancesAllocated: 12570,
          taxableIncome: 7430,
          incomeTaxAmount: 1486,
          taxBands: [{ name: "BRT", rate: 20, bandLimit: 37700, apportionedBandLimit: 37700, income: 7430, taxAmount: 1486 }],
        },
      },
      nics: {
        class2Nics: { amount: 0 },
        class4Nics: { totalAmount: 445.8 },
      },
      totalTaxDeducted: 0,
      totalIncomeTaxAndNicsDue: 1931.8,
    },
  },
  messages: { info: [{ id: "C22201", text: "Some info" }] },
};

describe("annual submission transport (SE Business API 5.0)", () => {
  it("PUTs to /annual/{taxYear} with version 5.0", async () => {
    mockCall.mockResolvedValue(undefined);
    await submitAnnualSubmission({
      userId: "u1", nino: NINO, businessId: BIZ, taxYear: "2025-26", ...ctx,
      body: { allowances: { annualInvestmentAllowance: 100 } },
    });
    const call = mockCall.mock.calls[0][0];
    expect(call.method).toBe("PUT");
    expect(call.path).toBe(`/individuals/business/self-employment/${NINO}/${BIZ}/annual/2025-26`);
    expect(call.apiVersion).toBe("5.0");
    expect(call.body).toEqual({ allowances: { annualInvestmentAllowance: 100 } });
  });

  it("refuses an empty body without calling HMRC", async () => {
    await expect(
      submitAnnualSubmission({
        userId: "u1", nino: NINO, businessId: BIZ, taxYear: "2025-26", ...ctx,
        body: { allowances: {}, adjustments: {} },
      })
    ).rejects.toThrow(/empty/);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("returns null when HMRC holds nothing (404)", async () => {
    mockCall.mockRejectedValue(new HmrcError("Not found", 404, "MATCHING_RESOURCE_NOT_FOUND", null));
    const held = await retrieveAnnualSubmission({
      userId: "u1", nino: NINO, businessId: BIZ, taxYear: "2025-26", ...ctx,
    });
    expect(held).toBeNull();
    expect(mockCall.mock.calls[0][0].method).toBe("GET");
  });

  it("passes other HMRC errors through", async () => {
    mockCall.mockRejectedValue(new HmrcError("Bad", 400, "FORMAT_TAX_YEAR", null));
    await expect(
      retrieveAnnualSubmission({ userId: "u1", nino: NINO, businessId: BIZ, taxYear: "2025-26", ...ctx })
    ).rejects.toBeInstanceOf(HmrcError);
  });

  it("DELETEs the same path", async () => {
    mockCall.mockResolvedValue(undefined);
    await deleteAnnualSubmission({ userId: "u1", nino: NINO, businessId: BIZ, taxYear: "2026-27", ...ctx });
    expect(mockCall.mock.calls[0][0].method).toBe("DELETE");
    expect(mockCall.mock.calls[0][0].path).toMatch(/\/annual\/2026-27$/);
  });

  it("rejects a malformed tax year before calling HMRC", async () => {
    await expect(
      deleteAnnualSubmission({ userId: "u1", nino: NINO, businessId: BIZ, taxYear: "2025-27", ...ctx })
    ).rejects.toThrow(/tax year/);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("isEmptyAnnualSubmission treats empty blocks and arrays as empty", () => {
    expect(isEmptyAnnualSubmission(null)).toBe(true);
    expect(isEmptyAnnualSubmission({ allowances: { structuredBuildingAllowance: [] } })).toBe(true);
    expect(isEmptyAnnualSubmission({ adjustments: { goodsAndServicesOwnUse: 0 } })).toBe(false);
  });
});

describe("buildAnnualSubmission (what MileClear will send)", () => {
  const base = { taxYear: "2026-27", accountingType: "CASH" as const, turnoverPence: 2_500_000, expensesClaimedPence: 600_000 };

  it("sends nothing: the flat rate per mile rules out vehicle capital allowances", () => {
    const r = buildAnnualSubmission(base);
    expect(r.body).toBeNull();
    const vehicle = r.items.find((i) => i.key === "vehicle_allowances")!;
    expect(vehicle.sent).toBe(false);
    expect(vehicle.reason).toMatch(/flat rate per mile/);
  });

  it("never claims the trading allowance, and every item is marked not sent", () => {
    const r = buildAnnualSubmission(base);
    expect(r.items.map((i) => i.key)).toEqual([
      "vehicle_allowances",
      "equipment_allowances",
      "trading_allowance",
      "adjustments",
    ]);
    expect(r.items.every((i) => !i.sent)).toBe(true);
    expect(r.notes).toEqual([]);
  });

  it("tells the driver when the trading allowance would beat their expenses", () => {
    const r = buildAnnualSubmission({ ...base, turnoverPence: 80_000, expensesClaimedPence: 20_000 });
    expect(r.body).toBeNull();
    expect(r.notes.some((n) => n.includes("£1,000 trading allowance") && n.includes("£200.00"))).toBe(true);
  });

  it("says nothing about the trading allowance when expenses already exceed it", () => {
    const r = buildAnnualSubmission({ ...base, turnoverPence: 90_000, expensesClaimedPence: TRADING_ALLOWANCE_PENCE + 1 });
    expect(r.notes).toEqual([]);
  });

  it("warns when HMRC has the business on traditional accounting", () => {
    const r = buildAnnualSubmission({ ...base, accountingType: "ACCRUALS" });
    expect(r.items.find((i) => i.key === "equipment_allowances")!.reason).toMatch(/traditional accounting/);
    expect(r.notes.some((n) => /accountant/.test(n))).toBe(true);
  });

  it("covers both cases when the accounting type is unknown", () => {
    const r = buildAnnualSubmission({ ...base, accountingType: null });
    const reason = r.items.find((i) => i.key === "equipment_allowances")!.reason;
    expect(reason).toMatch(/cash basis/);
    expect(reason).toMatch(/traditional accounting/);
  });

  it("uses no em dashes in driver-facing copy", () => {
    const r = buildAnnualSubmission({ ...base, accountingType: "ACCRUALS", turnoverPence: 50_000, expensesClaimedPence: 0 });
    const all = [...r.items.map((i) => i.reason + i.label), ...r.notes].join(" ");
    expect(all).not.toMatch(/—/);
  });
});

describe("summariseQuarterlyStatus", () => {
  const q = (start: string, end: string, status: "Open" | "Fulfilled") => ({ start, end, due: end, status });

  it("needs every standard quarter fulfilled", () => {
    const s = summariseQuarterlyStatus(
      [
        q("2025-04-06", "2025-07-05", "Fulfilled"),
        q("2025-07-06", "2025-10-05", "Fulfilled"),
        q("2025-10-06", "2026-01-05", "Fulfilled"),
        q("2026-01-06", "2026-04-05", "Open"),
      ],
      "2025-26"
    );
    expect(s.quarters).toHaveLength(4);
    expect(s.sentCount).toBe(3);
    expect(s.allSent).toBe(false);
  });

  it("accepts calendar quarters and ignores other years", () => {
    const s = summariseQuarterlyStatus(
      [
        q("2025-01-06", "2025-04-05", "Open"), // previous year's Q4
        q("2025-04-01", "2025-06-30", "Fulfilled"),
        q("2025-07-01", "2025-09-30", "Fulfilled"),
        q("2025-10-01", "2025-12-31", "Fulfilled"),
        q("2026-01-01", "2026-03-31", "Fulfilled"),
        q("2026-04-01", "2026-06-30", "Open"), // next year's Q1
      ],
      "2025-26"
    );
    expect(s.quarters.map((x) => x.start)).toEqual(["2025-04-01", "2025-07-01", "2025-10-01", "2026-01-01"]);
    expect(s.allSent).toBe(true);
  });

  it("is not 'all sent' when HMRC lists nothing", () => {
    expect(summariseQuarterlyStatus([], "2025-26").allSent).toBe(false);
  });

  it("knows the tax year runs 6 April to 5 April", () => {
    expect(taxYearBounds("2026-27")).toEqual({ start: "2026-04-06", end: "2027-04-05" });
  });
});

describe("findSubmittedTaxReturn", () => {
  it("finds a declared calculation", () => {
    const hit = findSubmittedTaxReturn([
      { calculationId: "a", calculationTimestamp: "2026-05-01T10:00:00Z", calculationType: "in-year" },
      {
        calculationId: "b",
        calculationTimestamp: "2026-05-02T10:00:00Z",
        calculationType: "final-declaration" as never,
        finalDeclarationTimestamp: "2026-05-02T10:05:00Z",
      },
    ]);
    expect(hit).toEqual({ calculationId: "b", submittedAt: "2026-05-02T10:05:00Z" });
  });

  it("returns null when nothing is declared", () => {
    expect(
      findSubmittedTaxReturn([
        { calculationId: "a", calculationTimestamp: "x", calculationType: "intent-to-finalise" },
      ])
    ).toBeNull();
  });
});

describe("summariseTaxReturnCalculation", () => {
  it("pulls out the SA302-style lines", () => {
    const s = summariseTaxReturnCalculation(FINAL_CALC, "fallback");
    expect(s.ready).toBe(true);
    expect(s.calculationId).toBe(FINAL_CALC.metadata.calculationId);
    expect(s.calculationType).toBe("intent-to-finalise");
    expect(s.totalIncomeReceived).toBe(20000);
    expect(s.personalAllowance).toBe(12570);
    expect(s.totalTaxableIncome).toBe(7430);
    expect(s.incomeTax).toBe(1486);
    expect(s.class2Nics).toBe(0);
    expect(s.class4Nics).toBe(445.8);
    expect(s.totalTaxDeducted).toBe(0);
    expect(s.totalIncomeTaxAndNicsDue).toBe(1931.8);
    expect(s.incomeSources).toEqual([{ label: "Self-employment profit", amount: 20000 }]);
    expect(s.taxBands).toEqual([{ name: "Basic rate", rate: 20, income: 7430, taxAmount: 1486 }]);
    expect(s.info).toEqual([{ id: "C22201", text: "Some info" }]);
    expect(taxReturnBlocker(s)).toBeNull();
  });

  it("is ready but blocked when HMRC returns errors and no figures", () => {
    const s = summariseTaxReturnCalculation(
      {
        metadata: { calculationId: "c1", taxYear: "2025-26", calculationType: "intent-to-finalise" },
        inputs: {},
        messages: { errors: [{ id: "C55001", text: "A problem" }] },
      },
      "c1"
    );
    expect(s.ready).toBe(true);
    expect(s.errors).toHaveLength(1);
    expect(taxReturnBlocker(s)).toMatch(/problems/);
  });

  it("blocks an in-year calculation", () => {
    const s = summariseTaxReturnCalculation(
      { ...FINAL_CALC, metadata: { ...FINAL_CALC.metadata, calculationType: "in-year" } },
      "x"
    );
    expect(taxReturnBlocker(s)).toMatch(/not the end-of-year one/);
  });

  it("blocks a calculation that is still running", () => {
    const s = summariseTaxReturnCalculation({ metadata: { calculationId: "c" }, inputs: {} }, "c");
    expect(s.ready).toBe(false);
    expect(taxReturnBlocker(s)).toMatch(/still working/);
  });
});

describe("tax return transport (Individual Calculations API 8.0)", () => {
  it("retrieves from /{taxYear}/{calculationId} and summarises", async () => {
    mockCall.mockResolvedValue(FINAL_CALC);
    const s = await retrieveTaxReturnCalculation({
      userId: "u1", nino: NINO, taxYear: "2025-26", calculationId: "calc-1", ...ctx,
    });
    const call = mockCall.mock.calls[0][0];
    expect(call.method).toBe("GET");
    expect(call.path).toBe(`/individuals/calculations/${NINO}/self-assessment/2025-26/calc-1`);
    expect(call.apiVersion).toBe("8.0");
    expect(s.totalIncomeTaxAndNicsDue).toBe(1931.8);
  });

  it("treats 404 as still calculating", async () => {
    mockCall.mockRejectedValue(new HmrcError("Not found", 404, "MATCHING_RESOURCE_NOT_FOUND", null));
    const s = await retrieveTaxReturnCalculation({
      userId: "u1", nino: NINO, taxYear: "2025-26", calculationId: "calc-1", ...ctx,
    });
    expect(s.ready).toBe(false);
  });

  it("submits the final declaration against the calculation and returns HMRC's correlation ID", async () => {
    mockCall.mockImplementation(async (opts) => {
      opts.onResponseHeaders?.(new Headers({ "X-CorrelationId": "corr-123" }));
      return undefined as never;
    });
    const res = await submitFinalDeclaration({
      userId: "u1", nino: NINO, taxYear: "2025-26", calculationId: "calc-1", ...ctx,
    });
    const call = mockCall.mock.calls[0][0];
    expect(call.method).toBe("POST");
    expect(call.path).toBe(`/individuals/calculations/${NINO}/self-assessment/2025-26/calc-1/final-declaration`);
    expect(call.apiVersion).toBe("8.0");
    expect(call.body).toBeUndefined();
    expect(res.correlationId).toBe("corr-123");
  });
});

describe("plainTaxReturnError", () => {
  it("rewrites known HMRC codes into plain English and keeps the code", () => {
    const out = plainTaxReturnError(
      new HmrcError("The final declaration cannot be submitted...", 400, "RULE_FINAL_DECLARATION_TAX_YEAR", null)
    ) as HmrcError;
    expect(out).toBeInstanceOf(HmrcError);
    expect(out.hmrcCode).toBe("RULE_FINAL_DECLARATION_TAX_YEAR");
    expect(out.httpStatus).toBe(400);
    expect(out.message).toMatch(/until the tax year has ended/);
  });

  it("leaves unknown codes and other errors alone", () => {
    const e = new HmrcError("x", 400, "SOMETHING_NEW", null);
    expect(plainTaxReturnError(e)).toBe(e);
    const plain = new Error("boom");
    expect(plainTaxReturnError(plain)).toBe(plain);
  });
});
