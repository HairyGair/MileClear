// One-off ops script: backfill map-matched polylines for tracked trips.
//
// After GPS map-matching shipped (10 May 2026), every new auto-tracked
// trip gets snapped to roads via GraphHopper as part of the create flow.
// This script catches up the 2k+ historical trips that were saved
// before the feature existed.
//
// Usage:
//   npx tsx apps/api/scripts/match-existing-trips.ts --dry-run --limit 50
//   npx tsx apps/api/scripts/match-existing-trips.ts --user <id> --apply
//   npx tsx apps/api/scripts/match-existing-trips.ts --since 30 --apply
//
// Mirrors the logic of POST /admin/match-existing-trips. Idempotent —
// only matches trips with no existing polyline (unless --rematch is set).
//
// Conservative distance update: bumps Trip.distanceMiles only when the
// matched road distance is >5% higher than the stored value. Never
// reduces a stored distance.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { matchTripRoute, isMatchPlausible } from "../src/services/mapMatching.js";
import { upsertMileageSummary } from "../src/services/mileage.js";
import { logEvent } from "../src/services/appEvents.js";
import { getTaxYear } from "@mileclear/shared";

interface Args {
  userId?: string;
  sinceDays?: number;
  limit: number;
  threshold: number;
  apply: boolean;
  rematch: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { limit: 200, threshold: 0.05, apply: false, rematch: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user" || a === "-u") out.userId = argv[++i];
    else if (a === "--since" || a === "-s") out.sinceDays = parseInt(argv[++i], 10);
    else if (a === "--limit" || a === "-l") out.limit = parseInt(argv[++i], 10);
    else if (a === "--threshold" || a === "-t") out.threshold = parseFloat(argv[++i]);
    else if (a === "--apply") out.apply = true;
    else if (a === "--dry-run") out.apply = false;
    else if (a === "--rematch") out.rematch = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: tsx match-existing-trips.ts [--user <id>] [--since <days>] [--limit <n>] [--threshold <0..1>] [--apply | --dry-run] [--rematch]"
      );
      process.exit(0);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const prisma = new PrismaClient();

async function main() {
  const dryRun = !args.apply;
  console.log(
    `[match] mode=${dryRun ? "DRY RUN" : "APPLY"} user=${args.userId ?? "all"} since=${
      args.sinceDays ?? "all"
    }d limit=${args.limit} threshold=${args.threshold} rematch=${args.rematch}`
  );

  const trips = await prisma.trip.findMany({
    where: {
      isManualEntry: false,
      isPhantomTrip: false,
      ...(args.rematch ? {} : { routePolyline: null }),
      ...(args.userId ? { userId: args.userId } : {}),
      ...(args.sinceDays
        ? { startedAt: { gte: new Date(Date.now() - args.sinceDays * 86_400_000) } }
        : {}),
    },
    select: {
      id: true,
      userId: true,
      distanceMiles: true,
      startedAt: true,
      coordinates: {
        orderBy: { recordedAt: "asc" },
        select: { lat: true, lng: true, accuracy: true, recordedAt: true },
      },
    },
    orderBy: { startedAt: "desc" },
    take: args.limit,
  });

  console.log(`[match] candidates: ${trips.length}`);

  let matched = 0;
  let distanceUpdated = 0;
  let skippedTooFewPoints = 0;
  let skippedMatchFailed = 0;
  const affectedUsers = new Set<string>();

  for (const t of trips) {
    if (t.coordinates.length < 10) {
      skippedTooFewPoints += 1;
      continue;
    }

    const result = await matchTripRoute(
      t.coordinates.map((c) => ({
        lat: c.lat,
        lng: c.lng,
        accuracy: c.accuracy,
        recordedAt: c.recordedAt,
      }))
    );

    if (!result) {
      skippedMatchFailed += 1;
      continue;
    }

    if (!isMatchPlausible(result.distanceMiles, t.distanceMiles)) {
      const startedLocal = t.startedAt.toISOString().slice(0, 16).replace("T", " ");
      console.log(
        `[skip implausible] ${t.id.slice(0, 8)} ${startedLocal}` +
          ` ${t.distanceMiles.toFixed(2)} -> ${result.distanceMiles.toFixed(2)}mi (ratio out of trust window)`
      );
      skippedMatchFailed += 1;
      if (!dryRun) {
        await logEvent("trip.map_match_skipped_implausible", t.userId, {
          tripId: t.id,
          currentDistanceMiles: t.distanceMiles,
          matchedDistanceMiles: result.distanceMiles,
          ratio: Math.round((result.distanceMiles / t.distanceMiles) * 100) / 100,
          triggeredBy: "ops_script",
        });
      }
      continue;
    }

    const updateDistance = result.distanceMiles > t.distanceMiles * (1 + args.threshold);
    const startedLocal = t.startedAt.toISOString().slice(0, 16).replace("T", " ");

    console.log(
      `${dryRun ? "[would match] " : "[match]       "} ${t.id.slice(0, 8)} ${startedLocal}` +
        ` ${t.distanceMiles.toFixed(2)} -> ${result.distanceMiles.toFixed(2)}mi` +
        ` (${result.pointsUsed} pts) ${updateDistance ? "[distance bump]" : "[polyline only]"}`
    );

    if (!dryRun) {
      await prisma.trip.update({
        where: { id: t.id },
        data: {
          routePolyline: result.encodedPolyline,
          ...(updateDistance ? { distanceMiles: result.distanceMiles } : {}),
        },
      });

      if (updateDistance) {
        await logEvent("trip.distance_recalculated", t.userId, {
          tripId: t.id,
          oldMiles: t.distanceMiles,
          newMiles: result.distanceMiles,
          ratio: Math.round((result.distanceMiles / t.distanceMiles) * 100) / 100,
          source: "map_match_backfill",
          triggeredBy: "ops_script",
        });
        affectedUsers.add(t.userId);
        distanceUpdated += 1;
      } else {
        await logEvent("trip.map_matched", t.userId, {
          tripId: t.id,
          pointsUsed: result.pointsUsed,
          pointsFilteredOut: result.pointsFilteredOut,
          matchedDistanceMiles: result.distanceMiles,
          triggeredBy: "ops_script",
        });
      }
    } else if (updateDistance) {
      distanceUpdated += 1;
    }

    matched += 1;
  }

  if (!dryRun && affectedUsers.size > 0) {
    const taxYear = getTaxYear(new Date());
    console.log(
      `[match] refreshing MileageSummary for ${affectedUsers.size} user(s) (tax year ${taxYear})...`
    );
    for (const uid of affectedUsers) {
      try {
        await upsertMileageSummary(uid, taxYear);
      } catch (err) {
        console.warn(
          `[match] mileage summary refresh failed for ${uid}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  console.log("");
  console.log(`[match] summary:`);
  console.log(`  scanned:                     ${trips.length}`);
  console.log(`  ${dryRun ? "would match" : "matched"}:                ${matched}`);
  console.log(`  ${dryRun ? "would bump distance" : "distance updated"}:        ${distanceUpdated}`);
  console.log(`  skipped (too few points):    ${skippedTooFewPoints}`);
  console.log(`  skipped (match failed):      ${skippedMatchFailed}`);
  if (dryRun && matched > 0) {
    console.log("");
    console.log(`[match] re-run with --apply to make changes.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[match] FATAL:", err);
  process.exit(1);
});
