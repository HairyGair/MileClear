// Dry run: "Next week on your roads" (jobs/roadWeekAhead.ts).
//
// READ-ONLY. Sends nothing and writes nothing. Uses the same planner the job
// uses (planRoadWeekAhead from dist/), so build first.
//
// It plans as of the coming Sunday 18:00 UK (the job's next send), or as of
// AS_OF=<ISO instant> if given, and prints:
//   - drivers eligible (road alerts on, with a push token)
//   - how many would get a push, and why the rest would not
//   - how many items each push would carry
//   - 10 sample push texts, anonymised (no names, emails or ids; the street
//     name in the copy is the only place word)
//
// Needs STREET_MANAGER_SNS_ENABLED=1 in the env (the prod .env has it), as
// the planner reads no works otherwise. ROAD_WEEK_AHEAD_PUSH is NOT needed.
// The "already sent" and "likely driving" checks are skipped by default, as
// they mean nothing for a future Sunday; CHECK_SENT=1 turns the first back on.
//
// Run ON the server from ~/mileclear-app/apps/api, after a build:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/dry-run-week-ahead.mjs

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with --env-file on the server.");
  process.exit(1);
}
if (process.env.STREET_MANAGER_SNS_ENABLED !== "1") {
  console.error("STREET_MANAGER_SNS_ENABLED is not 1: there would be no works to read.");
  process.exit(1);
}

const { planRoadWeekAhead } = await import("../dist/jobs/roadWeekAhead.js");
const { weekAheadWindow } = await import("../dist/services/roadWeekAheadRule.js");
const { ukLocalParts } = await import("../dist/services/roadCorridor.js");
const { prisma } = await import("../dist/lib/prisma.js");

/** The coming Sunday at 18:00 UK (today, if it is Sunday before 20:00). */
function nextSendTick(now) {
  const p = ukLocalParts(now);
  const daysAhead = p.weekday === 0 && p.minutes < 20 * 60 ? 0 : (7 - p.weekday) % 7 || 7;
  const [y, m, d] = p.dayKey.split("-").map(Number);
  // 18:00 UK is 18:00 UTC in GMT and 17:00 UTC in BST (the clocks change on
  // a Sunday, so never add 18 hours to midnight).
  const at18Utc = Date.UTC(y, m - 1, d + daysAhead, 18);
  for (const t of [at18Utc, at18Utc - 3600000]) {
    if (ukLocalParts(new Date(t)).minutes === 18 * 60) return new Date(t);
  }
  return new Date(at18Utc);
}

const asOf = process.env.AS_OF ? new Date(process.env.AS_OF) : nextSendTick(new Date());
if (Number.isNaN(asOf.getTime())) {
  console.error("AS_OF is not a date.");
  process.exit(1);
}
const window = weekAheadWindow(asOf);

try {
  const t0 = Date.now();
  const plan = await planRoadWeekAhead(asOf, { checkSent: process.env.CHECK_SENT === "1", checkDriving: false });

  console.log(`As of ${asOf.toISOString()} (week ${plan.weekKey}, ${window.start.toISOString()} to ${window.end.toISOString()})`);
  console.log(`Drivers eligible (road alerts on, push token): ${plan.candidates}`);
  console.log(`Would get a push: ${plan.plans.length}`);
  console.log(`Would not, by reason: ${JSON.stringify(plan.skipped)}`);

  const dist = {};
  for (const p of plan.plans) {
    const k = p.selection.total > 5 ? "6+" : String(p.selection.total);
    dist[k] = (dist[k] ?? 0) + 1;
  }
  console.log("Items per push (total on their roads that week):");
  for (const k of Object.keys(dist).sort()) console.log(`  ${k}: ${dist[k]}`);

  const tiers = { closure: 0, traffic_sensitive: 0, lights_or_lanes: 0 };
  for (const p of plan.plans) {
    const t = p.selection.items[0]?.tier;
    if (t === 0) tiers.closure++;
    else if (t === 1) tiers.traffic_sensitive++;
    else if (t === 2) tiers.lights_or_lanes++;
  }
  console.log(`Top item kind: ${JSON.stringify(tiers)}`);

  // Shuffle so the samples are not always the same drivers, then strip all
  // identity: only the push words are printed.
  const sample = [...plan.plans].sort(() => Math.random() - 0.5).slice(0, 10);
  console.log(`\n${sample.length} sample pushes (anonymised):`);
  sample.forEach((p, i) => console.log(`  ${i + 1}. ${p.copy.title}: ${p.copy.body}`));
  console.log(`\nDone in ${Math.round((Date.now() - t0) / 1000)} s. Nothing was sent or written.`);
} finally {
  await prisma.$disconnect();
}
