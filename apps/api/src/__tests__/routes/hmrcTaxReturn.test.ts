/**
 * End-of-year tax return routes. HMRC is mocked at hmrcCall, so these tests
 * check the server-side guards that stand between a tap in the app and a tax
 * return reaching HMRC:
 *   - no calculation until the driver confirms their other income is with HMRC
 *   - no submission without the tick, the current declaration wording, and a
 *     finished, error-free, end-of-year calculation
 *   - the annual submission body only ever comes from MileClear's own rules
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TAX_RETURN_DECLARATION_VERSION } from "@mileclear/shared";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    hmrcConnection: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../middleware/premium.js", () => ({
  premiumMiddleware: vi.fn(async () => {}),
}));
vi.mock("../../services/hmrc/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/hmrc/client.js")>();
  return { ...actual, hmrcCall: vi.fn() };
});
vi.mock("../../services/hmrc/requestContext.js", () => ({
  buildClientContext: vi.fn(() => ({})),
  buildServerContext: vi.fn(async () => ({})),
}));
vi.mock("../../services/hmrc/periodMapping.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/hmrc/periodMapping.js")>();
  return {
    ...actual,
    buildPeriodSubmission: vi.fn(async () => ({
      periodDates: { periodStartDate: "2025-04-06", periodEndDate: "2026-04-05" },
      periodIncome: { turnover: 20000 },
      periodExpenses: { carVanTravelExpenses: 4500 },
      breakdown: {
        income: { turnoverPence: 2_000_000, otherPence: 0, earningCount: 1, perPlatform: [] },
        mileage: {},
        expenses: {
          carVanTravelPence: 450_000,
          professionalFeesPence: 0,
          adminCostsPence: 0,
          otherExpensesPence: 0,
          excludedNonAmapPence: 0,
          expenseCount: 0,
        },
        warnings: [],
      },
    })),
  };
});

import { hmrcRoutes } from "../../routes/hmrc/index.js";
import { prisma } from "../../lib/prisma.js";
import { hmrcCall, HmrcError } from "../../services/hmrc/client.js";
import { logEvent } from "../../services/appEvents.js";

const USER_ID = "00000000-0000-0000-0000-0000000000f1";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };
const NINO = "QQ123456C";
const BIZ = "XAIS12345678901";
const mockCall = vi.mocked(hmrcCall);

const GOOD_CALC = {
  metadata: { calculationId: "calc-1", taxYear: "2025-26", calculationType: "intent-to-finalise" },
  inputs: {},
  calculation: {
    taxCalculation: {
      incomeTax: { totalIncomeReceivedFromAllSources: 20000, totalTaxableIncome: 7430, incomeTaxDueAfterReliefs: 1486 },
      nics: { class4Nics: { totalAmount: 445.8 } },
      totalIncomeTaxAndNicsDue: 1931.8,
    },
  },
};

const PERIODS_HELD = {
  submittedOn: "2026-04-10T10:00:00.000Z",
  periodsOfAccount: true,
  periodsOfAccountDates: [{ startDate: "2025-04-06", endDate: "2026-04-05" }],
};

async function createTestApp() {
  const app = await buildApp();
  await app.register(hmrcRoutes, { prefix: "/hmrc" });
  return app;
}

describe("HMRC tax return routes", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.HMRC_CLIENT_ID = "test-client-id";
    process.env.HMRC_CLIENT_SECRET = "test-client-secret";
    process.env.HMRC_ENVIRONMENT = "sandbox";
    process.env.HMRC_REDIRECT_URI = "https://api.example.com/hmrc/callback";
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue({
      nino: NINO,
      disconnectedAt: null,
      businessId: BIZ,
    } as never);
    app = await createTestApp();
  });

  it("won't ask HMRC for the end-of-year calculation until other income is confirmed", async () => {
    const res = await app.inject({
      method: "POST", url: "/hmrc/tax-return/2025-26/calculation", headers: auth, payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("triggers an intent-to-finalise calculation once confirmed", async () => {
    mockCall.mockResolvedValue({ calculationId: "calc-1" } as never);
    const res = await app.inject({
      method: "POST", url: "/hmrc/tax-return/2025-26/calculation", headers: auth,
      payload: { otherIncomeConfirmed: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.calculationId).toBe("calc-1");
    expect(mockCall.mock.calls[0][0].path).toBe(
      `/individuals/calculations/${NINO}/self-assessment/2025-26/trigger/intent-to-finalise`
    );
  });

  it("refuses to submit without the declaration ticked", async () => {
    const res = await app.inject({
      method: "POST", url: "/hmrc/tax-return/2025-26/submit", headers: auth,
      payload: { calculationId: "calc-1", otherIncomeConfirmed: true, declarationVersion: TAX_RETURN_DECLARATION_VERSION },
    });
    expect(res.statusCode).toBe(400);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("refuses to submit against out-of-date declaration wording", async () => {
    const res = await app.inject({
      method: "POST", url: "/hmrc/tax-return/2025-26/submit", headers: auth,
      payload: { calculationId: "calc-1", declarationAccepted: true, otherIncomeConfirmed: true, declarationVersion: "old" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("DECLARATION_CHANGED");
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("re-checks the calculation and refuses one with HMRC errors", async () => {
    mockCall.mockResolvedValueOnce({
      metadata: { calculationId: "calc-1", calculationType: "intent-to-finalise" },
      inputs: {},
      messages: { errors: [{ id: "C1", text: "Problem" }] },
    } as never);
    const res = await app.inject({
      method: "POST", url: "/hmrc/tax-return/2025-26/submit", headers: auth,
      payload: { calculationId: "calc-1", declarationAccepted: true, otherIncomeConfirmed: true, declarationVersion: TAX_RETURN_DECLARATION_VERSION },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CALCULATION_NOT_READY");
    // Only the retrieve happened; nothing was declared.
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall.mock.calls[0][0].method).toBe("GET");
  });

  it("submits against the agreed calculation and logs it", async () => {
    mockCall
      .mockResolvedValueOnce(GOOD_CALC as never)
      .mockResolvedValueOnce(PERIODS_HELD as never)
      .mockImplementationOnce(async (opts) => {
        opts.onResponseHeaders?.(new Headers({ "X-CorrelationId": "corr-9" }));
        return undefined as never;
      });
    const res = await app.inject({
      method: "POST", url: "/hmrc/tax-return/2025-26/submit", headers: auth,
      payload: { calculationId: "calc-1", declarationAccepted: true, otherIncomeConfirmed: true, declarationVersion: TAX_RETURN_DECLARATION_VERSION },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.calculationId).toBe("calc-1");
    expect(data.correlationId).toBe("corr-9");
    expect(data.environment).toBe("sandbox");
    const submit = mockCall.mock.calls[2][0];
    expect(submit.method).toBe("POST");
    expect(submit.path).toBe(`/individuals/calculations/${NINO}/self-assessment/2025-26/calc-1/final-declaration`);
    expect(logEvent).toHaveBeenCalledWith(
      "hmrc.tax_return_submitted",
      USER_ID,
      expect.objectContaining({ calculationId: "calc-1", declarationVersion: TAX_RETURN_DECLARATION_VERSION })
    );
  });

  it("turns HMRC's 'tax year not over' error into plain English", async () => {
    mockCall
      .mockResolvedValueOnce(GOOD_CALC as never)
      .mockResolvedValueOnce(PERIODS_HELD as never)
      .mockRejectedValueOnce(new HmrcError("raw", 400, "RULE_FINAL_DECLARATION_TAX_YEAR", null));
    const res = await app.inject({
      method: "POST", url: "/hmrc/tax-return/2025-26/submit", headers: auth,
      payload: { calculationId: "calc-1", declarationAccepted: true, otherIncomeConfirmed: true, declarationVersion: TAX_RETURN_DECLARATION_VERSION },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("RULE_FINAL_DECLARATION_TAX_YEAR");
    expect(res.json().error.message).toMatch(/until the tax year has ended/);
  });

  it("reports a calculation that is still running as not ready", async () => {
    mockCall.mockRejectedValueOnce(new HmrcError("nf", 404, "MATCHING_RESOURCE_NOT_FOUND", null));
    const res = await app.inject({
      method: "GET", url: "/hmrc/tax-return/2025-26/calculation/calc-1", headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ready).toBe(false);
  });

  it("shows what HMRC holds and MileClear's reasons, and sends nothing", async () => {
    mockCall.mockImplementation(async (opts) => {
      if (opts.path.includes("/annual/")) throw new HmrcError("nf", 404, "MATCHING_RESOURCE_NOT_FOUND", null);
      if (opts.path.startsWith("/individuals/business/details/")) return { accountingType: "CASH" } as never;
      throw new Error(`unexpected ${opts.path}`);
    });
    const res = await app.inject({ method: "GET", url: "/hmrc/tax-return/2025-26/annual", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.held).toBeNull();
    expect(res.json().data.proposal.body).toBeNull();
    expect(res.json().data.proposal.items).toHaveLength(4);

    const put = await app.inject({ method: "PUT", url: "/hmrc/tax-return/2025-26/annual", headers: auth });
    expect(put.statusCode).toBe(409);
    expect(put.json().error.code).toBe("NOTHING_TO_SEND");
    expect(mockCall.mock.calls.some((c) => c[0].method === "PUT")).toBe(false);
  });

  it("needs an explicit confirm to delete the annual submission", async () => {
    const res = await app.inject({
      method: "DELETE", url: "/hmrc/tax-return/2025-26/annual", headers: auth, payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("reports quarters for the year and whether a return is already in", async () => {
    mockCall.mockImplementation(async (opts) => {
      if (opts.path.startsWith("/obligations/")) {
        return {
          obligations: [
            {
              businessId: BIZ,
              obligationDetails: [
                { periodStartDate: "2025-04-06", periodEndDate: "2025-07-05", dueDate: "2025-08-07", status: "fulfilled" },
                { periodStartDate: "2025-07-06", periodEndDate: "2025-10-05", dueDate: "2025-11-07", status: "fulfilled" },
                { periodStartDate: "2025-10-06", periodEndDate: "2026-01-05", dueDate: "2026-02-07", status: "fulfilled" },
                { periodStartDate: "2026-01-06", periodEndDate: "2026-04-05", dueDate: "2026-05-07", status: "open" },
              ],
            },
          ],
        } as never;
      }
      if (opts.path.startsWith("/individuals/calculations/")) return { calculations: [] } as never;
      throw new Error(`unexpected ${opts.path}`);
    });
    const res = await app.inject({ method: "GET", url: "/hmrc/tax-return/2025-26/status", headers: auth });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.quarterly.sentCount).toBe(3);
    expect(d.quarterly.allSent).toBe(false);
    expect(d.submitted).toBeNull();
    expect(d.yearEnded).toBe(true);
  });

  it("won't submit until HMRC has the accounting period for the year", async () => {
    mockCall
      .mockResolvedValueOnce(GOOD_CALC as never)
      .mockRejectedValueOnce(new HmrcError("nf", 404, "MATCHING_RESOURCE_NOT_FOUND", null));
    const res = await app.inject({
      method: "POST", url: "/hmrc/tax-return/2025-26/submit", headers: auth,
      payload: { calculationId: "calc-1", declarationAccepted: true, otherIncomeConfirmed: true, declarationVersion: TAX_RETURN_DECLARATION_VERSION },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("PERIODS_OF_ACCOUNT_MISSING");
    expect(mockCall.mock.calls.some((c) => c[0].path.endsWith("/final-declaration"))).toBe(false);
  });

  it("reads the accounting method for the year from Business Details 2.0", async () => {
    mockCall.mockResolvedValueOnce({ accountingType: "CASH" } as never);
    const res = await app.inject({ method: "GET", url: "/hmrc/tax-return/2025-26/accounting-type", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.accountingType).toBe("CASH");
    const call = mockCall.mock.calls[0][0];
    expect(call.path).toBe(`/individuals/business/details/${NINO}/${BIZ}/2025-26/accounting-type`);
    expect(call.apiVersion).toBe("2.0");
  });

  it("returns null when HMRC holds no accounting method", async () => {
    mockCall.mockRejectedValueOnce(new HmrcError("nf", 404, "MATCHING_RESOURCE_NOT_FOUND", null));
    const res = await app.inject({ method: "GET", url: "/hmrc/tax-return/2025-26/accounting-type", headers: auth });
    expect(res.json().data.accountingType).toBeNull();
  });

  it("changes the accounting method with an audited PUT", async () => {
    mockCall.mockResolvedValueOnce(undefined as never);
    const res = await app.inject({
      method: "PUT", url: "/hmrc/tax-return/2025-26/accounting-type", headers: auth,
      payload: { accountingType: "ACCRUAL" },
    });
    expect(res.statusCode).toBe(200);
    const call = mockCall.mock.calls[0][0];
    expect(call.method).toBe("PUT");
    expect(call.body).toEqual({ accountingType: "ACCRUAL" });
    expect(call.audit).toEqual(expect.objectContaining({ operation: "accounting_type_update", taxYear: "2025-26" }));
  });

  it("refuses an accounting method HMRC doesn't know", async () => {
    const res = await app.inject({
      method: "PUT", url: "/hmrc/tax-return/2025-26/accounting-type", headers: auth,
      payload: { accountingType: "ACCRUALS" },
    });
    expect(res.statusCode).toBe(400);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("builds the periods of account body from the driver's answer", async () => {
    mockCall.mockResolvedValueOnce(undefined as never);
    const res = await app.inject({
      method: "PUT", url: "/hmrc/tax-return/2025-26/periods-of-account", headers: auth,
      payload: { choice: "tax_year", periodsOfAccount: false },
    });
    expect(res.statusCode).toBe(200);
    const call = mockCall.mock.calls[0][0];
    expect(call.path).toBe(`/individuals/business/details/${NINO}/${BIZ}/2025-26/periods-of-account`);
    expect(call.body).toEqual({
      periodsOfAccount: true,
      periodsOfAccountDates: [{ startDate: "2025-04-06", endDate: "2026-04-05" }],
    });
    expect(call.audit).toEqual(expect.objectContaining({ operation: "periods_of_account_submit" }));
  });

  it("refuses custom dates outside the tax year without calling HMRC", async () => {
    const res = await app.inject({
      method: "PUT", url: "/hmrc/tax-return/2025-26/periods-of-account", headers: auth,
      payload: { choice: "custom", startDate: "2025-01-01", endDate: "2025-03-31" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/end date must be between/);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("shows what HMRC holds about the accounting period as an answer", async () => {
    mockCall.mockResolvedValueOnce(PERIODS_HELD as never);
    const res = await app.inject({ method: "GET", url: "/hmrc/tax-return/2025-26/periods-of-account", headers: auth });
    expect(res.json().data.answer).toEqual({ choice: "tax_year" });
  });

  it("rejects a malformed tax year", async () => {
    const res = await app.inject({ method: "GET", url: "/hmrc/tax-return/2025-27/status", headers: auth });
    expect(res.statusCode).toBe(400);
  });
});
