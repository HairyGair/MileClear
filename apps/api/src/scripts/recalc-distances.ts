/**
 * One-time script to recalculate manual trip distances using OSRM road routing.
 *
 * Only processes trips that already have valid start AND end coordinates
 * (from mobile location picker). Does NOT geocode from addresses — that
 * produces unreliable results without city/postcode context.
 *
 * Run: npx tsx apps/api/src/scripts/recalc-distances.ts
 */

import { prisma } from "../lib/prisma.js";
import { fetchRouteDistance, getTaxYear } from "@mileclear/shared";
import { upsertMileageSummary } from "../services/mileage.js";

const OSRM_DELAY = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isValidCoord(lat: number, lng: number): boolean {
  return lat !== 0 && lng !== 0 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
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

  console.log(`Found ${trips.length} manual trips total`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const trip of trips) {
    const hasValidStart = isValidCoord(trip.startLat, trip.startLng);
    const hasValidEnd =
      trip.endLat != null && trip.endLng != null &&
      isValidCoord(trip.endLat, trip.endLng);

    if (!hasValidStart || !hasValidEnd) {
      console.log(`  SKIP ${trip.id} — no valid coords (${trip.startAddress} -> ${trip.endAddress})`);
      skipped++;
      continue;
    }

    const route = await fetchRouteDistance(
      trip.startLat, trip.startLng, trip.endLat!, trip.endLng!
    );
    await sleep(OSRM_DELAY);

    if (!route) {
      console.log(`  FAIL ${trip.id} — OSRM returned no route`);
      failed++;
      continue;
    }

    const oldDist = trip.distanceMiles;
    const newDist = route.distanceMiles;
    const pctChange = oldDist > 0 ? (((newDist - oldDist) / oldDist) * 100).toFixed(1) : "N/A";

    await prisma.trip.update({
      where: { id: trip.id },
      data: { distanceMiles: newDist },
    });

    console.log(
      `  OK ${trip.id}: ${oldDist.toFixed(2)} -> ${newDist.toFixed(2)} mi (${pctChange}% change)`
    );
    updated++;
  }

  console.log(`\nDone!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (no valid coords): ${skipped}`);
  console.log(`  Failed (OSRM error): ${failed}`);

  // Refresh mileage summaries
  if (updated > 0) {
    console.log(`\nRefreshing mileage summaries...`);
    const userTaxYears = new Set<string>();
    for (const t of trips) {
      userTaxYears.add(`${t.userId}|${getTaxYear(t.startedAt)}`);
    }
    for (const key of userTaxYears) {
      const [userId, taxYear] = key.split("|");
      try {
        await upsertMileageSummary(userId, taxYear);
        console.log(`  Refreshed: user=${userId.slice(0, 8)}... year=${taxYear}`);
      } catch (err) {
        console.log(`  Failed: ${err}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
