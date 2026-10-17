// Dry run: "Road reopened" (jobs/roadReopened.ts).
//
// READ-ONLY. Sends nothing and writes nothing. Uses the same planner the job
// uses (planRoadReopened from dist/), so build first.
//
// What it can see. Until this change the store kept no history of a closure
// finishing: a work stop overwrote the booked end with the actual end, a
// cancel deleted the row, and finished rows are purged after two days. So the
// last 7 days cannot be rebuilt from what was stored before. From the deploy
// of this change on, every closure that finishes early is noted as it arrives
// (an AppEvent road_alert.reopened_pending, written whatever
// ROAD_REOPENED_PUSH says), and this script reads those. Pending rows are
// kept 3 days, so the look-back is at most 3 days (one closure, permit and
// activity together, counts once). Run it a few days after the deploy.
//
// It prints:
//   - closures noted as reopened early in the look-back (default and most: 3 days)
//   - drivers eligible (road alerts on, with a push token)
//   - how many would have had a push, and why the rest would not
//   - 10 sample push texts, anonymised (no names, emails or ids; the street
//     name in the copy is the only place word)
//   - for context: closures the store shows as finished in the last 2 days
//     (what is left of the old data; their booked end is gone)
//
// The "one a day" and "already told" checks are skipped by default, as the
// look-back spans many days; CHECK_SENT=1 turns them back on. LOOKBACK_DAYS
// changes the look-back.
//
// Needs STREET_MANAGER_SNS_ENABLED=1 in the env (the prod .env has it).
// ROAD_REOPENED_PUSH is NOT needed.
//
// Run ON the server from ~/mileclear-app/apps/api, after a build:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/dry-run-road-reopened.mjs

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with --env-file on the server.");
  process.exit(1);
}
if (process.env.STREET_MANAGER_SNS_ENABLED !== "1") {
  console.error("STREET_MANAGER_SNS_ENABLED is not 1: there would be no works to read.");
  process.exit(1);
}

const { planRoadReopened } = await import("../dist/jobs/roadReopened.js");
const { prisma } = await import("../dist/lib/prisma.js");

const days = Math.min(3, Number(process.env.LOOKBACK_DAYS ?? 3));
if (!Number.isFinite(days) || days <= 0) {
  console.error("LOOKBACK_DAYS is not a positive number.");
  process.exit(1);
}
const now = new Date();

try {
  const t0 = Date.now();
  const plan = await planRoadReopened(now, {
    lookbackMs: days * 86400000,
    // Every reopening in the look-back, however long ago it happened.
    maxFinishAgeMs: days * 86400000 + 12 * 3600000,
    checkSent: process.env.CHECK_SENT === "1",
    checkDriving: false,
    checkReverted: true,
  });

  console.log(`Look-back: ${days} days to ${now.toISOString()}`);
  console.log(`Closures noted as reopened early (with a street name): ${plan.pending}`);
  if (plan.pending === 0) {
    console.log(
      "None noted yet. Reopenings are only noted from the deploy of this change on; " +
        "the store kept no history before it."
    );
  }
  console.log(`Drivers eligible (road alerts on, push token): ${plan.candidates}`);
  console.log(`Would have had a push: ${plan.plans.length}`);
  console.log(`Would not, by reason: ${JSON.stringify(plan.skipped)}`);

  const early = plan.plans.filter((p) => p.finding.plannedEndAt != null).length;
  console.log(`Of those, "earlier than planned": ${early}; no booked end: ${plan.plans.length - early}`);
  const others = plan.plans.filter((p) => p.others > 0).length;
  console.log(`Drivers with more than one reopening on their roads in the look-back: ${others}`);

  const sample = [...plan.plans].sort(() => Math.random() - 0.5).slice(0, 10);
  console.log(`\n${sample.length} sample pushes (anonymised):`);
  sample.forEach((p, i) => console.log(`  ${i + 1}. ${p.copy.title}: ${p.copy.body}`));

  // What is left of the old data, for context only.
  const finished = await prisma.streetWorksEvent.count({
    where: {
      trafficManagement: "road_closure",
      workStatus: { in: ["completed", "Completed", "works_completed"] },
      updatedAt: { gte: new Date(now.getTime() - 2 * 86400000) },
    },
  });
  console.log(
    `\nFor context: ${finished} road closures stored as finished in the last 2 days ` +
      "(booked end not kept, so early or not cannot be told)."
  );
  console.log(`\nDone in ${Math.round((Date.now() - t0) / 1000)} s. Nothing was sent or written.`);
} finally {
  await prisma.$disconnect();
}
