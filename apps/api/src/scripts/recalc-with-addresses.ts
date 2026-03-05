/**
 * Recalculate distances for manual trips by extracting UK postcodes
 * from addresses and using Postcodes.io + OSRM shortest-route.
 *
 * Postcodes.io is purpose-built for UK postcodes and gives accurate
 * centre-point coordinates. Combined with OSRM shortest-alternative
 * routing, this produces distances within ~5% of Apple/Google Maps.
 *
 * Run: npx tsx apps/api/src/scripts/recalc-with-addresses.ts
 */

import { prisma } from "../lib/prisma.js";
import { fetchRouteDistance, getTaxYear } from "@mileclear/shared";
import { upsertMileageSummary } from "../services/mileage.js";

const OSRM_DELAY = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Full UK postcode: SW1A 1AA, NE38 8RY, SR3 1BS
const FULL_POSTCODE_REGEX = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;
// Partial outcode only: NE38, NE11, SR3
const OUTCODE_REGEX = /\b([A-Z]{1,2}\d[A-Z\d]?)\b/i;

function extractPostcode(address: string): { code: string; partial: boolean } | null {
  const full = address.match(FULL_POSTCODE_REGEX);
  if (full) return { code: full[1].replace(/\s+/g, ""), partial: false };
  const partial = address.match(OUTCODE_REGEX);
  if (partial) return { code: partial[1], partial: true };
  return null;
}

async function geocodePostcode(info: { code: string; partial: boolean }): Promise<{ lat: number; lng: number } | null> {
  try {
    const endpoint = info.partial
      ? `https://api.postcodes.io/outcodes/${info.code}`
      : `https://api.postcodes.io/postcodes/${info.code}`;
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 200 || !data.result) return null;
    return { lat: data.result.latitude, lng: data.result.longitude };
  } catch {
    return null;
  }
}

async function main() {
  const trips = await prisma.trip.findMany({
    where: { isManualEntry: true },
    select: {
      id: true,
      startLat: true,
      startLng: true,
      endLat: true,
      endLng: true,
      startAddress: true,
      endAddress: true,
      distanceMiles: true,
      userId: true,
      startedAt: true,
    },
    orderBy: { startedAt: "desc" },
  });

  console.log(`Found ${trips.length} manual trips\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const affectedUsers = new Set<string>();

  for (const trip of trips) {
    if (!trip.startAddress || !trip.endAddress) {
      console.log(`  SKIP ${trip.id} — missing address text`);
      skipped++;
      continue;
    }

    const startPC = extractPostcode(trip.startAddress);
    const endPC = extractPostcode(trip.endAddress);

    if (!startPC || !endPC) {
      console.log(`  SKIP ${trip.id} — no postcode found in "${trip.startAddress}" or "${trip.endAddress}"`);
      skipped++;
      continue;
    }

    console.log(`  ${startPC.code}${startPC.partial ? " (partial)" : ""} -> ${endPC.code}${endPC.partial ? " (partial)" : ""}  (${trip.startAddress} -> ${trip.endAddress})`);

    const startGeo = await geocodePostcode(startPC);
    if (!startGeo) {
      console.log(`    FAIL — could not resolve postcode ${startPC.code}`);
      failed++;
      continue;
    }

    const endGeo = await geocodePostcode(endPC);
    if (!endGeo) {
      console.log(`    FAIL — could not resolve postcode ${endPC.code}`);
      failed++;
      continue;
    }

    const route = await fetchRouteDistance(startGeo.lat, startGeo.lng, endGeo.lat, endGeo.lng);
    await sleep(OSRM_DELAY);

    if (!route) {
      console.log(`    FAIL — OSRM returned no route`);
      failed++;
      continue;
    }

    await prisma.trip.update({
      where: { id: trip.id },
      data: {
        startLat: startGeo.lat,
        startLng: startGeo.lng,
        endLat: endGeo.lat,
        endLng: endGeo.lng,
        distanceMiles: route.distanceMiles,
      },
    });

    console.log(`    ${trip.distanceMiles.toFixed(2)} -> ${route.distanceMiles} mi (${Math.round(route.durationSecs / 60)} min)`);
    updated++;
    affectedUsers.add(`${trip.userId}|${getTaxYear(trip.startedAt)}`);
  }

  // Refresh mileage summaries
  if (updated > 0) {
    console.log(`\nRefreshing mileage summaries...`);
    for (const key of affectedUsers) {
      const [userId, taxYear] = key.split("|");
      try {
        await upsertMileageSummary(userId, taxYear);
        console.log(`  Refreshed: user=${userId.slice(0, 8)}... year=${taxYear}`);
      } catch (err) {
        console.log(`  Failed: ${err}`);
      }
    }
  }

  console.log(`\nDone!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed: ${failed}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
