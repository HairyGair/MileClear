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
    // A payout that is all reference keeps its fixed start as the key:
    // Monzo shows Amazon Flex as "TLR004511580782" and Just Eat as
    // "3079503100826" (a fixed prefix then the date). Stripping the
    // digits left an empty key or a new key every week, so a driver's
    // choice was never remembered (Ben Turner, 22 Oct 2026). Any token
    // with 8 or more digits becomes its first 6 characters plus "#".
    .replace(/\b[a-z0-9]*\d[a-z0-9]*\b/g, (t) =>
      (t.match(/\d/g)?.length ?? 0) >= 8 ? `${t.slice(0, 6)}#` : t
    )
    // strip the remaining numeric noise (branch numbers, short ids), but
    // never the prefix just kept
    .replace(/\b\d{4,}\b(?!#)/g, "")
    .replace(/[^a-z0-9 &'.#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * The key as it was built before 22 Oct 2026. Mappings learned then are
 * stored under it, so a look-up tries it after the current key.
 */
export function legacyMerchantKey(merchant: string): string {
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

/** A learned earning mapping this sure records the payout by itself. The
 *  driver has sorted this payout to the same app at least twice. */
export const AUTO_IMPORT_MIN_CONFIDENCE = 85;

export interface MerchantSuggestion {
  category: string;
  /** 0-100. Phase 2 boosts to 90+ on repeated accepts. */
  confidence: number;
  /** Where the suggestion came from. Useful for telemetry + future
   *  per-user "trained on X merchants" stats. */
  source: "user" | "seed" | "fallback";
  /** For a "user" suggestion: the key the mapping was found under, and
   *  whether that is the current key or the pre-22-Oct one. */
  matchedKey?: string;
  keyKind?: "current" | "legacy";
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
  const found = await findLearnedMapping(args);
  const learned = found?.row ?? null;
  if (found && learned) {
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
      matchedKey: learned.merchantKey,
      keyKind: found.keyKind,
    };
  }

  if (!normaliseMerchantKey(args.merchant) && !legacyMerchantKey(args.merchant)) {
    return { category: "other", confidence: 10, source: "fallback" };
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

/** The driver's mapping under the current key, else under the key used
 *  before 22 Oct 2026. */
async function findLearnedMapping(args: {
  userId: string;
  merchant: string;
  kind: "earning" | "expense";
}) {
  const current = normaliseMerchantKey(args.merchant);
  const legacy = legacyMerchantKey(args.merchant);
  const tries: Array<{ merchantKey: string; keyKind: "current" | "legacy" }> = [];
  if (current) tries.push({ merchantKey: current, keyKind: "current" });
  if (legacy && legacy !== current) tries.push({ merchantKey: legacy, keyKind: "legacy" });
  for (const { merchantKey, keyKind } of tries) {
    const row = await prisma.merchantMapping.findUnique({
      where: { userId_merchantKey_kind: { userId: args.userId, merchantKey, kind: args.kind } },
    });
    if (row) return { row, keyKind };
  }
  return null;
}

/** Words that say how money moved, not who sent it. A key made only of
 *  these (plus the driver's own name) could be anyone. */
const GENERIC_WORDS = new Set([
  "faster", "payment", "payments", "pmt", "transfer", "trf", "tfr", "credit", "bgc", "bacs", "giro",
  "fps", "chaps", "from", "to", "sent", "received", "standing", "order", "so", "dd", "refund",
  "mobile", "online", "internet", "bank", "banking", "account", "acc", "deposit", "cash", "in",
  "the", "and", "&", "ltd", "limited", "plc", "uk", "mr", "mrs", "ms", "miss", "dr", "pot", "pots",
  "savings", "saver", "interest", "cashback", "salary", "wages", "topup", "top-up", "reversal",
  "returned", "reversed", "rewards",
  // Banks and wallets: money from these is usually the driver's own.
  "monzo", "starling", "revolut", "barclays", "hsbc", "lloyds", "natwest", "santander", "halifax",
  "nationwide", "paypal", "wise", "chase", "tsb", "metro", "kroo", "tide", "anna", "virgin", "coop",
  "co-op", "first", "direct", "amex", "curve",
]);

/**
 * May a learned mapping under this key record payouts by itself? Only when
 * the key names a payer: it must not be only generic words and the
 * driver's own name ("SENT FROM BEN TURN", "Faster Payment"), and a bare
 * reference number counts only when its fixed start is not a date
 * ("202610#" groups every payer that month). The suggestion is still made
 * either way; this only decides whether nobody has to tap it.
 */
export function isAutoImportKey(key: string, ownNameWords: string[] = []): boolean {
  const own = ownNameWords.map((w) => w.toLowerCase()).filter((w) => w.length >= 3);
  const isOwnName = (t: string) => t.length >= 3 && own.some((w) => w.startsWith(t) || t.startsWith(w));
  const tokens = key.split(" ").filter(Boolean);
  for (const t of tokens) {
    if (t.endsWith("#")) {
      // A reference number names a payer only when it is the whole
      // description, like Ben's "3079503100826"; after "Faster Payment" it
      // is just that transfer's reference.
      if (tokens.length !== 1) continue;
      const prefix = t.slice(0, -1);
      if (/[a-z]{2,}/.test(prefix)) return true; // "tlr004#"
      if (/^\d{6}$/.test(prefix) && !/^(19|20)/.test(prefix)) return true; // "307950#"
      continue;
    }
    if (GENERIC_WORDS.has(t) || isOwnName(t)) continue;
    if ((t.match(/[a-z]/g)?.length ?? 0) >= 3) return true;
  }
  return false;
}

export function confidenceFromAcceptCount(n: number): number {
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

  // A mapping learned under the pre-22-Oct key moves to the current key
  // with its count, rather than a second row starting again at 1.
  const existing = (await findLearnedMapping(args))?.row ?? null;

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

  // A row moving from the old key may have been counting several payers
  // the old key lumped together, so it starts again at this one accept.
  const moved = existing.merchantKey !== key;
  if (existing.category === args.category) {
    await prisma.merchantMapping.update({
      where: { id: existing.id },
      data: {
        merchantKey: key,
        acceptCount: moved ? 1 : { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  } else {
    await prisma.merchantMapping.update({
      where: { id: existing.id },
      data: {
        merchantKey: key,
        category: args.category,
        acceptCount: 1,
        overrideCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }
}

const NOT_INVOICE_SUGGESTION = {
  OR: [{ suggestedKind: null }, { suggestedKind: { not: "invoice_payment" } }],
};

/**
 * After a driver sorts one transaction, show the same choice on the others
 * like it still waiting in their inbox, so the rest are one tap each. Only
 * the suggestion changes: nothing is accepted for them. Returns how many
 * rows now carry it.
 */
export async function refreshPendingSuggestions(args: {
  userId: string;
  merchant: string;
  kind: "earning" | "expense";
  excludeId?: string;
}): Promise<number> {
  const key = normaliseMerchantKey(args.merchant);
  if (!key) return 0;
  const pending = await prisma.bankTransaction.findMany({
    where: {
      userId: args.userId,
      status: "pending",
      amountPence: args.kind === "earning" ? { gt: 0 } : { lt: 0 },
      ...(args.excludeId ? { id: { not: args.excludeId } } : {}),
      // A suggested invoice payment keeps the invoice id in
      // suggestedCategory: never overwrite one.
      ...NOT_INVOICE_SUGGESTION,
    },
    select: { id: true, merchant: true },
  });
  const ids = pending.filter((t) => normaliseMerchantKey(t.merchant) === key).map((t) => t.id);
  if (ids.length === 0) return 0;
  const s = await resolveMerchantSuggestion(args);
  if (s.source !== "user") return 0;
  await prisma.bankTransaction.updateMany({
    where: { id: { in: ids }, userId: args.userId, status: "pending", ...NOT_INVOICE_SUGGESTION },
    data: { suggestedKind: args.kind, suggestedCategory: s.category, suggestedConfidence: s.confidence },
  });
  return ids.length;
}
