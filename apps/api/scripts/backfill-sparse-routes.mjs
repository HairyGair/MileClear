// Road distance for recorded trips with 2-9 GPS points (4 Oct 2026).
// See src/services/sparseRoute.ts. Dry run by default; --apply writes.
// Every write logs trip.distance_recalculated {source: "sparse_route",
// oldMiles, newMiles, triggeredBy: "backfill"} so it can be undone.
//
//   node --env-file=../../.env scripts/backfill-sparse-routes.mjs [--days 30] [--apply]
import { PrismaClient } from "@prisma/client";
const { runSparseRoutingForTrip } = await import("../dist/routes/trips/index.js");

const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const daysArg = process.argv.indexOf("--days");
const DAYS = daysArg > 0 ? Number(process.argv[daysArg + 1]) : 30;

const trips = await p.trip.findMany({
  where: {
    isManualEntry: false,
    isPhantomTrip: false,
    coordinateCount: { gte: 2, lte: 9 },
    startedAt: { gte: new Date(Date.now() - DAYS * 864e5) },
  },
  select: { id: true, userId: true, distanceMiles: true, startedAt: true, endedAt: true },
  orderBy: { startedAt: "asc" },
});
console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${trips.length} recorded trips with 2-9 points in the last ${DAYS} days`);

const reasons = {};
const accepted = [];
let unroutable = 0, notCandidate = 0;
for (const t of trips) {
  const points = await p.tripCoordinate.findMany({ where: { tripId: t.id }, orderBy: { recordedAt: "asc" }, select: { lat: true, lng: true, accuracy: true } });
  const v = await runSparseRoutingForTrip({
    tripId: t.id, points, storedMiles: t.distanceMiles, startedAt: t.startedAt, endedAt: t.endedAt,
    userId: t.userId, triggeredBy: "backfill", dryRun: !APPLY,
  });
  if (v === null) { if (points.length >= 2) unroutable++; else notCandidate++; continue; }
  if (v.accept) accepted.push({ id: t.id, userId: t.userId, from: t.distanceMiles, to: v.miles, startedAt: t.startedAt, endedAt: t.endedAt, pts: points.length });
  else reasons[v.reason] = (reasons[v.reason] || 0) + 1;
  await new Promise((r) => setTimeout(r, 20));
}

const added = accepted.reduce((s, a) => s + (a.to - a.from), 0);
console.log(`would change ${accepted.length} trips (${new Set(accepted.map((a) => a.userId)).size} drivers), +${added.toFixed(1)} mi in total`);
console.log("refused:", JSON.stringify(reasons), "| not routable / under 0.3 mi:", unroutable, "| <2 points:", notCandidate);
const ratios = accepted.map((a) => a.to / Math.max(a.from, 0.01)).sort((x, y) => x - y);
const q = (f) => ratios.length ? ratios[Math.floor(f * (ratios.length - 1))].toFixed(2) : "-";
console.log(`increase ratio: median ${q(0.5)}, p90 ${q(0.9)}, max ${q(1)}`);
console.log("biggest increases (check these by eye):");
for (const a of [...accepted].sort((x, y) => (y.to - y.from) - (x.to - x.from)).slice(0, 15)) {
  const mins = a.endedAt ? Math.round((a.endedAt - a.startedAt) / 60000) : "?";
  console.log(`  ${a.id.slice(0, 8)} ${a.from.toFixed(2)} -> ${a.to.toFixed(2)} mi, ${a.pts} pts, ${mins} min, ${a.startedAt.toISOString().slice(0, 16)}`);
}
await p.$disconnect();
process.exit(0);
