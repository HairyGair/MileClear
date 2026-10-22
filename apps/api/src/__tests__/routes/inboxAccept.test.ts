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
    user: { findUnique: vi.fn() },
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
const TXN = { id: "bt-1", userId: USER, status: "pending", externalId: "tl-1", merchant: "3079503100826", amountPence: 5000, transactionDate: new Date("2026-10-20") };

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
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ payoutsInArrears: null } as never);
});

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("POST /inbox/:id/accept (earning)", () => {
  it("links to an earning the sync already made, without making another", async () => {
    vi.mocked(prisma.earning.findFirst).mockResolvedValue({ id: "e-auto", periodStart: day("2026-10-20"), periodEnd: day("2026-10-20") } as never);
    const res = await accept();
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ earningId: "e-auto", alreadyRecorded: true });
    expect(prisma.earning.create).not.toHaveBeenCalled();
    expect(prisma.bankTransaction.update).toHaveBeenCalledWith({
      where: { id: "bt-1" },
      data: expect.objectContaining({ status: "accepted", resolvedEarningId: "e-auto" }),
    });
    // The driver's pick wins over the sync's guess.
    expect(prisma.earning.update).toHaveBeenCalledWith({
      where: { id: "e-auto" },
      data: { platform: "just_eat", periodStart: day("2026-10-20"), periodEnd: day("2026-10-20") },
    });
  });

  it("dates it to the week before when the app pays a week behind", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ payoutsInArrears: ["just_eat"] } as never);
    await accept();
    expect(prisma.earning.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ platform: "just_eat", periodStart: day("2026-10-13"), periodEnd: day("2026-10-19") }),
    }));
  });

  it("moves the sync's earning to the week before, but leaves dates changed by hand", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ payoutsInArrears: ["just_eat"] } as never);
    vi.mocked(prisma.earning.findFirst).mockResolvedValue({ id: "e-auto", periodStart: day("2026-10-20"), periodEnd: day("2026-10-20") } as never);
    await accept();
    expect(prisma.earning.update).toHaveBeenCalledWith({
      where: { id: "e-auto" },
      data: { platform: "just_eat", periodStart: day("2026-10-13"), periodEnd: day("2026-10-19") },
    });

    vi.mocked(prisma.earning.update).mockClear();
    vi.mocked(prisma.earning.findFirst).mockResolvedValue({ id: "e-auto", periodStart: day("2026-10-11"), periodEnd: day("2026-10-17") } as never);
    await accept();
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
