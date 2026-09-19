// Repair trips where a phone's merge stretched leg one of an auto-split trip
// back over its later legs (fixed going forward in 0ce6cdb).
//
// For each split parent whose endedAt runs past its first child's start:
//   - parent breadcrumbs already held by a child (a replay) are deleted,
//   - the rest after the first child's start move to the latest leg that had
//     started by then,
//   - the parent shrinks back to leg one: its end is its last remaining
//     breadcrumb and its miles are the figure the split gave it,
//   - each leg that gained breadcrumbs is extended by the trail through them.
//
// Dry run by default. Run ON the server from ~/mileclear-app/apps/api:
//   node scripts/repair-split-overlap.mjs [--days 30] [--user <id>] [--apply]

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DAYS = Number(args[args.indexOf("--days") + 1]) || 30;
const ONLY_USER = args.includes("--user") ? args[args.indexOf("--user") + 1] : null;

if (!process.env.DATABASE_URL) {
  const env = fs.readFileSync(path.resolve("../../.env"), "utf8");
  process.env.DATABASE_URL = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)[1];
}
const p = new PrismaClient();

function miles(a, b) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function trail(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += miles(coords[i - 1], coords[i]);
  return Math.round(m * 100) / 100;
}
const r2 = (n) => Math.round(n * 100) / 100;

const since = new Date(Date.now() - DAYS * 86400e3);
const splitEvents = await p.appEvent.findMany({
  where: { type: "trip.visit_auto_split", createdAt: { gte: since } },
  select: { userId: true, metadata: true, createdAt: true },
});
// FIRST split per parent: its legMiles[0] is what leg one was given before any
// merge inflated it. A later re-split of an inflated parent shares out the
// inflated figure, so its legMiles[0] cannot be trusted.
const legOneMiles = new Map();
for (const e of splitEvents.sort((a, b) => a.createdAt - b.createdAt)) {
  const m = e.metadata;
  if (m?.tripId && Array.isArray(m.legMiles) && !legOneMiles.has(m.tripId)) {
    legOneMiles.set(m.tripId, { userId: e.userId, miles: m.legMiles[0] });
  }
}

let found = 0;
let fixed = 0;
let milesRemoved = 0;
const touchedUsers = new Map();

const review = [];

for (const [parentId, { miles: leg1Miles }] of legOneMiles) {
  // The sweep job logs its splits without a user, so take it from the trip.
  const parent = await p.trip.findUnique({ where: { id: parentId } });
  if (!parent || !parent.endedAt) continue;
  if (ONLY_USER && parent.userId !== ONLY_USER) continue;
  const userId = parent.userId;
  const children = await p.trip.findMany({
    where: { userId, gpsQuality: { path: "$.autoSplitFromTripId", equals: parentId } },
    orderBy: { startedAt: "asc" },
  });
  if (children.length === 0) continue;
  const firstChildStart = children[0].startedAt;
  if (parent.endedAt <= firstChildStart) continue;

  found++;
  const parentCoords = await p.tripCoordinate.findMany({ where: { tripId: parentId }, orderBy: { recordedAt: "asc" } });
  const keep = parentCoords.filter((c) => c.recordedAt < firstChildStart);
  const stray = parentCoords.filter((c) => c.recordedAt >= firstChildStart);
  if (keep.length < 2) {
    console.log(`SKIP ${parentId.slice(0, 8)}: fewer than 2 breadcrumbs left for leg one`);
    continue;
  }
  const childCoordTimes = new Set(
    (await p.tripCoordinate.findMany({
      where: { tripId: { in: children.map((c) => c.id) } },
      select: { recordedAt: true },
    })).map((c) => c.recordedAt.getTime()),
  );
  const dupes = stray.filter((c) => childCoordTimes.has(c.recordedAt.getTime()));
  const moving = stray.filter((c) => !childCoordTimes.has(c.recordedAt.getTime()));

  // Each moving breadcrumb goes to the latest leg that had started by then.
  const byChild = new Map();
  for (const c of moving) {
    const target = [...children].reverse().find((ch) => ch.startedAt <= c.recordedAt) ?? children[0];
    if (!byChild.has(target.id)) byChild.set(target.id, []);
    byChild.get(target.id).push(c);
  }

  // Leg one's own breadcrumbs are the check: a split figure far above them
  // came from an already-inflated parent, so the trail wins.
  const keepTrail = trail(keep);
  const newParentMiles =
    leg1Miles != null && !(leg1Miles > keepTrail * 1.5 && leg1Miles - keepTrail > 0.5) ? leg1Miles : keepTrail;
  // Nothing to move, yet the parent would lose miles: those miles might be
  // double-counted or might be real driving with no breadcrumbs. Not ours to
  // guess, so list it for a human and leave it alone.
  if (moving.length === 0 && parent.distanceMiles - newParentMiles > 0.5) {
    review.push(`REVIEW user ${userId.slice(0, 8)} parent ${parentId} ${parent.startedAt.toISOString().slice(0, 16)} ` +
      `${parent.distanceMiles}mi, split gave leg one ${newParentMiles}mi, no breadcrumbs after ${firstChildStart.toISOString().slice(11, 16)}`);
    continue;
  }
  const before = parent.distanceMiles + children.reduce((a, c) => a + c.distanceMiles, 0);
  const plans = [];
  for (const child of children) {
    const add = byChild.get(child.id) ?? [];
    if (add.length === 0) continue;
    const last = await p.tripCoordinate.findFirst({ where: { tripId: child.id }, orderBy: { recordedAt: "desc" } });
    const after = add.filter((c) => !last || c.recordedAt > last.recordedAt);
    const extension = trail([...(last ? [last] : []), ...after]);
    const end = add[add.length - 1];
    plans.push({
      child,
      add,
      extension,
      endedAt: child.endedAt && child.endedAt > end.recordedAt ? child.endedAt : end.recordedAt,
      end,
    });
  }
  const afterTotal = newParentMiles + children.reduce((a, c) => a + c.distanceMiles, 0) + plans.reduce((a, pl) => a + pl.extension, 0);
  milesRemoved += before - afterTotal;

  console.log(
    `${APPLY ? "FIX " : "WOULD FIX"} user ${userId.slice(0, 8)} parent ${parentId.slice(0, 8)} ` +
      `${parent.startedAt.toISOString().slice(0, 16)}→${parent.endedAt.toISOString().slice(11, 16)} ` +
      `${parent.distanceMiles}mi → ${keep[keep.length - 1].recordedAt.toISOString().slice(11, 16)} ${r2(newParentMiles)}mi; ` +
      `stray ${stray.length} (dupes ${dupes.length}, moving ${moving.length}); ` +
      plans.map((pl) => `leg ${pl.child.id.slice(0, 8)} +${pl.add.length}pts +${pl.extension}mi`).join(", ") +
      `; family ${r2(before)} → ${r2(afterTotal)} mi`,
  );

  if (!APPLY) continue;
  const lastKeep = keep[keep.length - 1];
  await p.$transaction(async (tx) => {
    if (dupes.length) await tx.tripCoordinate.deleteMany({ where: { id: { in: dupes.map((c) => c.id) } } });
    for (const pl of plans) {
      await tx.tripCoordinate.updateMany({ where: { id: { in: pl.add.map((c) => c.id) } }, data: { tripId: pl.child.id } });
      await tx.trip.update({
        where: { id: pl.child.id },
        data: {
          coordinateCount: { increment: pl.add.length },
          distanceMiles: r2(pl.child.distanceMiles + pl.extension),
          endedAt: pl.endedAt,
          endLat: pl.end.lat,
          endLng: pl.end.lng,
          endAddress: null,
          routePolyline: null,
        },
      });
    }
    await tx.trip.update({
      where: { id: parentId },
      data: {
        endedAt: lastKeep.recordedAt,
        endLat: lastKeep.lat,
        endLng: lastKeep.lng,
        endAddress: null,
        distanceMiles: r2(newParentMiles),
        coordinateCount: keep.length,
        routePolyline: null,
      },
    });
    await tx.appEvent.create({
      data: {
        type: "trip.split_overlap_repaired",
        userId,
        metadata: {
          tripId: parentId,
          milesBefore: r2(before),
          milesAfter: r2(afterTotal),
          dupesDeleted: dupes.length,
          moved: plans.map((pl) => ({ tripId: pl.child.id, points: pl.add.length, addedMiles: pl.extension })),
        },
      },
    });
  });
  fixed++;
  touchedUsers.set(userId, parent.startedAt);
}

if (APPLY && touchedUsers.size) {
  // Refresh the per-tax-year totals the fixed trips feed.
  const { upsertMileageSummary } = await import("../dist/services/mileage.js").catch(() => ({}));
  const { getTaxYear } = await import("@mileclear/shared");
  for (const [userId, startedAt] of touchedUsers) {
    if (upsertMileageSummary) await upsertMileageSummary(userId, getTaxYear(startedAt)).catch((e) => console.log("summary failed", userId, e.message));
  }
}

for (const line of review) console.log(line);
console.log(`\n${found} overlapped split trips in ${DAYS} days, ${review.length} left for review, ${fixed} fixed, ${r2(milesRemoved)} double-counted miles ${APPLY ? "removed" : "would be removed"}.`);
await p.$disconnect();
