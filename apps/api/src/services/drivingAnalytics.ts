import { prisma } from "../lib/prisma.js";
import { percentChange } from "../lib/insightsMath.js";
import { dateOnlyParts, ukParts, ukWeekBounds } from "../lib/ukTime.js";
import { boundsLabel, loadPeriodFigures } from "./periodFigures.js";
import { taxYearRunningCost } from "./runningCost.js";
import {
  getTaxYear,
  parseTaxYear,
  type WeeklyReport,
  type FrequentRoute,
  type ShiftSweetSpot,
  type FuelCostBreakdown,
  type EarningsDayPattern,
  type CommuteTiming,
  type DrivingAnalytics,
} from "@mileclear/shared";

// ── Helpers ───────────────────────────────────────────────────────

function weekBounds(weeksBack = 0): { start: Date; end: Date; label: string } {
  // UK Monday-to-Sunday weeks: the same weeks as /gamification/recap.
  const b = ukWeekBounds(new Date(), weeksBack);
  return { ...b, label: `${boundsLabel(b)} ${ukParts(b.end).year}` };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Weekly Report ─────────────────────────────────────────────────

export async function getWeeklyReport(userId: string, weeksBack = 0): Promise<WeeklyReport> {
  const { start, end, label } = weekBounds(weeksBack);
  const prev = weekBounds(weeksBack + 1);

  // Miles, trips, claim and earnings for both weeks from the one period
  // calculation (services/periodFigures), so this card, the recap and
  // Weekly P&L agree. Phantom trips are left out (they were counted here
  // before 9 Oct 2026).
  const [figures, prevFigures, shifts, achievements, stats, fuelLogs] = await Promise.all([
    loadPeriodFigures(userId, { start, end }),
    loadPeriodFigures(userId, { start: prev.start, end: prev.end }),
    prisma.shift.findMany({
      where: { userId, status: "completed", startedAt: { gte: start, lte: end } },
    }),
    prisma.achievement.findMany({
      where: { userId, achievedAt: { gte: start, lte: end } },
    }),
    // For streak — get all trip dates up to now
    prisma.trip.findMany({
      where: { userId, isPhantomTrip: false, startedAt: { lte: end } },
      select: { startedAt: true },
      orderBy: { startedAt: "desc" },
      take: 365,
    }),
    prisma.fuelLog.findMany({
      where: { userId, loggedAt: { gte: start, lte: end } },
      select: { costPence: true },
    }),
  ]);

  const { trips, earnings } = figures;
  const personalTrips = trips.filter((t) => t.classification === "personal");
  const totalEarnings = figures.earningsPence;
  const weekFuelCost = fuelLogs.reduce((s, l) => s + l.costPence, 0);

  // Shift stats
  const shiftHours = shifts.reduce((s, sh) => {
    if (!sh.endedAt) return s;
    return s + (sh.endedAt.getTime() - sh.startedAt.getTime()) / 3600000;
  }, 0);

  // Best shift grade (reuse simple logic)
  let bestGrade: string | null = null;
  if (shifts.length > 0 && totalEarnings > 0 && shiftHours > 0) {
    const earningsPerHour = totalEarnings / shiftHours / 100;
    bestGrade = earningsPerHour >= 15 ? "A" : earningsPerHour >= 11 ? "B" : earningsPerHour >= 8 ? "C" : earningsPerHour >= 5 ? "D" : "F";
  }

  // Top platform by earnings
  const platformTotals = new Map<string, number>();
  for (const e of earnings) {
    platformTotals.set(e.platform, (platformTotals.get(e.platform) ?? 0) + e.amountPence);
  }
  let topPlatform: string | null = null;
  let topPlatformAmount = 0;
  for (const [p, amt] of platformTotals) {
    if (amt > topPlatformAmount) { topPlatform = p; topPlatformAmount = amt; }
  }

  // Streak: consecutive UK days with trips, ending at the week's end.
  const tripDates = new Set(stats.map((t) => ukParts(t.startedAt).dateKey));
  let streakDays = 0;
  const checkFrom = Date.parse(ukParts(new Date(Math.min(end.getTime(), Date.now()))).dateKey + "T12:00:00Z");
  for (let i = 0; i < 365; i++) {
    const key = new Date(checkFrom - i * 86_400_000).toISOString().slice(0, 10);
    if (tripDates.has(key)) {
      streakDays++;
    } else if (i > 0) break; // allow today to be missing
    else continue;
  }

  // Achievement labels
  const { ACHIEVEMENT_META } = await import("@mileclear/shared");
  const newAchLabels = achievements.map((a) => {
    const meta = ACHIEVEMENT_META[a.type as keyof typeof ACHIEVEMENT_META];
    return meta?.label ?? a.type;
  });

  const longestPersonalTrip = personalTrips.length > 0
    ? Math.max(...personalTrips.map((t) => t.distanceMiles))
    : 0;
  const avgPersonalTrip = personalTrips.length > 0
    ? personalTrips.reduce((s, t) => s + t.distanceMiles, 0) / personalTrips.length
    : 0;

  return {
    weekLabel: label,
    business: {
      miles: figures.businessMiles,
      trips: figures.businessTrips,
      // The week's mileage claim (lib/mileageRates periodClaimPence).
      deductionPence: figures.claimPence,
      earningsPence: totalEarnings,
      shifts: shifts.length,
      avgShiftHours: shifts.length > 0 ? Math.round((shiftHours / shifts.length) * 10) / 10 : 0,
      bestShiftGrade: bestGrade,
      fuelCostPence: weekFuelCost > 0 ? weekFuelCost : null,
      topPlatform,
    },
    personal: {
      miles: figures.personalMiles,
      trips: figures.personalTrips,
      avgTripMiles: Math.round(avgPersonalTrip * 10) / 10,
      longestTripMiles: Math.round(longestPersonalTrip * 10) / 10,
    },
    totalMiles: figures.totalMiles,
    totalTrips: figures.totalTrips,
    streakDays,
    newAchievements: newAchLabels,
    milesDelta: percentChange(figures.totalMiles, prevFigures.totalMiles),
    tripsDelta: percentChange(figures.totalTrips, prevFigures.totalTrips),
    earningsDelta: percentChange(totalEarnings, prevFigures.earningsPence),
  };
}

// ── Frequent Routes ───────────────────────────────────────────────

const CLUSTER_RADIUS_MILES = 0.3; // ~500m

export async function getFrequentRoutes(userId: string, limit = 10): Promise<FrequentRoute[]> {
  const trips = await prisma.trip.findMany({
    where: {
      userId,
      endLat: { not: null },
      endLng: { not: null },
    },
    orderBy: { startedAt: "desc" },
    take: 500, // last 500 trips for clustering
  });

  if (trips.length < 2) return [];

  // Cluster by start+end pair within CLUSTER_RADIUS_MILES
  const clusters: {
    trips: typeof trips;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
  }[] = [];

  for (const trip of trips) {
    if (!trip.endLat || !trip.endLng) continue;

    let matched = false;
    for (const cluster of clusters) {
      const startDist = haversine(trip.startLat, trip.startLng, cluster.startLat, cluster.startLng);
      const endDist = haversine(trip.endLat, trip.endLng, cluster.endLat, cluster.endLng);
      if (startDist <= CLUSTER_RADIUS_MILES && endDist <= CLUSTER_RADIUS_MILES) {
        cluster.trips.push(trip);
        matched = true;
        break;
      }
    }

    if (!matched) {
      clusters.push({
        trips: [trip],
        startLat: trip.startLat,
        startLng: trip.startLng,
        endLat: trip.endLat!,
        endLng: trip.endLng!,
      });
    }
  }

  // Filter to routes with at least 2 trips, sort by frequency
  const frequent = clusters
    .filter((c) => c.trips.length >= 2)
    .sort((a, b) => b.trips.length - a.trips.length)
    .slice(0, limit);

  return frequent.map((cluster) => {
    const durations = cluster.trips
      .filter((t) => t.endedAt)
      .map((t) => (new Date(t.endedAt!).getTime() - new Date(t.startedAt).getTime()) / 60000);

    const distances = cluster.trips.map((t) => t.distanceMiles);

    // Classification mode
    const classCount = new Map<string, number>();
    for (const t of cluster.trips) {
      classCount.set(t.classification, (classCount.get(t.classification) ?? 0) + 1);
    }
    let topClass = "unclassified";
    let topClassCount = 0;
    for (const [cls, cnt] of classCount) {
      if (cnt > topClassCount) { topClass = cls; topClassCount = cnt; }
    }

    // Platform mode
    const platCount = new Map<string, number>();
    for (const t of cluster.trips) {
      if (t.platformTag) platCount.set(t.platformTag, (platCount.get(t.platformTag) ?? 0) + 1);
    }
    let topPlatform: string | null = null;
    let topPlatCount = 0;
    for (const [p, cnt] of platCount) {
      if (cnt > topPlatCount) { topPlatform = p; topPlatCount = cnt; }
    }

    // Day of week breakdown (0=Mon..6=Sun)
    const dayBreakdown = new Array(7).fill(0);
    for (const t of cluster.trips) {
      const d = new Date(t.startedAt).getDay();
      dayBreakdown[d === 0 ? 6 : d - 1]++;
    }

    // Time of day breakdown (4-hour blocks)
    const timeBreakdown = new Array(6).fill(0);
    for (const t of cluster.trips) {
      const h = new Date(t.startedAt).getHours();
      timeBreakdown[Math.floor(h / 4)]++;
    }

    // Use the most common address from the cluster
    const startAddresses = new Map<string, number>();
    const endAddresses = new Map<string, number>();
    for (const t of cluster.trips) {
      if (t.startAddress) startAddresses.set(t.startAddress, (startAddresses.get(t.startAddress) ?? 0) + 1);
      if (t.endAddress) endAddresses.set(t.endAddress, (endAddresses.get(t.endAddress) ?? 0) + 1);
    }
    const bestStartAddr = [...startAddresses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown";
    const bestEndAddr = [...endAddresses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown";

    return {
      startLat: cluster.startLat,
      startLng: cluster.startLng,
      endLat: cluster.endLat,
      endLng: cluster.endLng,
      startAddress: bestStartAddr,
      endAddress: bestEndAddr,
      tripCount: cluster.trips.length,
      avgDurationMinutes: durations.length > 0
        ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
        : 0,
      fastestDurationMinutes: durations.length > 0
        ? Math.round(Math.min(...durations))
        : 0,
      avgDistanceMiles: Math.round((distances.reduce((s, d) => s + d, 0) / distances.length) * 10) / 10,
      classification: topClass,
      platformTag: topPlatform,
      dayBreakdown,
      timeBreakdown,
    };
  });
}

// ── Shift Sweet Spots ─────────────────────────────────────────────

const DURATION_BUCKETS = [
  { label: "Under 2 hrs", min: 0, max: 2 },
  { label: "2–4 hrs", min: 2, max: 4 },
  { label: "4–6 hrs", min: 4, max: 6 },
  { label: "6–8 hrs", min: 6, max: 8 },
  { label: "8–10 hrs", min: 8, max: 10 },
  { label: "Over 10 hrs", min: 10, max: 999 },
];

export async function getShiftSweetSpots(userId: string): Promise<ShiftSweetSpot[]> {
  const taxYear = getTaxYear(new Date());
  const { start, end } = parseTaxYear(taxYear);

  const [shifts, earnings, trips] = await Promise.all([
    prisma.shift.findMany({
      where: { userId, status: "completed", startedAt: { gte: start, lte: end }, endedAt: { not: null } },
    }),
    prisma.earning.findMany({
      where: { userId, periodStart: { gte: start, lte: end } },
    }),
    prisma.trip.findMany({
      where: { userId, classification: "business", startedAt: { gte: start, lte: end } },
      select: { shiftId: true, distanceMiles: true },
    }),
  ]);

  // Earnings are dates (no time). A one-day earning goes to the shifts
  // that started that UK day, split by shift length; earnings covering
  // several days, or days with no shift, are left out. (Before 9 Oct 2026
  // the date was read as midnight and matched to the nearest shift.)
  const shiftsByDay = new Map<string, typeof shifts>();
  for (const s of shifts) {
    if (!s.endedAt) continue;
    const key = ukParts(s.startedAt).dateKey;
    shiftsByDay.set(key, [...(shiftsByDay.get(key) ?? []), s]);
  }
  const shiftEarnings = new Map<string, number>();
  for (const e of earnings) {
    const day = dateOnlyParts(e.periodStart).dateKey;
    if (dateOnlyParts(e.periodEnd).dateKey !== day) continue;
    const dayShifts = shiftsByDay.get(day) ?? [];
    const totalMs = dayShifts.reduce((sum, s) => sum + (s.endedAt!.getTime() - s.startedAt.getTime()), 0);
    if (totalMs <= 0) continue;
    for (const s of dayShifts) {
      const share = (s.endedAt!.getTime() - s.startedAt.getTime()) / totalMs;
      shiftEarnings.set(s.id, (shiftEarnings.get(s.id) ?? 0) + Math.round(e.amountPence * share));
    }
  }

  // Trip miles per shift
  const shiftMiles = new Map<string, number>();
  const shiftTripCounts = new Map<string, number>();
  for (const t of trips) {
    if (!t.shiftId) continue;
    shiftMiles.set(t.shiftId, (shiftMiles.get(t.shiftId) ?? 0) + t.distanceMiles);
    shiftTripCounts.set(t.shiftId, (shiftTripCounts.get(t.shiftId) ?? 0) + 1);
  }

  // Bucket shifts by duration
  const buckets = DURATION_BUCKETS.map((b) => ({
    ...b,
    shiftCount: 0,
    totalEarnings: 0,
    totalHours: 0,
    totalTrips: 0,
    totalMiles: 0,
  }));

  for (const s of shifts) {
    if (!s.endedAt) continue;
    const hours = (s.endedAt.getTime() - s.startedAt.getTime()) / 3600000;
    const bucket = buckets.find((b) => hours >= b.min && hours < b.max);
    if (!bucket) continue;

    bucket.shiftCount++;
    bucket.totalEarnings += shiftEarnings.get(s.id) ?? 0;
    bucket.totalHours += hours;
    bucket.totalTrips += shiftTripCounts.get(s.id) ?? 0;
    bucket.totalMiles += shiftMiles.get(s.id) ?? 0;
  }

  return buckets
    .filter((b) => b.shiftCount > 0)
    .map((b) => ({
      durationBucket: b.label,
      shiftCount: b.shiftCount,
      avgEarningsPerHourPence: b.totalHours > 0
        ? Math.round(b.totalEarnings / b.totalHours)
        : 0,
      avgTrips: Math.round((b.totalTrips / b.shiftCount) * 10) / 10,
      avgMiles: Math.round((b.totalMiles / b.shiftCount) * 10) / 10,
      totalEarningsPence: b.totalEarnings,
    }));
}

// ── Fuel Cost Breakdown ───────────────────────────────────────────

export async function getFuelCostBreakdown(userId: string): Promise<FuelCostBreakdown> {
  const taxYear = getTaxYear(new Date());
  const { start, end } = parseTaxYear(taxYear);

  const [fuelLogs, vehicles, trips] = await Promise.all([
    prisma.fuelLog.findMany({
      where: { userId, loggedAt: { gte: start, lte: end } },
      orderBy: { loggedAt: "asc" },
    }),
    prisma.vehicle.findMany({ where: { userId } }),
    prisma.trip.findMany({
      where: { userId, isPhantomTrip: false, startedAt: { gte: start, lte: end } },
      select: { vehicleId: true, distanceMiles: true },
    }),
  ]);

  const totalFuelCost = fuelLogs.reduce((s, l) => s + l.costPence, 0);
  const totalMiles = trips.reduce((s, t) => s + t.distanceMiles, 0);
  // The one running cost per mile (services/runningCost).
  const runningCost = await taxYearRunningCost(userId);

  // Overall MPG from odometer readings
  const logsWithOdo = fuelLogs.filter((l) => l.odometerReading && l.odometerReading > 0);
  let actualMpg: number | null = null;
  if (logsWithOdo.length >= 2) {
    logsWithOdo.sort((a, b) => a.odometerReading! - b.odometerReading!);
    const milesDriven = logsWithOdo[logsWithOdo.length - 1].odometerReading! - logsWithOdo[0].odometerReading!;
    const litresUsed = logsWithOdo.slice(1).reduce((s, l) => s + l.litres, 0);
    if (litresUsed > 0 && milesDriven > 0) {
      actualMpg = Math.round((milesDriven / (litresUsed / 4.54609)) * 10) / 10;
    }
  }

  // Per-vehicle breakdown
  const perVehicle: FuelCostBreakdown["perVehicle"] = [];

  for (const v of vehicles) {
    const vLogs = fuelLogs.filter((l) => l.vehicleId === v.id);
    const vTrips = trips.filter((t) => t.vehicleId === v.id);
    const vMiles = vTrips.reduce((s, t) => s + t.distanceMiles, 0);
    const vFuelCost = vLogs.reduce((s, l) => s + l.costPence, 0);

    // Vehicle-specific MPG
    const vOdoLogs = vLogs.filter((l) => l.odometerReading && l.odometerReading > 0);
    let vMpg: number | null = null;
    if (vOdoLogs.length >= 2) {
      vOdoLogs.sort((a, b) => a.odometerReading! - b.odometerReading!);
      const vMilesDriven = vOdoLogs[vOdoLogs.length - 1].odometerReading! - vOdoLogs[0].odometerReading!;
      const vLitres = vOdoLogs.slice(1).reduce((s, l) => s + l.litres, 0);
      if (vLitres > 0 && vMilesDriven > 0) {
        vMpg = Math.round((vMilesDriven / (vLitres / 4.54609)) * 10) / 10;
      }
    }

    perVehicle.push({
      vehicleId: v.id,
      make: v.make,
      model: v.model,
      fuelType: v.fuelType,
      mpg: vMpg ?? v.estimatedMpg,
      costPerMilePence: vMiles > 0 ? Math.round(vFuelCost / vMiles) : null,
      totalCostPence: vFuelCost,
      milesDriven: Math.round(vMiles * 10) / 10,
    });
  }

  // Recent fill-ups (last 5)
  const recentFillUps = fuelLogs
    .slice(-5)
    .reverse()
    .map((l) => ({
      date: l.loggedAt.toISOString(),
      litres: l.litres,
      costPence: l.costPence,
      costPerLitrePence: l.litres > 0 ? Math.round(l.costPence / l.litres) : 0,
      stationName: l.stationName,
    }));

  // Get primary vehicle's estimated MPG as fallback
  const primaryVehicle = vehicles.find((v) => v.isPrimary) ?? vehicles[0];
  const estimatedMpg = primaryVehicle?.estimatedMpg ?? null;

  return {
    actualMpg,
    estimatedMpg,
    fuelCostPerMilePence: runningCost.pencePerMile,
    fuelCostSource: runningCost.source,
    totalFuelCostPence: totalFuelCost,
    totalMilesDriven: Math.round(totalMiles * 10) / 10,
    perVehicle,
    recentFillUps,
  };
}

// ── Earnings by Day of Week ───────────────────────────────────────

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export async function getEarningsByDay(userId: string): Promise<EarningsDayPattern[]> {
  const taxYear = getTaxYear(new Date());
  const { start, end } = parseTaxYear(taxYear);

  const earnings = await prisma.earning.findMany({
    where: { userId, periodStart: { gte: start, lte: end } },
  });

  const buckets = DAYS.map((day, i) => ({
    day,
    dayIndex: i,
    totalPence: 0,
    entryCount: 0,
  }));

  for (const e of earnings) {
    // A DATE column: read the day in UTC (getDay() on a server west of
    // London would say the day before).
    const jsDay = dateOnlyParts(e.periodStart).dow; // 0=Sun, 1=Mon...
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    buckets[idx].totalPence += e.amountPence;
    buckets[idx].entryCount++;
  }

  // Also count business trips per day for trip count
  const trips = await prisma.trip.findMany({
    where: { userId, isPhantomTrip: false, classification: "business", startedAt: { gte: start, lte: end } },
    select: { startedAt: true },
  });

  const tripCounts = new Array(7).fill(0);
  for (const t of trips) {
    const jsDay = ukParts(t.startedAt).dow;
    tripCounts[jsDay === 0 ? 6 : jsDay - 1]++;
  }

  return buckets.map((b, i) => ({
    day: b.day,
    dayIndex: b.dayIndex,
    totalEarningsPence: b.totalPence,
    avgEarningsPence: b.entryCount > 0
      ? Math.round(b.totalPence / Math.max(1, b.entryCount))
      : 0,
    tripCount: tripCounts[i],
    entryCount: b.entryCount,
  }));
}

// ── Commute Timing ────────────────────────────────────────────────

export async function getCommuteTiming(userId: string): Promise<CommuteTiming[]> {
  const [savedLocations, trips] = await Promise.all([
    prisma.savedLocation.findMany({ where: { userId } }),
    prisma.trip.findMany({
      where: { userId, endedAt: { not: null }, endLat: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 500,
    }),
  ]);

  if (savedLocations.length < 2) return [];

  const results: CommuteTiming[] = [];

  // For each pair of saved locations, find matching trips
  for (let i = 0; i < savedLocations.length; i++) {
    for (let j = 0; j < savedLocations.length; j++) {
      if (i === j) continue;
      const from = savedLocations[i];
      const to = savedLocations[j];
      const fromRadius = from.radiusMeters / 1609.34; // convert meters to miles
      const toRadius = to.radiusMeters / 1609.34;

      const matchingTrips = trips.filter((t) => {
        if (!t.endLat || !t.endLng || !t.endedAt) return false;
        const startDist = haversine(t.startLat, t.startLng, from.latitude, from.longitude);
        const endDist = haversine(t.endLat, t.endLng, to.latitude, to.longitude);
        return startDist <= Math.max(fromRadius, 0.3) && endDist <= Math.max(toRadius, 0.3);
      });

      if (matchingTrips.length < 3) continue; // need at least 3 trips for meaningful data

      const durations = matchingTrips
        .filter((t) => t.endedAt)
        .map((t) => ({
          minutes: (new Date(t.endedAt!).getTime() - new Date(t.startedAt).getTime()) / 60000,
          hour: new Date(t.startedAt).getHours(),
        }));

      if (durations.length < 3) continue;

      const allMinutes = durations.map((d) => d.minutes);
      const avg = allMinutes.reduce((s, m) => s + m, 0) / allMinutes.length;

      // Group by departure hour
      const byHour = new Map<number, { total: number; count: number }>();
      for (const d of durations) {
        const existing = byHour.get(d.hour) ?? { total: 0, count: 0 };
        existing.total += d.minutes;
        existing.count++;
        byHour.set(d.hour, existing);
      }

      // Find best departure hour
      let bestHour = 0;
      let bestAvg = Infinity;
      const hourEntries: CommuteTiming["byHour"] = [];
      for (const [hour, data] of byHour) {
        const hourAvg = data.total / data.count;
        hourEntries.push({
          hour,
          avgMinutes: Math.round(hourAvg),
          tripCount: data.count,
        });
        if (hourAvg < bestAvg && data.count >= 2) {
          bestAvg = hourAvg;
          bestHour = hour;
        }
      }

      hourEntries.sort((a, b) => a.hour - b.hour);

      const bestLabel = bestHour <= 12
        ? `Leave by ${bestHour === 0 ? 12 : bestHour}${bestHour < 12 ? "am" : "pm"}`
        : `Leave by ${bestHour - 12}pm`;

      results.push({
        routeLabel: `${from.name} → ${to.name}`,
        locationFrom: from.name,
        locationTo: to.name,
        avgDurationMinutes: Math.round(avg),
        bestDurationMinutes: Math.round(Math.min(...allMinutes)),
        worstDurationMinutes: Math.round(Math.max(...allMinutes)),
        bestDepartureHour: bestHour,
        bestDepartureLabel: bestLabel,
        byHour: hourEntries,
      });
    }
  }

  // Sort by trip count (most data first)
  results.sort((a, b) => {
    const aTrips = a.byHour.reduce((s, h) => s + h.tripCount, 0);
    const bTrips = b.byHour.reduce((s, h) => s + h.tripCount, 0);
    return bTrips - aTrips;
  });

  return results.slice(0, 10);
}

// ── Combined Analytics Endpoint ───────────────────────────────────

export async function getDrivingAnalytics(userId: string): Promise<DrivingAnalytics> {
  const [weeklyReport, frequentRoutes, shiftSweetSpots, fuelCost, earningsByDay, commuteTiming] =
    await Promise.all([
      getWeeklyReport(userId),
      getFrequentRoutes(userId),
      getShiftSweetSpots(userId),
      getFuelCostBreakdown(userId),
      getEarningsByDay(userId),
      getCommuteTiming(userId),
    ]);

  return {
    weeklyReport,
    frequentRoutes,
    shiftSweetSpots,
    fuelCost,
    earningsByDay,
    commuteTiming,
  };
}
