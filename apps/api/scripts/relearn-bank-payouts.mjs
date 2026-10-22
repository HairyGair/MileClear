// Re-learn drivers' payout choices under the 22 Oct 2026 merchant key.
//
// Before 22 Oct a payout that was all reference number ("3079503100826",
// "TLR004511580782") was keyed as an empty string or as a new key every
// week, so a driver's choice in the bank inbox was never remembered. This
// rebuilds those mappings from the payouts drivers already sorted, then
// puts the choice on the same payout's other weeks still waiting.
//
// Dry run by default (prints each pattern, writes nothing). Run ON the server against dist:
//   cd ~/mileclear-app/apps/api && node --env-file=/home/mileclear/mileclear-app/.env scripts/relearn-bank-payouts.mjs [--apply] [--user=<id>]

import { PrismaClient } from "@prisma/client";
import {
  normaliseMerchantKey,
  refreshPendingSuggestions,
  isAutoImportKey,
} from "../dist/services/merchantCategoriser.js";
import { matchMerchantToPlatform } from "../dist/services/openBanking.js";

const apply = process.argv.includes("--apply");
const onlyUser = process.argv.find((a) => a.startsWith("--user="))?.slice(7) ?? null;
const p = new PrismaClient();

const accepted = await p.bankTransaction.findMany({
  where: {
    status: "accepted",
    amountPence: { gt: 0 },
    resolvedEarningId: { not: null },
    ...(onlyUser ? { userId: onlyUser } : {}),
  },
  select: { userId: true, merchant: true, resolvedEarningId: true, reviewedAt: true },
  orderBy: { reviewedAt: "asc" },
});
const earnings = await p.earning.findMany({
  where: { id: { in: accepted.map((a) => a.resolvedEarningId) } },
  select: { id: true, platform: true },
});
const platformOf = new Map(earnings.map((e) => [e.id, e.platform]));

// userId + key -> choices in the order the driver made them
const groups = new Map();
for (const a of accepted) {
  const platform = platformOf.get(a.resolvedEarningId);
  const key = normaliseMerchantKey(a.merchant);
  if (!platform || !key) continue;
  const g = `${a.userId}\u0000${key}`;
  if (!groups.has(g)) groups.set(g, { userId: a.userId, key, merchant: a.merchant, picks: [] });
  groups.get(g).picks.push(platform);
}

// What the sync will really allow for each driver: their own name words
// and whether they have unpaid invoices (no automatic recording then).
const driverInfo = new Map();
async function infoFor(userId) {
  if (!driverInfo.has(userId)) {
    const u = await p.user.findUnique({ where: { id: userId }, select: { fullName: true, displayName: true } });
    const openInvoices = await p.invoice.count({
      where: { userId, paidAt: null, status: { in: ["sent", "overdue"] } },
    });
    driverInfo.set(userId, {
      own: `${u?.fullName ?? ""} ${u?.displayName ?? ""}`.split(/\s+/).filter(Boolean),
      openInvoices: openInvoices > 0,
    });
  }
  return driverInfo.get(userId);
}

let created = 0;
let existed = 0;
let differs = 0;
const rows = [];
let suggested = 0;
const drivers = new Set();
for (const g of groups.values()) {
  const latest = g.picks[g.picks.length - 1];
  // Count only the run of matching picks at the end: a changed mind
  // starts the count again, as trainMerchantMapping does.
  let count = 0;
  for (let i = g.picks.length - 1; i >= 0 && g.picks[i] === latest; i--) count++;

  const have = await p.merchantMapping.findUnique({
    where: { userId_merchantKey_kind: { userId: g.userId, merchantKey: g.key, kind: "earning" } },
    select: { id: true, category: true },
  });
  rows.push({
    driver: g.userId.slice(0, 8),
    key: g.key,
    picks: g.picks.join(","),
    count,
    existing: have?.category ?? "-",
    recordsByItself:
      count >= 2 &&
      !(await infoFor(g.userId)).openInvoices &&
      isAutoImportKey(g.key, (await infoFor(g.userId)).own),
  });
  if (have) {
    if (have.category === latest) existed++;
    else differs++;
  } else {
    created++;
    if (apply) {
      await p.merchantMapping.create({
        data: { userId: g.userId, merchantKey: g.key, kind: "earning", category: latest, acceptCount: count },
      });
    }
  }
  if (apply) {
    const n = await refreshPendingSuggestions({ userId: g.userId, merchant: g.merchant, kind: "earning" });
    suggested += n;
    if (n > 0) drivers.add(g.userId);
  }
}

// Waiting payouts that the known-app list now recognises (e.g. "Roofoods"
// for Deliveroo) but were scored "Other" when they arrived. Suggestion only:
// the driver still taps them, so nothing can be counted twice.
const waiting = await p.bankTransaction.findMany({
  where: {
    status: "pending",
    amountPence: { gt: 0 },
    OR: [{ suggestedKind: null }, { suggestedKind: { not: "invoice_payment" } }],
    ...(onlyUser ? { userId: onlyUser } : {}),
  },
  select: { id: true, merchant: true, suggestedCategory: true, suggestedConfidence: true },
});
// Only rows still on the low-confidence fallback: a suggestion the driver's
// own sorting produced is never replaced by the built-in list.
const rescore = waiting
  .filter((t) => !t.suggestedCategory || (t.suggestedCategory === "other" && (t.suggestedConfidence ?? 0) <= 30))
  .map((t) => ({ id: t.id, platform: matchMerchantToPlatform(t.merchant), was: t.suggestedCategory }))
  .filter((t) => t.platform && t.platform !== t.was);
if (apply) {
  for (const t of rescore) {
    await p.bankTransaction.update({
      where: { id: t.id },
      data: { suggestedKind: "earning", suggestedCategory: t.platform, suggestedConfidence: 85 },
    });
  }
}

console.log(`${apply ? "APPLIED" : "DRY RUN"}: ${groups.size} payout patterns from ${accepted.length} sorted payouts`);
for (const r of rows) console.log(" ", JSON.stringify(r));
console.log(`mappings to create ${created}, already right ${existed}, existing with a different app ${differs} (left alone)`);
console.log(`waiting payouts newly recognised by name: ${rescore.length}`);
if (apply) console.log(`waiting payouts now suggested: ${suggested} across ${drivers.size} drivers`);
await p.$disconnect();
