import { prisma } from "../lib/prisma.js";
import { haversineDistance } from "@mileclear/shared";

// Geographic density for the admin map. Aggregates trip start/end points
// onto a lat/lng grid and enriches each cell with reach, growth, premium
// and platform signals. Admin-only — the k-anonymity floor defaults to 1
// here (admin already sees individual users); it stays configurable so we
// can compare against the user-facing community-insights floor of 5.

export interface DensityCell {
  lat: number;
  lng: number;
  town: string;
  nation: string;
  trips: number;
  users: number;
  newUsers: number;
  premiumUsers: number;
  businessTrips: number;
  personalTrips: number;
  topPlatform: string | null;
  avgTripsPerUser: number;
  avgDistanceMiles: number;
  prevTrips: number;
  growthPct: number | null; // null = no prior-window activity (brand-new area)
}

export interface DensityResult {
  windowDays: number;
  gridSizeDegrees: number;
  minUsersPerCell: number;
  startCells: DensityCell[];
  endCells: DensityCell[];
  totalTrips: number;
  totalUsers: number;
  maxTripsInCell: number;
  suppressedCells: number;
  suppressedTrips: number;
  concentration: { top3Share: number; top5Share: number; top10Share: number };
  nations: Array<{ nation: string; trips: number }>;
  fastestGrowing: DensityCell[];
  newAreas: DensityCell[];
  generatedAt: string;
}

// Coarse UK place list for labelling cell centres. Nearest by great-circle
// distance. Not exhaustive — enough to give every populated cell a human
// name instead of raw coordinates. [name, lat, lng, nation].
const UK_PLACES: Array<[string, number, number, string]> = [
  ["London", 51.507, -0.128, "England"],
  ["Birmingham", 52.486, -1.890, "England"],
  ["Manchester", 53.481, -2.242, "England"],
  ["Leeds", 53.801, -1.549, "England"],
  ["Sheffield", 53.383, -1.470, "England"],
  ["Bradford", 53.795, -1.759, "England"],
  ["Liverpool", 53.408, -2.992, "England"],
  ["Newcastle upon Tyne", 54.978, -1.618, "England"],
  ["Sunderland", 54.906, -1.383, "England"],
  ["Middlesbrough", 54.574, -1.235, "England"],
  ["Durham", 54.777, -1.575, "England"],
  ["Nottingham", 52.954, -1.158, "England"],
  ["Leicester", 52.637, -1.139, "England"],
  ["Derby", 52.922, -1.477, "England"],
  ["Doncaster", 53.523, -1.133, "England"],
  ["Rotherham", 53.430, -1.357, "England"],
  ["Hull", 53.745, -0.336, "England"],
  ["York", 53.960, -1.081, "England"],
  ["Bristol", 51.454, -2.588, "England"],
  ["Plymouth", 50.376, -4.143, "England"],
  ["Exeter", 50.721, -3.534, "England"],
  ["Bournemouth", 50.720, -1.880, "England"],
  ["Southampton", 50.910, -1.404, "England"],
  ["Portsmouth", 50.816, -1.088, "England"],
  ["Brighton", 50.822, -0.137, "England"],
  ["Reading", 51.454, -0.973, "England"],
  ["Milton Keynes", 52.041, -0.759, "England"],
  ["Oxford", 51.752, -1.258, "England"],
  ["Cambridge", 52.205, 0.119, "England"],
  ["Norwich", 52.630, 1.297, "England"],
  ["Ipswich", 52.059, 1.156, "England"],
  ["Northampton", 52.240, -0.903, "England"],
  ["Coventry", 52.407, -1.510, "England"],
  ["Stoke-on-Trent", 53.003, -2.186, "England"],
  ["Wolverhampton", 52.587, -2.129, "England"],
  ["Preston", 53.763, -2.703, "England"],
  ["Blackpool", 53.817, -3.036, "England"],
  ["Bolton", 53.578, -2.429, "England"],
  ["Warrington", 53.390, -2.597, "England"],
  ["Chester", 53.190, -2.892, "England"],
  ["Carlisle", 54.891, -2.944, "England"],
  ["Lancaster", 54.047, -2.801, "England"],
  ["Watford", 51.656, -0.398, "England"],
  ["Luton", 51.879, -0.417, "England"],
  ["Peterborough", 52.573, -0.243, "England"],
  ["Lincoln", 53.234, -0.539, "England"],
  ["Gloucester", 51.864, -2.238, "England"],
  ["Swindon", 51.559, -1.772, "England"],
  ["Wakefield", 53.683, -1.499, "England"],
  ["Huddersfield", 53.645, -1.785, "England"],
  ["Barnsley", 53.552, -1.479, "England"],
  ["Scunthorpe", 53.589, -0.654, "England"],
  ["Grimsby", 53.567, -0.081, "England"],
  ["Chelmsford", 51.736, 0.469, "England"],
  ["Southend-on-Sea", 51.545, 0.708, "England"],
  ["Maidstone", 51.272, 0.529, "England"],
  ["Crawley", 51.113, -0.187, "England"],
  ["Guildford", 51.236, -0.571, "England"],
  ["Glasgow", 55.864, -4.252, "Scotland"],
  ["Edinburgh", 55.953, -3.188, "Scotland"],
  ["Aberdeen", 57.149, -2.094, "Scotland"],
  ["Dundee", 56.462, -2.970, "Scotland"],
  ["Inverness", 57.478, -4.224, "Scotland"],
  ["Perth", 56.397, -3.437, "Scotland"],
  ["Stirling", 56.117, -3.937, "Scotland"],
  ["Paisley", 55.846, -4.424, "Scotland"],
  ["Cardiff", 51.481, -3.179, "Wales"],
  ["Swansea", 51.622, -3.944, "Wales"],
  ["Newport", 51.588, -2.998, "Wales"],
  ["Wrexham", 53.043, -2.993, "Wales"],
  ["Bangor", 53.228, -4.129, "Wales"],
  ["Aberystwyth", 52.415, -4.083, "Wales"],
  ["Belfast", 54.597, -5.930, "Northern Ireland"],
  ["Londonderry", 54.997, -7.309, "Northern Ireland"],
  ["Lisburn", 54.512, -6.058, "Northern Ireland"],
  ["Newry", 54.176, -6.349, "Northern Ireland"],
];

function nearestPlace(lat: number, lng: number): { town: string; nation: string } {
  let best = UK_PLACES[0];
  let bestD = Infinity;
  for (const p of UK_PLACES) {
    const d = haversineDistance(lat, lng, p[1], p[2]);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  // If the nearest named place is far (rural), still label by it but mark it.
  const prefix = bestD > 18 ? "near " : "";
  return { town: `${prefix}${best[0]}`, nation: best[3] };
}

interface Point {
  userId: string;
  lat: number;
  lng: number;
  classification: string;
  platformTag: string | null;
  distanceMiles: number;
  isNew: boolean;
  isPremium: boolean;
}

interface Bucket {
  trips: number;
  users: Set<string>;
  newUsers: Set<string>;
  premiumUsers: Set<string>;
  business: number;
  personal: number;
  platforms: Map<string, number>;
  sumDistance: number;
}

function bucketKey(lat: number, lng: number, grid: number): string {
  return `${Math.round(lat / grid)}_${Math.round(lng / grid)}`;
}

function buildCells(
  points: Point[],
  grid: number,
  minUsers: number,
  prevCounts: Map<string, number>
): { cells: DensityCell[]; suppressedCells: number; suppressedTrips: number } {
  const buckets = new Map<string, Bucket>();
  for (const p of points) {
    const key = bucketKey(p.lat, p.lng, grid);
    let b = buckets.get(key);
    if (!b) {
      b = {
        trips: 0,
        users: new Set(),
        newUsers: new Set(),
        premiumUsers: new Set(),
        business: 0,
        personal: 0,
        platforms: new Map(),
        sumDistance: 0,
      };
      buckets.set(key, b);
    }
    b.trips += 1;
    b.users.add(p.userId);
    if (p.isNew) b.newUsers.add(p.userId);
    if (p.isPremium) b.premiumUsers.add(p.userId);
    if (p.classification === "business") b.business += 1;
    else if (p.classification === "personal") b.personal += 1;
    if (p.platformTag) b.platforms.set(p.platformTag, (b.platforms.get(p.platformTag) ?? 0) + 1);
    b.sumDistance += p.distanceMiles;
  }

  const cells: DensityCell[] = [];
  let suppressedCells = 0;
  let suppressedTrips = 0;
  for (const [key, b] of buckets) {
    const users = b.users.size;
    if (users < minUsers) {
      suppressedCells += 1;
      suppressedTrips += b.trips;
      continue;
    }
    const [latB, lngB] = key.split("_").map(Number);
    const lat = Math.round(latB * grid * 100) / 100;
    const lng = Math.round(lngB * grid * 100) / 100;
    let topPlatform: string | null = null;
    let topCount = 0;
    for (const [plat, n] of b.platforms) {
      if (n > topCount) {
        topCount = n;
        topPlatform = plat;
      }
    }
    const prevTrips = prevCounts.get(key) ?? 0;
    const { town, nation } = nearestPlace(lat, lng);
    cells.push({
      lat,
      lng,
      town,
      nation,
      trips: b.trips,
      users,
      newUsers: b.newUsers.size,
      premiumUsers: b.premiumUsers.size,
      businessTrips: b.business,
      personalTrips: b.personal,
      topPlatform,
      avgTripsPerUser: Math.round((b.trips / users) * 10) / 10,
      avgDistanceMiles: Math.round((b.sumDistance / b.trips) * 10) / 10,
      prevTrips,
      growthPct: prevTrips > 0 ? Math.round(((b.trips - prevTrips) / prevTrips) * 100) : null,
    });
  }
  cells.sort((a, b) => b.trips - a.trips);
  return { cells, suppressedCells, suppressedTrips };
}

export async function buildGeographicDensity(opts: {
  windowDays: number;
  minUsers: number;
  grid: number;
}): Promise<DensityResult> {
  const { windowDays, minUsers, grid } = opts;
  const now = Date.now();
  const since = new Date(now - windowDays * 24 * 60 * 60 * 1000);
  const prevSince = new Date(now - 2 * windowDays * 24 * 60 * 60 * 1000);

  const [users, trips, prevTrips] = await Promise.all([
    prisma.user.findMany({ select: { id: true, isPremium: true, createdAt: true } }),
    prisma.trip.findMany({
      where: { startedAt: { gte: since }, isPhantomTrip: false },
      select: {
        userId: true,
        startLat: true,
        startLng: true,
        endLat: true,
        endLng: true,
        classification: true,
        platformTag: true,
        distanceMiles: true,
      },
    }),
    prisma.trip.findMany({
      where: {
        startedAt: { gte: prevSince, lt: since },
        isPhantomTrip: false,
      },
      select: { startLat: true, startLng: true },
    }),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Previous-window trip counts per start bucket, for growth deltas.
  const prevCounts = new Map<string, number>();
  for (const t of prevTrips) {
    if (t.startLat == null || t.startLng == null) continue;
    const key = bucketKey(t.startLat, t.startLng, grid);
    prevCounts.set(key, (prevCounts.get(key) ?? 0) + 1);
  }

  const startPoints: Point[] = [];
  const endPoints: Point[] = [];
  const allUsers = new Set<string>();
  for (const t of trips) {
    const u = userMap.get(t.userId);
    const isNew = u ? u.createdAt >= since : false;
    const isPremium = u ? u.isPremium : false;
    allUsers.add(t.userId);
    if (t.startLat != null && t.startLng != null) {
      startPoints.push({
        userId: t.userId,
        lat: t.startLat,
        lng: t.startLng,
        classification: t.classification,
        platformTag: t.platformTag,
        distanceMiles: t.distanceMiles,
        isNew,
        isPremium,
      });
    }
    if (t.endLat != null && t.endLng != null) {
      endPoints.push({
        userId: t.userId,
        lat: t.endLat,
        lng: t.endLng,
        classification: t.classification,
        platformTag: t.platformTag,
        distanceMiles: t.distanceMiles,
        isNew,
        isPremium,
      });
    }
  }

  const startBuild = buildCells(startPoints, grid, minUsers, prevCounts);
  const endBuild = buildCells(endPoints, grid, minUsers, new Map());
  const startCells = startBuild.cells;

  const totalTrips = startCells.reduce((a, c) => a + c.trips, 0);
  const maxTripsInCell = startCells.reduce((a, c) => (c.trips > a ? c.trips : a), 0);

  // Concentration: share of trips held by the top N cells.
  const shareOfTop = (n: number) =>
    totalTrips > 0
      ? Math.round((startCells.slice(0, n).reduce((a, c) => a + c.trips, 0) / totalTrips) * 100)
      : 0;

  // Nations split by trips (across shown start cells).
  const nationMap = new Map<string, number>();
  for (const c of startCells) nationMap.set(c.nation, (nationMap.get(c.nation) ?? 0) + c.trips);
  const nations = [...nationMap.entries()]
    .map(([nation, t]) => ({ nation, trips: t }))
    .sort((a, b) => b.trips - a.trips);

  // Fastest growing (meaningful prior base) + brand-new areas.
  const fastestGrowing = startCells
    .filter((c) => c.growthPct != null && c.prevTrips >= 3)
    .sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
    .slice(0, 5);
  const newAreas = startCells
    .filter((c) => c.prevTrips === 0 && c.trips >= 3)
    .sort((a, b) => b.trips - a.trips)
    .slice(0, 5);

  return {
    windowDays,
    gridSizeDegrees: grid,
    minUsersPerCell: minUsers,
    startCells,
    endCells: endBuild.cells,
    totalTrips,
    totalUsers: allUsers.size,
    maxTripsInCell,
    suppressedCells: startBuild.suppressedCells,
    suppressedTrips: startBuild.suppressedTrips,
    concentration: { top3Share: shareOfTop(3), top5Share: shareOfTop(5), top10Share: shareOfTop(10) },
    nations,
    fastestGrowing,
    newAreas,
    generatedAt: new Date().toISOString(),
  };
}
