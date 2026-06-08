// One-off remediation: undo map-matching distance inflations.
//
// Until 8 Jun 2026 the map-match plausibility gate accepted any match up to
// 3.0x the stored distance and only ever increased distances ("never reduce"),
// so a mis-snapped match could inflate a trip (e.g. a real 79mi York->home
// drive stored as 111mi, ratio 1.4). In-app Recalculate can't fix these because
// it also refuses to reduce. Every inflation was logged as a
// trip.distance_recalculated event carrying the correct pre-inflation oldMiles,
// so this script restores that value for trips still showing the inflated one,
// then refreshes the affected tax-year mileage summaries.
//
//   npx tsx apps/api/scripts/remediate-mapmatch-inflation.ts            # dry-run
//   npx tsx apps/api/scripts/remediate-mapmatch-inflation.ts --user <id>
//   npx tsx apps/api/scripts/remediate-mapmatch-inflation.ts --apply
//
// Safe + idempotent: only corrects trips whose current distance still matches
// the logged inflated value AND where the correction reduces the distance, so a
// re-run (or a trip edited since) is left untouched.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { upsertMileageSummary } from "../src/services/mileage.js";
import { logEvent } from "../src/services/appEvents.js";
import { getTaxYear } from "@mileclear/shared";

const apply = process.argv.includes("--apply");
const userIdx = process.argv.indexOf("--user");
const userFilter = userIdx >= 0 ? process.argv[userIdx + 1] : null;
// Mirror of the new MATCH_PLAUSIBLE_MAX_RATIO — only events the new gate rejects.
const RATIO_THRESHOLD = 1.3;

const prisma = new PrismaClient();

async function main() {
  // Every map-match recalc whose ratio the new gate would reject, newest first.
  // CAST the JSON values to DECIMAL: comparing a raw JSON_EXTRACT result against
  // a bound parameter (?) doesn't coerce types like a literal does, so the
  // ratio filter silently matched nothing without these casts.
  const rows = await prisma.$queryRaw<
    Array<{ tripId: string | null; oldMiles: string | null; newMiles: string | null; ratio: string | null }>
  >`
    SELECT JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.tripId'))            AS tripId,
           CAST(JSON_EXTRACT(metadata, '$.oldMiles') AS DECIMAL(12,4)) AS oldMiles,
           CAST(JSON_EXTRACT(metadata, '$.newMiles') AS DECIMAL(12,4)) AS newMiles,
           CAST(JSON_EXTRACT(metadata, '$.ratio')    AS DECIMAL(12,4)) AS ratio
    FROM app_events
    WHERE type = 'trip.distance_recalculated'
      AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.source')) = 'map_match'
      AND CAST(JSON_EXTRACT(metadata, '$.ratio') AS DECIMAL(12,4)) > ${RATIO_THRESHOLD}
    ORDER BY createdAt DESC
  `;

  // Latest inflation per trip (the one that set the value it currently holds).
  const latestByTrip = new Map<string, { oldMiles: number; newMiles: number; ratio: number }>();
  for (const r of rows) {
    if (!r.tripId || r.oldMiles == null || r.newMiles == null) continue;
    if (!latestByTrip.has(r.tripId)) {
      latestByTrip.set(r.tripId, {
        oldMiles: Number(r.oldMiles),
        newMiles: Number(r.newMiles),
        ratio: Number(r.ratio),
      });
    }
  }

  let corrected = 0;
  let skipped = 0;
  let totalMilesRemoved = 0;
  const summaries = new Set<string>(); // `${userId}|${taxYear}`

  for (const [tripId, inf] of latestByTrip) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, userId: true, distanceMiles: true, startedAt: true },
    });
    if (!trip) { skipped++; continue; }
    if (userFilter && trip.userId !== userFilter) continue;

    // Still inflated? current must still match the logged inflated value (not
    // edited since), and the correction must actually reduce the distance.
    const tol = Math.max(1.0, inf.newMiles * 0.02);
    const stillInflated = Math.abs(trip.distanceMiles - inf.newMiles) <= tol;
    const reduces = inf.oldMiles < trip.distanceMiles - 0.1;
    if (!stillInflated || !reduces) { skipped++; continue; }

    const removed = trip.distanceMiles - inf.oldMiles;
    totalMilesRemoved += removed;
    corrected++;
    console.log(
      `${apply ? "FIX " : "DRY "} trip ${trip.id.slice(0, 8)}  user ${trip.userId.slice(0, 8)}  ` +
        `${trip.distanceMiles.toFixed(1)} -> ${inf.oldMiles.toFixed(1)} mi  (-${removed.toFixed(1)}, ratio ${inf.ratio})`
    );

    if (apply) {
      await prisma.trip.update({ where: { id: trip.id }, data: { distanceMiles: inf.oldMiles } });
      logEvent("trip.distance_remediated", trip.userId, {
        tripId: trip.id,
        fromMiles: trip.distanceMiles,
        toMiles: inf.oldMiles,
        ratio: inf.ratio,
        reason: "mapmatch_inflation",
      });
      summaries.add(`${trip.userId}|${getTaxYear(trip.startedAt)}`);
    }
  }

  console.log(
    `\n${apply ? "APPLIED" : "DRY-RUN"}: ${corrected} trip(s) ${apply ? "corrected" : "would be corrected"}, ` +
      `${skipped} skipped. ~${totalMilesRemoved.toFixed(0)} phantom miles ${apply ? "removed" : "to remove"}.`
  );

  if (apply && summaries.size > 0) {
    for (const key of summaries) {
      const [userId, taxYear] = key.split("|");
      await upsertMileageSummary(userId, taxYear).catch(() => {});
    }
    console.log(`Refreshed ${summaries.size} tax-year mileage summary(ies).`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
