// Diversion labels backfill (5 Oct 2026). See src/services/diversionRule.ts
// for the rule and src/services/diversions.ts for the runner. DRY RUN by
// default; --apply writes trip_diversions rows (a label only: trips are never
// changed) and logs trip.diversion_labelled with triggeredBy "backfill".
// Undo: delete the rows (DELETE FROM trip_diversions WHERE ...).
// Needs a current build (it imports dist/) and the trip_diversions migration.
// Runs whether or not TRIP_DIVERSIONS is set, so it can be measured first.
//
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/backfill-diversions.mjs [--since 2026-10-05] [--user <id prefix>] [--apply]
import { PrismaClient } from "@prisma/client";
const { runDiversionLabel } = await import("../dist/services/diversions.js");
const { DIVERSION_MIN_POINTS } = await import("../dist/services/diversionRule.js");

const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
// Street Manager data starts on 5 Oct 2026: nothing before it can match.
const SINCE = new Date(arg("--since", "2026-10-05T00:00:00Z"));
const USER_PREFIX = arg("--user", null);

const trips = await p.trip.findMany({
  where: {
    isManualEntry: false,
    isPhantomTrip: false,
    coordinateCount: { gte: DIVERSION_MIN_POINTS },
    endedAt: { not: null },
    endLat: { not: null },
    startedAt: { gte: SINCE },
    diversion: { is: null },
    ...(USER_PREFIX ? { userId: { startsWith: USER_PREFIX } } : {}),
  },
  select: { id: true, userId: true, startedAt: true },
  orderBy: { startedAt: "asc" },
});
console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${trips.length} recorded trips since ${SINCE.toISOString().slice(0, 10)} with ${DIVERSION_MIN_POINTS}+ GPS points`);

const reasons = {};
const labelled = [];
let i = 0;
for (const t of trips) {
  i++;
  let r = null;
  try {
    r = await runDiversionLabel({ tripId: t.id, userId: t.userId, dryRun: !APPLY, triggeredBy: "backfill" });
  } catch (err) {
    console.error(`trip ${t.id.slice(0, 8)} failed: ${err.message}`);
  }
  if (!r) reasons.skipped_or_error = (reasons.skipped_or_error || 0) + 1;
  else if (r.decision.ok) labelled.push({ ...r.decision, userId: t.userId });
  else reasons[r.decision.reason] = (reasons[r.decision.reason] || 0) + 1;
  if (i % 200 === 0) console.log(`  ...${i}/${trips.length}`);
  await new Promise((res) => setTimeout(res, 10));
}

const extra = labelled.reduce((s, d) => s + d.diversion.extraMiles, 0);
console.log(
  `${APPLY ? "labelled" : "would label"} ${labelled.length} trips (${new Set(labelled.map((d) => d.userId)).size} drivers), ${extra.toFixed(1)} extra mi in total (distances unchanged)`
);
console.log("not labelled:", JSON.stringify(Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1]))));
// Anonymised samples: extra miles, usual miles, street name only.
for (const d of labelled.slice(0, 10)) {
  console.log(
    `  +${d.diversion.extraMiles.toFixed(2)} mi on a usual ${d.diversion.usualMiles.toFixed(2)} mi (${d.historyCount} past trips), closed: ${d.diversion.streetName ?? "(unnamed street)"}`
  );
}
await p.$disconnect();
