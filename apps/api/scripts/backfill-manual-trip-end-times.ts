/**
 * Backfill endedAt on manual trips that were saved without one.
 *
 * The web add-trip form had no end-time field until 12 Aug 2026 and mobile's
 * is optional, so a long tail of manual trips carries endedAt NULL and is
 * skipped by every duration-derived figure (shift grades, earnings per hour,
 * golden hours, weekly P&L). New trips now get an estimate at create time;
 * this applies the same rule to the ones already stored.
 *
 * Same rule as the live path, deliberately: estimate from the road route, only
 * where a genuine routed duration exists, and label it in gpsQuality so an
 * estimate is never mistaken for a measured time.
 *
 * Dry run by default. Pass --commit to write.
 *
 *   node --env-file=/home/mileclear/mileclear-app/.env \
 *     dist/scripts/backfill-manual-trip-end-times.js [--commit] [--limit=N]
 */
import { prisma } from "../src/lib/prisma.js";
import { resolveRouteDistance, routedDurationUsable } from "../src/services/routing.js";
import type { Prisma } from "@prisma/client";

const COMMIT = process.argv.includes("--commit");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 1000;


async function main() {
  const candidates = await prisma.trip.findMany({
    where: {
      isManualEntry: true,
      endedAt: null,
      // 0,0 is the established "no coordinates" sentinel; nothing to route.
      NOT: [{ startLat: 0, startLng: 0 }],
      endLat: { not: null },
      endLng: { not: null },
    },
    select: {
      id: true, userId: true, startedAt: true, distanceMiles: true,
      startLat: true, startLng: true, endLat: true, endLng: true,
      startAddress: true, endAddress: true, gpsQuality: true,
    },
    orderBy: { startedAt: "desc" },
    take: LIMIT,
  });

  const total = await prisma.trip.count({ where: { isManualEntry: true, endedAt: null } });
  console.log(`${total} manual trips with no end time; ${candidates.length} have coordinates to route.\n`);

  let filled = 0;
  let noRoute = 0;
  let implausible = 0;

  for (const t of candidates) {
    const route = await resolveRouteDistance({
      startLat: t.startLat, startLng: t.startLng,
      endLat: t.endLat!, endLng: t.endLng!,
      userId: t.userId,
    });

    if (!route) {
      noRoute++;
      continue;
    }
    // Identical rule to the live create path: the route must be recognisably
    // the journey the user recorded, or we leave the end time empty.
    if (!routedDurationUsable({
      routedMiles: route.distanceMiles,
      routedSecs: route.durationSecs,
      storedMiles: t.distanceMiles,
    })) {
      implausible++;
      console.log(
        `  skip ${t.id.slice(0, 8)} stored ${t.distanceMiles}mi vs routed ` +
        `${route.distanceMiles.toFixed(1)}mi in ${route.durationSecs}s  ${t.startAddress ?? "?"} -> ${t.endAddress ?? "?"}`
      );
      continue;
    }

    const endedAt = new Date(t.startedAt.getTime() + route.durationSecs * 1000);
    // Never stamp an arrival into the future.
    if (endedAt > new Date()) {
      implausible++;
      continue;
    }

    filled++;
    const mins = Math.round(route.durationSecs / 60);
    console.log(
      `  ${COMMIT ? "fill" : "would fill"} ${t.id.slice(0, 8)} ${t.distanceMiles}mi ` +
      `${t.startedAt.toISOString().slice(0, 16)} +${mins}min  ${t.startAddress ?? "?"} -> ${t.endAddress ?? "?"}`
    );

    if (COMMIT) {
      await prisma.trip.update({
        where: { id: t.id },
        data: {
          endedAt,
          gpsQuality: {
            ...(t.gpsQuality && typeof t.gpsQuality === "object" && !Array.isArray(t.gpsQuality)
              ? (t.gpsQuality as Prisma.JsonObject)
              : {}),
            endedAtSource: "routed_duration_backfill",
            endedAtDurationSecs: route.durationSecs,
          },
        },
      });
    }
  }

  console.log(
    `\n${COMMIT ? "Filled" : "Would fill"} ${filled}. ` +
    `No route: ${noRoute}. Implausible: ${implausible}. ` +
    `Left without coordinates: ${total - candidates.length}.`
  );
  if (!COMMIT) console.log("DRY RUN - pass --commit to write.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
