// READ-ONLY: did the location-starvation push help? Run on the server:
//
//   ssh mileclear@85.234.151.224 'cd ~/mileclear-app/apps/api && \
//     node --env-file=/home/mileclear/mileclear-app/.env scripts/location-starvation-effect.mjs [days]'
//
// For every driver pushed (app_events notification.location_starvation) it
// compares, in the 7 days before and the 7 days after the push:
//   - automatic trips saved (not manual, not phantom)
//   - starved recordings dropped (trip.recording_dropped, reason too_short or
//     no_coords, 3 location points or fewer, 60s+ where known; same rule as
//     jobs/locationStarvation.ts)
// and counts who tapped the push (notification.location_starvation_opened) and
// who flipped MileClear to Unrestricted afterwards (battery_opt_nudge.resolved).
//
// Comparison group: drivers the dry run flagged (location_starvation.dry_run)
// who were never pushed, measured around their dry-run time the same way. They
// match the pushed group on the pattern and the period. If the job has not
// been dry-run first, that group is empty and the script says so.
//
// [days] is how far back to look for pushes (default 30). A push less than 7
// days old has an unfinished "after" window and is marked partial; it is left
// out of the totals. Nothing here writes. Fields are selected explicitly
// because the local schema can run ahead of production.

import { PrismaClient } from "@prisma/client";

const lookbackDays = Number(process.argv[2] ?? 30) || 30;
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const now = Date.now();
const p = new PrismaClient();

function isStarved(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) return false;
  if (m.platform !== "android") return false;
  if (m.reason !== "too_short" && m.reason !== "no_coords") return false;
  const coords = typeof m.coords === "number" ? m.coords : m.reason === "no_coords" ? 0 : null;
  if (coords === null || coords > 3) return false;
  if (typeof m.durationSec === "number" && m.durationSec < 60) return false;
  return true;
}

async function measure(userId, at) {
  const before = new Date(at - WEEK);
  const after = new Date(at + WEEK);
  const [trips, drops, resolved, opened] = await Promise.all([
    p.trip.findMany({
      where: {
        userId,
        isManualEntry: false,
        isPhantomTrip: false,
        createdAt: { gte: before, lt: after },
      },
      select: { createdAt: true },
    }),
    p.appEvent.findMany({
      where: { userId, type: "trip.recording_dropped", createdAt: { gte: before, lt: after } },
      select: { createdAt: true, metadata: true },
    }),
    p.appEvent.findFirst({
      where: { userId, type: "battery_opt_nudge.resolved", createdAt: { gte: new Date(at), lt: after } },
      select: { id: true },
    }),
    p.appEvent.findFirst({
      where: { userId, type: "notification.location_starvation_opened", createdAt: { gte: new Date(at), lt: after } },
      select: { id: true },
    }),
  ]);
  const split = (rows) => ({
    before: rows.filter((r) => r.createdAt.getTime() < at).length,
    after: rows.filter((r) => r.createdAt.getTime() >= at).length,
  });
  return {
    trips: split(trips),
    starved: split(drops.filter((d) => isStarved(d.metadata))),
    resolved: !!resolved,
    opened: !!opened,
  };
}

function summarise(label, rows) {
  const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
  const tb = sum((r) => r.m.trips.before);
  const ta = sum((r) => r.m.trips.after);
  const sb = sum((r) => r.m.starved.before);
  const sa = sum((r) => r.m.starved.after);
  const recovered = rows.filter((r) => r.m.trips.before === 0 && r.m.trips.after > 0).length;
  const stillStarved = rows.filter((r) => r.m.starved.after >= 3).length;
  console.log(`\n${label}: ${rows.length} drivers`);
  console.log(`  auto trips saved   7d before ${tb}   7d after ${ta}   (${rows.length ? (ta / rows.length).toFixed(1) : "-"} per driver after)`);
  console.log(`  starved drops      7d before ${sb}   7d after ${sa}`);
  console.log(`  drivers with 0 trips before and some after: ${recovered}`);
  console.log(`  drivers with 3+ starved drops still in the after week: ${stillStarved}`);
  console.log(`  tapped the push: ${rows.filter((r) => r.m.opened).length}   set to Unrestricted afterwards: ${rows.filter((r) => r.m.resolved).length}`);
}

try {
  const since = new Date(now - lookbackDays * DAY);
  const pushes = await p.appEvent.findMany({
    where: { type: "notification.location_starvation", createdAt: { gte: since }, userId: { not: null } },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const pushedIds = new Set(pushes.map((e) => e.userId));
  const dry = await p.appEvent.findMany({
    where: { type: "location_starvation.dry_run", createdAt: { gte: since }, userId: { not: null } },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // First event per driver in each group, so a driver counts once.
  const first = (rows, skip) => {
    const seen = new Map();
    for (const r of rows) if (!skip?.has(r.userId) && !seen.has(r.userId)) seen.set(r.userId, r.createdAt.getTime());
    return [...seen.entries()];
  };

  const run = async (entries) => {
    const done = [];
    let partial = 0;
    for (const [userId, at] of entries) {
      if (now - at < WEEK) {
        partial++;
        continue;
      }
      done.push({ userId, at, m: await measure(userId, at) });
    }
    return { done, partial };
  };

  const pushed = await run(first(pushes));
  const control = await run(first(dry, pushedIds));

  console.log(`Location-starvation push, last ${lookbackDays} days`);
  console.log(`Pushed drivers: ${pushedIds.size} (${pushed.partial} still inside their 7-day after window, left out)`);
  console.log(`Dry-run-only drivers (comparison): ${control.done.length + control.partial} (${control.partial} still partial)`);
  summarise("PUSHED", pushed.done);
  if (control.done.length) summarise("COMPARISON (flagged, never pushed)", control.done);
  else console.log("\nCOMPARISON: none. Dry-run first (leave LOCATION_STARVATION_PUSH unset for a few days) to build one.");
  console.log("\nRead it as: pushed vs comparison on 'auto trips saved after' and 'starved drops after'. Small groups are noise.");
} finally {
  await p.$disconnect();
}
