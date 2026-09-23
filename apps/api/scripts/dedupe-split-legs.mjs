// Remove split legs the automatic stop-split created twice (race fixed in
// 8295aecf, 23 Sep 2026: two coordinate appends milliseconds apart each ran a
// split from the same breadcrumbs and both created the leg).
//
// A duplicate group = auto-split legs of the same parent trip, for the same
// user, starting at the same instant. In each group the leg with the most
// breadcrumb rows is kept (ties: the earliest created). Another leg is only
// removed when it really is the same drive: end within 60 s and distance
// within 5% of the keeper. Anything else in a group is reported, not touched.
// A leg the driver has since edited (classification, purpose, notes or
// platform differing from the keeper) is also reported and left alone.
//
// Removal uses the same path as a driver's own delete: archived to
// deleted_trips first (restorable by support), then deleted, then the
// mileage summary for that tax year recalculated. Here the archive must
// succeed or the leg is left in place.
//
// Dry run by default. Run ON the server from ~/mileclear-app/apps/api:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/dedupe-split-legs.mjs [--apply]
import { PrismaClient } from "@prisma/client";
import { getTaxYear } from "@mileclear/shared";
import { archiveTripBeforeDelete } from "../dist/services/tripArchive.js";
import { upsertMileageSummary } from "../dist/services/mileage.js";
import { logEvent } from "../dist/services/appEvents.js";

const APPLY = process.argv.includes("--apply");
const p = new PrismaClient();

const legs = (await p.$queryRaw`
  SELECT id, userId, startedAt, endedAt, createdAt, distanceMiles, classification,
         businessPurpose, notes, platformTag, isPhantomTrip,
         JSON_UNQUOTE(JSON_EXTRACT(gpsQuality, '$.autoSplitFromTripId')) AS parentId
  FROM trips
  WHERE createdAt >= '2026-08-20'
    AND JSON_EXTRACT(gpsQuality, '$.autoSplitFromTripId') IS NOT NULL`).map((t) => ({
  ...t,
  distanceMiles: Number(t.distanceMiles),
  gpsQuality: { autoSplitFromTripId: t.parentId },
}));

const groups = new Map();
for (const t of legs) {
  const key = `${t.userId}|${t.gpsQuality.autoSplitFromTripId}|${t.startedAt.getTime()}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(t);
}

const remove = [];
const leftAlone = [];
for (const g of groups.values()) {
  if (g.length < 2) continue;
  for (const t of g) t.rows = await p.tripCoordinate.count({ where: { tripId: t.id } });
  g.sort((a, b) => b.rows - a.rows || a.createdAt - b.createdAt);
  const keep = g[0];
  for (const t of g.slice(1)) {
    const endGap = keep.endedAt && t.endedAt ? Math.abs(keep.endedAt - t.endedAt) / 1000 : Infinity;
    const distGap = keep.distanceMiles > 0 ? Math.abs(keep.distanceMiles - t.distanceMiles) / keep.distanceMiles : 1;
    const edited =
      t.classification !== keep.classification ||
      (t.businessPurpose ?? "") !== (keep.businessPurpose ?? "") ||
      (t.notes ?? "") !== (keep.notes ?? "") ||
      (t.platformTag ?? "") !== (keep.platformTag ?? "");
    const row = { keep, dup: t, endGap, distGap, edited };
    if (endGap <= 60 && distGap <= 0.05 && !edited) remove.push(row);
    else leftAlone.push(row);
  }
}

const fmt = (d) => d.toISOString().slice(0, 16).replace("T", " ");
const byUser = new Map();
for (const r of remove) byUser.set(r.dup.userId, (byUser.get(r.dup.userId) ?? 0) + r.dup.distanceMiles);
console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${legs.length} split legs scanned, ${remove.length} duplicates to remove across ${byUser.size} drivers, ${remove.reduce((a, r) => a + r.dup.distanceMiles, 0).toFixed(1)} mi`);
for (const r of remove) {
  console.log(`  remove ${r.dup.id.slice(0, 8)} user ${r.dup.userId.slice(0, 8)} ${fmt(r.dup.startedAt)}Z ${r.dup.distanceMiles.toFixed(2)} mi rows ${r.dup.rows} ${r.dup.classification} | keep ${r.keep.id.slice(0, 8)} rows ${r.keep.rows} ${r.keep.distanceMiles.toFixed(2)} mi | created ${Math.round(Math.abs(r.dup.createdAt - r.keep.createdAt) / 1000)}s apart`);
}
console.log(`Left alone (not clearly the same drive, or edited): ${leftAlone.length}`);
for (const r of leftAlone) {
  console.log(`  skip ${r.dup.id.slice(0, 8)} user ${r.dup.userId.slice(0, 8)} ${fmt(r.dup.startedAt)}Z ${r.dup.distanceMiles.toFixed(2)} vs ${r.keep.distanceMiles.toFixed(2)} mi, end gap ${Number.isFinite(r.endGap) ? Math.round(r.endGap) + "s" : "n/a"}${r.edited ? ", edited by driver" : ""}`);
}

if (APPLY) {
  const summaries = new Set();
  let done = 0;
  for (const r of remove) {
    let archivedId = null;
    try {
      archivedId = await archiveTripBeforeDelete(r.dup.id, r.dup.userId, "admin");
    } catch (err) {
      console.log(`  archive FAILED for ${r.dup.id}, left in place: ${err?.message ?? err}`);
      continue;
    }
    if (!archivedId) { console.log(`  ${r.dup.id} gone already`); continue; }
    await p.trip.delete({ where: { id: r.dup.id } });
    logEvent("trip.duplicate_split_leg_removed", r.dup.userId, { tripId: r.dup.id, keptTripId: r.keep.id, deletedTripId: archivedId, distanceMiles: r.dup.distanceMiles });
    summaries.add(`${r.dup.userId}|${getTaxYear(r.dup.startedAt)}`);
    done++;
  }
  for (const s of summaries) {
    const [userId, taxYear] = s.split("|");
    await upsertMileageSummary(userId, taxYear);
  }
  console.log(`Removed ${done}; recalculated ${summaries.size} mileage summaries.`);
}
await p.$disconnect();
