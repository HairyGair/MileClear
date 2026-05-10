// One-off ops script: re-run the routing service against existing manual
// trips with potentially-buggy distances (legacy crow-flies fallback bug,
// Laura Joyce report 10 May 2026).
//
// Bypasses HTTP/auth so it can be run directly from SSH:
//
//   tsx apps/api/scripts/recalc-distances.ts --dry-run
//   tsx apps/api/scripts/recalc-distances.ts --user <userId>
//   tsx apps/api/scripts/recalc-distances.ts --user <userId> --apply
//   tsx apps/api/scripts/recalc-distances.ts --since 14 --apply
//
// Mirrors the logic of POST /admin/recalc-distances. Safe to run multiple
// times — only updates trips where the new road distance is meaningfully
// higher than the stored value (5% threshold), so re-runs are idempotent.
//
// On the production server, run via:
//   cd ~/mileclear-app && npx tsx apps/api/scripts/recalc-distances.ts --user <id>
//
// The script logs every change to app_events as trip.distance_recalculated.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolveRouteDistance } from "../src/services/routing.js";
import { upsertMileageSummary } from "../src/services/mileage.js";
import { logEvent } from "../src/services/appEvents.js";
import { getTaxYear } from "@mileclear/shared";

const args = parseArgs(process.argv.slice(2));
const prisma = new PrismaClient();

interface Args {
  userId?: string;
  sinceDays?: number;
  limit: number;
  threshold: number;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { limit: 500, threshold: 0.05, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user" || a === "-u") out.userId = argv[++i];
    else if (a === "--since" || a === "-s") out.sinceDays = parseInt(argv[++i], 10);
    else if (a === "--limit" || a === "-l") out.limit = parseInt(argv[++i], 10);
    else if (a === "--threshold" || a === "-t") out.threshold = parseFloat(argv[++i]);
    else if (a === "--apply") out.apply = true;
    else if (a === "--dry-run") out.apply = false;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: tsx recalc-distances.ts [--user <id>] [--since <days>] [--limit <n>] [--threshold <0..1>] [--apply | --dry-run]"
      );
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const dryRun = !args.apply;
  console.log(
    `[recalc] mode=${dryRun ? "DRY RUN" : "APPLY"} user=${args.userId ?? "all"} since=${
      args.sinceDays ?? "all"
    }d limit=${args.limit} threshold=${args.threshold}`
  );

  const trips = await prisma.trip.findMany({
    where: {
      isManualEntry: true,
      isPhantomTrip: false,
      endLat: { not: null },
      endLng: { not: null },
      ...(args.userId ? { userId: args.userId } : {}),
      ...(args.sinceDays
        ? { startedAt: { gte: new Date(Date.now() - args.sinceDays * 86_400_000) } }
        : {}),
    },
    select: {
      id: true,
      userId: true,
      startLat: true,
      startLng: true,
      endLat: true,
      endLng: true,
      distanceMiles: true,
      startedAt: true,
      startAddress: true,
      endAddress: true,
    },
    orderBy: { startedAt: "desc" },
    take: args.limit,
  });

  console.log(`[recalc] candidates: ${trips.length}`);

  let updated = 0;
  let skippedAlreadyCorrect = 0;
  let skippedRoutingFailed = 0;
  const affectedUsers = new Set<string>();

  for (const t of trips) {
    if (t.endLat == null || t.endLng == null) continue;

    const route = await resolveRouteDistance({
      startLat: t.startLat,
      startLng: t.startLng,
      endLat: t.endLat,
      endLng: t.endLng,
      userId: t.userId,
    });

    if (!route) {
      skippedRoutingFailed += 1;
      continue;
    }

    const newMiles = route.distanceMiles;
    const oldMiles = t.distanceMiles;

    if (newMiles <= oldMiles * (1 + args.threshold)) {
      skippedAlreadyCorrect += 1;
      continue;
    }

    const ratio = oldMiles > 0 ? newMiles / oldMiles : Infinity;
    const startedLocal = t.startedAt.toISOString().slice(0, 16).replace("T", " ");
    const fromTo = `${t.startAddress?.slice(0, 30) ?? "?"} -> ${t.endAddress?.slice(0, 30) ?? "?"}`;
    console.log(
      `${dryRun ? "[would update]" : "[update]    "} ${t.id.slice(0, 8)} ${startedLocal}` +
        ` ${oldMiles.toFixed(2)} -> ${newMiles.toFixed(2)} mi (${(ratio * 100).toFixed(0)}%)` +
        ` source=${route.source} ${fromTo}`
    );

    if (!dryRun) {
      await prisma.trip.update({
        where: { id: t.id },
        data: { distanceMiles: newMiles },
      });
      await logEvent("trip.distance_recalculated", t.userId, {
        tripId: t.id,
        oldMiles,
        newMiles,
        ratio: Math.round(ratio * 100) / 100,
        source: route.source,
        startedAt: t.startedAt.toISOString(),
        triggeredBy: "ops_script",
      });
      affectedUsers.add(t.userId);
    }
    updated += 1;
  }

  if (!dryRun && affectedUsers.size > 0) {
    const taxYear = getTaxYear(new Date());
    console.log(`[recalc] refreshing MileageSummary for ${affectedUsers.size} user(s) (tax year ${taxYear})...`);
    for (const uid of affectedUsers) {
      try {
        await upsertMileageSummary(uid, taxYear);
      } catch (err) {
        console.warn(`[recalc] mileage summary refresh failed for ${uid}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log("");
  console.log(`[recalc] summary:`);
  console.log(`  scanned:                ${trips.length}`);
  console.log(`  ${dryRun ? "would update" : "updated"}:           ${updated}`);
  console.log(`  skipped (close enough): ${skippedAlreadyCorrect}`);
  console.log(`  skipped (routing fail): ${skippedRoutingFailed}`);
  if (dryRun && updated > 0) {
    console.log("");
    console.log(`[recalc] re-run with --apply to make changes.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[recalc] FATAL:", err);
  process.exit(1);
});
