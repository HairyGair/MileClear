// READ-ONLY. Weekly growth indicators (28 Sep 2026, Anthony: users first, the
// money follows at the end of the tax year and when MTD plugs in fully).
//
//   1. Retention: of each sign-up week, how many still record 28-35 days on.
//   2. Capture: share of each week's trips recorded automatically, per platform.
//   3. Demand before the season: free users opening the Self Assessment summary
//      or the Exports screen, checkouts started, new paying subscribers.
//   4. The January pool: drivers active now who have tracked through most of
//      the 2026-27 tax year (since 6 April), the likeliest to buy the SA PDF.
//
// Run on the server from ~/mileclear-app/apps/api:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/growth-indicators.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DAY = 864e5;
const now = new Date();
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "-");
const weekStart = (d) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); // Monday
  return x;
};
const iso = (d) => d.toISOString().slice(0, 10);

// Platform per user: the latest diagnostic dump says it best; web-only users have none.
const dumps = await prisma.diagnosticDump.findMany({ select: { userId: true, platform: true } });
const platformOf = new Map(dumps.map((d) => [d.userId, d.platform === "android" ? "android" : "ios"]));

// ── 1. Retention by sign-up week ──────────────────────────────────────────
console.log("=== 1. STILL RECORDING 28-35 DAYS AFTER JOINING (by sign-up week)");
const cohortFrom = weekStart(new Date(now.getTime() - 12 * 7 * DAY));
const signups = await prisma.user.findMany({
  where: { createdAt: { gte: cohortFrom, lt: new Date(now.getTime() - 35 * DAY) } },
  select: { id: true, createdAt: true },
});
const laterTrips = await prisma.trip.findMany({
  where: { userId: { in: signups.map((u) => u.id) }, startedAt: { gte: cohortFrom } },
  select: { userId: true, startedAt: true, isManualEntry: true },
});
const tripsBy = new Map();
for (const t of laterTrips) (tripsBy.get(t.userId) ?? tripsBy.set(t.userId, []).get(t.userId)).push(t);
const cohorts = new Map();
for (const u of signups) {
  const wk = iso(weekStart(u.createdAt));
  const c = cohorts.get(wk) ?? { joined: 0, everTracked: 0, retained: 0 };
  c.joined += 1;
  const ts = tripsBy.get(u.id) ?? [];
  if (ts.length) c.everTracked += 1;
  const from = u.createdAt.getTime() + 28 * DAY, to = u.createdAt.getTime() + 35 * DAY;
  if (ts.some((t) => t.startedAt.getTime() >= from && t.startedAt.getTime() < to)) c.retained += 1;
  cohorts.set(wk, c);
}
for (const [wk, c] of [...cohorts].sort()) {
  console.log(`  week of ${wk}: joined ${c.joined}, ever tracked ${c.everTracked}, still recording in days 28-35: ${c.retained} (${pct(c.retained, c.joined)} of joiners, ${pct(c.retained, c.everTracked)} of trackers)`);
}

// ── 2. Automatic capture share by week and platform ───────────────────────
console.log("\n=== 2. SHARE OF TRIPS RECORDED AUTOMATICALLY (last 6 weeks)");
const capFrom = weekStart(new Date(now.getTime() - 6 * 7 * DAY));
const capTrips = await prisma.trip.findMany({ where: { startedAt: { gte: capFrom } }, select: { userId: true, startedAt: true, isManualEntry: true } });
const cap = new Map();
for (const t of capTrips) {
  const key = `${iso(weekStart(t.startedAt))}|${platformOf.get(t.userId) ?? "web/unknown"}`;
  const c = cap.get(key) ?? { auto: 0, all: 0 };
  c.all += 1;
  if (!t.isManualEntry) c.auto += 1;
  cap.set(key, c);
}
for (const [k, c] of [...cap].sort()) {
  const [wk, p] = k.split("|");
  if (p === "web/unknown") continue;
  console.log(`  week of ${wk} ${p.padEnd(7)}: ${c.all} trips, ${pct(c.auto, c.all)} automatic`);
}

// ── 3. Demand before the season (last 4 weeks, by week) ───────────────────
console.log("\n=== 3. DEMAND FOR PRO FEATURES (free users unless stated, last 4 weeks)");
const dFrom = weekStart(new Date(now.getTime() - 4 * 7 * DAY));
const premiumNow = new Set(
  (await prisma.user.findMany({ where: { isPremium: true }, select: { id: true } })).map((u) => u.id)
);
const ev = await prisma.appEvent.findMany({
  where: {
    createdAt: { gte: dFrom },
    OR: [
      { type: "self_assessment.summary" },
      { type: "billing.checkout_created" },
      { type: "welcome.pro_sent" },
      { type: "screen.viewed" },
      { type: "paywall.shown" },
    ],
  },
  select: { type: true, userId: true, createdAt: true, metadata: true },
});
const demand = new Map();
const bump = (wk, k, id) => {
  const d = demand.get(wk) ?? { saFree: new Set(), exportsFree: new Set(), paywall: new Set(), checkout: new Set(), newPro: new Set() };
  d[k].add(id);
  demand.set(wk, d);
};
for (const e of ev) {
  if (!e.userId) continue;
  const wk = iso(weekStart(e.createdAt));
  if (e.type === "self_assessment.summary" && !premiumNow.has(e.userId)) bump(wk, "saFree", e.userId);
  else if (e.type === "billing.checkout_created") bump(wk, "checkout", e.userId);
  else if (e.type === "welcome.pro_sent") bump(wk, "newPro", e.userId);
  else if (e.type === "paywall.shown") bump(wk, "paywall", e.userId);
  else if (e.type === "screen.viewed") {
    const route = String((e.metadata ?? {}).route ?? "");
    if (/export/i.test(route) && !premiumNow.has(e.userId)) bump(wk, "exportsFree", e.userId);
  }
}
for (const [wk, d] of [...demand].sort()) {
  console.log(`  week of ${wk}: free users opening SA summary ${d.saFree.size}, free users opening Exports ${d.exportsFree.size}, free users shown the Pro screen ${d.paywall.size}, checkouts started ${d.checkout.size}, new Pro ${d.newPro.size}`);
}

// ── 4. The January pool ────────────────────────────────────────────────────
console.log("\n=== 4. THE JANUARY POOL (tax year 2026-27, since 6 April)");
const taxYearStart = new Date("2026-04-06T00:00:00Z");
const monthsSoFar = [];
for (let d = new Date(Date.UTC(2026, 3, 1)); d <= now; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) monthsSoFar.push(d.toISOString().slice(0, 7));
const yearTrips = await prisma.trip.findMany({ where: { startedAt: { gte: taxYearStart } }, select: { userId: true, startedAt: true, distanceMiles: true, classification: true } });
const per = new Map();
for (const t of yearTrips) {
  const p = per.get(t.userId) ?? { months: new Set(), last: 0, businessMiles: 0 };
  p.months.add(t.startedAt.toISOString().slice(0, 7));
  p.last = Math.max(p.last, t.startedAt.getTime());
  if (t.classification === "business") p.businessMiles += t.distanceMiles ?? 0;
  per.set(t.userId, p);
}
const activeCut = now.getTime() - 14 * DAY;
const active = [...per].filter(([, p]) => p.last >= activeCut);
const band = (min) => active.filter(([, p]) => p.months.size >= min);
const free = (list) => list.filter(([id]) => !premiumNow.has(id));
const withBiz = (list, miles) => list.filter(([, p]) => p.businessMiles >= miles);
console.log(`  tax-year months so far: ${monthsSoFar.length} (${monthsSoFar[0]}..${monthsSoFar.at(-1)})`);
console.log(`  active in the last 14 days: ${active.length} (free ${free(active).length})`);
for (const m of [3, Math.max(3, monthsSoFar.length - 1), monthsSoFar.length]) {
  const b = band(m);
  console.log(`  ...who tracked in ${m}+ of those months: ${b.length} (free ${free(b).length}; free with 1,000+ business miles: ${withBiz(free(b), 1000).length})`);
}

await prisma.$disconnect();
