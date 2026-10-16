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
//  - A fix is COVERED when it is exact-shared with a kept trip (same recordedAt
//    ms, within 50 m, from a pair with 5+ shared timestamps; the departure
//    anchor never counts) OR it lies between two of that keeper's OWN fixes that
//    are each within 5 minutes of it (never its saved startedAt / endedAt,
//    which a long Start Trip or an end edit can stretch). Uncovered fixes form contiguous stretches; anchor-shaped
//    fixes (accuracy 50, speed 0) neither break a stretch nor make one. A
//    stretch's miles = its own path plus the joining segment to the adjacent
//    covered fix; it is REAL at 0.3 mi or more.
//    0 real stretches: ARCHIVE (deleted_trips, restorable, then deleted).
//    Exactly 1: TRIM to it (one covered fix kept as the joining point; distance
//    = path of what is kept, never more than before; times and end points from
//    the remainder; an address is kept only if that end did not move; dropped
//    small stretches and their miles are logged). 2+: REVIEW.
//  - Per driver, trips go in createdAt order (a visit-auto-split tail sorts
//    with its parent's family) against the trips kept so far, so triple and
//    quadruple overlaps resolve one at a time.
//  - The driver's classification is not lost: when the copy's classification
//    was set by the driver (classificationSource user / user_undo, or
//    classificationAutoAccepted set) and the keeper is unclassified, the same,
//    or only auto-classified, the classification, its source and any platform
//    tag are copied onto the keeper in the same transaction (old keeper values
//    go in the undo event). Both set differently by the driver: REVIEW.
//  - A shift suggestion naming an archived trip is cleared (proposed) or
//    repointed to the keeper (accepted / dismissed); possibleDuplicateOfId
//    pointers are cleared.
//  - A real stretch needs 5+ fixes over 60+ s, else REVIEW. Anchor-shaped fixes
//    are dropped from the kept route (except one directly before the stretch,
//    within 60 s), so the new distance is the kept path.
//  - Timing is not trusted alone: REVIEW when the copy's path over its covered
//    fixes exceeds the keepers' own path over the same time by 0.5 mi or 10%,
//    or when timing-only covered fixes outnumber exact-shared ones 2:1.
//  - Any business / non-business disagreement between copy and keeper, whatever
//    the source (mileage counts classification === "business"): REVIEW.
//  - REVIEW, never changed: a shift, odometer readings, a note / purpose /
//    project / category, more than 6000 coordinate rows (an archive holds 6000),
//    a month a team manager approved (TeamApproval, driver + "YYYY-MM"), a start or end edit (trip.start_edited / end_edited /
//    start_time_edited events, gpsQuality.endExtension), a split or join the
//    driver made, a QuickBooks sync, a diversion label, an anomaly, or a
//    stored distance more than 0.5 mi above what its fixes explain.
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
// Undo: each change logs one app event in the same transaction:
// admin.trip_shared_fixes_trimmed (the complete old trip row, every removed
// coordinate with its id) or admin.trip_shared_fixes_archived (the complete old
// row, the archive id, shift suggestions as they were). Both hold the keeper's
// old classification fields. Reverse them with scripts/undo-dedupe-shared-fixes.mjs
// <event ids> [apply]. Apply order matters: do not re-sort the plan file.
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
// ORDER MATTERS: items are applied in the order they sit in the plan file. The
// planner compared each copy with what its keepers would look like after their
// own changes, so a keeper's trim comes before the copies that rest on it. Do
// not re-sort the file; delete items, never move them. A driver's items sit
// together, and that driver's mileage summaries are recalculated as soon as
// their items are done.
if (APPLY) {
  const { getTaxYear } = await import("@mileclear/shared");
  const { archiveTripBeforeDelete } = await import("../dist/services/tripArchive.js");
  const { upsertMileageSummary } = await import("../dist/services/mileage.js");

  const J = (o) => JSON.parse(JSON.stringify(o)); // dates to ISO strings, for the undo events
  const file = JSON.parse(readFileSync(IDS_FILE, "utf8"));
  const items = (Array.isArray(file) ? file : file.items ?? []).filter((i) => i.action === "TRIM" || i.action === "ARCHIVE");
  console.log(`APPLY: ${items.length} approved TRIM / ARCHIVE items from ${IDS_FILE}`);
  const touched = new Set(); // trips this run already trimmed, or put a classification on
  let summaries = new Set();
  let curUser = null;
  let done = 0;
  let summariesDone = 0;
  const flush = async () => {
    for (const key of summaries) {
      const [userId, taxYear] = key.split("|");
      await upsertMileageSummary(userId, taxYear).catch((err) =>
        console.log(`  mileage summary failed for ${userId.slice(0, 8)} ${taxYear}: ${err?.message ?? err}`));
      summariesDone++;
    }
    summaries = new Set();
  };

  for (const it of items) {
    if (curUser && it.userId !== curUser) await flush();
    curUser = it.userId;
    const tag = `${it.tripId.slice(0, 8)} (${it.action})`;
    const trip = await p.trip.findFirst({ where: { id: it.tripId, userId: it.userId } });
    if (!trip) { console.log(`  skip ${tag}: trip gone`); continue; }
    if (trip.updatedAt.toISOString() !== it.guard.updatedAt) { console.log(`  skip ${tag}: trip changed since the plan`); continue; }
    const rowCount = await p.tripCoordinate.count({ where: { tripId: trip.id } });
    if (rowCount !== it.guard.coordinateRows) { console.log(`  skip ${tag}: coordinate count ${rowCount}, plan saw ${it.guard.coordinateRows}`); continue; }
    if (rowCount > 6000) { console.log(`  skip ${tag}: ${rowCount} coordinate rows is more than an archive holds`); continue; }

    // EVERY keeper must still exist and be as planned (keepers this run already changed excepted).
    if (!Array.isArray(it.keeperGuards) || it.keeperGuards.length !== it.keeperIds.length) { console.log(`  skip ${tag}: plan has no keeper guards`); continue; }
    let keepersOk = true;
    for (const g of it.keeperGuards) {
      const k = await p.trip.findFirst({ where: { id: g.id, userId: it.userId }, select: { id: true, updatedAt: true } });
      if (!k) { console.log(`  skip ${tag}: keeper ${g.id.slice(0, 8)} is gone`); keepersOk = false; break; }
      if (touched.has(g.id)) continue;
      if (k.updatedAt.toISOString() !== g.updatedAt) { console.log(`  skip ${tag}: keeper ${g.id.slice(0, 8)} changed since the plan`); keepersOk = false; break; }
      const kRows = await p.tripCoordinate.count({ where: { tripId: g.id } });
      if (kRows !== g.coordinateRows) { console.log(`  skip ${tag}: keeper ${g.id.slice(0, 8)} has ${kRows} coordinates, plan saw ${g.coordinateRows}`); keepersOk = false; break; }
    }
    if (!keepersOk) continue;

    // The coordinates to remove, read back with their values for the undo event.
    const removed = [];
    if (it.action === "TRIM") {
      for (const c of chunks(it.removeFixIds, 500)) {
        removed.push(...(await p.tripCoordinate.findMany({
          where: { id: { in: c }, tripId: trip.id },
          select: { id: true, lat: true, lng: true, accuracy: true, speed: true, recordedAt: true },
        })));
      }
      if (removed.length !== it.removeFixIds.length) { console.log(`  skip ${tag}: ${it.removeFixIds.length - removed.length} planned coordinates are not on this trip`); continue; }
    }
    const oldRow = J(trip); // every column, so a hand restore is exact

    // The driver's classification travels to the keeper; the keeper must still be as planned.
    const keeperSelect = { id: true, classification: true, classificationSource: true, classificationAutoAccepted: true, platformTag: true, autoClassifiedAt: true, preAutoClassification: true };
    const keeperStillAsPlanned = async (db) => {
      if (!it.keeperUpdate) return { ok: true, old: null };
      const k = await db.trip.findFirst({ where: { id: it.keeperUpdate.keeperId, userId: trip.userId }, select: keeperSelect });
      const o = it.keeperUpdate.old;
      const ok = k && k.classification === o.classification && (k.classificationSource ?? null) === (o.classificationSource ?? null) && (k.platformTag ?? null) === (o.platformTag ?? null);
      return { ok: Boolean(ok), old: k };
    };
    const carryToKeeper = async (tx) => {
      if (!it.keeperUpdate) return null;
      const { ok, old } = await keeperStillAsPlanned(tx);
      if (!ok) throw new Error("keeper changed since the plan");
      await tx.trip.update({ where: { id: old.id }, data: { ...it.keeperUpdate.set, autoClassifiedAt: null } });
      return J({ keeperId: old.id, old, set: it.keeperUpdate.set });
    };
    // Shift suggestions are system-made: a proposed one naming an archived trip is
    // cleared (the scan proposes it again), any other has the id swapped for the main keeper's.
    const mainKeeper = it.mainKeeperId ?? it.keeperIds[0];
    const fixShiftSuggestions = async (tx) => {
      const out = [];
      const all = await tx.shiftSuggestion.findMany({ where: { userId: trip.userId } });
      for (const s of all) {
        const list = Array.isArray(s.tripIdsJson) ? s.tripIdsJson : [];
        if (!list.includes(trip.id) && !s.key.split(":").includes(trip.id)) continue;
        if (s.status === "proposed") {
          await tx.shiftSuggestion.delete({ where: { id: s.id } });
          out.push({ change: "cleared", row: J(s) });
        } else {
          const next = [...new Set(list.map((x) => (x === trip.id ? mainKeeper : x)))];
          await tx.shiftSuggestion.update({ where: { id: s.id }, data: { tripIdsJson: next } });
          out.push({ change: "repointed", row: J(s), after: next });
        }
      }
      return out;
    };

    let archivedId = null;
    let committed = false;
    try {
      if (!(await keeperStillAsPlanned(p)).ok) { console.log(`  skip ${tag}: keeper ${it.keeperUpdate.keeperId.slice(0, 8)} changed since the plan`); continue; }
      if (it.action === "ARCHIVE") {
        archivedId = await archiveTripBeforeDelete(trip.id, trip.userId, "admin"); // must succeed
        if (!archivedId) { console.log(`  skip ${tag}: gone before archive`); continue; }
        await p.$transaction(async (tx) => {
          const keeperOld = await carryToKeeper(tx);
          const suggestions = await fixShiftSuggestions(tx);
          const pointing = await tx.trip.findMany({ where: { userId: trip.userId, possibleDuplicateOfId: trip.id }, select: { id: true } });
          await tx.trip.updateMany({ where: { userId: trip.userId, possibleDuplicateOfId: trip.id }, data: { possibleDuplicateOfId: null } });
          await tx.tripCoordinate.deleteMany({ where: { tripId: trip.id } });
          await tx.trip.delete({ where: { id: trip.id } });
          await tx.appEvent.create({ data: {
            type: "admin.trip_shared_fixes_archived", userId: trip.userId,
            metadata: {
              tripId: trip.id, deletedTripId: archivedId, keeperIds: it.keeperIds, mainKeeperId: mainKeeper, sharedFixes: it.sharedFixes,
              oldRow, coordinateRows: rowCount, droppedStretches: it.droppedStretches ?? [],
              keeperClassification: keeperOld, shiftSuggestions: suggestions, clearedPointerTripIds: pointing.map((x) => x.id),
              source: "dedupe-shared-fixes",
            },
          } });
        }, { timeout: 60000 });
        committed = true;
        if (it.keeperUpdate) touched.add(it.keeperUpdate.keeperId);
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
          const keeperOld = await carryToKeeper(tx);
          for (const c of chunks(removed.map((r) => r.id), 500)) await tx.tripCoordinate.deleteMany({ where: { id: { in: c }, tripId: trip.id } });
          const after = await tx.trip.update({ where: { id: trip.id }, data, select: { updatedAt: true } });
          await tx.appEvent.create({ data: {
            type: "admin.trip_shared_fixes_trimmed", userId: trip.userId,
            metadata: J({
              // the undo refuses to overwrite the row if it has changed since this
              postTrimUpdatedAt: after.updatedAt,
              tripId: trip.id, keeperIds: it.keeperIds, mainKeeperId: mainKeeper, sharedFixes: it.sharedFixes, oldRow,
              droppedStretches: it.droppedStretches ?? [], keeperClassification: keeperOld,
              new: { distanceMiles: it.newMiles, startedAt: fields.startedAt, endedAt: fields.endedAt, coordinateCount: fields.coordinateCount },
              removedCoordinates: removed.map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, accuracy: r.accuracy, speed: r.speed, recordedAt: r.recordedAt })),
              source: "dedupe-shared-fixes",
            }),
          } });
        }, { timeout: 60000 });
        committed = true;
        touched.add(trip.id);
        if (it.keeperUpdate) touched.add(it.keeperUpdate.keeperId);
        summaries.add(`${trip.userId}|${getTaxYear(trip.startedAt)}`);
        summaries.add(`${trip.userId}|${getTaxYear(fields.startedAt)}`);
      }
      done++;
      console.log(`  done ${tag} ${trip.distanceMiles.toFixed(2)} -> ${it.action === "ARCHIVE" ? "deleted" : it.newMiles.toFixed(2)} mi`);
    } catch (err) {
      console.log(`  FAILED ${tag}: ${err?.message ?? err}`);
      if (archivedId && !committed) {
        // The change rolled back but the archive copy was already written: take the stray copy out.
        try {
          // A commit that went through but errored on the way back must keep its archive.
          const stillThere = await p.trip.findFirst({ where: { id: trip.id }, select: { id: true } });
          if (!stillThere) {
            console.log(`  the trip ${trip.id.slice(0, 8)} is gone, so the change DID commit: archive row ${archivedId.slice(0, 8)} kept`);
            summaries.add(`${trip.userId}|${getTaxYear(trip.startedAt)}`);
            continue;
          }
          await p.deletedTrip.delete({ where: { id: archivedId } });
          await new Promise((r) => setTimeout(r, 1000)); // trip.archived_on_delete is fire-and-forget
          const ev = await p.appEvent.deleteMany({ where: { type: "trip.archived_on_delete", userId: trip.userId, metadata: { path: "$.deletedTripId", equals: archivedId } } });
          console.log(`  removed the stray archive row ${archivedId.slice(0, 8)} and ${ev.count} archived_on_delete event(s); the trip is untouched`);
        } catch (e2) {
          console.log(`  COULD NOT remove the stray archive row ${archivedId} (trip ${trip.id}): ${e2?.message ?? e2}. Delete it by hand.`);
        }
      }
    }
  }
  await flush();
  console.log(`Applied ${done} of ${items.length}; recalculated ${summariesDone} tax-year summaries.`);
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
    gpsQuality: true, splitFromTripId: true, joinedCount: true, platformTag: true,
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
// (A shift suggestion naming a trip is system-generated and never holds it back;
// apply repoints or clears it for an archived trip.)

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

// A month a team manager approved for the driver is not touched (TeamApproval:
// one row per org / driver / "YYYY-MM" in UK local time, status "approved").
const approvedMonths = new Set();
for (const c of chunks(driverIds, 500)) {
  for (const a of await p.teamApproval.findMany({ where: { userId: { in: c }, status: "approved" }, select: { userId: true, month: true } })) approvedMonths.add(`${a.userId}|${a.month}`);
}
const ukMonth = (d) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${parts.find((x) => x.type === "year").value}-${parts.find((x) => x.type === "month").value}`;
};
const monthLocked = (t) => approvedMonths.has(`${t.userId}|${ukMonth(t.startedAt)}`) || (t.endedAt && approvedMonths.has(`${t.userId}|${ukMonth(t.endedAt)}`));

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
    classification: t.classification, classificationSource: t.classificationSource,
    classificationAutoAccepted: t.classificationAutoAccepted, platformTag: t.platformTag,
    monthLocked: monthLocked(t),
    reviewReasons: [...rowReviewReasons(t), ...(linked.get(t.id) ?? []), ...(monthLocked(t) ? ["month approved by a team manager"] : [])],
    fixes: fixesByTrip.get(t.id) ?? [],
  }));
  for (const it of planDriver(input)) {
    const t = tripById.get(it.tripId);
    planItems.push({
      ...it, userId,
      startedAt: iso(t.startedAt), endedAt: iso(t.endedAt),
      guard: { updatedAt: iso(t.updatedAt), coordinateRows: (fixesByTrip.get(t.id) ?? []).length },
      // Every keeper, as it was when planned; apply refuses the item if any has moved.
      keeperGuards: it.keeperIds.map((id) => ({ id, updatedAt: iso(tripById.get(id).updatedAt), coordinateRows: (fixesByTrip.get(id) ?? []).length })),
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

console.log("\nPer driver totals:");
const perDriver = new Map();
for (const i of planItems) {
  const e = perDriver.get(i.userId) ?? { ARCHIVE: 0, TRIM: 0, REVIEW: 0, miles: 0 };
  e[i.action]++; e.miles += removedMiles(i);
  perDriver.set(i.userId, e);
}
for (const [u, e] of [...perDriver].sort((a, b) => b[1].miles - a[1].miles)) {
  console.log(`  user ${u.slice(0, 8)} (${users.get(u) ?? "unknown"}): ${e.ARCHIVE} archived, ${e.TRIM} trimmed, ${e.REVIEW} for review, ${e.miles.toFixed(1)} mi removed`);
}

console.log("\nOne line per planned change:");
const order = { ARCHIVE: 0, TRIM: 1, REVIEW: 2 };
for (const i of [...planItems].sort((a, b) => order[a.action] - order[b.action] || a.userId.localeCompare(b.userId) || a.startedAt.localeCompare(b.startedAt))) {
  const newTxt = i.action === "ARCHIVE" ? "deleted" : `${i.newMiles.toFixed(2)}`;
  console.log(
    `  ${i.action.padEnd(7)} user ${i.userId.slice(0, 8)} trip ${i.tripId.slice(0, 8)} keeper ${i.keeperIds.map((k) => k.slice(0, 8)).join("+")} ` +
    `${fmt(i.startedAt)}-${i.endedAt.slice(11, 16)}Z ${i.oldMiles.toFixed(2)} -> ${newTxt} mi | ${i.reason}` +
    (i.droppedStretches?.length ? ` | drops ${i.droppedStretches.length} small bit(s) ${i.droppedStretches.reduce((a, s) => a + s.miles, 0).toFixed(2)} mi` : "") +
    (i.keeperUpdate ? ` | carries ${JSON.stringify(i.keeperUpdate.set)} to keeper ${i.keeperUpdate.keeperId.slice(0, 8)}` : "")
  );
}
console.log(`\nPlan written to ${OUT}. To apply a reviewed (and, if you like, shortened) copy:`);
console.log(`  node --env-file=... scripts/dedupe-shared-fixes.mjs ${DAYS}${USER_PREFIX ? " " + USER_PREFIX : ""} apply --ids=${OUT}`);
await p.$disconnect();
