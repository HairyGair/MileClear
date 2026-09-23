// Repair the breadcrumb count on legs of a trip a driver split by hand.
//
// executeTripSplit moved each leg's breadcrumbs but never set the leg's
// coordinateCount, so it stayed 0 while the rows were there (fixed going
// forward in the same commit as this script). The trip list then read those
// legs as "No GPS samples captured" and low confidence. 69 legs on 23 Sep 2026.
//
// Only touches split legs whose column is 0 and that hold breadcrumbs, and sets
// the column to the number of rows. Nothing else changes.
//
// Dry run by default. Run ON the server from ~/mileclear-app/apps/api:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/repair-split-leg-coord-count.mjs [--apply]

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const p = new PrismaClient();

const rows = await p.$queryRawUnsafe(`
  SELECT t.id, t.userId,
    (SELECT COUNT(*) FROM trip_coordinates c WHERE c.tripId = t.id) AS n
  FROM trips t
  WHERE JSON_EXTRACT(t.gpsQuality, '$.splitFromTripId') IS NOT NULL
    AND t.coordinateCount = 0
    AND EXISTS (SELECT 1 FROM trip_coordinates c WHERE c.tripId = t.id)`);

console.log(`${rows.length} split legs with a 0 count and breadcrumbs, ${new Set(rows.map((r) => r.userId)).size} drivers`);
for (const r of rows) {
  console.log(`  ${r.id} user ${r.userId.slice(0, 8)} -> ${Number(r.n)}`);
  if (APPLY) {
    // Raw so updatedAt is left alone: the app shows "edited" off it, and the
    // driver did not edit anything.
    await p.$executeRawUnsafe("UPDATE trips SET coordinateCount = ? WHERE id = ?", Number(r.n), r.id);
  }
}
console.log(APPLY ? "Applied." : "Dry run. Pass --apply to write.");
await p.$disconnect();
