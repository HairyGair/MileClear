// Trim or remove automatic trips that hold the SAME GPS fixes as another trip
// of the same driver.
//
// Why (16 Oct 2026): the Android app saved one drive's fixes into two to four
// trips (the same fixes, identical recordedAt to the millisecond). The server
// guard only refuses a copy when 90% of its fixes match, so a copy that also
// carries a further stretch was stored whole, and the shared miles count twice.
// The earlier script (dedupe-overlapping-trips.mjs) removes whole copies; this
// one handles the partial overlaps.
//
// Rules (all in scripts/lib/sharedFixes.mjs, tested with `node --test`):
//  - Automatic, non-phantom trips with an end, saved more than an hour ago, in
//    the last DAYS days. Pairs of one driver overlapping in time by over 60 s.
//  - A fix is shared when the other trip has a fix at the exact same recordedAt
//    millisecond within 50 m. A pair with fewer than 5 shared timestamps is
//    ignored. The synthetic departure anchor (first fix, accuracy exactly 50,
//    speed 0, 15-45 s before the next fix) never counts as shared.
//  - Per driver, trips are taken in createdAt order (a visit-auto-split tail
//    sorts with its parent's family) and compared with the trips kept so far,
//    so a triple or quadruple overlap resolves one at a time. The earliest
//    saved trip keeps its fixes.
//  - A later trip loses its shared fixes. If one stretch of >= 2 fixes and
//    >= 0.3 mi remains: TRIM (one shared fix is kept as the joining point, so
//    the route stays joined; distance = path of the remaining fixes, never
//    more than before; start/end times and points from the remainder; an
//    address is kept only if that end did not move, otherwise cleared for the
//    geocode backfill job). Less than that: ARCHIVE (deleted_trips, restorable
//    by support, then deleted). Several separate stretches: REVIEW.
//  - REVIEW, never changed: a shift, odometer readings, a driver-set
//    classification (classificationSource user / user_undo, or
//    classificationAutoAccepted set), a note / purpose / project / category,
//    a start or end edit (trip.start_edited / end_edited / start_time_edited
//    events, gpsQuality.endExtension), a split or join the driver made, a
//    QuickBooks sync, a diversion label, an anomaly, a shift suggestion naming
//    the trip, or a stored distance more than 0.5 mi above what its fixes
//    explain.
//
// DRY RUN by default: writes nothing to the database. It writes the plan file
// (--out, default ./dedupe-shared-fixes-plan.json). Apply needs the word
// "apply" AND --ids=<plan file>; only TRIM / ARCHIVE items in that file are
// done, so delete lines from the file to approve less. Each item is re-checked
// (updatedAt, coordinate count, the coordinates still belong to the trip, a
// keeper still exists) and skipped if anything moved.
//
// Run ON the server from ~/mileclear-app/apps/api after the API build:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/dedupe-shared-fixes.mjs [days] [userPrefix] [--out=plan.json]
//   node --env-file=... scripts/dedupe-shared-fixes.mjs [days] [userPrefix] apply --ids=plan.json
//
// Undo: each change logs one app event in the same transaction holding the old
// values and every removed coordinate (lat, lng, accuracy, speed, recordedAt):
// admin.trip_shared_fixes_trimmed or admin.trip_shared_fixes_archived. An
// archived trip can also be restored from the user detail page.
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  candidateTripIds, familyRoot, rowReviewReasons, planDriver, trimmedTripFields, sortFixes,
} from "./lib/sharedFixes.mjs";

const argv = process.argv.slice(2);
const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const APPLY = argv.includes("apply");
const positional = argv.filter((a) => !a.startsWith("--") && a !== "apply");
const dayArg = flag("days") ?? positional.find((a) => /^\d{1,3}$/.test(a));
const DAYS = Number(dayArg ?? 30);
const USER_PREFIX = flag("user") ?? positional.find((a) => a !== dayArg) ?? "";
const OUT = flag("out") ?? "./dedupe-shared-fixes-plan.json";
const IDS_FILE = flag("ids");
if (APPLY && !IDS_FILE) {
  console.error("apply needs --ids=<plan file from a dry run>. Nothing done.");
  process.exit(1);
}
if (!Number.isFinite(DAYS) || DAYS <= 0) {
  console.error("days must be a positive number.");
  process.exit(1);
}

const p = new PrismaClient();
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const iso = (d) => (d ? new Date(d).toISOString() : null);
const fmt = (d) => iso(d).slice(0, 16).replace("T", " ") + "Z";

// ---------------------------------------------------------------- APPLY ----
if (APPLY) {
  const { getTaxYear } = await import("@mileclear/shared");
  const { archiveTripBeforeDelete } = await import("../dist/services/tripArchive.js");
  const { upsertMileageSummary } = await import("../dist/services/mileage.js");

  const file = JSON.parse(readFileSync(IDS_FILE, "utf8"));
  const items = (Array.isArray(file) ? file : file.items ?? []).filter((i) => i.action === "TRIM" || i.action === "ARCHIVE");
  console.log(`APPLY: ${items.length} approved TRIM / ARCHIVE items from ${IDS_FILE}`);
  const summaries = new Set();
  let done = 0;
  for (const it of items) {
    const tag = `${it.tripId.slice(0, 8)} (${it.action})`;
    const trip = await p.trip.findFirst({ where: { id: it.tripId, userId: it.userId } });
    if (!trip) { console.log(`  skip ${tag}: trip gone`); continue; }
    if (trip.updatedAt.toISOString() !== it.guard.updatedAt) { console.log(`  skip ${tag}: trip changed since the plan`); continue; }
    const rowCount = await p.tripCoordinate.count({ where: { tripId: trip.id } });
    if (rowCount !== it.guard.coordinateRows) { console.log(`  skip ${tag}: coordinate count ${rowCount}, plan saw ${it.guard.coordinateRows}`); continue; }
    const keepers = await p.trip.count({ where: { id: { in: it.keeperIds }, userId: it.userId } });
    if (keepers === 0) { console.log(`  skip ${tag}: none of the keeper trips exist any more`); continue; }

    // The coordinates to remove, read back with their values so they are in the undo event.
    const removeIds = it.action === "ARCHIVE" ? null : it.removeFixIds;
    const removed = [];
    if (removeIds) {
      for (const c of chunks(removeIds, 500)) {
        removed.push(...(await p.tripCoordinate.findMany({
          where: { id: { in: c }, tripId: trip.id },
          select: { id: true, lat: true, lng: true, accuracy: true, speed: true, recordedAt: true },
        })));
      }
      if (removed.length !== removeIds.length) { console.log(`  skip ${tag}: ${removeIds.length - removed.length} planned coordinates are not on this trip`); continue; }
    }
    const oldValues = {
      distanceMiles: trip.distanceMiles, startedAt: iso(trip.startedAt), endedAt: iso(trip.endedAt),
      startLat: trip.startLat, startLng: trip.startLng, endLat: trip.endLat, endLng: trip.endLng,
      startAddress: trip.startAddress, endAddress: trip.endAddress, coordinateCount: trip.coordinateCount,
      routePolyline: trip.routePolyline, originalStartLat: trip.originalStartLat, originalStartLng: trip.originalStartLng,
    };

    try {
      if (it.action === "ARCHIVE") {
        const archivedId = await archiveTripBeforeDelete(trip.id, trip.userId, "admin"); // must succeed
        if (!archivedId) { console.log(`  skip ${tag}: gone before archive`); continue; }
        await p.$transaction(async (tx) => {
          await tx.trip.updateMany({ where: { userId: trip.userId, possibleDuplicateOfId: trip.id }, data: { possibleDuplicateOfId: null } });
          await tx.tripCoordinate.deleteMany({ where: { tripId: trip.id } });
          await tx.trip.delete({ where: { id: trip.id } });
          await tx.appEvent.create({ data: {
            type: "admin.trip_shared_fixes_archived", userId: trip.userId,
            metadata: { tripId: trip.id, deletedTripId: archivedId, keeperIds: it.keeperIds, sharedFixes: it.sharedFixes, old: oldValues, source: "dedupe-shared-fixes" },
          } });
        }, { timeout: 60000 });
        summaries.add(`${trip.userId}|${getTaxYear(trip.startedAt)}`);
      } else {
        const keepFixes = it.keepFixes.map((f) => ({ ...f }));
        const fields = trimmedTripFields(trip, keepFixes);
        const gq = trip.gpsQuality && typeof trip.gpsQuality === "object" ? trip.gpsQuality : {};
        const data = {
          ...fields,
          distanceMiles: it.newMiles,
          // The stored route drew the doubled drive; the breadcrumbs redraw it.
          routePolyline: null,
          // Create-time dedup keys on where the device said the trip began.
          originalStartLat: trip.originalStartLat ?? trip.startLat,
          originalStartLng: trip.originalStartLng ?? trip.startLng,
          gpsQuality: { ...gq, sharedFixesTrim: { at: new Date().toISOString(), removedFixes: removed.length, oldMiles: trip.distanceMiles, keeperIds: it.keeperIds } },
        };
        await p.$transaction(async (tx) => {
          for (const c of chunks(removed.map((r) => r.id), 500)) await tx.tripCoordinate.deleteMany({ where: { id: { in: c }, tripId: trip.id } });
          await tx.trip.update({ where: { id: trip.id }, data });
          await tx.appEvent.create({ data: {
            type: "admin.trip_shared_fixes_trimmed", userId: trip.userId,
            metadata: {
              tripId: trip.id, keeperIds: it.keeperIds, sharedFixes: it.sharedFixes, old: oldValues,
              new: { distanceMiles: it.newMiles, startedAt: iso(fields.startedAt), endedAt: iso(fields.endedAt), coordinateCount: fields.coordinateCount },
              removedCoordinates: removed.map((r) => ({ lat: r.lat, lng: r.lng, accuracy: r.accuracy, speed: r.speed, recordedAt: iso(r.recordedAt) })),
              source: "dedupe-shared-fixes",
            },
          } });
        }, { timeout: 60000 });
        summaries.add(`${trip.userId}|${getTaxYear(trip.startedAt)}`);
        summaries.add(`${trip.userId}|${getTaxYear(fields.startedAt)}`);
      }
      done++;
      console.log(`  done ${tag} ${trip.distanceMiles.toFixed(2)} -> ${it.action === "ARCHIVE" ? "deleted" : it.newMiles.toFixed(2)} mi`);
    } catch (err) {
      console.log(`  FAILED ${tag}: ${err?.message ?? err}`);
    }
  }
  for (const key of summaries) {
    const [userId, taxYear] = key.split("|");
    await upsertMileageSummary(userId, taxYear).catch((err) =>
      console.log(`  mileage summary failed for ${userId.slice(0, 8)} ${taxYear}: ${err?.message ?? err}`));
  }
  console.log(`Applied ${done} of ${items.length}; recalculated ${summaries.size} tax-year summaries.`);
  await p.$disconnect();
  process.exit(0);
}

// -------------------------------------------------------------- DRY RUN ----
const since = new Date(Date.now() - DAYS * 86400000);
const settledBefore = new Date(Date.now() - 60 * 60 * 1000);
const rows = await p.trip.findMany({
  where: {
    startedAt: { gte: since }, createdAt: { lte: settledBefore },
    isManualEntry: false, isPhantomTrip: false, endedAt: { not: null },
    ...(USER_PREFIX ? { userId: { startsWith: USER_PREFIX } } : {}),
  },
  select: {
    id: true, userId: true, shiftId: true, startedAt: true, endedAt: true, createdAt: true, updatedAt: true,
    distanceMiles: true, classification: true, classificationSource: true, classificationAutoAccepted: true,
    notes: true, businessPurpose: true, projectLabel: true, category: true, odometerStart: true, odometerEnd: true,
    gpsQuality: true, splitFromTripId: true, joinedCount: true,
  },
});
// no orderBy in SQL (sort memory); everything is sorted in JS
const cand = candidateTripIds(rows.map((t) => ({ id: t.id, userId: t.userId, startedAt: t.startedAt.getTime(), endedAt: t.endedAt.getTime() })));
const trips = rows.filter((t) => cand.has(t.id));
console.log(`DRY RUN: last ${DAYS} days, ${rows.length} automatic trips, ${trips.length} in overlapping pairs.`);

// Linked rows and driver edits, only for the candidates.
const ids = trips.map((t) => t.id);
const linked = new Map(); // tripId -> reasons
const addReason = (id, r) => { if (!linked.has(id)) linked.set(id, new Set()); linked.get(id).add(r); };
for (const c of chunks(ids, 500)) {
  const ph = c.map(() => "?").join(",");
  const ev = await p.$queryRawUnsafe(
    `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.tripId')) AS tid FROM app_events
     WHERE type IN ('trip.start_edited','trip.end_edited','trip.start_time_edited')
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.tripId')) IN (${ph})`, ...c);
  for (const r of ev) addReason(r.tid, "start or end edited by the driver");
  for (const r of await p.quickBooksSyncedTrip.findMany({ where: { tripId: { in: c } }, select: { tripId: true } })) addReason(r.tripId, "synced to QuickBooks");
  for (const r of await p.tripDiversion.findMany({ where: { tripId: { in: c } }, select: { tripId: true } })) addReason(r.tripId, "has a diversion label");
  for (const r of await p.tripAnomaly.findMany({ where: { tripId: { in: c } }, select: { tripId: true } })) addReason(r.tripId, "has an anomaly record");
}
const driverIds = [...new Set(trips.map((t) => t.userId))];
const idSet = new Set(ids);
for (const c of chunks(driverIds, 200)) {
  for (const s of await p.shiftSuggestion.findMany({ where: { userId: { in: c } }, select: { tripIdsJson: true } })) {
    for (const id of Array.isArray(s.tripIdsJson) ? s.tripIdsJson : []) if (idSet.has(id)) addReason(id, "named in a shift suggestion");
  }
}

// Coordinates in batches of 150 trips, no window functions, no joins.
const fixesByTrip = new Map();
for (const c of chunks(ids, 150)) {
  const cs = await p.tripCoordinate.findMany({
    where: { tripId: { in: c } },
    select: { id: true, tripId: true, lat: true, lng: true, speed: true, accuracy: true, recordedAt: true },
  });
  for (const x of cs) {
    if (!fixesByTrip.has(x.tripId)) fixesByTrip.set(x.tripId, []);
    fixesByTrip.get(x.tripId).push({ id: x.id, t: x.recordedAt.getTime(), lat: x.lat, lng: x.lng, speed: x.speed, accuracy: x.accuracy });
  }
}

const users = new Map();
for (const c of chunks(driverIds, 500)) {
  for (const u of await p.user.findMany({ where: { id: { in: c } }, select: { id: true, platformsSeen: true } })) users.set(u.id, u.platformsSeen || "unknown");
}

const byDriver = new Map();
for (const t of trips) {
  if (!byDriver.has(t.userId)) byDriver.set(t.userId, []);
  byDriver.get(t.userId).push(t);
}
const tripById = new Map(trips.map((t) => [t.id, t]));
const planItems = [];
for (const [userId, list] of byDriver) {
  const input = list.map((t) => ({
    id: t.id, createdAt: t.createdAt.getTime(), startedAt: t.startedAt.getTime(), endedAt: t.endedAt.getTime(),
    distanceMiles: t.distanceMiles, family: familyRoot(t.gpsQuality, t.id),
    reviewReasons: [...rowReviewReasons(t), ...(linked.get(t.id) ?? [])],
    fixes: fixesByTrip.get(t.id) ?? [],
  }));
  for (const it of planDriver(input)) {
    const t = tripById.get(it.tripId);
    planItems.push({
      ...it, userId,
      startedAt: iso(t.startedAt), endedAt: iso(t.endedAt),
      guard: { updatedAt: iso(t.updatedAt), coordinateRows: (fixesByTrip.get(t.id) ?? []).length },
      keepFixes: it.keepFixes?.map((f) => ({ id: f.id, t: f.t, lat: f.lat, lng: f.lng, speed: f.speed, accuracy: f.accuracy })),
    });
  }
}

writeFileSync(OUT, JSON.stringify({ createdAt: new Date().toISOString(), days: DAYS, items: planItems }, null, 1));

// Summary
const act = (a) => planItems.filter((i) => i.action === a);
const removedMiles = (i) => (i.action === "ARCHIVE" ? i.oldMiles : i.action === "TRIM" ? i.oldMiles - i.newMiles : 0);
const sum = (arr) => arr.reduce((a, i) => a + removedMiles(i), 0);
const changing = [...act("TRIM"), ...act("ARCHIVE")];
console.log(`\nPlanned: ${act("TRIM").length} TRIM, ${act("ARCHIVE").length} ARCHIVE, ${act("REVIEW").length} REVIEW (not changed).`);
console.log(`Miles removed if all approved: ${sum(changing).toFixed(1)} mi across ${new Set(changing.map((i) => i.userId)).size} drivers.`);
const byPlatform = new Map();
for (const i of changing) {
  const k = users.get(i.userId) ?? "unknown";
  const e = byPlatform.get(k) ?? { drivers: new Set(), trips: 0, miles: 0 };
  e.drivers.add(i.userId); e.trips++; e.miles += removedMiles(i);
  byPlatform.set(k, e);
}
console.log("By platform (user.platformsSeen):");
for (const [k, e] of byPlatform) console.log(`  ${k}: ${e.drivers.size} drivers, ${e.trips} trips, ${e.miles.toFixed(1)} mi`);
const reviewReasons = {};
for (const i of act("REVIEW")) for (const r of i.reviewReasons.length ? i.reviewReasons : [i.reason]) reviewReasons[r.replace(/[\d.]+/g, "N")] = (reviewReasons[r.replace(/[\d.]+/g, "N")] ?? 0) + 1;
console.log("Review reasons:", JSON.stringify(reviewReasons));

console.log("\nOne line per planned change:");
const order = { ARCHIVE: 0, TRIM: 1, REVIEW: 2 };
for (const i of [...planItems].sort((a, b) => order[a.action] - order[b.action] || a.userId.localeCompare(b.userId) || a.startedAt.localeCompare(b.startedAt))) {
  const newTxt = i.action === "ARCHIVE" ? "deleted" : `${i.newMiles.toFixed(2)}`;
  console.log(
    `  ${i.action.padEnd(7)} user ${i.userId.slice(0, 8)} trip ${i.tripId.slice(0, 8)} keeper ${i.keeperIds.map((k) => k.slice(0, 8)).join("+")} ` +
    `${fmt(i.startedAt)}-${i.endedAt.slice(11, 16)}Z ${i.oldMiles.toFixed(2)} -> ${newTxt} mi | ${i.reason}`
  );
}
console.log(`\nPlan written to ${OUT}. To apply a reviewed (and, if you like, shortened) copy:`);
console.log(`  node --env-file=... scripts/dedupe-shared-fixes.mjs ${DAYS}${USER_PREFIX ? " " + USER_PREFIX : ""} apply --ids=${OUT}`);
await p.$disconnect();
