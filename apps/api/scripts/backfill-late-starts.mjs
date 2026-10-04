// Late-start backfill for recorded trips (4 Oct 2026). See
// src/services/lateStart.ts for the rule and every guard. DRY RUN by default;
// --apply writes. Each write keeps the old values in
// gpsQuality.lateStartBackfill and logs trip.start_backfilled {oldStartedAt,
// oldStartLat, oldStartLng, oldMiles, newMiles, routedMiles} so it can be
// undone. Needs a current build (it imports dist/).
//
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/backfill-late-starts.mjs [--days 30] [--user <id prefix>] [--apply]
import { PrismaClient } from "@prisma/client";
const { runLateStartBackfill } = await import("../dist/services/lateStart.js");

const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const DAYS = Number(arg("--days", "30"));
const USER_PREFIX = arg("--user", null);
const MAX_GAP_MS = 12 * 3600e3;

function miles(aLat, aLng, bLat, bLng) {
  const R = 3958.8, r = (d) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat), dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const since = new Date(Date.now() - DAYS * 864e5);
const trips = await p.trip.findMany({
  where: {
    isPhantomTrip: false,
    OR: [{ startedAt: { gte: since } }, { endedAt: { gte: new Date(since.getTime() - MAX_GAP_MS) } }],
    ...(USER_PREFIX ? { userId: { startsWith: USER_PREFIX } } : {}),
  },
  select: { id: true, userId: true, isManualEntry: true, startedAt: true, endedAt: true, startLat: true, startLng: true, endLat: true, endLng: true },
});

// Cheap in-memory pre-filter (same geometry as the rule) so only plausible
// pairs reach the runner, which re-reads everything and decides for itself.
const byUser = new Map();
for (const t of trips) {
  if (!t.endedAt) continue;
  const l = byUser.get(t.userId) || [];
  l.push(t);
  byUser.set(t.userId, l);
}
for (const l of byUser.values()) l.sort((a, b) => a.endedAt - b.endedAt);
const pairs = [];
for (const b of trips) {
  if (b.isManualEntry || b.startedAt < since) continue;
  let prev = null;
  for (const t of byUser.get(b.userId) || []) {
    if (t.endedAt > b.startedAt) break;
    if (t.id !== b.id) prev = t;
  }
  if (!prev || prev.endLat == null || b.startedAt - prev.endedAt > MAX_GAP_MS) continue;
  const crow = miles(prev.endLat, prev.endLng, b.startLat, b.startLng);
  if (crow >= 0.2 && crow <= 2.0) pairs.push({ b, crow });
}
pairs.sort((x, y) => x.b.startedAt - y.b.startedAt);
console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${pairs.length} recorded trips in the last ${DAYS} days start 0.2-2 mi from the previous trip's end`);

const reasons = {};
const accepted = [];
for (const { b } of pairs) {
  const r = await runLateStartBackfill({ tripId: b.id, userId: b.userId, triggeredBy: "backfill", dryRun: !APPLY });
  if (!r) { reasons.error = (reasons.error || 0) + 1; continue; }
  if (r.decision.ok) accepted.push({ ...r, userId: b.userId });
  else reasons[r.decision.reason] = (reasons[r.decision.reason] || 0) + 1;
  await new Promise((res) => setTimeout(res, 20));
}

const added = accepted.reduce((s, a) => s + a.decision.addedMiles, 0);
console.log(`${APPLY ? "changed" : "would change"} ${accepted.length} trips (${new Set(accepted.map((a) => a.userId)).size} drivers), +${added.toFixed(1)} mi in total`);
console.log("refused:", JSON.stringify(Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1]))));
const fmt = (a) => {
  const d = a.decision;
  return `${a.tripId.slice(0, 8)} user ${a.userId.slice(0, 8)} ${a.startedAt.toISOString().slice(0, 16)} -> ${d.newStartedAt.toISOString().slice(11, 16)}, ${a.storedMiles.toFixed(2)} + ${d.addedMiles.toFixed(2)} mi (crow ${d.crowMiles}, gap ${d.gapMin} min, drive ${Math.round(d.routedDurationSecs / 60)} min) from "${d.startAddress ?? "(geocode)"}"`;
};
console.log("biggest additions (check these by eye):");
for (const a of [...accepted].sort((x, y) => y.decision.addedMiles - x.decision.addedMiles).slice(0, 15)) console.log("  " + fmt(a));
console.log("tightest time fits (drive time / gap):");
for (const a of [...accepted].sort((x, y) => y.decision.routedDurationSecs / (y.decision.gapMin * 60) - x.decision.routedDurationSecs / (x.decision.gapMin * 60)).slice(0, 10)) console.log("  " + fmt(a));
if (USER_PREFIX) {
  console.log(`every accepted trip for ${USER_PREFIX}*:`);
  for (const a of accepted) console.log("  " + fmt(a));
}
await p.$disconnect();
process.exit(0);
