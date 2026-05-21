// Merchant categoriser — Phase 2 of the "Money Picture" stack
// (22 May 2026).
//
// Hierarchy of suggestions for a bank transaction:
//   1. User's learned MerchantMapping (highest confidence — trained
//      by every accept in /inbox/:id/accept)
//   2. Phase 1 seed rules (matchMerchantToPlatform for earnings;
//      categoriseExpenseMerchant for expenses) — same as before
//   3. "other" with low confidence — user reviews
//
// The accept route updates the MerchantMapping table on every
// inbox accept. Repeated accepts of the same merchant+category
// pair raise confidence; overrides (accept with a different
// category) bump `overrideCount` for future UX prompts but
// already-saved confidence stays elevated.
//
// Phase 3 will surface a "remembered N merchants" stat on the
// dashboard so users can see the categoriser learning.

import { prisma } from "../lib/prisma.js";
import {
  matchMerchantToPlatform,
  categoriseExpenseMerchant,
} from "./openBanking.js";

/**
 * Normalise a merchant string into the look-up key. Lowercased,
 * collapsed whitespace, common reference noise stripped. Same
 * transform is applied at write + read time so look-ups are
 * symmetric.
 *
 * Examples:
 *   "UBER PAYMENTS LTD  Ref:123"  →  "uber payments ltd"
 *   "SHELL NEWCASTLE 4321         →  "shell newcastle"
 *   "  Costa Coffee  London  "    →  "costa coffee london"
 */
export function normaliseMerchantKey(merchant: string): string {
  return merchant
    .toLowerCase()
    // strip common reference patterns
    .replace(/\bref[: ]+[\w-]+/gi, "")
    .replace(/\btxn[: ]+[\w-]+/gi, "")
    // strip trailing numeric noise (transaction ids, branch numbers)
    .replace(/\b\d{4,}\b/g, "")
    .replace(/[^a-z0-9 &'.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export interface MerchantSuggestion {
  category: string;
  /** 0-100. Phase 2 boosts to 90+ on repeated accepts. */
  confidence: number;
  /** Where the suggestion came from. Useful for telemetry + future
   *  per-user "trained on X merchants" stats. */
  source: "user" | "seed" | "fallback";
}

/**
 * Resolve a category suggestion for a single transaction. The
 * caller (currently `openBanking.syncTransactions`) supplies the
 * raw merchant string + kind; we return what the inbox should
 * pre-select.
 */
export async function resolveMerchantSuggestion(args: {
  userId: string;
  merchant: string;
  kind: "earning" | "expense";
}): Promise<MerchantSuggestion> {
  const key = normaliseMerchantKey(args.merchant);
  if (!key) {
    return { category: "other", confidence: 10, source: "fallback" };
  }

  // 1. User's learned mapping
  const learned = await prisma.merchantMapping.findUnique({
    where: {
      userId_merchantKey_kind: {
        userId: args.userId,
        merchantKey: key,
        kind: args.kind,
      },
    },
  });
  if (learned) {
    // Bump lastUsedAt opportunistically. Cheap, doesn't need to
    // block the sync — fire and forget.
    void prisma.merchantMapping
      .update({
        where: { id: learned.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);
    return {
      category: learned.category,
      confidence: confidenceFromAcceptCount(learned.acceptCount),
      source: "user",
    };
  }

  // 2. Seed rules — same as Phase 1 inline categoriser
  if (args.kind === "earning") {
    const platform = matchMerchantToPlatform(args.merchant);
    if (platform) {
      return { category: platform, confidence: 85, source: "seed" };
    }
    return { category: "other", confidence: 30, source: "fallback" };
  }
  const seed = categoriseExpenseMerchant(args.merchant);
  return {
    category: seed.category,
    confidence: seed.confidence,
    source: seed.confidence >= 50 ? "seed" : "fallback",
  };
}

function confidenceFromAcceptCount(n: number): number {
  if (n <= 1) return 80;
  if (n <= 2) return 85;
  if (n <= 4) return 90;
  return 95;
}

/**
 * Train the user's categoriser. Called by `/inbox/:id/accept`
 * with the merchant from the bank_transaction and the category
 * the user picked.
 *
 *   - First accept for this merchant → create row, acceptCount=1
 *   - Subsequent accept for SAME category → acceptCount++
 *   - Accept for DIFFERENT category → overrideCount++, category
 *     updated to the new pick, acceptCount reset to 1 (the user
 *     has changed their mind; their latest preference wins)
 */
export async function trainMerchantMapping(args: {
  userId: string;
  merchant: string;
  kind: "earning" | "expense";
  category: string;
}): Promise<void> {
  const key = normaliseMerchantKey(args.merchant);
  if (!key) return;

  const existing = await prisma.merchantMapping.findUnique({
    where: {
      userId_merchantKey_kind: {
        userId: args.userId,
        merchantKey: key,
        kind: args.kind,
      },
    },
  });

  if (!existing) {
    await prisma.merchantMapping.create({
      data: {
        userId: args.userId,
        merchantKey: key,
        kind: args.kind,
        category: args.category,
      },
    });
    return;
  }

  if (existing.category === args.category) {
    await prisma.merchantMapping.update({
      where: { id: existing.id },
      data: {
        acceptCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  } else {
    await prisma.merchantMapping.update({
      where: { id: existing.id },
      data: {
        category: args.category,
        acceptCount: 1,
        overrideCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }
}
