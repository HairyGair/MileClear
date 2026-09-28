// Expire "journeys to check" that are too old to be worth asking about.
//
// 28 Sep 2026: 476 of 649 active drivers had open offers, median 6, 164 with
// 10 or more and 28 with 25 or more. In the previous 14 days drivers dismissed
// 495 and accepted 317. A pile that size is noise, so GET /trips/missed-journeys
// now stops offering a journey once it is more than OFFER_MAX_AGE_DAYS old
// (30 for a discarded Start Trip),
// measured by the journey's own date (arrivedAt, the latest moment the drive
// could have happened), not by when the row was made. See
// src/services/missedJourneyExpiryRule.ts.
//
// The scan applies the rule to each driver on their next visit, so nothing
// needs running for it to take effect. This script exists to:
//   1. show the evidence behind the window (how old offers are when drivers
//      accept or dismiss them, per source), and
//   2. preview (default) or apply (APPLY=1) the expiry to the whole backlog in
//      one go, so the counts are right for every driver at once and not only
//      for the ones who open Trips.
//
// Expiry is reversible: the row moves to status "expired", decidedAt stays
// null (the driver decided nothing), and one app event per driver lists the
// rows. To undo for a driver:
//   UPDATE missed_journey_proposals SET status = 'proposed'
//   WHERE id IN (...ids from the trip.missed_proposals_expired event...);
//
// DRY RUN BY DEFAULT. It writes only with APPLY=1.
//
// Run ON the server from ~/mileclear-app/apps/api:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/expire-old-journey-offers.mjs
//   APPLY=1 node --env-file=... scripts/expire-old-journey-offers.mjs
// Optional: USER_ID=<uuid> to act on one driver only.

import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with --env-file on the server.");
  process.exit(1);
}
const prisma = new PrismaClient();
const APPLY = process.env.APPLY === "1";
const USER_ID = process.env.USER_ID || null;

// ── Copy of the rule (src/services/missedJourneyExpiryRule.ts) ──────────────
// A script cannot import the .ts; keep the two in step.
const DAY_MS = 24 * 60 * 60 * 1000;
const OFFER_MAX_AGE_DAYS = 14;
const OFFER_MAX_AGE_DAYS_BY_SOURCE = { dropped_start_trip: 30 };
const offerMaxAgeDays = (source) => OFFER_MAX_AGE_DAYS_BY_SOURCE[source] ?? OFFER_MAX_AGE_DAYS;
function isOfferExpired(p, now) {
  const t = p.arrivedAt.getTime();
  if (!Number.isFinite(t) || !Number.isFinite(now)) return false;
  return now > t + offerMaxAgeDays(p.source) * DAY_MS;
}
// ────────────────────────────────────────────────────────────────────────────

const median = (xs) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "-");

async function evidence(now) {
  // How old was the journey when the driver decided? decidedAt only exists on
  // rows decided since it was added, which is what we want: real decisions.
  const since = new Date(now - 90 * DAY_MS);
  const decided = await prisma.missedJourneyProposal.findMany({
    where: {
      status: { in: ["accepted", "dismissed"] },
      decidedAt: { gte: since },
      ...(USER_ID ? { userId: USER_ID } : {}),
    },
    select: { source: true, status: true, arrivedAt: true, decidedAt: true },
  });
  const buckets = [
    ["<1d", 1], ["1-3d", 3], ["3-7d", 7], ["7-14d", 14], ["14-21d", 21], ["21-30d", 30], ["30d+", Infinity],
  ];
  const table = new Map(); // source -> status -> bucket counts
  for (const r of decided) {
    const ageDays = (r.decidedAt.getTime() - r.arrivedAt.getTime()) / DAY_MS;
    const b = buckets.find(([, max]) => ageDays < max)[0];
    const bySource = table.get(r.source) ?? new Map();
    const row = bySource.get(r.status) ?? Object.fromEntries(buckets.map(([k]) => [k, 0]));
    row[b]++;
    bySource.set(r.status, row);
    table.set(r.source, bySource);
  }
  console.log(`\nEVIDENCE: ${decided.length} decisions in the last 90 days, by age of the journey when decided`);
  console.log(`source               status     ${buckets.map(([k]) => k.padStart(7)).join("")}   total  after14d`);
  for (const [source, bySource] of [...table].sort()) {
    for (const [status, row] of [...bySource].sort()) {
      const total = Object.values(row).reduce((a, b) => a + b, 0);
      const late = row["14-21d"] + row["21-30d"] + row["30d+"];
      console.log(
        `${source.padEnd(20)} ${status.padEnd(10)} ${buckets.map(([k]) => String(row[k]).padStart(7)).join("")}   ${String(total).padStart(5)}  ${String(late).padStart(4)} (${pct(late, total)})`
      );
    }
  }
}

async function main() {
  const now = Date.now();
  await evidence(now);

  const open = await prisma.missedJourneyProposal.findMany({
    where: { status: "proposed", ...(USER_ID ? { userId: USER_ID } : {}) },
    select: { id: true, userId: true, source: true, arrivedAt: true, estimatedMiles: true, recordedMiles: true },
  });
  const expire = open.filter((p) => isOfferExpired(p, now));

  const perUserBefore = new Map();
  const perUserAfter = new Map();
  for (const p of open) {
    perUserBefore.set(p.userId, (perUserBefore.get(p.userId) ?? 0) + 1);
    if (!isOfferExpired(p, now)) perUserAfter.set(p.userId, (perUserAfter.get(p.userId) ?? 0) + 1);
  }
  const before = [...perUserBefore.values()];
  const after = [...perUserBefore.keys()].map((u) => perUserAfter.get(u) ?? 0);
  const afterWithAny = after.filter((n) => n > 0);

  const bySource = {};
  let expiredMiles = 0;
  for (const p of expire) {
    bySource[p.source] = (bySource[p.source] ?? 0) + 1;
    expiredMiles += p.recordedMiles ?? p.estimatedMiles ?? 0;
  }
  const openBySource = {};
  for (const p of open) openBySource[p.source] = (openBySource[p.source] ?? 0) + 1;

  console.log(`\nOPEN OFFERS NOW: ${open.length} across ${perUserBefore.size} drivers`);
  console.log(`  by source: ${JSON.stringify(openBySource)}`);
  console.log(`  per driver: median ${median(before)}, 10+ ${before.filter((n) => n >= 10).length}, 25+ ${before.filter((n) => n >= 25).length}`);
  console.log(`\nWOULD EXPIRE (journey more than ${OFFER_MAX_AGE_DAYS} days old): ${expire.length}`);
  console.log(`  by source: ${JSON.stringify(bySource)}`);
  console.log(`  miles on those offers (estimates): ${Math.round(expiredMiles)}`);
  console.log(`  drivers touched: ${new Set(expire.map((p) => p.userId)).size}`);
  console.log(`\nAFTER: ${open.length - expire.length} open across ${afterWithAny.length} drivers`);
  console.log(`  per driver (of those still with any): median ${median(afterWithAny)}, 10+ ${afterWithAny.filter((n) => n >= 10).length}, 25+ ${afterWithAny.filter((n) => n >= 25).length}`);
  console.log(`  drivers whose list empties completely: ${after.filter((n) => n === 0).length}`);

  if (!APPLY) {
    console.log("\nDRY RUN: nothing written. Run with APPLY=1 to expire these.");
    return;
  }

  const byUser = new Map();
  for (const p of expire) {
    const list = byUser.get(p.userId) ?? [];
    list.push(p);
    byUser.set(p.userId, list);
  }
  let moved = 0;
  for (const [userId, list] of byUser) {
    const ids = list.map((p) => p.id);
    // status guard: a row decided or covered since the read above is left alone.
    const r = await prisma.missedJourneyProposal.updateMany({
      where: { id: { in: ids }, userId, status: "proposed" },
      data: { status: "expired" },
    });
    moved += r.count;
    const sources = {};
    for (const p of list) sources[p.source] = (sources[p.source] ?? 0) + 1;
    await prisma.appEvent.create({
      data: {
        type: "trip.missed_proposals_expired",
        userId,
        metadata: { via: "backlog_script", count: r.count, maxAgeDays: OFFER_MAX_AGE_DAYS, maxAgeDaysBySource: OFFER_MAX_AGE_DAYS_BY_SOURCE, bySource: sources, proposalIds: ids },
      },
    });
  }
  console.log(`\nAPPLIED: ${moved} rows moved to "expired" across ${byUser.size} drivers.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
