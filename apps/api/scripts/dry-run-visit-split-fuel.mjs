// Dry run: how many automatic visit splits cut a trip at a fuel station?
//
// Read-only. Run ON the server against the built dist:
//   cd ~/mileclear-app/apps/api && node --env-file=/home/mileclear/mileclear-app/.env scripts/dry-run-visit-split-fuel.mjs [days=14]
//
// For every trip.visit_auto_split in the window it rebuilds the original
// trail (parent leg + the legs it made), finds the dwell each cut sat in,
// and measures that dwell's distance to the nearest UK fuel station
// (Fuel Finder). Prints counts only, plus a short anonymised sample.

import { PrismaClient } from "@prisma/client";
import { detectDwells } from "../dist/services/tripSplit.js";
import { fetchFuelFinderStations, isFuelFinderConfigured } from "../dist/services/fuelFinder.js";

const days = Number(process.argv[2] ?? 14);
const p = new PrismaClient();
const M_PER_MILE = 1609.344;

function metres(aLat, aLng, bLat, bLng) {
  const r = (d) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

if (!isFuelFinderConfigured()) {
  console.log("Fuel Finder not configured; stop.");
  process.exit(1);
}
const { stations } = await fetchFuelFinderStations();
// ~1 km grid so a lookup only scans nearby cells.
const CELL = 0.01;
const grid = new Map();
for (const s of stations) {
  const k = `${Math.floor(s.latitude / CELL)}:${Math.floor(s.longitude / CELL)}`;
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(s);
}
function nearest(lat, lng) {
  const ci = Math.floor(lat / CELL);
  const cj = Math.floor(lng / CELL);
  let best = null;
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++)
      for (const s of grid.get(`${ci + di}:${cj + dj}`) ?? []) {
        const d = metres(lat, lng, s.latitude, s.longitude);
        if (!best || d < best.d) best = { d, brand: s.brand };
      }
  return best;
}

const since = new Date(Date.now() - days * 864e5);
const events = await p.appEvent.findMany({
  where: { type: "trip.visit_auto_split", createdAt: { gte: since } },
  select: { metadata: true, createdAt: true },
});

const distBuckets = { "<=30m": 0, "30-60m": 0, "60-100m": 0, "100-200m": 0, ">200m/none": 0 };
const nearDwell = { "4-10 min": 0, "10-20 min": 0, "20-45 min": 0, "45+ min": 0 };
let boundaries = 0;
let unmatched = 0;
let exemptTrips = 0;
let exemptCuts = 0;
const exemptByClass = {};
const sample = [];
// Did the driver delete a leg afterwards? The nearest thing we have to "this
// split was unwanted": there is no join event.
const SUPERMARKET = /tesco|sainsbury|asda|morrison|co-?op|waitrose|lidl|aldi|m&s|marks|spar|budgens|nisa|londis|one stop/i;
const deleted = { exempt: [0, 0], exemptSupermarket: [0, 0], exemptForecourt: [0, 0], other: [0, 0] };
const tally = (k, hit) => { deleted[k][0] += hit ? 1 : 0; deleted[k][1] += 1; };

for (const e of events) {
  const m = e.metadata ?? {};
  const ids = [m.tripId, ...(m.newTripIds ?? [])].filter(Boolean);
  if (ids.length < 2) continue;
  const trips = await p.trip.findMany({
    where: { id: { in: ids } },
    select: { id: true, startedAt: true, endedAt: true, classification: true, distanceMiles: true },
    orderBy: { startedAt: "asc" },
  });
  if (trips.length !== ids.length) continue;
  const coords = (
    await p.tripCoordinate.findMany({
      where: { tripId: { in: ids } },
      select: { lat: true, lng: true, speed: true, recordedAt: true },
      orderBy: { recordedAt: "asc" },
    })
  ).map((c) => ({ ...c, speed: c.speed == null ? null : Number(c.speed) }));
  const dwells = detectDwells(coords);
  let tripHasExempt = false;
  let exemptSupermarket = null;
  for (let k = 0; k < trips.length - 1; k++) {
    boundaries++;
    const cutAt = trips[k].endedAt?.getTime();
    const dwell = dwells.find((d) => Math.abs(d.timestamp.getTime() - cutAt) < 1000);
    if (!dwell) {
      unmatched++;
      continue;
    }
    const n = nearest(dwell.lat, dwell.lng);
    const d = n?.d ?? Infinity;
    if (d <= 30) distBuckets["<=30m"]++;
    else if (d <= 60) distBuckets["30-60m"]++;
    else if (d <= 100) distBuckets["60-100m"]++;
    else if (d <= 200) distBuckets["100-200m"]++;
    else distBuckets[">200m/none"]++;
    if (d <= 60) {
      const min = dwell.dwellSec / 60;
      if (min < 10) nearDwell["4-10 min"]++;
      else if (min < 20) nearDwell["10-20 min"]++;
      else if (min < 45) nearDwell["20-45 min"]++;
      else nearDwell["45+ min"]++;
      if (min <= 20) {
        exemptCuts++;
        tripHasExempt = true;
        exemptSupermarket = SUPERMARKET.test(n.brand ?? "");
        if (sample.length < 12)
          sample.push({
            day: e.createdAt.toISOString().slice(0, 10),
            trip: trips[0].id.slice(0, 8),
            station: n.brand,
            metres: Math.round(d),
            dwellMin: Math.round(min * 10) / 10,
            legs: trips.map((t) => `${t.distanceMiles.toFixed(1)}mi ${t.classification}`).join(" | "),
          });
      }
    }
  }
  const legDeleted =
    (await p.deletedTrip.count({ where: { originalTripId: { in: ids } } })) > 0;
  if (tripHasExempt) {
    tally("exempt", legDeleted);
    tally(exemptSupermarket ? "exemptSupermarket" : "exemptForecourt", legDeleted);
  } else {
    tally("other", legDeleted);
  }
  if (tripHasExempt) {
    exemptTrips++;
    const c = trips[0].classification;
    exemptByClass[c] = (exemptByClass[c] ?? 0) + 1;
  }
}

console.log(`Stations loaded: ${stations.length}`);
console.log(`Automatic splits in the last ${days} days: ${events.length} trips, ${boundaries} cuts (${unmatched} cuts could not be matched to a dwell)`);
console.log("Distance from each cut to the nearest fuel station:", distBuckets);
console.log("Cuts within 60 m of a station, by stop length:", nearDwell);
console.log(`Would stay whole with the exemption (<= 60 m, <= 20 min): ${exemptCuts} cuts on ${exemptTrips} trips`);
console.log("Those trips by first leg's classification:", exemptByClass);
const pct = ([a, b]) => `${a}/${b} (${b ? Math.round((a / b) * 1000) / 10 : 0}%)`;
console.log("Splits where the driver later deleted a leg:", {
  atFuelStation: pct(deleted.exempt),
  ofThose_supermarket: pct(deleted.exemptSupermarket),
  ofThose_forecourtBrand: pct(deleted.exemptForecourt),
  everywhereElse: pct(deleted.other),
});
console.log("Sample:");
for (const s of sample) console.log(" ", JSON.stringify(s));
await p.$disconnect();
