/**
 * Bank sync: which credits become earnings by themselves (22 Oct 2026).
 *
 * Ben Turner's Monzo payouts arrived as "Roofoods Limited" (Deliveroo),
 * "TLR004..." (Amazon Flex) and "3079503<date>" (Just Eat). Only the one
 * saying "UBER" was recognised. Now the company names are known, and a
 * payout the driver has sorted to the same app twice is recorded by
 * itself. A sync reaches back 90 days, so a payout already in the inbox
 * must never become an earning as well.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/truelayer.js", () => ({
  TRUELAYER_AUTH_BASE: "https://auth.test",
  TRUELAYER_API_BASE: "https://api.truelayer.test",
  TRUELAYER_CLIENT_ID: "c",
  TRUELAYER_CLIENT_SECRET: "s",
  truelayerEnabled: true,
}));
vi.mock("../../lib/encryption.js", () => ({
  encrypt: (v: string) => v,
  decrypt: () => "access-token",
  isEncrypted: () => true,
}));
vi.mock("../../services/invoiceReconcile.js", () => ({
  reconcileInvoicePayments: vi.fn().mockResolvedValue({ autoMatched: 0, suggested: 0 }),
}));
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    plaidConnection: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    bankTransaction: { findUnique: vi.fn(), create: vi.fn() },
    earning: { create: vi.fn(), findFirst: vi.fn() },
    merchantMapping: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn() },
    invoice: { count: vi.fn() },
  },
}));

import { syncTransactions } from "../../services/openBanking.js";
import { prisma } from "../../lib/prisma.js";

const USER = "user-1";

function txn(id: string, merchant: string, amount = 50) {
  return {
    transaction_id: id,
    merchant_name: merchant,
    description: merchant,
    transaction_type: "CREDIT",
    amount,
    currency: "GBP",
    timestamp: "2026-10-20T09:00:00Z",
  };
}

function bank(transactions: unknown[]) {
  global.fetch = vi.fn(async (url: string) => {
    const body = String(url).includes("/transactions")
      ? { results: transactions }
      : { results: [{ account_id: "acc-1" }] };
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as never;
}

function mapping(category: string, acceptCount: number, merchantKey = "307950#") {
  return { id: "m-1", userId: USER, kind: "earning", merchantKey, category, acceptCount };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.plaidConnection.findFirst).mockResolvedValue({
    id: "conn-1",
    userId: USER,
    accessToken: "enc",
    refreshToken: null,
    institutionName: "Monzo",
    status: "active",
  } as never);
  vi.mocked(prisma.bankTransaction.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.bankTransaction.create).mockImplementation((async (a: any) => ({ id: `bt-${a.data.externalId}` })) as never);
  vi.mocked(prisma.earning.create).mockImplementation((async () => ({ id: "earning-1" })) as never);
  vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.earning.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ fullName: "Ben Turner", displayName: "benturner10" } as never);
  vi.mocked(prisma.invoice.count).mockResolvedValue(0 as never);
});

const created = () => vi.mocked(prisma.bankTransaction.create).mock.calls.map((c: any) => c[0].data);

describe("syncTransactions", () => {
  it("records Deliveroo's company name as a Deliveroo earning", async () => {
    bank([txn("t1", "Roofoods Limited")]);
    const r = await syncTransactions(USER, "conn-1");
    expect(prisma.earning.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ platform: "deliveroo", amountPence: 5000 }) })
    );
    expect(created()[0]).toMatchObject({ status: "consumed", resolvedEarningId: "earning-1" });
    expect(r.imported).toBe(1);
  });

  it("records a payout the driver has sorted to the same app twice", async () => {
    bank([txn("t1", "3079503240826")]);
    vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue(mapping("just_eat", 2) as never);
    await syncTransactions(USER, "conn-1");
    expect(prisma.earning.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ platform: "just_eat" }) })
    );
    expect(created()[0].status).toBe("consumed");
  });

  it("only suggests it after one sort: the driver still confirms", async () => {
    bank([txn("t1", "3079503240826")]);
    vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue(mapping("just_eat", 1) as never);
    const r = await syncTransactions(USER, "conn-1");
    expect(prisma.earning.create).not.toHaveBeenCalled();
    expect(created()[0]).toMatchObject({ status: "pending", suggestedCategory: "just_eat" });
    expect(r.queued).toBe(1);
  });

  it("never records a learned 'Other' or 'Freelance' by itself", async () => {
    bank([txn("t1", "Rachel Turner"), txn("t2", "SENT FROM BEN TURN")]);
    vi.mocked(prisma.merchantMapping.findUnique)
      .mockResolvedValueOnce(mapping("other", 5, "rachel turner") as never)
      .mockResolvedValueOnce(mapping("freelance", 5, "sent from ben turn") as never);
    await syncTransactions(USER, "conn-1");
    expect(prisma.earning.create).not.toHaveBeenCalled();
  });

  it("leaves a payout already in the inbox alone, even once it is recognised", async () => {
    bank([txn("t1", "Roofoods Limited")]);
    vi.mocked(prisma.bankTransaction.findUnique).mockResolvedValue({ id: "bt-old" } as never);
    const r = await syncTransactions(USER, "conn-1");
    expect(prisma.earning.create).not.toHaveBeenCalled();
    expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
  });

  it("never turns money going out into an earning", async () => {
    bank([{ ...txn("t1", "Roofoods Limited"), transaction_type: "DEBIT" }]);
    await syncTransactions(USER, "conn-1");
    expect(prisma.earning.create).not.toHaveBeenCalled();
  });

  // Review, 22 Oct 2026.
  it("does not record transfers from the driver's own name by itself", async () => {
    bank([txn("t1", "SENT FROM BEN TURN")]);
    vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue(mapping("uber", 5, "sent from ben turn") as never);
    await syncTransactions(USER, "conn-1");
    expect(prisma.earning.create).not.toHaveBeenCalled();
    expect(created()[0]).toMatchObject({ status: "pending", suggestedCategory: "uber" });
  });

  it("does not record by itself from a mapping found under the old key", async () => {
    // "Faster Payment 12345678": the old key "faster payment" lumped payers.
    bank([txn("t1", "Faster Payment 12345678")]);
    vi.mocked(prisma.merchantMapping.findUnique).mockImplementation((async (q: any) =>
      q.where.userId_merchantKey_kind.merchantKey === "faster payment"
        ? mapping("uber", 5, "faster payment")
        : null) as never);
    await syncTransactions(USER, "conn-1");
    expect(prisma.earning.create).not.toHaveBeenCalled();
  });

  it("sends a payout to the inbox when the same money is already an earning", async () => {
    bank([txn("t1", "Roofoods Limited")]);
    vi.mocked(prisma.earning.findFirst).mockResolvedValue({ id: "typed-in" } as never);
    await syncTransactions(USER, "conn-1");
    expect(prisma.earning.create).not.toHaveBeenCalled();
    expect(created()[0].status).toBe("pending");
  });

  it("does not record learned payouts by itself for a driver with unpaid invoices", async () => {
    bank([txn("t1", "3079503240826")]);
    vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue(mapping("just_eat", 3) as never);
    vi.mocked(prisma.invoice.count).mockResolvedValue(2 as never);
    await syncTransactions(USER, "conn-1");
    expect(prisma.earning.create).not.toHaveBeenCalled();
  });

  it("does not treat Amazon UK Services as Flex (it also pays warehouse wages)", async () => {
    bank([txn("t1", "AMAZON UK SERVICES TLR004549242732 BGC")]);
    await syncTransactions(USER, "conn-1");
    expect(prisma.earning.create).not.toHaveBeenCalled();
  });

  it("sends a payout to the inbox when a typed-in week of the same amount ended days before", async () => {
    bank([txn("t1", "Roofoods Limited")]);
    vi.mocked(prisma.earning.findFirst).mockResolvedValue({ id: "typed-week" } as never);
    await syncTransactions(USER, "conn-1");
    const where = vi.mocked(prisma.earning.findFirst).mock.calls[0][0]!.where as any;
    const day = new Date("2026-10-20").getTime();
    expect(where.amountPence).toBe(5000);
    expect(where.OR[1].periodEnd.gte.getTime()).toBe(day - 10 * 864e5);
    expect(where.OR[1].periodEnd.lte.getTime()).toBe(day + 864e5);
    expect(prisma.earning.create).not.toHaveBeenCalled();
  });

  it("only counts sent or overdue invoices as unpaid (not written off)", async () => {
    bank([txn("t1", "3079503240826")]);
    vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue(mapping("just_eat", 3) as never);
    await syncTransactions(USER, "conn-1");
    expect(vi.mocked(prisma.invoice.count).mock.calls[0][0]).toEqual({
      where: { userId: USER, paidAt: null, status: { in: ["sent", "overdue"] } },
    });
  });
});
