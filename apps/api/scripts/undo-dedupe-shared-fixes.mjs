// Undo what scripts/dedupe-shared-fixes.mjs did, from the app events it logged.
//
//   admin.trip_shared_fixes_trimmed   -> the removed coordinates go back (same
//                                        ids) and the trip row gets every old
//                                        column value back.
//   admin.trip_shared_fixes_archived  -> the trip is recreated from its
//                                        deleted_trips archive with its ORIGINAL
//                                        id and every old column (classification
//                                        source, auto-accepted flag, shift, split
//                                        fields...), its coordinates come back,
//                                        and the archive row is marked restored.
// Both also put back the keeper's old classification fields (only if the keeper
// still has exactly what the cleanup gave it), shift suggestions as they were
// (cleared ones recreated, repointed ones pointed back) and the
// possibleDuplicateOfId pointers that were cleared.
//
// DRY RUN by default (reads only, prints what it would do). Run ON the server
// from ~/mileclear-app/apps/api:
//   node --env-file=... scripts/undo-dedupe-shared-fixes.mjs <eventId> [<eventId>...] [--events=file.json]
//   node --env-file=... scripts/undo-dedupe-shared-fixes.mjs <eventIds...> apply
// --events=<file> holds a JSON array of event ids. Find ids with
//   SELECT id, type, userId FROM app_events WHERE type LIKE 'admin.trip_shared_fixes_%';
// An event already undone (admin.trip_shared_fixes_undone naming it) is skipped.
import { readFileSync } from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";
import { reviveDates } from "./lib/sharedFixes.mjs";

const argv = process.argv.slice(2);
const APPLY = argv.includes("apply");
const evFile = argv.find((a) => a.startsWith("--events="))?.slice(9);
const eventIds = [...argv.filter((a) => !a.startsWith("--") && a !== "apply"), ...(evFile ? JSON.parse(readFileSync(evFile, "utf8")) : [])];
if (eventIds.length === 0) {
  console.error("Give one or more event ids (or --events=file.json).");
  process.exit(1);
}

const TRIP_DATES = ["startedAt", "endedAt", "createdAt", "updatedAt", "syncedAt", "autoClassifiedAt"];
const SUGGESTION_DATES = ["startedAt", "endedAt", "decidedAt", "createdAt", "updatedAt"];
const p = new PrismaClient();
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const J = (o) => JSON.parse(JSON.stringify(o));

let getTaxYear, upsertMileageSummary;
if (APPLY) {
  ({ getTaxYear } = await import("@mileclear/shared"));
  ({ upsertMileageSummary } = await import("../dist/services/mileage.js"));
}
const summaries = new Set();

const tripData = (row) => {
  const d = reviveDates(row, TRIP_DATES);
  delete d.id;
  d.gpsQuality = d.gpsQuality === null || d.gpsQuality === undefined ? Prisma.JsonNull : d.gpsQuality;
  return d;
};

// Keeper back to what it was, but only if it still holds what the cleanup gave it.
async function planKeeper(meta) {
  const kc = meta.keeperClassification;
  if (!kc) return { todo: null, note: "no keeper change to undo" };
  const k = await p.trip.findFirst({ where: { id: kc.keeperId }, select: { id: true, classification: true, classificationSource: true, platformTag: true } });
  if (!k) return { todo: null, note: `keeper ${kc.keeperId.slice(0, 8)} is gone` };
  const wantC = kc.set.classification ?? kc.old.classification;
  const wantS = kc.set.classificationSource ?? kc.old.classificationSource;
  const wantP = kc.set.platformTag ?? kc.old.platformTag;
  if (k.classification !== wantC || (k.classificationSource ?? null) !== (wantS ?? null) || (k.platformTag ?? null) !== (wantP ?? null)) {
    return { todo: null, note: `keeper ${kc.keeperId.slice(0, 8)} has been changed since; left as it is` };
  }
  const { id: _omit, ...oldFields } = kc.old;
  return { todo: { id: k.id, data: reviveDates(oldFields, ["autoClassifiedAt"]) }, note: `keeper ${k.id.slice(0, 8)} classification put back` };
}

for (const id of eventIds) {
  const ev = await p.appEvent.findUnique({ where: { id } });
  const head = `event ${id.slice(0, 8)}`;
  if (!ev || !["admin.trip_shared_fixes_trimmed", "admin.trip_shared_fixes_archived"].includes(ev.type)) { console.log(`${head}: not a shared-fixes event, skipped`); continue; }
  const prior = await p.appEvent.findFirst({ where: { type: "admin.trip_shared_fixes_undone", metadata: { path: "$.undoOfEventId", equals: ev.id } }, select: { id: true } });
  if (prior) { console.log(`${head}: already undone, skipped`); continue; }
  const m = ev.metadata;
  const userId = ev.userId;
  const keeper = await planKeeper(m);

  if (ev.type === "admin.trip_shared_fixes_trimmed") {
    const trip = await p.trip.findFirst({ where: { id: m.tripId, userId } });
    if (!trip) { console.log(`${head}: TRIM of ${m.tripId.slice(0, 8)}: trip is gone, cannot undo`); continue; }
    const back = m.removedCoordinates ?? [];
    let existing = 0;
    for (const c of chunks(back.map((r) => r.id), 500)) existing += await p.tripCoordinate.count({ where: { id: { in: c } } });
    if (existing > 0) { console.log(`${head}: ${existing} of the removed coordinates already exist again, cannot undo safely`); continue; }

    // Has the trip changed since the trim? Then do not overwrite the row.
    const unchanged = m.postTrimUpdatedAt && trip.updatedAt.toISOString() === m.postTrimUpdatedAt;
    let data;
    let mode;
    if (unchanged) {
      data = { ...tripData(m.oldRow) };
      delete data.updatedAt; // let it be stamped now
      // vehicle / shift may have been removed since
      if (data.vehicleId && !(await p.vehicle.findFirst({ where: { id: data.vehicleId, userId }, select: { id: true } }))) { data.vehicleId = null; console.log(`  note: vehicle no longer exists, left empty`); }
      if (data.shiftId && !(await p.shift.findFirst({ where: { id: data.shiftId }, select: { id: true } }))) { data.shiftId = null; console.log(`  note: shift no longer exists, left empty`); }
      mode = "whole row";
    } else {
      // Only restore the figures the trim itself wrote, and only if they are still what it wrote.
      const n = m.new ?? {};
      const stillTrimmed = trip.distanceMiles === n.distanceMiles && trip.startedAt.toISOString() === n.startedAt && trip.endedAt?.toISOString() === n.endedAt;
      if (!stillTrimmed) { console.log(`${head}: TRIM of ${m.tripId.slice(0, 8)}: the trip has been edited since and its distance or times differ from the trim, so nothing was restored. Restore by hand from the event.`); continue; }
      const keys = ["distanceMiles", "startedAt", "endedAt", "startLat", "startLng", "endLat", "endLng", "startAddress", "endAddress", "coordinateCount", "routePolyline", "originalStartLat", "originalStartLng"];
      data = reviveDates(Object.fromEntries(keys.map((k) => [k, m.oldRow[k]])), TRIP_DATES);
      mode = "coordinates and the trimmed figures only (the trip was touched since: notes, classification etc. left alone)";
    }
    console.log(`${head}: TRIM of ${m.tripId.slice(0, 8)}: put back ${back.length} coordinates and ${mode} (${m.oldRow.distanceMiles} mi, ${m.oldRow.startedAt} to ${m.oldRow.endedAt}); ${keeper.note}`);
    if (!APPLY) continue;
    await p.$transaction(async (tx) => {
      for (const c of chunks(back, 500)) {
        await tx.tripCoordinate.createMany({
          data: c.map((r) => ({ id: r.id, tripId: m.tripId, lat: r.lat, lng: r.lng, accuracy: r.accuracy, speed: r.speed, recordedAt: new Date(r.recordedAt) })),
        });
      }
      await tx.trip.update({ where: { id: m.tripId }, data });
      if (keeper.todo) await tx.trip.update({ where: { id: keeper.todo.id }, data: keeper.todo.data });
      await tx.appEvent.create({ data: { type: "admin.trip_shared_fixes_undone", userId, metadata: { undoOfEventId: ev.id, tripId: m.tripId, action: "TRIM", restoredCoordinates: back.length } } });
    }, { timeout: 60000 });
    summaries.add(`${userId}|${getTaxYear(new Date(m.oldRow.startedAt))}`);
    summaries.add(`${userId}|${getTaxYear(new Date(m.new.startedAt))}`);
  } else {
    const existing = await p.trip.findUnique({ where: { id: m.tripId }, select: { id: true } });
    if (existing) { console.log(`${head}: ARCHIVE of ${m.tripId.slice(0, 8)}: a trip with that id exists already, cannot undo`); continue; }
    const arch = await p.deletedTrip.findUnique({ where: { id: m.deletedTripId } });
    if (!arch) { console.log(`${head}: archive row ${m.deletedTripId} is gone, cannot undo`); continue; }
    if (arch.restoredTripId) { console.log(`${head}: archive row was already restored as ${arch.restoredTripId}, skipped`); continue; }
    const coords = Array.isArray(arch.coordinatesJson) ? arch.coordinatesJson : [];
    if (coords.length < (m.coordinateRows ?? 0)) { console.log(`${head}: archive holds ${coords.length} coordinates but the trip had ${m.coordinateRows}, cannot undo exactly`); continue; }
    const row = { ...m.oldRow };
    const vehicle = row.vehicleId ? await p.vehicle.findFirst({ where: { id: row.vehicleId, userId }, select: { id: true } }) : null;
    if (row.vehicleId && !vehicle) row.vehicleId = null;
    const shift = row.shiftId ? await p.shift.findFirst({ where: { id: row.shiftId }, select: { id: true } }) : null;
    if (row.shiftId && !shift) row.shiftId = null;
    const sugs = m.shiftSuggestions ?? [];
    const pointers = m.clearedPointerTripIds ?? [];
    console.log(`${head}: ARCHIVE of ${m.tripId.slice(0, 8)}: recreate it with its original id and ${coords.length} coordinates; ${sugs.length} shift suggestion(s) and ${pointers.length} duplicate pointer(s) put back; ${keeper.note}`);
    if (!APPLY) continue;
    await p.$transaction(async (tx) => {
      await tx.trip.create({ data: { id: m.tripId, ...tripData(row) } });
      for (const c of chunks(coords, 500)) {
        await tx.tripCoordinate.createMany({
          data: c.map((r) => ({ tripId: m.tripId, lat: r.lat, lng: r.lng, accuracy: r.accuracy ?? null, speed: r.speed ?? null, recordedAt: new Date(r.recordedAt) })),
        });
      }
      await tx.deletedTrip.update({ where: { id: arch.id }, data: { restoredTripId: m.tripId, restoredAt: new Date() } });
      if (keeper.todo) await tx.trip.update({ where: { id: keeper.todo.id }, data: keeper.todo.data });
      for (const s of sugs) {
        const r = reviveDates(s.row, SUGGESTION_DATES);
        if (s.change === "cleared") {
          const there = await tx.shiftSuggestion.findFirst({ where: { userId, key: r.key }, select: { id: true } });
          if (!there) await tx.shiftSuggestion.create({ data: r });
        } else {
          // Only if it still holds what the cleanup wrote.
          const cur = await tx.shiftSuggestion.findFirst({ where: { id: r.id } });
          if (cur && JSON.stringify(cur.tripIdsJson) === JSON.stringify(s.after)) {
            await tx.shiftSuggestion.update({ where: { id: r.id }, data: { tripIdsJson: r.tripIdsJson } });
          } else {
            console.log(`  note: shift suggestion ${r.id.slice(0, 8)} has changed since, left as it is`);
          }
        }
      }
      if (pointers.length) await tx.trip.updateMany({ where: { id: { in: pointers }, userId, possibleDuplicateOfId: null }, data: { possibleDuplicateOfId: m.tripId } });
      await tx.appEvent.create({ data: { type: "admin.trip_shared_fixes_undone", userId, metadata: { undoOfEventId: ev.id, tripId: m.tripId, action: "ARCHIVE", restoredCoordinates: coords.length } } });
    }, { timeout: 60000 });
    summaries.add(`${userId}|${getTaxYear(new Date(m.oldRow.startedAt))}`);
  }
  console.log(`  undone`);
}

if (APPLY) {
  for (const key of summaries) {
    const [userId, taxYear] = key.split("|");
    await upsertMileageSummary(userId, taxYear).catch((err) => console.log(`  mileage summary failed for ${userId.slice(0, 8)} ${taxYear}: ${err?.message ?? err}`));
  }
  console.log(`Recalculated ${summaries.size} tax-year summaries.`);
} else {
  console.log("\nDRY RUN: nothing written. Add the word apply to do it.");
}
await p.$disconnect();
