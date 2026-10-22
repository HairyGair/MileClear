/**
 * Merchant categoriser tests (Phase 2 of the Money Picture stack,
 * 22 May 2026).
 *
 * Verifies the lookup hierarchy (user mapping > seed > fallback) and
 * the train() side-effect on accept / override.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    merchantMapping: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    bankTransaction: {
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

import {
  normaliseMerchantKey,
  legacyMerchantKey,
  isAutoImportKey,
  resolveMerchantSuggestion,
  trainMerchantMapping,
  refreshPendingSuggestions,
} from "../../services/merchantCategoriser.js";
import { matchMerchantToPlatform } from "../../services/openBanking.js";
import { prisma } from "../../lib/prisma.js";

const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue(null);
});

describe("normaliseMerchantKey", () => {
  it("lowercases + collapses whitespace", () => {
    expect(normaliseMerchantKey("  Costa  Coffee  London  ")).toBe(
      "costa coffee london"
    );
  });

  it("strips ref/txn noise + trailing branch numbers", () => {
    expect(normaliseMerchantKey("UBER PAYMENTS LTD  Ref:ABC123")).toBe(
      "uber payments ltd"
    );
    expect(normaliseMerchantKey("SHELL NEWCASTLE 4321")).toBe("shell newcastle");
  });

  it("returns empty string for null-ish input", () => {
    expect(normaliseMerchantKey("")).toBe("");
    expect(normaliseMerchantKey("   ")).toBe("");
  });

  it("preserves common punctuation that's part of brand names", () => {
    expect(normaliseMerchantKey("Sainsbury's Petrol")).toBe("sainsbury's petrol");
  });
});

describe("resolveMerchantSuggestion", () => {
  it("prefers the user's learned mapping over seed rules", async () => {
    vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue({
      id: "m-1",
      userId: USER,
      merchantKey: "costa coffee",
      kind: "expense",
      category: "subscription", // user overrode subsistence → subscription
      acceptCount: 3,
      overrideCount: 1,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    } as any);

    const r = await resolveMerchantSuggestion({
      userId: USER,
      merchant: "Costa Coffee 4321",
      kind: "expense",
    });
    expect(r.source).toBe("user");
    expect(r.category).toBe("subscription");
    expect(r.confidence).toBeGreaterThanOrEqual(85);
  });

  it("falls back to seed rules when no user mapping exists (earning)", async () => {
    const r = await resolveMerchantSuggestion({
      userId: USER,
      merchant: "UBER PAYMENTS",
      kind: "earning",
    });
    expect(r.source).toBe("seed");
    expect(r.category).toBe("uber"); // platform value
    expect(r.confidence).toBe(85);
  });

  it("falls back to seed rules when no user mapping exists (expense)", async () => {
    const r = await resolveMerchantSuggestion({
      userId: USER,
      merchant: "NCP Car Park Newcastle",
      kind: "expense",
    });
    expect(r.source).toBe("seed");
    expect(r.category).toBe("parking");
  });

  it("returns low-confidence 'other' for unknown expense merchants", async () => {
    const r = await resolveMerchantSuggestion({
      userId: USER,
      merchant: "Mystery Vendor 42",
      kind: "expense",
    });
    expect(r.category).toBe("other");
    expect(r.confidence).toBeLessThan(50);
    expect(r.source).toBe("fallback");
  });

  it("scales confidence with acceptCount on learned mappings", async () => {
    vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue({
      id: "m-1",
      userId: USER,
      merchantKey: "shell newcastle",
      kind: "expense",
      category: "other",
      acceptCount: 5,
      overrideCount: 0,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    } as any);

    const r = await resolveMerchantSuggestion({
      userId: USER,
      merchant: "Shell Newcastle 1234",
      kind: "expense",
    });
    expect(r.confidence).toBe(95);
  });
});

describe("trainMerchantMapping", () => {
  it("creates a new row on first accept", async () => {
    await trainMerchantMapping({
      userId: USER,
      merchant: "Costa Coffee 4218",
      kind: "expense",
      category: "subsistence",
    });
    expect(prisma.merchantMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER,
        merchantKey: "costa coffee",
        kind: "expense",
        category: "subsistence",
      }),
    });
  });

  it("increments acceptCount when category matches existing mapping", async () => {
    vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue({
      id: "m-1",
      userId: USER,
      merchantKey: "costa coffee",
      kind: "expense",
      category: "subsistence",
      acceptCount: 2,
      overrideCount: 0,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    } as any);

    await trainMerchantMapping({
      userId: USER,
      merchant: "Costa Coffee 4218",
      kind: "expense",
      category: "subsistence",
    });
    expect(prisma.merchantMapping.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m-1" },
        data: expect.objectContaining({
          acceptCount: { increment: 1 },
        }),
      })
    );
  });

  it("on override, swaps category + bumps overrideCount + resets acceptCount", async () => {
    vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue({
      id: "m-1",
      userId: USER,
      merchantKey: "costa coffee",
      kind: "expense",
      category: "subsistence",
      acceptCount: 4,
      overrideCount: 0,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    } as any);

    await trainMerchantMapping({
      userId: USER,
      merchant: "Costa Coffee 4218",
      kind: "expense",
      category: "subscription",
    });
    expect(prisma.merchantMapping.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "subscription",
          acceptCount: 1,
          overrideCount: { increment: 1 },
        }),
      })
    );
  });

  it("no-ops on empty merchant string", async () => {
    await trainMerchantMapping({
      userId: USER,
      merchant: "   ",
      kind: "expense",
      category: "other",
    });
    expect(prisma.merchantMapping.create).not.toHaveBeenCalled();
    expect(prisma.merchantMapping.update).not.toHaveBeenCalled();
  });
});

// Ben Turner, 22 Oct 2026: Monzo showed his payouts as company names and
// bare reference numbers, so only one in nine was recognised.
describe("payouts that arrive without the app's name", () => {
  it("knows Deliveroo's company name, but not Amazon UK Services (warehouse wages too)", () => {
    expect(matchMerchantToPlatform("Roofoods Limited")).toBe("deliveroo");
    expect(matchMerchantToPlatform("AMAZON UK SERVICES TLR004549242732 BGC")).toBeNull();
  });

  it("only lets a key that names a payer record payouts by itself", () => {
    const own = ["Ben", "Turner"];
    expect(isAutoImportKey("307950#", own)).toBe(true);
    expect(isAutoImportKey("tlr004#", own)).toBe(true);
    expect(isAutoImportKey("roofoods limited", own)).toBe(true);
    expect(isAutoImportKey("payoutid", own)).toBe(true);
    expect(isAutoImportKey("sent from ben turn", own)).toBe(false);
    expect(isAutoImportKey("faster payment", own)).toBe(false);
    expect(isAutoImportKey("202610#", own)).toBe(false); // a date, any payer
    expect(isAutoImportKey("", own)).toBe(false);
    // Review round 2: own transfers, pots, interest, references after generic words.
    expect(isAutoImportKey("faster payment 123456#", own)).toBe(false);
    expect(isAutoImportKey("savings pot", own)).toBe(false);
    expect(isAutoImportKey("interest", own)).toBe(false);
    expect(isAutoImportKey("from monzo", own)).toBe(false);
    expect(isAutoImportKey("paypal transfer", own)).toBe(false);
    // A two-letter name never hides a payer.
    expect(isAutoImportKey("tlr004#", ["Tl"])).toBe(true);
  });

  it("keys a reference-number payout on its fixed start, the same every week", () => {
    expect(normaliseMerchantKey("3079503100826")).toBe("307950#");
    expect(normaliseMerchantKey("3079503170826")).toBe("307950#");
    expect(normaliseMerchantKey("TLR004511580782")).toBe("tlr004#");
    expect(normaliseMerchantKey("TLR004527604612")).toBe("tlr004#");
    expect(normaliseMerchantKey("PayoutID: 934819,")).toBe("payoutid");
  });

  it("leaves ordinary merchants keyed as before", () => {
    for (const m of ["SHELL NEWCASTLE 4321", "Costa Coffee 4218", "UBER PAYMENTS LTD  Ref:ABC123", "Roofoods Limited"]) {
      expect(normaliseMerchantKey(m)).toBe(legacyMerchantKey(m));
    }
  });

  it("finds a mapping learned under the old key", async () => {
    vi.mocked(prisma.merchantMapping.findUnique).mockImplementation((async (q: any) =>
      q.where.userId_merchantKey_kind.merchantKey === "tlr004527604612"
        ? { id: "m-old", merchantKey: "tlr004527604612", category: "amazon_flex", acceptCount: 1 }
        : null) as any);
    // Same reference twice: old key and new key differ, the old row is found.
    const r = await resolveMerchantSuggestion({ userId: USER, merchant: "TLR004527604612", kind: "earning" });
    expect(r).toMatchObject({ source: "user", category: "amazon_flex" });
  });

  it("moves an old-key mapping to the new key when trained again", async () => {
    vi.mocked(prisma.merchantMapping.findUnique).mockImplementation((async (q: any) =>
      q.where.userId_merchantKey_kind.merchantKey === "tlr004527604612"
        ? { id: "m-old", merchantKey: "tlr004527604612", category: "amazon_flex", acceptCount: 1 }
        : null) as any);
    await trainMerchantMapping({ userId: USER, merchant: "TLR004527604612", kind: "earning", category: "amazon_flex" });
    expect(prisma.merchantMapping.create).not.toHaveBeenCalled();
    expect(prisma.merchantMapping.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m-old" },
        // It may have been counting several payers the old key lumped
        // together, so the count starts again.
        data: expect.objectContaining({ merchantKey: "tlr004#", acceptCount: 1 }),
      })
    );
  });

  it("puts the driver's choice on the same payout's other weeks still waiting, and nothing else", async () => {
    vi.mocked(prisma.merchantMapping.findUnique).mockResolvedValue({
      id: "m-1", merchantKey: "307950#", category: "just_eat", acceptCount: 1,
    } as any);
    vi.mocked(prisma.bankTransaction.findMany).mockResolvedValue([
      { id: "t1", merchant: "3079503170826" },
      { id: "t2", merchant: "3079503240826" },
      { id: "t3", merchant: "Rachel Turner" },
    ] as any);
    const n = await refreshPendingSuggestions({ userId: USER, merchant: "3079503100826", kind: "earning", excludeId: "t0" });
    expect(n).toBe(2);
    const where = vi.mocked(prisma.bankTransaction.findMany).mock.calls[0][0]!.where as any;
    expect(where).toMatchObject({ userId: USER, status: "pending", amountPence: { gt: 0 }, id: { not: "t0" } });
    expect(where.OR).toEqual([{ suggestedKind: null }, { suggestedKind: { not: "invoice_payment" } }]);
    expect(prisma.bankTransaction.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: { in: ["t1", "t2"] }, status: "pending" }),
      data: { suggestedKind: "earning", suggestedCategory: "just_eat", suggestedConfidence: 80 },
    });
  });

  it("changes nothing when the driver has no learned mapping for it", async () => {
    vi.mocked(prisma.bankTransaction.findMany).mockResolvedValue([{ id: "t1", merchant: "Roofoods Limited" }] as any);
    const n = await refreshPendingSuggestions({ userId: USER, merchant: "Roofoods Limited", kind: "earning" });
    expect(n).toBe(0);
    expect(prisma.bankTransaction.updateMany).not.toHaveBeenCalled();
  });
});
