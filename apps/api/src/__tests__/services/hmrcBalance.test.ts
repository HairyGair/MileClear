/**
 * "What you owe HMRC" (Self Assessment Accounts API): pounds become pence,
 * negative or missing figures never read as money owed, a 404 means HMRC
 * holds nothing yet, and the route stays off until HMRC_BALANCE=on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: { hmrcConnection: { findUnique: vi.fn() } },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/hmrc/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../services/hmrc/client.js")>();
  return { ...real, hmrcCall: vi.fn() };
});

import { summariseBalance, fetchBalance } from "../../services/hmrc/accounts.js";
import { hmrcCall, HmrcError } from "../../services/hmrc/client.js";
import { hmrcRoutes } from "../../routes/hmrc/index.js";
import { prisma } from "../../lib/prisma.js";

const USER_ID = "00000000-0000-0000-0000-0000000000b1";

describe("summariseBalance", () => {
  it("turns HMRC's pounds into pence with their due dates", () => {
    const b = summariseBalance({
      overdueAmount: 120.5,
      earliestPaymentDateOverdue: "2026-07-31",
      payableAmount: 1000.01,
      payableDueDate: "2027-01-31",
      pendingChargeDueAmount: 450,
      pendingChargeDueDate: "2027-07-31",
      totalBalance: 1570.51,
      availableCredit: 0,
    });
    expect(b).toEqual({
      overduePence: 12050,
      overdueSince: "2026-07-31",
      dueNowPence: 100001,
      dueNowDate: "2027-01-31",
      comingUpPence: 45000,
      comingUpDate: "2027-07-31",
      totalPence: 157051,
      creditPence: 0,
      nothingYet: false,
    });
  });

  it("never shows a negative or missing figure as money owed, and drops its date", () => {
    const b = summariseBalance({
      overdueAmount: -5,
      earliestPaymentDateOverdue: "2026-07-31",
      payableAmount: 0,
      payableDueDate: "2027-01-31",
      totalBalance: -250,
      availableCredit: 250,
    });
    expect(b.overduePence).toBe(0);
    expect(b.overdueSince).toBeNull();
    expect(b.dueNowPence).toBe(0);
    expect(b.dueNowDate).toBeNull();
    expect(b.comingUpPence).toBe(0);
    expect(b.totalPence).toBe(-25000);
    expect(b.creditPence).toBe(25000);
  });

  it("copes with no balanceDetails at all", () => {
    expect(summariseBalance(undefined)).toMatchObject({ overduePence: 0, dueNowPence: 0, totalPence: 0, nothingYet: false });
  });
});

describe("fetchBalance", () => {
  beforeEach(() => {
    vi.mocked(hmrcCall).mockReset();
  });

  it("asks HMRC for unpaid charges on version 4.0", async () => {
    vi.mocked(hmrcCall).mockResolvedValue({ balanceDetails: { payableAmount: 10, payableDueDate: "2027-01-31" } });
    const b = await fetchBalance({ userId: USER_ID, nino: "AA123456A", client: {} as never, server: {} as never });
    expect(b.dueNowPence).toBe(1000);
    const call = vi.mocked(hmrcCall).mock.calls[0][0];
    expect(call).toMatchObject({
      method: "GET",
      path: "/accounts/self-assessment/AA123456A/balance-and-transactions",
      apiVersion: "4.0",
      query: { onlyOpenItems: "true" },
    });
  });

  it("reads HMRC's 404 as nothing charged yet, not an error", async () => {
    vi.mocked(hmrcCall).mockRejectedValue(new HmrcError("not found", 404, "NOT_FOUND", null));
    const b = await fetchBalance({ userId: USER_ID, nino: "AA123456A", client: {} as never, server: {} as never });
    expect(b).toMatchObject({ nothingYet: true, overduePence: 0, dueNowPence: 0, comingUpPence: 0 });
  });

  it("passes other HMRC errors on", async () => {
    vi.mocked(hmrcCall).mockRejectedValue(new HmrcError("forbidden", 403, "CLIENT_OR_AGENT_NOT_AUTHORISED", null));
    await expect(
      fetchBalance({ userId: USER_ID, nino: "AA123456A", client: {} as never, server: {} as never }),
    ).rejects.toBeInstanceOf(HmrcError);
  });
});

describe("GET /hmrc/balance", () => {
  const original = process.env.HMRC_BALANCE;
  afterEach(() => {
    if (original === undefined) delete process.env.HMRC_BALANCE;
    else process.env.HMRC_BALANCE = original;
  });

  it("is off until HMRC_BALANCE=on, without touching HMRC or the database", async () => {
    delete process.env.HMRC_BALANCE;
    vi.mocked(hmrcCall).mockReset();
    vi.mocked(prisma.hmrcConnection.findUnique).mockReset();
    const app = await buildApp();
    await app.register(hmrcRoutes, { prefix: "/hmrc" });
    const res = await app.inject({
      method: "GET",
      url: "/hmrc/balance",
      headers: { authorization: `Bearer ${makeAccessToken(USER_ID)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ available: false, balance: null });
    expect(hmrcCall).not.toHaveBeenCalled();
    expect(prisma.hmrcConnection.findUnique).not.toHaveBeenCalled();
  });

  it("asks the driver to connect first when on and not connected", async () => {
    process.env.HMRC_BALANCE = "on";
    vi.mocked(prisma.hmrcConnection.findUnique).mockResolvedValue(null as never);
    const app = await buildApp();
    await app.register(hmrcRoutes, { prefix: "/hmrc" });
    const res = await app.inject({
      method: "GET",
      url: "/hmrc/balance",
      headers: { authorization: `Bearer ${makeAccessToken(USER_ID)}` },
    });
    expect(res.statusCode).toBe(400);
    expect(hmrcCall).not.toHaveBeenCalled();
  });
});
