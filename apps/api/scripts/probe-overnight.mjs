// Runs from anywhere: here or on the server (~/mileclear-app/apps/api):
//   node scripts/probe-overnight.mjs
// DATABASE_URL comes from the environment (--env-file) or the repo-root .env.
import fs from "node:fs";
import { createRequire } from "node:module";
const { PrismaClient } = createRequire(new URL("../package.json", import.meta.url))("@prisma/client");
const url =
  process.env.DATABASE_URL ??
  fs.readFileSync(new URL("../../../.env", import.meta.url), "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)[1];
const p = new PrismaClient({ datasources: { db: { url } } });
const now = new Date();
const since = (() => { const d = new Date(); d.setUTCHours(22, 0, 0, 0); if (d > new Date()) d.setUTCDate(d.getUTCDate() - 1); return d; })(); // 23:00 BST last night
const dayAgo = new Date(since.getTime() - 86400e3);
const weekAgo = new Date(since.getTime() - 7 * 86400e3);
const H = 3600e3;
async function trips(from, to) {
  const rows = await p.trip.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { userId: true, isManualEntry: true, distanceMiles: true, startedAt: true, endedAt: true, isPhantomTrip: true } });
  const users = new Set(rows.map(r => r.userId)).size;
  const manual = rows.filter(r => r.isManualEntry).length;
  const miles = rows.reduce((a, r) => a + r.distanceMiles, 0);
  const longShort = rows.filter(r => r.endedAt && r.distanceMiles < 3 && (r.endedAt - r.startedAt) > 6 * H).length;
  const phantom = rows.filter(r => r.isPhantomTrip).length;
  return { trips: rows.length, users, manual, auto: rows.length - manual, miles: Math.round(miles), shortLong: longShort, phantom };
}
console.log("WINDOW now:", now.toISOString(), "since:", since.toISOString());
console.log("trips tonight ", await trips(since, now));
console.log("trips prev night", await trips(dayAgo, new Date(now - 86400e3)));
console.log("trips week ago ", await trips(weekAgo, new Date(now - 7 * 86400e3)));
const jobs = await p.jobRun.findMany({ where: { startedAt: { gte: since } }, select: { jobName: true, status: true, errorMessage: true, startedAt: true }, orderBy: { startedAt: "asc" } });
const jc = {};
for (const j of jobs) { const k = j.jobName + " " + j.status; jc[k] = (jc[k] || 0) + 1; }
console.log("JOBS", jc);
for (const j of jobs.filter(j => j.status !== "success" && j.status !== "ok")) console.log("  JOBFAIL", j.startedAt.toISOString(), j.jobName, j.status, (j.errorMessage || "").slice(0, 160));
const ev = await p.appEvent.groupBy({ by: ["type"], where: { createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { type: "desc" } } });
console.log("EVENTS", ev.map(e => `${e.type}=${e._count._all}`).join("  "));
const evPrev = await p.appEvent.groupBy({ by: ["type"], where: { createdAt: { gte: dayAgo, lt: new Date(now - 86400e3) } }, _count: { _all: true } });
const prevMap = Object.fromEntries(evPrev.map(e => [e.type, e._count._all]));
const changed = ev.filter(e => Math.abs(e._count._all - (prevMap[e.type] || 0)) >= 5).map(e => `${e.type} ${prevMap[e.type] || 0}->${e._count._all}`);
console.log("EVENT DELTAS vs prev night (>=5):", changed.join("  "));
const fb = await p.feedback.findMany({ where: { createdAt: { gte: since } }, select: { title: true, category: true, createdAt: true } });
console.log("FEEDBACK new:", fb.length, fb.map(f => `${f.category}: ${f.title}`).join(" | "));
const dumps = await p.diagnosticDump.groupBy({ by: ["platform", "buildNumber", "verdict"], where: { capturedAt: { gte: since } }, _count: { _all: true } });
console.log("DUMPS", dumps.map(d => `${d.platform}/${d.buildNumber}/${d.verdict}=${d._count._all}`).join("  "));
const mj = await p.missedJourneyProposal.count({ where: { createdAt: { gte: since } } }).catch(e => "n/a " + e.message.slice(0, 80));
console.log("MISSED-JOURNEY proposals overnight:", mj);

// ESTABLISHED DRIVERS (added 23 Sep 2026). Record signups hid a steady loss of
// established iPhone drivers (277 -> 235 active in three weeks), so this is the
// number to watch next to trips. Established = joined 21+ days ago; active =
// at least one automatic, non-phantom trip in the 7-day window.
{
  const DAY = 864e5;
  const cutoff = new Date(now - 21 * DAY);
  const est = await p.user.findMany({ where: { createdAt: { lte: cutoff } }, select: { id: true, platformsSeen: true } });
  const plat = new Map(est.map(u => [u.id, (u.platformsSeen || "").includes("android") ? "android" : "ios"]));
  const ids = est.map(u => u.id);
  async function activeIn(from, to) {
    const rows = await p.trip.groupBy({ by: ["userId"], where: { userId: { in: ids }, isManualEntry: false, isPhantomTrip: false, startedAt: { gte: from, lt: to } } });
    return new Set(rows.map(r => r.userId));
  }
  const weeks = [];
  for (let w = 3; w >= 0; w--) weeks.push(await activeIn(new Date(now - (w + 1) * 7 * DAY), new Date(now - w * 7 * DAY)));
  const [, , prev, cur] = weeks;
  const split = (set) => { const c = { ios: 0, android: 0 }; for (const u of set) c[plat.get(u)]++; return c; };
  const silent = [...prev].filter(u => !cur.has(u)), back = [...cur].filter(u => !prev.has(u));
  const c = split(cur), pv = split(prev), si = split(new Set(silent)), bk = split(new Set(back));
  console.log(`ESTABLISHED DRIVERS (joined 21+ days ago, ${est.length}): active last 7 days ${cur.size} (iOS ${c.ios}, Android ${c.android}) vs ${prev.size} the week before (iOS ${pv.ios}, Android ${pv.android})`);
  console.log(`  went quiet ${silent.length} (iOS ${si.ios}, Android ${si.android}), came back ${back.length} (iOS ${bk.ios}, Android ${bk.android}); 4-week trend of active: ${weeks.map(s => s.size).join(" -> ")}`);
}
await p.$disconnect();
