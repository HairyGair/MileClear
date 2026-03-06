import { PrismaClient } from "@prisma/client";
import { haversineDistance } from "@mileclear/shared";
import {
  isReportRelevant,
  getAlertSeverity,
  aggregateReasons,
} from "@mileclear/shared";
import type {
  CommunityInsights,
  CommunityStats,
  AreaEarnings,
  AreaPeakHour,
  NearbyAnomaly,
  RouteSpeedInsight,
} from "@mileclear/shared";

const prisma = new PrismaClient();

// Minimum drivers before surfacing platform earnings (privacy threshold)
const MIN_DRIVERS_THRESHOLD = 3;
// Radius in miles for "nearby" queries
const NEARBY_RADIUS_MILES = 20;
// Max lookback for anomalies (broadest window — time-decay handles filtering)
const ANOMALY_LOOKBACK_DAYS = 14;
// How far back for speed/earnings data
const DATA_LOOKBACK_DAYS = 90;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatHourLabel(dayOfWeek: string, hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const nextH = (hour + 1) % 24;
  const nextPeriod = nextH >= 12 ? "PM" : "AM";
  const nextH12 = nextH === 0 ? 12 : nextH > 12 ? nextH - 12 : nextH;
  return `${dayOfWeek} ${h12}–${nextH12} ${nextPeriod}`;
}

/**
 * Get community intelligence data centered around a user's location.
 * All data is anonymized and aggregated — no individual user data is exposed.
 */
export async function getCommunityInsights(
  lat: number,
  lng: number,
  userId: string
): Promise<CommunityInsights> {
  const now = new Date();
  const lookbackDate = new Date(now.getTime() - DATA_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const anomalyLookback = new Date(now.getTime() - ANOMALY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Approximate bounding box for nearby queries (±0.3 degrees ≈ 20 miles)
  const latDelta = 0.3;
  const lngDelta = 0.45; // wider at UK latitudes
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;

  const [
    globalStats,
    nearbyTrips,
    nearbyEarnings,
    nearbyAnomalyRows,
    nearbyCoordSpeeds,
  ] = await Promise.all([
    // 1. Global community stats
    getGlobalStats(),

    // 2. Nearby trips (within bounding box, recent)
    prisma.trip.findMany({
      where: {
        startLat: { gte: minLat, lte: maxLat },
        startLng: { gte: minLng, lte: maxLng },
        startedAt: { gte: lookbackDate },
        classification: "business",
      },
      select: {
        userId: true,
        platformTag: true,
        distanceMiles: true,
        startedAt: true,
        endedAt: true,
        startLat: true,
        startLng: true,
      },
    }),

    // 3. Earnings from users who have trips in the area
    prisma.$queryRaw<Array<{ userId: string; platform: string; totalPence: bigint; count: bigint }>>`
      SELECT e.userId, e.platform, SUM(e.amountPence) as totalPence, COUNT(*) as count
      FROM earnings e
      WHERE e.userId IN (
        SELECT DISTINCT t.userId FROM trips t
        WHERE t.startLat BETWEEN ${minLat} AND ${maxLat}
        AND t.startLng BETWEEN ${minLng} AND ${maxLng}
        AND t.startedAt >= ${lookbackDate}
        AND t.classification = 'business'
      )
      AND e.periodStart >= ${lookbackDate}
      GROUP BY e.userId, e.platform
    `,

    // 4. Nearby anomalies (14 day window — time-decay filters relevance, excluding self)
    prisma.tripAnomaly.findMany({
      where: {
        lat: { gte: minLat, lte: maxLat },
        lng: { gte: minLng, lte: maxLng },
        createdAt: { gte: anomalyLookback },
        userId: { not: userId },
      },
      select: {
        type: true,
        response: true,
        lat: true,
        lng: true,
        createdAt: true,
        question: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),

    // 5. Speed data from trip coordinates near the location
    prisma.$queryRaw<Array<{ avgSpeed: number; hour: number; count: bigint }>>`
      SELECT AVG(tc.speed) as avgSpeed, HOUR(tc.recordedAt) as hour, COUNT(*) as count
      FROM trip_coordinates tc
      JOIN trips t ON tc.tripId = t.id
      WHERE t.startLat BETWEEN ${minLat} AND ${maxLat}
      AND t.startLng BETWEEN ${minLng} AND ${maxLng}
      AND tc.speed IS NOT NULL
      AND tc.speed > 0
      AND tc.recordedAt >= ${lookbackDate}
      GROUP BY HOUR(tc.recordedAt)
      HAVING COUNT(*) >= 10
      ORDER BY hour
    `,
  ]);

  // Exclude requesting user's own data from community results
  const otherTrips = nearbyTrips.filter((t) => t.userId !== userId);

  // Count nearby drivers (excluding self)
  const nearbyDriverIds = new Set(otherTrips.map((t) => t.userId));
  const driversNearby = nearbyDriverIds.size;

  // ── Area Earnings (by platform) ──────────────────────────────────
  const platformAgg = new Map<string, { totalPence: number; tripCount: number; drivers: Set<string>; totalMiles: number }>();

  // Get trip miles per platform per user (excluding self)
  for (const trip of otherTrips) {
    if (!trip.platformTag) continue;
    const key = trip.platformTag.toLowerCase();
    const existing = platformAgg.get(key) ?? { totalPence: 0, tripCount: 0, drivers: new Set(), totalMiles: 0 };
    existing.tripCount++;
    existing.totalMiles += trip.distanceMiles;
    existing.drivers.add(trip.userId);
    platformAgg.set(key, existing);
  }

  // Add earnings data
  for (const row of nearbyEarnings) {
    const key = row.platform.toLowerCase();
    const existing = platformAgg.get(key);
    if (existing) {
      existing.totalPence += Number(row.totalPence);
    }
  }

  const areaEarnings: AreaEarnings[] = [];
  for (const [platform, data] of platformAgg) {
    if (data.drivers.size < MIN_DRIVERS_THRESHOLD) continue;
    if (data.totalMiles < 1) continue;
    areaEarnings.push({
      platform,
      earningsPerMilePence: Math.round(data.totalPence / data.totalMiles),
      tripCount: data.tripCount,
      driverCount: data.drivers.size,
    });
  }
  areaEarnings.sort((a, b) => b.earningsPerMilePence - a.earningsPerMilePence);

  // ── Peak Hours ───────────────────────────────────────────────────
  const hourBuckets = new Map<string, { trips: number; totalSpeedSum: number; speedCount: number; drivers: Set<string> }>();
  for (const trip of otherTrips) {
    const d = new Date(trip.startedAt);
    const day = DAY_NAMES[d.getUTCDay()];
    const hour = d.getUTCHours();
    const key = `${day}-${hour}`;
    const existing = hourBuckets.get(key) ?? { trips: 0, totalSpeedSum: 0, speedCount: 0, drivers: new Set<string>() };
    existing.trips++;
    existing.drivers.add(trip.userId);
    if (trip.endedAt && trip.distanceMiles > 0) {
      const durationHours = (new Date(trip.endedAt).getTime() - d.getTime()) / 3600000;
      if (durationHours > 0) {
        existing.totalSpeedSum += trip.distanceMiles / durationHours;
        existing.speedCount++;
      }
    }
    hourBuckets.set(key, existing);
  }

  const peakHours: AreaPeakHour[] = Array.from(hourBuckets.entries())
    .filter(([, v]) => v.trips >= 3 && v.drivers.size >= MIN_DRIVERS_THRESHOLD) // minimum trips + drivers for privacy
    .map(([key, v]) => {
      const [day, hourStr] = key.split("-");
      const hour = parseInt(hourStr, 10);
      return {
        dayOfWeek: day,
        hour,
        label: formatHourLabel(day, hour),
        tripCount: v.trips,
        avgSpeedMph: v.speedCount > 0 ? Math.round(v.totalSpeedSum / v.speedCount) : 0,
      };
    })
    .sort((a, b) => b.tripCount - a.tripCount)
    .slice(0, 5);

  // ── Nearby Anomalies (with time-decay + severity + reason aggregation) ──
  // First, filter by time-decay relevance
  const relevantAnomalies = nearbyAnomalyRows.filter((a) =>
    a.lat != null && a.lng != null && isReportRelevant(a.createdAt, a.response)
  );

  // Cluster nearby anomalies by location (~500m grid)
  const anomalyClusters = new Map<string, {
    type: string;
    responses: string[];
    lat: number;
    lng: number;
    dist: number;
    mostRecent: Date;
    count: number;
    placeName: string | null;
  }>();

  for (const a of relevantAnomalies) {
    const dist = haversineDistance(lat, lng, a.lat!, a.lng!);
    if (dist > NEARBY_RADIUS_MILES) continue;

    // Grid at ~500m precision
    const clusterKey = `${Math.round(a.lat! * 200)}-${Math.round(a.lng! * 200)}`;
    const existing = anomalyClusters.get(clusterKey);

    // Extract place name from question text (e.g. "Slow near Penshaw")
    const placeMatch = a.question.match(/near (.+?)$/);
    const placeName = placeMatch ? placeMatch[1] : null;

    if (existing) {
      existing.responses.push(a.response);
      existing.count++;
      if (a.createdAt > existing.mostRecent) {
        existing.mostRecent = a.createdAt;
        existing.type = a.type;
      }
      if (placeName && !existing.placeName) {
        existing.placeName = placeName;
      }
    } else {
      anomalyClusters.set(clusterKey, {
        type: a.type,
        responses: [a.response],
        lat: a.lat!,
        lng: a.lng!,
        dist,
        mostRecent: a.createdAt,
        count: 1,
        placeName,
      });
    }
  }

  const nearbyAnomalies: NearbyAnomaly[] = Array.from(anomalyClusters.values())
    .map((cluster) => {
      const hoursAgo = (Date.now() - cluster.mostRecent.getTime()) / (60 * 60 * 1000);
      const topReasons = aggregateReasons(cluster.responses);
      const severity = getAlertSeverity(cluster.count, hoursAgo);

      return {
        type: cluster.type,
        response: topReasons[0] ?? cluster.responses[0],
        lat: Math.round(cluster.lat * 1000) / 1000,   // ~111m precision for privacy
        lng: Math.round(cluster.lng * 1000) / 1000,
        distanceMiles: Math.round(cluster.dist * 10) / 10,
        reportedAt: cluster.mostRecent.toISOString(),
        reportCount: cluster.count,
        severity,
        topReasons,
        placeName: cluster.placeName,
      };
    })
    .sort((a, b) => {
      // Sort by severity first (high > medium > low), then by distance
      const severityOrder = { high: 0, medium: 1, low: 2 };
      const sDiff = (severityOrder[a.severity!] ?? 2) - (severityOrder[b.severity!] ?? 2);
      if (sDiff !== 0) return sDiff;
      return a.distanceMiles - b.distanceMiles;
    })
    .slice(0, 15);

  // ── Route Speed Insights ─────────────────────────────────────────
  const MS_TO_MPH = 2.23694;
  const routeSpeeds: RouteSpeedInsight[] = nearbyCoordSpeeds
    .filter((r) => r.avgSpeed > 0)
    .map((r) => {
      const hour = r.hour;
      let timeOfDay: RouteSpeedInsight["timeOfDay"];
      if (hour >= 6 && hour < 12) timeOfDay = "morning";
      else if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
      else if (hour >= 17 && hour < 21) timeOfDay = "evening";
      else timeOfDay = "night";

      return {
        areaName: "Nearby",
        avgSpeedMph: Math.round(r.avgSpeed * MS_TO_MPH),
        sampleSize: Number(r.count),
        timeOfDay,
      };
    });

  // ── Best platform & time suggestions ─────────────────────────────
  const bestPlatformNearby = areaEarnings.length > 0 ? areaEarnings[0].platform : null;
  const bestTimeNearby = peakHours.length > 0 ? peakHours[0].label : null;

  return {
    stats: {
      ...globalStats,
      driversNearby,
    },
    areaEarnings,
    peakHours,
    nearbyAnomalies,
    routeSpeeds,
    bestPlatformNearby,
    bestTimeNearby,
    fuelTipNearby: null, // populated by route handler from fuel service
  };
}

/**
 * Global community stats (cached for 5 minutes).
 */
let cachedGlobalStats: Omit<CommunityStats, "driversNearby"> | null = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getGlobalStats(): Promise<Omit<CommunityStats, "driversNearby">> {
  if (cachedGlobalStats && Date.now() - cachedAt < CACHE_TTL) {
    return cachedGlobalStats;
  }

  const [userCount, tripAgg, mileageAgg] = await Promise.all([
    prisma.user.count(),
    prisma.trip.aggregate({
      _count: true,
      _sum: { distanceMiles: true },
    }),
    prisma.mileageSummary.aggregate({
      _sum: { deductionPence: true },
    }),
  ]);

  cachedGlobalStats = {
    totalDrivers: userCount,
    totalMilesTracked: Math.round(tripAgg._sum.distanceMiles ?? 0),
    totalTripsLogged: tripAgg._count,
    totalTaxSavedPence: mileageAgg._sum.deductionPence ?? 0,
  };
  cachedAt = Date.now();

  return cachedGlobalStats;
}
