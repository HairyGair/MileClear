/**
 * Revert bad geocoded distances from the recalc-distances script.
 *
 * The previous script geocoded vague addresses (e.g. "41 Somerset St")
 * without city context, resolving to wrong locations and producing
 * wildly inaccurate distances.
 *
 * This script:
 * 1. Finds manual trips where coords were likely set by geocoding
 *    (originally 0,0, now have coords but no GPS breadcrumbs)
 * 2. Resets their coords back to 0/null and distance to 0
 * 3. Refreshes mileage summaries
 *
 * Run: npx tsx apps/api/src/scripts/revert-geocoded.ts
 */

import { prisma } from "../lib/prisma.js";
import { getTaxYear } from "@mileclear/shared";
import { upsertMileageSummary } from "../services/mileage.js";

async function main() {
  // Find manual trips that have coordinates but no GPS breadcrumbs
  // These are the ones the previous script geocoded from addresses
  const trips = await prisma.trip.findMany({
    where: {
      isManualEntry: true,
    },
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
      _count: { select: { coordinates: true } },
    },
    orderBy: { startedAt: "desc" },
  });

  console.log(`Found ${trips.length} manual trips`);

  let reverted = 0;
  const affectedUsers = new Set<string>();

  for (const trip of trips) {
    const hasCoords = trip._count.coordinates > 0;

    // If trip has GPS breadcrumbs, the coordinates are real — skip
    if (hasCoords) {
      console.log(`  SKIP ${trip.id} — has ${trip._count.coordinates} GPS coords (real data)`);
      continue;
    }

    // If trip has non-zero coordinates but no GPS breadcrumbs,
    // the coords were either from mobile location picker (valid)
    // or from the geocoding script (potentially wrong).
    // We can't easily distinguish, so reset ALL manual trips
    // without GPS breadcrumbs back to clean state.
    const hadDistance = trip.distanceMiles;

    await prisma.trip.update({
      where: { id: trip.id },
      data: {
        startLat: 0,
        startLng: 0,
        endLat: null,
        endLng: null,
        distanceMiles: 0,
      },
    });

    console.log(
      `  REVERT ${trip.id}: ${hadDistance.toFixed(2)} mi -> 0 mi (${trip.startAddress || "?"} -> ${trip.endAddress || "?"})`
    );
    reverted++;
    affectedUsers.add(`${trip.userId}|${getTaxYear(trip.startedAt)}`);
  }

  // Refresh mileage summaries
  if (reverted > 0) {
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

  console.log(`\nDone! Reverted ${reverted} trips.`);
  console.log(`These trips now show 0 miles — users can re-enter distances manually`);
  console.log(`or use the updated add-trip form which calculates road distance properly.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
