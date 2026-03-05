/**
 * One-time script to recalculate manual trip distances using OSRM road routing.
 *
 * Handles two cases:
 * 1. Trips with valid start+end coordinates → route directly via OSRM
 * 2. Trips with 0,0 coords but addresses → geocode via Nominatim, then route
 *
 * Run: npx tsx apps/api/src/scripts/recalc-distances.ts
 */

import { prisma } from "../lib/prisma.js";
import { fetchRouteDistance, getTaxYear } from "@mileclear/shared";
import { upsertMileageSummary } from "../services/mileage.js";

const NOMINATIM_DELAY = 1100; // Nominatim rate limit: 1 req/s
const OSRM_DELAY = 200; // Be polite to the free OSRM server

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isValidCoord(lat: number, lng: number): boolean {
  return lat !== 0 && lng !== 0 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ", UK")}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "MileClear/1.0 (distance-recalc)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

async function main() {
  // Find all manual trips that have end coordinates or addresses
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
    },
    orderBy: { startedAt: "desc" },
  });

  console.log(`Found ${trips.length} manual trips total`);

  let updated = 0;
  let skipped = 0;
  let geocoded = 0;
  let failed = 0;

  for (const trip of trips) {
    let startLat = trip.startLat;
    let startLng = trip.startLng;
    let endLat = trip.endLat;
    let endLng = trip.endLng;

    const hasValidStart = isValidCoord(startLat, startLng);
    const hasValidEnd = endLat != null && endLng != null && isValidCoord(endLat, endLng);

    // If coords are missing/zero but addresses exist, geocode them
    if (!hasValidStart && trip.startAddress) {
      console.log(`  Geocoding start: "${trip.startAddress}"`);
      const result = await geocode(trip.startAddress);
      await sleep(NOMINATIM_DELAY);
      if (result) {
        startLat = result.lat;
        startLng = result.lng;
        geocoded++;
      }
    }

    if (!hasValidEnd && trip.endAddress) {
      console.log(`  Geocoding end: "${trip.endAddress}"`);
      const result = await geocode(trip.endAddress);
      await sleep(NOMINATIM_DELAY);
      if (result) {
        endLat = result.lat;
        endLng = result.lng;
        geocoded++;
      }
    }

    // Need valid start and end to route
    if (!isValidCoord(startLat, startLng) || endLat == null || endLng == null || !isValidCoord(endLat, endLng)) {
      console.log(`  SKIP ${trip.id} — missing coordinates (start: ${trip.startAddress}, end: ${trip.endAddress})`);
      skipped++;
      continue;
    }

    // Fetch road distance
    const route = await fetchRouteDistance(startLat, startLng, endLat, endLng);
    await sleep(OSRM_DELAY);

    if (!route) {
      console.log(`  FAIL ${trip.id} — OSRM returned no route`);
      failed++;
      continue;
    }

    const oldDist = trip.distanceMiles;
    const newDist = route.distanceMiles;
    const diff = Math.abs(newDist - oldDist);
    const pctChange = oldDist > 0 ? ((diff / oldDist) * 100).toFixed(1) : "N/A";

    // Update the trip with road distance and resolved coordinates
    await prisma.trip.update({
      where: { id: trip.id },
      data: {
        distanceMiles: newDist,
        startLat,
        startLng,
        endLat,
        endLng,
      },
    });

    console.log(
      `  OK ${trip.id}: ${oldDist.toFixed(2)} mi -> ${newDist.toFixed(2)} mi (${pctChange}% change)`
    );
    updated++;
  }

  console.log(`\nDistance recalculation done!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (no coords/address): ${skipped}`);
  console.log(`  Geocoded addresses: ${geocoded}`);
  console.log(`  Failed (OSRM error): ${failed}`);

  // Refresh mileage summaries for all affected users
  if (updated > 0) {
    console.log(`\nRefreshing mileage summaries...`);
    const affectedUsers = await prisma.trip.findMany({
      where: { isManualEntry: true },
      select: { userId: true, startedAt: true },
      distinct: ["userId"],
    });
    const userTaxYears = new Set<string>();
    for (const t of affectedUsers) {
      userTaxYears.add(`${t.userId}|${getTaxYear(t.startedAt)}`);
    }
    for (const key of userTaxYears) {
      const [userId, taxYear] = key.split("|");
      try {
        await upsertMileageSummary(userId, taxYear);
        console.log(`  Refreshed summary: user=${userId.slice(0, 8)}... taxYear=${taxYear}`);
      } catch (err) {
        console.log(`  Failed to refresh summary for ${userId.slice(0, 8)}...: ${err}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
