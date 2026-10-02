// "Drivers near you" (GET /business-insights/benchmarks/local): how a driver
// compares with MileClear drivers in their own postcode area. The rules and
// maths live in services/localBenchmarkMath.ts (pure, unit-tested); this file
// only loads rows and caches.
//
// Cost, once per hour (stale-while-revalidate, one in-flight load shared):
//   - ONE grouped pass over the last 4 complete weeks of non-phantom trips
//     (userId x week x tax-year side x vehicle type), bounded by startedAt.
//   - When the window does not start on 6 April, ONE grouped pass over the
//     business trips earlier in that tax year (for the 10,000-mile step).
//   - dashboardMode + vehicles for the drivers in the window (two IN reads).
//   - Home areas from loadGeographyBase() (shared with the admin Geography
//     view, itself memoised).
// Per request: one findUnique for the viewer's dashboardMode, then in-memory
// filtering. The chosen group's distribution is cached per
// (snapshot, mode, area, region) via lib/redis.ts for an hour.

import { prisma } from "../lib/prisma.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
import { getTaxYear, parseTaxYear, type LocalBenchmark, type VehicleType } from "@mileclear/shared";
import { loadGeographyBase } from "./geographyLoader.js";
import { areaInfo } from "./geographyAreas.js";
import { fallbackVehicleTypeForUsers } from "./vehicleDefaults.js";
import {
  WINDOW_WEEKS,
  assembleLocalBenchmark,
  choosePeerGroup,
  claimPenceForSegments,
  completeWeeksWindow,
  familiesOf,
  groupDistributions,
  taxYearBoundaryInWindow,
  viewerFamily,
  type ClaimSegment,
  type DriverWindowStats,
  type GroupDistributions,
  type ModeFamily,
} from "./localBenchmarkMath.js";

const SNAPSHOT_TTL_MS = 60 * 60 * 1000;
const GROUP_CACHE_TTL_S = 60 * 60;
const WEEK_SECONDS = 7 * 24 * 60 * 60;

interface WindowRow {
  userId: string;
  wk: number | bigint;
  afterBoundary: number | bigint;
  vt: string | null;
  trips: number | bigint;
  miles: number | null;
  bizMiles: number | null;
  classified: number | bigint | string | null;
}

interface PriorRow {
  userId: string;
  vt: string | null;
  bizMiles: number | null;
}

interface Snapshot {
  key: string;
  window: { start: Date; end: Date };
  stats: Map<string, DriverWindowStats>;
  home: Map<string, { area: string | null; region: string | null }>;
}

const isVehicleType = (v: unknown): v is VehicleType => v === "car" || v === "van" || v === "motorbike";

async function loadSnapshot(now: Date): Promise<Snapshot> {
  const window = completeWeeksWindow(now);
  const boundary = taxYearBoundaryInWindow(window.start, window.end);
  // With no boundary inside the window, compare against the window end so
  // every row lands on the "before" side.
  const sideCut = boundary ?? window.end;
  const startTaxYear = getTaxYear(window.start);
  const startTaxYearStart = parseTaxYear(startTaxYear).start;
  const endTaxYear = boundary ? getTaxYear(boundary) : startTaxYear;

  const [rows, priorRows, geo] = await Promise.all([
    prisma.$queryRaw<WindowRow[]>`
      SELECT /*+ MAX_EXECUTION_TIME(20000) */
        t.userId AS userId,
        FLOOR(TIMESTAMPDIFF(SECOND, ${window.start}, t.startedAt) / ${WEEK_SECONDS}) AS wk,
        (t.startedAt >= ${sideCut}) AS afterBoundary,
        v.vehicleType AS vt,
        COUNT(*) AS trips,
        SUM(t.distanceMiles) AS miles,
        SUM(CASE WHEN t.classification = 'business' THEN t.distanceMiles ELSE 0 END) AS bizMiles,
        SUM(CASE WHEN t.classification IN ('business', 'personal') THEN 1 ELSE 0 END) AS classified
      FROM trips t
      LEFT JOIN vehicles v ON v.id = t.vehicleId
      WHERE t.isPhantomTrip = 0
        AND t.startedAt >= ${window.start}
        AND t.startedAt < ${window.end}
      GROUP BY t.userId, wk, afterBoundary, v.vehicleType
    `,
    startTaxYearStart.getTime() < window.start.getTime()
      ? prisma.$queryRaw<PriorRow[]>`
          SELECT /*+ MAX_EXECUTION_TIME(20000) */
            t.userId AS userId, v.vehicleType AS vt, SUM(t.distanceMiles) AS bizMiles
          FROM trips t
          LEFT JOIN vehicles v ON v.id = t.vehicleId
          WHERE t.isPhantomTrip = 0
            AND t.classification = 'business'
            AND t.startedAt >= ${startTaxYearStart}
            AND t.startedAt < ${window.start}
          GROUP BY t.userId, v.vehicleType
        `
      : Promise.resolve([] as PriorRow[]),
    loadGeographyBase(),
  ]);

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [modes, fallbackTypes] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, dashboardMode: true } })
      : Promise.resolve([] as { id: string; dashboardMode: string }[]),
    fallbackVehicleTypeForUsers(userIds),
  ]);
  const modeBy = new Map(modes.map((m) => [m.id, m.dashboardMode]));
  const vt = (userId: string, raw: string | null): VehicleType =>
    isVehicleType(raw) ? raw : fallbackTypes.get(userId) ?? "car";

  const home = new Map<string, { area: string | null; region: string | null }>();
  for (const u of geo.users) home.set(u.id, { area: u.home.area, region: u.home.region });

  // Prior business miles this tax year, per user + vehicle type.
  const prior = new Map<string, number>();
  for (const r of priorRows) {
    const key = `${r.userId}|${vt(r.userId, r.vt)}`;
    prior.set(key, (prior.get(key) ?? 0) + Number(r.bizMiles ?? 0));
  }

  interface Acc {
    weeks: Set<number>;
    totalMiles: number;
    businessMiles: number;
    trips: number;
    classified: number;
    segments: Map<string, ClaimSegment>;
  }
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    let a = acc.get(r.userId);
    if (!a) {
      a = { weeks: new Set(), totalMiles: 0, businessMiles: 0, trips: 0, classified: 0, segments: new Map() };
      acc.set(r.userId, a);
    }
    const wk = Number(r.wk);
    if (wk >= 0 && wk < WINDOW_WEEKS) a.weeks.add(wk);
    a.trips += Number(r.trips);
    a.totalMiles += Number(r.miles ?? 0);
    a.classified += Number(r.classified ?? 0);
    const biz = Number(r.bizMiles ?? 0);
    a.businessMiles += biz;
    if (biz > 0) {
      const after = Number(r.afterBoundary) === 1;
      const taxYear = after ? endTaxYear : startTaxYear;
      const type = vt(r.userId, r.vt);
      const segKey = `${taxYear}|${type}`;
      const seg = a.segments.get(segKey) ?? {
        taxYear,
        vehicleType: type,
        miles: 0,
        // A new tax year starting inside the window has nothing before it.
        priorMiles: after ? 0 : prior.get(`${r.userId}|${type}`) ?? 0,
      };
      seg.miles += biz;
      a.segments.set(segKey, seg);
    }
  }

  const stats = new Map<string, DriverWindowStats>();
  for (const [userId, a] of acc) {
    const h = home.get(userId);
    stats.set(userId, {
      userId,
      area: h?.area ?? null,
      region: h?.region ?? null,
      families: familiesOf(modeBy.get(userId)),
      weeksActive: a.weeks.size,
      totalMiles: a.totalMiles,
      businessMiles: a.businessMiles,
      claimPence: claimPenceForSegments([...a.segments.values()]),
      trips: a.trips,
      classifiedTrips: a.classified,
    });
  }

  return { key: `${window.end.toISOString()}@${now.getTime()}`, window, stats, home };
}

let memo: { at: number; promise: Promise<Snapshot>; last: Snapshot | null } | null = null;

/**
 * Hourly snapshot. After the hour, the previous snapshot is served while a
 * fresh one loads in the background, so only the very first request after a
 * restart waits for the load. A failed load is dropped, never served.
 */
function getSnapshot(now = new Date()): Promise<Snapshot> {
  if (memo && now.getTime() - memo.at < SNAPSHOT_TTL_MS) {
    return memo.last ? Promise.resolve(memo.last) : memo.promise;
  }
  const previous = memo?.last ?? null;
  const promise = loadSnapshot(now);
  const entry: { at: number; promise: Promise<Snapshot>; last: Snapshot | null } = {
    at: now.getTime(),
    promise,
    last: previous,
  };
  memo = entry;
  promise
    .then((snap) => {
      if (memo === entry) entry.last = snap;
    })
    .catch(() => {
      if (memo === entry) memo = previous ? { at: 0, promise: Promise.resolve(previous), last: previous } : null;
    });
  return previous ? Promise.resolve(previous) : promise;
}

export async function buildLocalBenchmark(
  userId: string,
  requestedMode?: ModeFamily | null,
): Promise<LocalBenchmark> {
  const now = new Date();
  const [snap, viewer] = await Promise.all([
    getSnapshot(now),
    prisma.user.findUnique({ where: { id: userId }, select: { dashboardMode: true } }),
  ]);
  const family = viewerFamily(viewer?.dashboardMode, requestedMode);
  const h = snap.home.get(userId) ?? { area: null, region: null };
  const info = areaInfo(h.area);
  const home = { area: h.area, areaName: info?.name ?? null, region: h.region ?? info?.region ?? null };

  const cacheKey = `localbench:v1:${snap.key}:${family}:${home.area ?? "-"}:${home.region ?? "-"}`;
  let group: GroupDistributions | null = null;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    group = JSON.parse(cached) as GroupDistributions | null;
  } else {
    const choice = choosePeerGroup([...snap.stats.values()], home, family);
    group = choice ? groupDistributions(choice, family) : null;
    await cacheSet(cacheKey, JSON.stringify(group), GROUP_CACHE_TTL_S);
  }

  return assembleLocalBenchmark({
    userId,
    family,
    home,
    you: snap.stats.get(userId) ?? null,
    group,
    window: snap.window,
    now,
  });
}
