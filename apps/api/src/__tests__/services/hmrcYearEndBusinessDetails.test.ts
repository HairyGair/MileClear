/**
 * Accounting method and periods of account (Business Details API 2.0):
 * the pure rules that turn a driver's answer into HMRC's body, and the
 * transport guards. QQ is HMRC's reserved dummy NINO prefix.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/hmrc/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/hmrc/client.js")>();
  return { ...actual, hmrcCall: vi.fn() };
});

import { hmrcCall, HmrcError } from "../../services/hmrc/client.js";
import {
  buildPeriodsOfAccount,
  describeHeldPeriods,
  normaliseAccountingType,
  retrievePeriodsOfAccount,
  submitPeriodsOfAccount,
  updateAccountingType,
} from "../../services/hmrc/yearEndBusinessDetails.js";

const mockCall = vi.mocked(hmrcCall);
const base = {
  userId: "u1",
  nino: "QQ123456C",
  businessId: "XAIS12345678901",
  taxYear: "2025-26",
  client: {} as never,
  server: {} as never,
};

beforeEach(() => {
  mockCall.mockReset();
});

describe("normaliseAccountingType", () => {
  it("treats ACCRUAL and the older ACCRUALS as traditional", () => {
    expect(normaliseAccountingType("ACCRUAL")).toBe("ACCRUAL");
    expect(normaliseAccountingType("ACCRUALS")).toBe("ACCRUAL");
    expect(normaliseAccountingType("CASH")).toBe("CASH");
    expect(normaliseAccountingType(undefined)).toBeNull();
  });
});

describe("buildPeriodsOfAccount", () => {
  it("uses the tax year itself for most drivers", () => {
    const p = buildPeriodsOfAccount({ taxYear: "2025-26", choice: "tax_year" });
    expect(p.body).toEqual({
      periodsOfAccount: true,
      periodsOfAccountDates: [{ startDate: "2025-04-06", endDate: "2026-04-05" }],
    });
    expect(p.warnings).toEqual([]);
  });

  it("accepts a year ending 31 March without a warning", () => {
    const p = buildPeriodsOfAccount({ taxYear: "2026-27", choice: "to_31_march" });
    expect(p.body?.periodsOfAccountDates).toEqual([{ startDate: "2026-04-01", endDate: "2027-03-31" }]);
    expect(p.warnings).toEqual([]);
  });

  it("sends false with no dates when no period ended, and warns", () => {
    const p = buildPeriodsOfAccount({ taxYear: "2025-26", choice: "none" });
    expect(p.body).toEqual({ periodsOfAccount: false });
    expect(p.warnings).toHaveLength(1);
  });

  it("accepts custom dates ending in the tax year and warns when they don't line up", () => {
    const p = buildPeriodsOfAccount({ taxYear: "2025-26", choice: "custom", startDate: "2025-01-01", endDate: "2025-12-31" });
    expect(p.error).toBeNull();
    expect(p.body?.periodsOfAccountDates).toEqual([{ startDate: "2025-01-01", endDate: "2025-12-31" }]);
    expect(p.warnings[0]).toMatch(/doesn't match the tax year/);
  });

  it("rejects custom dates that HMRC would reject", () => {
    expect(buildPeriodsOfAccount({ taxYear: "2025-26", choice: "custom" }).error).toMatch(/Enter a start date/);
    expect(
      buildPeriodsOfAccount({ taxYear: "2025-26", choice: "custom", startDate: "2025-06-01", endDate: "2025-05-01" }).error
    ).toMatch(/after the start date/);
    expect(
      buildPeriodsOfAccount({ taxYear: "2025-26", choice: "custom", startDate: "2025-05-01", endDate: "2026-04-06" }).error
    ).toMatch(/between 6 April 2025 and 5 April 2026/);
    expect(
      buildPeriodsOfAccount({ taxYear: "2025-26", choice: "custom", startDate: "2025-02-30", endDate: "2025-12-31" }).error
    ).toMatch(/Enter a start date/);
  });

  it("rejects a bad tax year", () => {
    expect(buildPeriodsOfAccount({ taxYear: "2025-27", choice: "tax_year" }).body).toBeNull();
  });

  it("uses no em dashes in driver-facing copy", () => {
    const all = [
      ...buildPeriodsOfAccount({ taxYear: "2025-26", choice: "none" }).warnings,
      ...buildPeriodsOfAccount({ taxYear: "2025-26", choice: "custom", startDate: "2025-01-01", endDate: "2025-12-31" }).warnings,
    ].join(" ");
    expect(all).not.toMatch(/—/);
  });
});

describe("describeHeldPeriods", () => {
  it("maps what HMRC holds back to an answer", () => {
    expect(describeHeldPeriods(null, "2025-26")).toBeNull();
    expect(describeHeldPeriods({ submittedOn: "x", periodsOfAccount: false }, "2025-26")).toEqual({ choice: "none" });
    expect(
      describeHeldPeriods(
        { submittedOn: "x", periodsOfAccount: true, periodsOfAccountDates: [{ startDate: "2025-04-01", endDate: "2026-03-31" }] },
        "2025-26"
      )
    ).toEqual({ choice: "to_31_march" });
    expect(
      describeHeldPeriods(
        { submittedOn: "x", periodsOfAccount: true, periodsOfAccountDates: [{ startDate: "2025-01-01", endDate: "2025-12-31" }] },
        "2025-26"
      )
    ).toEqual({ choice: "custom", startDate: "2025-01-01", endDate: "2025-12-31" });
  });
});

describe("transport", () => {
  it("returns null when HMRC holds no periods of account", async () => {
    mockCall.mockRejectedValue(new HmrcError("nf", 404, "MATCHING_RESOURCE_NOT_FOUND", null));
    expect(await retrievePeriodsOfAccount(base)).toBeNull();
  });

  it("refuses a body HMRC would reject (RULE_PERIODS_OF_ACCOUNT) without calling HMRC", async () => {
    await expect(submitPeriodsOfAccount({ ...base, body: { periodsOfAccount: true } })).rejects.toThrow();
    await expect(
      submitPeriodsOfAccount({
        ...base,
        body: { periodsOfAccount: false, periodsOfAccountDates: [{ startDate: "2025-04-06", endDate: "2026-04-05" }] },
      })
    ).rejects.toThrow();
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("audits the accounting type update", async () => {
    mockCall.mockResolvedValue(undefined as never);
    await updateAccountingType({ ...base, accountingType: "CASH" });
    const call = mockCall.mock.calls[0][0];
    expect(call.path).toBe("/individuals/business/details/QQ123456C/XAIS12345678901/2025-26/accounting-type");
    expect(call.apiVersion).toBe("2.0");
    expect(call.audit?.operation).toBe("accounting_type_update");
  });
});
