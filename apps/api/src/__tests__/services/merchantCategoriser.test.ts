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
  },
}));

import {
  normaliseMerchantKey,
  resolveMerchantSuggestion,
  trainMerchantMapping,
} from "../../services/merchantCategoriser.js";
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
