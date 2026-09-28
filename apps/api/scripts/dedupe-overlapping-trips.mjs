// Remove automatic trips that are a second recording of a drive the driver
// already has.
//
// Why (28 Sep 2026): a read-only sweep found 278 pairs of automatic trips on
// 87 drivers overlapping by 80% or more in the 14 days before, roughly 2,100
// miles sitting in the shorter trip of each pair. Most were a shift recording
// and the automatic engine's copy of the same fixes both saved: the shift lock
// was released without its breadcrumbs being processed
// (stale_active_shift_cleared "active_too_long"), the app-open orphan sweep
// saved the engine's copy, and the shift saved its own copy when it was
// finally closed. The rest were the same drive finalized twice, and legs the
// visit auto-split created twice before the 23 Sep race fix. The causes are
// fixed in the app (finalize drops fixes a shift or saved trip already owns)
// and on the server (POST /trips refuses a recording whose fixes are already
// saved); this clears what was saved before that.
//
// What counts as a copy is decided by services/recordedDuplicate.ts
// (planCleanup), fix by fix: 90% of a trip's breadcrumbs must have a
// counterpart within 2 minutes and 150 m on a trip that is being kept. Times
// and end points alone never decide it. A copy is only removed when nothing
// the driver gave it would be lost: not classified differently from its
// keeper, no note / purpose / platform / project / odometer the keeper lacks,
// start and end never edited by the driver, not a leg of a split they made,
// and no more distance than the keeper (plus a small slack). Anything else is
// listed as skipped and left alone. Manual entries and phantoms are never
// considered, and neither is anything saved in the last hour.
//
// Removal uses the same path as a driver's own delete: archived to
// deleted_trips (deletedBy "admin", restorable by support from the user
// detail page), then deleted, then the mileage summary recalculated for each
// affected tax year. The archive must succeed or the trip is left in place.
// Each removal logs trip.duplicate_removed. Any trip still pointing at a
// removed copy through possibleDuplicateOfId has that pointer cleared, and a
// keeper with no shift takes the copy's shift, so the shift scorecard still
// counts the drive.
//
// Dry run by default. Run ON the server from ~/mileclear-app/apps/api after
// the build that contains services/recordedDuplicate.js is deployed:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/dedupe-overlapping-trips.mjs
//   APPLY=1 node --env-file=... scripts/dedupe-overlapping-trips.mjs
// Env: DAYS (default 60, the archive's retention window), ONLY_USER (id prefix, to
// run for one driver), RULE_PATH (load the rule from elsewhere, for a dry run
// before the build is deployed).
import { PrismaClient } from "@prisma/client";

const APPLY = process.env.APPLY === "1";
const DAYS = Number(process.env.DAYS ?? 60);
const ONLY_USER = process.env.ONLY_USER ?? "";
const RULE_PATH = process.env.RULE_PATH ?? "../dist/services/recordedDuplicate.js";
const { planCleanup } = await import(RULE_PATH);

const p = new PrismaClient();
const since = new Date(Date.now() - DAYS * 86400000);
const settledBefore = new Date(Date.now() - 60 * 60 * 1000);

const trips = await p.trip.findMany({
  where: {
    startedAt: { gte: since },
    createdAt: { lte: settledBefore },
    isManualEntry: false,
    isPhantomTrip: false,
    endedAt: { not: null },
    ...(ONLY_USER ? { userId: { startsWith: ONLY_USER } } : {}),
  },
  select: {
    id: true, userId: true, shiftId: true, startedAt: true, endedAt: true, createdAt: true,
    distanceMiles: true, classification: true, classificationSource: true, notes: true,
    businessPurpose: true, platformTag: true, projectLabel: true, category: true,
    odometerStart: true, odometerEnd: true, gpsQuality: true, coordinateCount: true,
  },
  orderBy: { startedAt: "asc" },
});

// Overlap clusters per driver: trips whose windows touch (with 2 minutes of
// slack, the rule's own time window) are judged together.
const SLACK = 2 * 60 * 1000;
const clusters = [];
const byUser = new Map();
for (const t of trips) {
  if (!byUser.has(t.userId)) byUser.set(t.userId, []);
  byUser.get(t.userId).push(t);
}
for (const list of byUser.values()) {
  let cur = [];
  let curEnd = 0;
  for (const t of list) {
    if (cur.length && t.startedAt.getTime() - SLACK <= curEnd) {
      cur.push(t);
      curEnd = Math.max(curEnd, t.endedAt.getTime());
    } else {
      if (cur.length > 1) clusters.push(cur);
      cur = [t];
      curEnd = t.endedAt.getTime();
    }
  }
  if (cur.length > 1) clusters.push(cur);
}

// A trip the driver re-timed or split themselves is theirs; never a copy.
const clusterIds = clusters.flat().map((t) => t.id);
const edited = new Set();
for (let i = 0; i < clusterIds.length; i += 500) {
  const chunk = clusterIds.slice(i, i + 500);
  const rows = await p.$queryRawUnsafe(
    `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.tripId')) AS tid FROM app_events
     WHERE type IN ('trip.start_edited', 'trip.end_edited')
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.tripId')) IN (${chunk.map(() => "?").join(",")})`,
    ...chunk
  );
  for (const r of rows) edited.add(r.tid);
}

const remove = [];
const skipped = [];
for (const cluster of clusters) {
  const withFixes = [];
  for (const t of cluster) {
    const coords = await p.tripCoordinate.findMany({
      where: { tripId: t.id },
      select: { lat: true, lng: true, recordedAt: true },
    });
    withFixes.push({
      ...t,
      driverEdited: edited.has(t.id) || Boolean(t.gpsQuality && t.gpsQuality.splitFromTripId),
      fixes: coords.map((c) => ({ t: c.recordedAt.getTime(), lat: c.lat, lng: c.lng })),
    });
  }
  const plan = planCleanup(withFixes);
  for (const r of plan.remove) remove.push({ ...r, userId: cluster[0].userId });
  for (const s of plan.skipped) skipped.push({ ...s, userId: cluster[0].userId });
}

const fmt = (d) => d.toISOString().slice(0, 16).replace("T", " ");
const win = (t) => `${fmt(t.startedAt)}-${t.endedAt.toISOString().slice(11, 16)}Z`;
const line = (r) =>
  `${r.trip.id.slice(0, 8)} user ${r.userId.slice(0, 8)} ${win(r.trip)} ${r.trip.distanceMiles.toFixed(1)} mi ${r.trip.fixes.length} fixes ${r.trip.classification}${r.trip.shiftId ? " shift" : ""}` +
  ` | covered ${(r.coverage.share * 100).toFixed(0)}% by ${r.keeper.id.slice(0, 8)} ${win(r.keeper)} ${r.keeper.distanceMiles.toFixed(1)} mi ${r.keeper.fixes.length} fixes ${r.keeper.classification}${r.keeper.shiftId ? " shift" : ""}` +
  ` | saved ${Math.round(Math.abs(r.trip.createdAt - r.keeper.createdAt) / 60000)} min apart`;

const miles = remove.reduce((a, r) => a + r.trip.distanceMiles, 0);
const drivers = new Set(remove.map((r) => r.userId));
const shiftPairs = remove.filter((r) => Boolean(r.trip.shiftId) !== Boolean(r.keeper.shiftId)).length;
const skipCounts = {};
for (const s of skipped) skipCounts[s.reason] = (skipCounts[s.reason] ?? 0) + 1;
console.log(
  `${APPLY ? "APPLY" : "DRY RUN"}: last ${DAYS} days, ${trips.length} recorded trips, ${clusters.length} overlap clusters (${clusters.flat().length} trips).`
);
console.log(
  `Copies to remove: ${remove.length} across ${drivers.size} drivers, ${miles.toFixed(1)} mi (${shiftPairs} are a shift recording paired with an automatic one).`
);
console.log(`Copies left alone: ${skipped.length} ${JSON.stringify(skipCounts)}`);

const byDriver = new Map();
for (const r of remove) byDriver.set(r.userId, (byDriver.get(r.userId) ?? 0) + r.trip.distanceMiles);
console.log("\nMiles removed per driver (largest first):");
for (const [u, m] of [...byDriver].sort((a, b) => b[1] - a[1])) console.log(`  ${u.slice(0, 8)} ${m.toFixed(1)} mi`);

console.log("\nOutliers worth a look:");
const outliers = [
  ...[...remove].sort((a, b) => b.trip.distanceMiles - a.trip.distanceMiles).slice(0, 5).map((r) => ["largest copy", r]),
  ...remove.filter((r) => r.trip.distanceMiles > r.keeper.distanceMiles).slice(0, 5).map((r) => ["copy longer than keeper", r]),
  ...remove.filter((r) => r.coverage.share < 0.95).slice(0, 5).map((r) => ["coverage under 95%", r]),
  ...remove.filter((r) => r.keeper.endedAt - r.keeper.startedAt > 12 * 3600 * 1000).slice(0, 5).map((r) => ["keeper spans 12h+", r]),
  ...remove.filter((r) => r.trip.fixes.length < 5).slice(0, 5).map((r) => ["copy under 5 fixes", r]),
];
for (const [why, r] of outliers) console.log(`  [${why}] ${line(r)}`);

console.log("\nEvery proposed removal:");
for (const r of remove) console.log(`  remove ${line(r)}`);
console.log("\nLeft alone:");
for (const s of skipped) console.log(`  skip (${s.reason}) ${line(s)}`);

if (APPLY) {
  const { getTaxYear } = await import("@mileclear/shared");
  const { archiveTripBeforeDelete } = await import("../dist/services/tripArchive.js");
  const { upsertMileageSummary } = await import("../dist/services/mileage.js");
  const { logEvent } = await import("../dist/services/appEvents.js");
  const summaries = new Set();
  let done = 0;
  for (const r of remove) {
    const { trip, keeper, userId, coverage } = r;
    let archivedId = null;
    try {
      archivedId = await archiveTripBeforeDelete(trip.id, userId, "admin");
    } catch (err) {
      console.log(`  archive failed, left in place: ${trip.id} ${err?.message ?? err}`);
      continue;
    }
    if (!archivedId) {
      console.log(`  gone already, skipped: ${trip.id}`);
      continue;
    }
    if (trip.shiftId && !keeper.shiftId) {
      await p.trip.updateMany({ where: { id: keeper.id, shiftId: null }, data: { shiftId: trip.shiftId } });
    }
    const cleared = await p.trip.updateMany({
      where: { userId, possibleDuplicateOfId: trip.id },
      data: { possibleDuplicateOfId: null },
    });
    await p.trip.delete({ where: { id: trip.id } });
    summaries.add(`${userId}|${getTaxYear(trip.startedAt)}`);
    logEvent("trip.duplicate_removed", userId, {
      tripId: trip.id,
      keptTripId: keeper.id,
      deletedTripId: archivedId,
      distanceMiles: trip.distanceMiles,
      keptDistanceMiles: keeper.distanceMiles,
      coveredShare: Math.round(coverage.share * 1000) / 1000,
      fixes: trip.fixes.length,
      pointersCleared: cleared.count,
      source: "dedupe-overlapping-trips",
    });
    done++;
  }
  for (const key of summaries) {
    const [userId, taxYear] = key.split("|");
    await upsertMileageSummary(userId, taxYear).catch((err) =>
      console.log(`  mileage summary failed for ${userId.slice(0, 8)} ${taxYear}: ${err?.message ?? err}`)
    );
  }
  console.log(`\nRemoved ${done} of ${remove.length}; recalculated ${summaries.size} tax-year summaries.`);
  // logEvent is fire-and-forget; give the last writes a moment to land.
  await new Promise((r) => setTimeout(r, 3000));
}
await p.$disconnect();
