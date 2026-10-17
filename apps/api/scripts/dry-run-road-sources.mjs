// Dry run: the three newer road-data sources for road alerts (TfL, Traffic
// Wales, National Highways planned closures; services/roadSources.ts).
//
// READ-ONLY. Sends nothing and writes nothing. It fetches each source once
// (one TfL request, three Traffic Wales feeds, about four National Highways
// pages; no keys are sent unless TFL_APP_KEY is set), reads the opted-in
// drivers' usual roads from the database the same way the road alerts job
// does (trips and breadcrumbs, select only), and prints:
//   - per source: items, how many are in effect now or start in the next
//     8 days, and counts by category/severity
//   - per source: how many opted-in drivers' usual roads touch the area,
//     how many would see at least one item, and how many would see a
//     closure or serious item (the only kind that can cause a push)
//   - for TfL: how many items were dropped as Street Manager duplicates
//     (needs STREET_MANAGER_SNS_ENABLED=1, else none are dropped)
// No names, emails or ids are printed.
//
// Sources: those switched on (ROAD_SOURCE_TFL / ROAD_SOURCE_WALES /
// ROAD_SOURCE_NH = 1), or forced with FORCE=tfl,wales,nh (or FORCE=all).
//
// Run ON the server from ~/mileclear-app/apps/api, after a build:
//   FORCE=all node --env-file=/home/mileclear/mileclear-app/.env scripts/dry-run-road-sources.mjs

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with --env-file on the server.");
  process.exit(1);
}

const { loadTfl, loadWales, loadNh, isSourceEnabled, FEED_SPECS } = await import("../dist/services/roadSources.js");
const { bboxTouches, eventBbox, withoutStreetManagerDuplicates } = await import("../dist/services/roadSourcesParse.js");
const { loadCorridor } = await import("../dist/services/roadAlerts.js");
const { matchEventToCorridor } = await import("../dist/services/roadCorridor.js");
const { splitForScreen } = await import("../dist/services/roadAlertsRule.js");
const { loadStreetWorks, isStreetManagerEnabled } = await import("../dist/services/streetManager.js");
const { pushPrefOptedIn } = await import("../dist/services/pushPrefs.js");
const { prisma } = await import("../dist/lib/prisma.js");

const forced = new Set(
  (process.env.FORCE ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
const ALIASES = { tfl: "tfl", wales: "traffic_wales", traffic_wales: "traffic_wales", nh: "national_highways", national_highways: "national_highways" };
const want = new Set();
for (const f of forced) {
  if (f === "all") ["tfl", "traffic_wales", "national_highways"].forEach((s) => want.add(s));
  else if (ALIASES[f]) want.add(ALIASES[f]);
  else console.warn(`FORCE: unknown source "${f}" ignored`);
}
for (const s of ["tfl", "traffic_wales", "national_highways"]) if (isSourceEnabled(s)) want.add(s);
if (want.size === 0) {
  console.error("No source enabled or forced. Use FORCE=tfl,wales,nh or FORCE=all.");
  process.exit(1);
}

const LOADERS = { tfl: loadTfl, traffic_wales: loadWales, national_highways: loadNh };
const HORIZON_MS = 8 * 86400000;
const now = new Date();

function tally(events) {
  const out = {};
  for (const e of events) {
    const k = `${e.category}/${e.severity}`;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

const bySource = {};
for (const s of want) {
  const t0 = Date.now();
  try {
    const all = await LOADERS[s](now);
    const live = all.filter(
      (e) => (!e.endAt || e.endAt > now) && (!e.startAt || e.startAt.getTime() <= now.getTime() + HORIZON_MS)
    );
    bySource[s] = live.map((e) => ({ ...e, future: e.startAt != null && e.startAt > now, _box: eventBbox(e) }));
    console.log(`\n${s}: ${all.length} items fetched in ${Date.now() - t0} ms; ${live.length} in effect now or starting within 8 days`);
    for (const [k, v] of Object.entries(tally(live)).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  } catch (err) {
    console.log(`\n${s}: FETCH FAILED (${err?.message ?? err})`);
    bySource[s] = [];
  }
}

try {
  const users = await prisma.user.findMany({
    where: { pushPrefs: { path: "$.roadAlerts", equals: true } },
    select: { id: true, pushPrefs: true, pushToken: true },
  });
  const optedIn = users.filter((u) => pushPrefOptedIn(u.pushPrefs, "roadAlerts"));
  console.log(`\nOpted-in drivers: ${optedIn.length} (${optedIn.filter((u) => u.pushToken).length} with a push token)`);

  const stats = {};
  for (const s of want) stats[s] = { touchArea: 0, seeAny: 0, seeSerious: 0, items: 0, dupesDropped: 0 };
  let noCorridor = 0;

  for (const u of optedIn) {
    const corridor = await loadCorridor(u.id, now);
    if (!corridor.bbox) { noCorridor++; continue; }
    const works = want.has("tfl") && isStreetManagerEnabled() && bboxTouches(corridor.bbox, FEED_SPECS.tfl.area)
      ? await loadStreetWorks(corridor.bbox, now, 8)
      : [];
    for (const s of want) {
      if (!bboxTouches(corridor.bbox, FEED_SPECS[s].area)) continue;
      stats[s].touchArea++;
      let candidates = bySource[s].filter((e) => e._box && bboxTouches(e._box, corridor.bbox));
      if (s === "tfl") {
        const kept = withoutStreetManagerDuplicates(candidates, works);
        stats[s].dupesDropped += candidates.length - kept.length;
        candidates = kept;
      }
      const matches = [];
      for (const e of candidates) {
        const m = matchEventToCorridor(corridor, e);
        if (m.matched) matches.push({ event: e, days: m.days });
      }
      const { current, upcoming } = splitForScreen(matches, now);
      const shown = current.length + upcoming.length;
      stats[s].items += shown;
      if (shown > 0) stats[s].seeAny++;
      if ([...current, ...upcoming].some((m) => m.event.severity === "closure" || m.event.severity === "major")) stats[s].seeSerious++;
    }
  }

  console.log(`Drivers with no usual roads yet: ${noCorridor}`);
  for (const s of want) {
    const x = stats[s];
    console.log(
      `\n${s}:\n  usual roads touch its area: ${x.touchArea}\n  would see at least one item on the Road alerts screen: ${x.seeAny}` +
        `\n  would see a closure or serious item: ${x.seeSerious}\n  items shown, all drivers: ${x.items}` +
        (s === "tfl" ? `\n  dropped as Street Manager duplicates: ${x.dupesDropped}${isStreetManagerEnabled() ? "" : " (Street Manager off here)"}` : "")
    );
  }
  console.log("\nNothing was written and nothing was sent. (Grouping, dismissals and the Sunday push are not applied here.)");
} finally {
  await prisma.$disconnect();
}
