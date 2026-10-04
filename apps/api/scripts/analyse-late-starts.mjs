// READ-ONLY. How often do recorded drives start late? (4 Oct 2026)
//
// A late start: a recorded (non-manual, non-phantom) trip whose first point is
// 0.2-2 mi (straight line) from where the same driver's previous trip ended,
// with that previous trip ending at most 12 h earlier. The first stretch of
// the drive is missing. See src/services/lateStart.ts for the fix.
//
// Writes nothing. Run on the server (~/mileclear-app/apps/api):
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/analyse-late-starts.mjs
// Options:
//   --days 30            look-back window (default 30)
//   --daily-from 2026-09-15   first day of the by-day table (default 15 Sep 2026)
//   --user df0a037d      also list every candidate for users whose id starts with this
import fs from "node:fs";
import { createRequire } from "node:module";
const { PrismaClient } = createRequire(new URL("../package.json", import.meta.url))("@prisma/client");
const url =
  process.env.DATABASE_URL ??
  fs.readFileSync(new URL("../../../.env", import.meta.url), "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)[1];
const p = new PrismaClient({ datasources: { db: { url } } });

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const DAYS = Number(arg("--days", "30"));
const DAILY_FROM = arg("--daily-from", "2026-09-15");
const USER_PREFIX = arg("--user", null);

const H = 3600e3;
const MAX_GAP_MS = 12 * H;
const MIN_CROW = 0.2, MAX_CROW = 2.0;
const MOVING_MPS = 4, MOVING_IMPLIED_MPH = 9, MAX_IMPLIED_MPH = 90; // same judgement as lateStart.movingAtFirstRealFix
const ANCHOR_MATCH_MILES = 0.15; // lateStart.LATE_START_ANCHOR_MATCH_MILES
const TYPICAL_ROAD_RATIO = 1.3; // estimate only; the backfill dry run uses real routes

const now = new Date();
const windowStart = new Date(now.getTime() - DAYS * 864e5);
const dailyFromMs = Math.min(new Date(DAILY_FROM + "T00:00:00Z").getTime(), windowStart.getTime());
const loadFrom = new Date(dailyFromMs - MAX_GAP_MS - 864e5);

function miles(aLat, aLng, bLat, bLng) {
  const R = 3958.8, r = (d) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat), dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const ukDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
const day = (d) => ukDay.format(d);
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "-");
const band = (v, edges) => { for (const [lim, label] of edges) if (v < lim) return label; return edges[edges.length - 1][1]; };
const crowBand = (c) => band(c, [[0.4, "0.2-0.4"], [0.6, "0.4-0.6"], [1.0, "0.6-1.0"], [Infinity, "1.0-2.0"]]);
const gapBand = (m) => band(m, [[5, "<5 min"], [15, "5-15 min"], [60, "15-60 min"], [180, "1-3 h"], [Infinity, "3-12 h"]]);
const gq = (raw) => (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {});
async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}
function table(title, rows, cols) {
  console.log(`\n== ${title}`);
  console.log(cols.join("\t"));
  for (const r of rows) console.log(cols.map((c) => r[c] ?? "").join("\t"));
}

// ── Load ───────────────────────────────────────────────────────────────────
const trips = await p.trip.findMany({
  where: { isPhantomTrip: false, OR: [{ startedAt: { gte: loadFrom } }, { endedAt: { gte: loadFrom } }] },
  select: {
    id: true, userId: true, vehicleId: true, shiftId: true, isManualEntry: true,
    startedAt: true, endedAt: true, createdAt: true, startLat: true, startLng: true, endLat: true, endLng: true,
    distanceMiles: true, originalStartLat: true, gpsQuality: true,
  },
});
console.log(`READ ONLY. ${trips.length} non-phantom trips loaded since ${loadFrom.toISOString().slice(0, 10)}; window ${DAYS} days; by-day from ${DAILY_FROM}`);

const userIds = [...new Set(trips.map((t) => t.userId))];
const users = await p.user.findMany({ where: { id: { in: userIds } }, select: { id: true, platformsSeen: true, buildNumber: true } });
const platformOf = new Map(users.map((u) => {
  const s = u.platformsSeen || "";
  const a = s.includes("android"), i = s.includes("ios");
  return [u.id, a && i ? "both" : a ? "android" : i ? "ios" : "unknown"];
}));
const currentBuild = new Map(users.map((u) => [u.id, u.buildNumber || "?"]));

// Per-trip build: the trip.created event logged with the trip (it carries the
// build from the driver's latest heartbeat). Matched by user + createdAt.
const createdEvents = await p.appEvent.findMany({
  where: { type: "trip.created", createdAt: { gte: loadFrom } },
  select: { userId: true, createdAt: true, buildNumber: true },
});
const evByUser = new Map();
for (const e of createdEvents) {
  if (!e.userId) continue;
  const l = evByUser.get(e.userId) || [];
  l.push(e);
  evByUser.set(e.userId, l);
}
function buildFor(t) {
  const l = evByUser.get(t.userId);
  if (!l) return null;
  let best = null, bestD = 120e3;
  for (const e of l) {
    const d = Math.abs(e.createdAt - t.createdAt);
    if (d <= bestD) { best = e; bestD = d; }
  }
  return best?.buildNumber ?? null;
}

// ── Pair each recorded trip with its previous trip ────────────────────────
const byUser = new Map();
for (const t of trips) {
  if (!t.endedAt) continue;
  const l = byUser.get(t.userId) || [];
  l.push(t);
  byUser.set(t.userId, l);
}
for (const l of byUser.values()) l.sort((a, b) => a.endedAt - b.endedAt);
function prevOf(b) {
  const l = byUser.get(b.userId) || [];
  let prev = null;
  for (const t of l) {
    if (t.endedAt > b.startedAt) break;
    if (t.id !== b.id) prev = t;
  }
  if (!prev || b.startedAt - prev.endedAt > MAX_GAP_MS || prev.endLat == null || prev.endLng == null) return null;
  return prev;
}

const recorded = trips.filter((t) => !t.isManualEntry && t.startedAt.getTime() >= dailyFromMs);
const paired = [];
for (const b of recorded) {
  const prev = prevOf(b);
  if (!prev) continue;
  const crow = miles(prev.endLat, prev.endLng, b.startLat, b.startLng);
  paired.push({ b, prev, crow, gapMin: (b.startedAt - prev.endedAt) / 60000 });
}
const candidates = paired.filter((x) => x.crow >= MIN_CROW && x.crow <= MAX_CROW);
console.log(`${recorded.length} recorded trips since ${DAILY_FROM}; ${paired.length} have a previous trip ending within 12 h; ${candidates.length} start 0.2-2 mi from it`);

// First two fixes of every paired trip (motion + the device anchor-plant signature),
// last fix of each candidate's previous trip (accuracy).
await inBatches(paired, 10, async (x) => {
  x.fixes = await p.tripCoordinate.findMany({
    where: { tripId: x.b.id }, orderBy: { recordedAt: "asc" }, take: 3,
    select: { lat: true, lng: true, speed: true, accuracy: true, recordedAt: true },
  });
});
await inBatches(candidates, 10, async (x) => {
  const last = await p.tripCoordinate.findFirst({ where: { tripId: x.prev.id }, orderBy: { recordedAt: "desc" }, select: { accuracy: true } });
  x.prevEndAccuracy = last?.accuracy ?? null;
});
// The phone plants its departure anchor as a synthetic first fix: speed 0,
// accuracy exactly 50, 30 s before the first real fix. It is not a recorded
// fix, so motion is judged from the real fixes after it.
const anchorPlanted = (fixes) => fixes?.[0]?.speed === 0 && fixes?.[0]?.accuracy === 50;
const realFixes = (fixes) => (anchorPlanted(fixes) ? fixes.slice(1) : fixes || []);
function motion(fixes) {
  const real = realFixes(fixes);
  if (real.length === 0) return "unknown";
  const [a, b] = real;
  if (a.speed != null && a.speed >= MOVING_MPS) return "moving";
  if (!b) return a.speed != null ? "stationary" : "unknown";
  const h = (b.recordedAt - a.recordedAt) / H;
  if (!(h > 0)) return a.speed != null ? "stationary" : "unknown";
  const mph = miles(a.lat, a.lng, b.lat, b.lng) / h;
  if (mph > MAX_IMPLIED_MPH) return "unknown"; // a jump, not motion
  return mph >= MOVING_IMPLIED_MPH ? "moving" : "stationary";
}

// Missed-journey offers for each candidate pair.
const keys = candidates.map((x) => `${x.prev.id}:${x.b.id}`);
const offerByKey = new Map();
for (let i = 0; i < keys.length; i += 500) {
  const rows = await p.missedJourneyProposal.findMany({ where: { key: { in: keys.slice(i, i + 500) } }, select: { key: true, status: true, source: true } });
  for (const r of rows) offerByKey.set(r.key, r);
}

for (const x of paired) {
  x.platform = platformOf.get(x.b.userId) || "unknown";
  x.build = buildFor(x.b) ?? `now:${currentBuild.get(x.b.userId)}`;
  x.motion = motion(x.fixes);
  x.anchor = anchorPlanted(x.fixes);
  x.day = day(x.b.startedAt);
}
for (const x of candidates) {
  const q = gq(x.b.gpsQuality);
  const offer = offerByKey.get(`${x.prev.id}:${x.b.id}`);
  x.vehicleChanged = (x.prev.vehicleId ?? null) !== (x.b.vehicleId ?? null);
  x.kind = x.b.shiftId ? "shift" : "auto";
  x.offer = q.startExtendedSource ? "extended_from_offer" : offer ? `${offer.source}:${offer.status}` : "none";
  x.moved = x.b.originalStartLat != null;
  const real = realFixes(x.fixes);
  x.firstAcc = real[0]?.accuracy ?? null;
  x.firstSpeed = real[0]?.speed ?? null;
  // Anchor near the previous end: the phone already backfilled the start.
  // Anywhere else: the rule skips it as a mismatch.
  x.anchorStatus = !x.anchor
    ? "none"
    : miles(x.fixes[0].lat, x.fixes[0].lng, x.prev.endLat, x.prev.endLng) <= ANCHOR_MATCH_MILES
      ? "backfilled"
      : "mismatch";
  x.estMiles = x.crow * TYPICAL_ROAD_RATIO;
  // Approximation of the rule (no routing, no saved-place or overlap check):
  x.approxQualifies =
    x.motion === "moving" && x.anchorStatus === "none" && !x.vehicleChanged && !x.moved && !q.startExtendedSource &&
    !(offer && (offer.status === "accepted" || offer.status === "dismissed")) &&
    (x.firstAcc == null || x.firstAcc <= 100) &&
    (x.prevEndAccuracy == null || x.prevEndAccuracy <= 100) &&
    x.gapMin * 60 >= (x.estMiles / 25) * 3600; // gap fits the drive at ~25 mph
}

// ── Last N days breakdowns ────────────────────────────────────────────────
const inWindow = candidates.filter((x) => x.b.startedAt >= windowStart);
const pairedWindow = paired.filter((x) => x.b.startedAt >= windowStart);
function breakdown(title, keyFn) {
  const rows = {};
  for (const x of inWindow) {
    const k = keyFn(x);
    rows[k] ||= { key: k, trips: 0, moving: 0, stationary: 0, unknown: 0, qualifies: 0, estMiles: 0 };
    rows[k].trips++;
    rows[k][x.motion]++;
    if (x.approxQualifies) { rows[k].qualifies++; rows[k].estMiles += x.estMiles; }
  }
  table(title, Object.values(rows).sort((a, b) => String(a.key).localeCompare(String(b.key))).map((r) => ({ ...r, estMiles: r.estMiles.toFixed(1) })),
    ["key", "trips", "moving", "stationary", "unknown", "qualifies", "estMiles"]);
}
console.log(`\nLAST ${DAYS} DAYS: ${pairedWindow.length} recorded trips with a previous trip within 12 h; ${inWindow.length} (${pct(inWindow.length, pairedWindow.length)}) start 0.2-2 mi away`);
console.log(`  moving at first fix (late start): ${inWindow.filter((x) => x.motion === "moving").length}; stationary: ${inWindow.filter((x) => x.motion === "stationary").length}; unknown: ${inWindow.filter((x) => x.motion === "unknown").length}`);
const q = inWindow.filter((x) => x.approxQualifies);
console.log(`  would roughly qualify for the fix: ${q.length} trips, ${new Set(q.map((x) => x.b.userId)).size} drivers, ~${q.reduce((s, x) => s + x.estMiles, 0).toFixed(1)} mi (crow x ${TYPICAL_ROAD_RATIO}; the backfill dry run gives routed figures)`);
breakdown("by platform", (x) => x.platform);
breakdown("by straight-line gap", (x) => crowBand(x.crow));
breakdown("by time gap", (x) => gapBand(x.gapMin));
breakdown("by vehicle", (x) => (x.vehicleChanged ? "changed" : "same"));
breakdown("by recording kind", (x) => x.kind);
breakdown("by missed-journey offer (source:status)", (x) => x.offer);
breakdown("start already moved by the server or driver (originalStartLat set)", (x) => (x.moved ? "moved" : "not moved"));
breakdown("phone's planted anchor as first fix (none / backfilled = near previous end / mismatch)", (x) => x.anchorStatus);
breakdown("platform x motion x band", (x) => `${x.platform} ${x.motion} ${crowBand(x.crow)}`);

// ── By UK day, iOS / Android ──────────────────────────────────────────────
const days = {};
for (const x of paired) {
  const plat = x.platform === "android" ? "android" : x.platform === "ios" ? "ios" : "other";
  const k = `${x.day} ${plat}`;
  days[k] ||= { day: x.day, platform: plat, withPrev: 0, late: 0, lateMoving: 0, rateMoving: "", anchorFirst: 0, anchorRate: "", estMiles: 0 };
  const r = days[k];
  r.withPrev++;
  if (x.anchor) r.anchorFirst++;
  if (x.crow >= MIN_CROW && x.crow <= MAX_CROW) {
    r.late++;
    if (x.motion === "moving") { r.lateMoving++; r.estMiles += x.crow * TYPICAL_ROAD_RATIO; }
  }
}
for (const r of Object.values(days)) { r.rateMoving = pct(r.lateMoving, r.withPrev); r.anchorRate = pct(r.anchorFirst, r.withPrev); r.estMiles = r.estMiles.toFixed(1); }
table("BY UK DAY (withPrev = recorded trips with a previous trip within 12 h; late = 0.2-2 mi away; lateMoving = and moving at first fix; anchorFirst = first fix is the phone's planted departure anchor)",
  Object.values(days).sort((a, b) => (a.day + a.platform).localeCompare(b.day + b.platform)),
  ["day", "platform", "withPrev", "late", "lateMoving", "rateMoving", "anchorFirst", "anchorRate", "estMiles"]);

// Server-side wake-lag extension by day (it only fires under 0.6 mi).
const wl = await p.appEvent.findMany({
  where: { type: { in: ["trip.wake_lag_start_extended", "trip.wake_lag_start_skipped"] }, createdAt: { gte: new Date(dailyFromMs) } },
  select: { type: true, createdAt: true, metadata: true },
});
const wlDays = {};
for (const e of wl) {
  const d = day(e.createdAt);
  wlDays[d] ||= { day: d, extended: 0, skipped: 0, reasons: {} };
  if (e.type.endsWith("extended")) wlDays[d].extended++;
  else { wlDays[d].skipped++; inc(wlDays[d].reasons, e.metadata?.reason ?? "?"); }
}
table("WAKE-LAG EXTENSION BY UK DAY (server, create time)", Object.values(wlDays).sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ ...r, reasons: JSON.stringify(r.reasons) })), ["day", "extended", "skipped", "reasons"]);

// ── By build ──────────────────────────────────────────────────────────────
const builds = {};
for (const x of paired) {
  const k = `${x.platform}/${x.build}`;
  builds[k] ||= { build: k, withPrev: 0, lateMoving: 0, rate: "", anchorFirst: 0, first: x.day, last: x.day };
  const r = builds[k];
  r.withPrev++;
  if (x.anchor) r.anchorFirst++;
  if (x.crow >= MIN_CROW && x.crow <= MAX_CROW && x.motion === "moving") r.lateMoving++;
  if (x.day < r.first) r.first = x.day;
  if (x.day > r.last) r.last = x.day;
}
for (const r of Object.values(builds)) r.rate = pct(r.lateMoving, r.withPrev);
table(`BY PLATFORM / BUILD (build from the trip.created event; "now:N" = no event, driver's current build)`,
  Object.values(builds).filter((r) => r.withPrev >= 10).sort((a, b) => a.build.localeCompare(b.build)),
  ["build", "withPrev", "lateMoving", "rate", "anchorFirst", "first", "last"]);

// ── Offers drivers already get ────────────────────────────────────────────
const offers = await p.missedJourneyProposal.groupBy({
  by: ["source", "status"], where: { createdAt: { gte: windowStart }, source: { in: ["trip_start", "gap"] } }, _count: { _all: true },
});
console.log(`\n== MISSED-JOURNEY OFFERS created in the last ${DAYS} days (source/status)`);
for (const o of offers) console.log(`  ${o.source}/${o.status}: ${o._count._all}`);
const extended = await p.appEvent.findMany({ where: { type: "trip.start_extended_from_offer", createdAt: { gte: windowStart } }, select: { metadata: true } });
console.log(`  trip.start_extended_from_offer: ${extended.length} extensions, +${extended.reduce((s, e) => s + (Number(e.metadata?.addedMiles) || 0), 0).toFixed(1)} mi`);

// ── Outliers to read by eye ───────────────────────────────────────────────
const fmt = (x) => `${x.b.id.slice(0, 8)} user ${x.b.userId.slice(0, 8)} ${x.platform}/${x.build} ${x.b.startedAt.toISOString().slice(0, 16)} crow ${x.crow.toFixed(2)} mi gap ${x.gapMin.toFixed(0)} min ${x.motion} anchor ${x.anchorStatus} v1 ${x.firstSpeed ?? "?"} m/s acc ${x.firstAcc ?? "?"} prevAcc ${x.prevEndAccuracy ?? "?"} veh ${x.vehicleChanged ? "CHANGED" : "same"} ${x.kind} offer ${x.offer}${x.moved ? " MOVED" : ""}${x.approxQualifies ? " QUALIFIES" : ""}`;
console.log("\n== LARGEST QUALIFYING GAPS (check these)");
for (const x of [...q].sort((a, b) => b.crow - a.crow).slice(0, 15)) console.log("  " + fmt(x));
console.log("\n== SHORTEST TIME GAPS AMONG QUALIFYING (fast hand-offs)");
for (const x of [...q].sort((a, b) => a.gapMin - b.gapMin).slice(0, 10)) console.log("  " + fmt(x));
if (USER_PREFIX) {
  console.log(`\n== EVERY CANDIDATE FOR USER ${USER_PREFIX}*`);
  for (const x of candidates.filter((c) => c.b.userId.startsWith(USER_PREFIX)).sort((a, b) => a.b.startedAt - b.b.startedAt)) console.log("  " + fmt(x));
}

await p.$disconnect();
process.exit(0);
