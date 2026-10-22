/**
 * Bank inbox accept (22 Oct 2026): a payout the sync already recorded as an
 * earning is linked, never recorded a second time; a fresh accept puts the
 * same choice on that payout's other weeks still waiting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    bankTransaction: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    earning: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/proEntitlement.js", () => ({ isProUser: vi.fn().mockResolvedValue(true) }));
vi.mock("../../services/invoices.js", () => ({ markInvoicePaid: vi.fn() }));
vi.mock("../../services/merchantCategoriser.js", () => ({
  trainMerchantMapping: vi.fn().mockResolvedValue(undefined),
  refreshPendingSuggestions: vi.fn().mockResolvedValue(3),
}));

import { inboxRoutes } from "../../routes/inbox/index.js";
import { prisma } from "../../lib/prisma.js";
import { refreshPendingSuggestions } from "../../services/merchantCategoriser.js";
import { invalidatePremiumCache } from "../../middleware/premium.js";

const USER = "00000000-0000-0000-0000-0000000000b2";
const TXN = { id: "bt-1", userId: USER, status: "pending", externalId: "tl-1", merchant: "3079503100826", amountPence: 5000, transactionDate: new Date("2026-10-10") };

async function accept() {
  const a = await buildApp();
  await a.register(inboxRoutes, { prefix: "/inbox" });
  await a.ready();
  const res = await a.inject({
    method: "POST",
    url: "/inbox/bt-1/accept",
    headers: { authorization: `Bearer ${makeAccessToken(USER)}` },
    payload: { kind: "earning", platform: "just_eat" },
  });
  await a.close();
  return res;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await invalidatePremiumCache(USER);
  vi.mocked(prisma.bankTransaction.findFirst).mockResolvedValue(TXN as never);
  vi.mocked(prisma.earning.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.earning.create).mockResolvedValue({ id: "e-new" } as never);
});

describe("POST /inbox/:id/accept (earning)", () => {
  it("links to an earning the sync already made, without making another", async () => {
    vi.mocked(prisma.earning.findFirst).mockResolvedValue({ id: "e-auto" } as never);
    const res = await accept();
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ earningId: "e-auto", alreadyRecorded: true });
    expect(prisma.earning.create).not.toHaveBeenCalled();
    expect(prisma.bankTransaction.update).toHaveBeenCalledWith({
      where: { id: "bt-1" },
      data: expect.objectContaining({ status: "accepted", resolvedEarningId: "e-auto" }),
    });
    // The driver's pick wins over the sync's guess.
    expect(prisma.earning.update).toHaveBeenCalledWith({ where: { id: "e-auto" }, data: { platform: "just_eat" } });
  });

  it("records it and suggests the same app for that payout's other weeks", async () => {
    const res = await accept();
    expect(res.json().data).toMatchObject({ earningId: "e-new", alsoSuggested: 3 });
    expect(refreshPendingSuggestions).toHaveBeenCalledWith({
      userId: USER, merchant: "3079503100826", kind: "earning", excludeId: "bt-1",
    });
  });
});
