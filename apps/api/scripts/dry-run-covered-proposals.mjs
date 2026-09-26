// Dry run: which open "journeys to check" are already a trip?
//
// 26 Sep 2026: Sunny (his own Start Trip drive) and Jenkins (a drive support
// added for him) both had an offer still open for a drive already in their
// account; accepting it would count the miles twice. GET /trips/missed-journeys
// now moves such rows to status "covered" (services/missedJourneyCoverRule.ts).
// This lists, per driver, every open row that rule would hide on that driver's
// next visit, with the trip that covers it, so the outliers can be read BEFORE
// the change goes live (the house dry-run habit: visit auto-split ate 620 of
// 2,005 trips once).
//
// READ-ONLY. It never writes. The rule below is a copy of findCoveringTrip in
// src/services/missedJourneyCoverRule.ts (a script cannot import the .ts); keep
// the two in step.
//
// Run ON the server from ~/mileclear-app/apps/api:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/dry-run-covered-proposals.mjs
// Optional: USER_ID=<uuid> to look at one driver only.

import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with --env-file on the server.");
  process.exit(1);
}
const prisma = new PrismaClient();

// ── Copy of the rule (src/services/missedJourneyCoverRule.ts) ───────────────
const COVER_WINDOW_FRACTION = 0.5;
const COVER_TRIP_INSIDE_FRACTION = 0.5;
const COVER_DESTINATION_KM = 1;
const KM_PER_MILE = 1.609344;
const INFERRED = new Set(["gap", "trip_start"]);
const round2 = (n) => Math.round(n * 100) / 100;
// Same as haversineDistance in @mileclear/shared (miles).
const toRad = (d) => (d * Math.PI) / 180;
function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findCoveringTrip(proposal, trips) {
  const winStart = proposal.departedAt.getTime();
  const winEnd = proposal.arrivedAt.getTime();
  const winLen = winEnd - winStart;
  if (!(winLen > 0)) return null;
  const hits = [];
  for (const t of trips) {
    if (t.endedAt == null) continue;
    const tStart = t.startedAt.getTime();
    const tEnd = t.endedAt.getTime();
    if (tEnd < tStart) continue;
    const from = Math.max(winStart, tStart);
    const to = Math.min(winEnd, tEnd);
    const tripLen = tEnd - tStart;
    if (tripLen === 0) {
      if (tStart > winStart && tStart < winEnd) hits.push({ trip: t, from: tStart, to: tStart, inside: 1 });
      continue;
    }
    if (to <= from) continue;
    hits.push({ trip: t, from, to, inside: (to - from) / tripLen });
  }
  if (hits.length === 0) return null;
  const spans = hits.map((h) => [h.from, h.to]).sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let [curFrom, curTo] = spans[0];
  for (let i = 1; i < spans.length; i++) {
    const [f, t] = spans[i];
    if (f <= curTo) {
      if (t > curTo) curTo = t;
    } else {
      covered += curTo - curFrom;
      curFrom = f;
      curTo = t;
    }
  }
  covered += curTo - curFrom;
  const windowCoveredFraction = covered / winLen;
  const biggest = hits.reduce((best, h) => (h.to - h.from > best.to - best.from ? h : best));

  if (!INFERRED.has(proposal.source)) {
    if (windowCoveredFraction < COVER_WINDOW_FRACTION) return null;
    return {
      trip: biggest.trip,
      rule: "window_covered",
      windowCoveredFraction: round2(windowCoveredFraction),
      tripInsideFraction: round2(biggest.inside),
      destinationKm: null,
    };
  }

  const last = hits.reduce((best, h) => (h.trip.endedAt.getTime() > best.trip.endedAt.getTime() ? h : best));
  if (last.trip.endLat == null || last.trip.endLng == null) return null;
  const destinationKm =
    haversineMiles(last.trip.endLat, last.trip.endLng, proposal.toLat, proposal.toLng) * KM_PER_MILE;
  if (destinationKm > COVER_DESTINATION_KM) return null;
  let rule = null;
  if (windowCoveredFraction >= COVER_WINDOW_FRACTION) rule = "window_covered";
  else if (hits.some((h) => h.inside >= COVER_TRIP_INSIDE_FRACTION)) rule = "trip_inside_gap";
  if (rule == null) return null;
  return {
    trip: last.trip,
    rule,
    windowCoveredFraction: round2(windowCoveredFraction),
    tripInsideFraction: round2(last.inside),
    destinationKm: Math.round(destinationKm * 10) / 10,
  };
}
// ────────────────────────────────────────────────────────────────────────────

const iso = (d) => (d ? d.toISOString().replace(":00.000Z", "Z").replace("T", " ") : "-");
const mins = (a, b) => Math.round((b.getTime() - a.getTime()) / 60000);
const short = (s, n = 38) => (s ? (s.length > n ? s.slice(0, n - 1) + "~" : s) : "?");

// Why the scan's own prune missed a gap row: the covering trip sorts BEFORE
// trip A (so A and B are still "consecutive" by startedAt), or it sits between
// them and the scan simply has not run since the trip was made.
function gapMissReason(p, cover, tripsById) {
  if (!INFERRED.has(p.source)) return "evidence row (never re-checked after it arrived)";
  const [aId, bId] = p.key.split(":");
  const a = tripsById.get(aId);
  const b = tripsById.get(bId);
  if (!a || !b) return "A or B trip no longer loaded (deleted?)";
  if (cover.trip.startedAt < a.startedAt) return "covering trip starts before A: sort-order miss";
  if (cover.trip.startedAt > b.startedAt) return "covering trip starts after B: sort-order miss";
  return "covering trip sits between A and B: scan has not re-run since";
}

async function main() {
  const where = { status: "proposed" };
  if (process.env.USER_ID) where.userId = process.env.USER_ID;
  const proposals = await prisma.missedJourneyProposal.findMany({
    where,
    select: {
      id: true, userId: true, key: true, source: true,
      departedAt: true, arrivedAt: true, estimatedMiles: true, recordedMiles: true,
      fromAddress: true, toAddress: true, toLat: true, toLng: true, createdAt: true,
    },
  });
  const byUser = new Map();
  for (const p of proposals) {
    const list = byUser.get(p.userId) ?? [];
    list.push(p);
    byUser.set(p.userId, list);
  }

  const totals = { open: proposals.length, hidden: 0, bySource: {}, byRule: {}, outliers: 0, users: 0 };
  const outlierLines = [];

  for (const [userId, list] of byUser) {
    let minDep = list[0].departedAt;
    let maxArr = list[0].arrivedAt;
    for (const p of list) {
      if (p.departedAt < minDep) minDep = p.departedAt;
      if (p.arrivedAt > maxArr) maxArr = p.arrivedAt;
    }
    // Wider than the windows so a gap's own A and B trips load too (for the
    // "why did the scan miss it" column).
    const pad = 36 * 60 * 60 * 1000;
    const trips = await prisma.trip.findMany({
      where: {
        userId,
        isPhantomTrip: false,
        startedAt: { lte: new Date(maxArr.getTime() + pad) },
        OR: [{ endedAt: { gte: new Date(minDep.getTime() - pad) } }, { endedAt: null }],
      },
      select: {
        id: true, startedAt: true, endedAt: true, isManualEntry: true,
        endLat: true, endLng: true, distanceMiles: true, startAddress: true, endAddress: true, createdAt: true,
      },
    });
    const tripsById = new Map(trips.map((t) => [t.id, t]));

    const rows = [];
    for (const p of list.sort((a, b) => a.departedAt - b.departedAt)) {
      const cover = findCoveringTrip(p, trips);
      if (!cover) continue;
      rows.push({ p, cover });
    }
    if (rows.length === 0) continue;
    totals.users++;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    console.log(`\n=== ${userId.slice(0, 8)} ${user?.displayName ?? ""} : ${rows.length} of ${list.length} open would be hidden`);
    for (const { p, cover } of rows) {
      totals.hidden++;
      totals.bySource[p.source] = (totals.bySource[p.source] ?? 0) + 1;
      totals.byRule[cover.rule] = (totals.byRule[cover.rule] ?? 0) + 1;
      const t = cover.trip;
      const flags = [];
      if (!INFERRED.has(p.source)) flags.push("EVIDENCE");
      if (mins(p.departedAt, p.arrivedAt) > 240) flags.push("WINDOW>4h");
      if (cover.rule === "trip_inside_gap" && cover.windowCoveredFraction < 0.2) flags.push("TRIP<20%OFWINDOW");
      const offerMiles = p.recordedMiles ?? p.estimatedMiles;
      if (offerMiles >= 2 && t.distanceMiles < offerMiles * 0.5) flags.push("TRIP<HALF-MILES");
      if (flags.length) totals.outliers++;
      const line =
        `  [${p.source}] ${iso(p.departedAt)} -> ${iso(p.arrivedAt)} (${mins(p.departedAt, p.arrivedAt)} min, ` +
        `${p.estimatedMiles} mi${p.recordedMiles != null ? `, rec ${p.recordedMiles}` : ""}) ` +
        `${short(p.fromAddress, 24)} -> ${short(p.toAddress, 24)}\n` +
        `      covered by ${t.id.slice(0, 8)} ${t.isManualEntry ? "manual" : "auto"} ` +
        `${iso(t.startedAt)} -> ${iso(t.endedAt)} ${Math.round(t.distanceMiles * 10) / 10} mi ` +
        `${short(t.startAddress, 24)} -> ${short(t.endAddress, 24)} (trip made ${iso(t.createdAt)})\n` +
        `      rule ${cover.rule}, window ${Math.round(cover.windowCoveredFraction * 100)}% covered, ` +
        `trip ${Math.round(cover.tripInsideFraction * 100)}% inside` +
        (cover.destinationKm != null ? `, ends ${cover.destinationKm} km from the offer's to-point` : "") +
        `; ${gapMissReason(p, cover, tripsById)}` +
        (flags.length ? `\n      ** ${flags.join(" ")}` : "");
      console.log(line);
      if (flags.length) outlierLines.push(`${userId.slice(0, 8)} ${p.id.slice(0, 8)} ${p.source} ${flags.join(" ")}`);
    }
  }

  console.log("\n=== Summary");
  console.log(`open proposals: ${totals.open}`);
  console.log(`would be hidden: ${totals.hidden} across ${totals.users} drivers`);
  console.log(`by source: ${JSON.stringify(totals.bySource)}`);
  console.log(`by rule:   ${JSON.stringify(totals.byRule)}`);
  console.log(`flagged for a closer look: ${totals.outliers}`);
  for (const l of outlierLines) console.log(`  ${l}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
