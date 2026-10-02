/**
 * Cheapest fuel near a driver today, and the EV running-cost equivalent.
 * Shared by GET /fuel/cheapest-today (fuel tab) and jobs/fuelAlerts.ts (the
 * opt-in morning push and Monday EV summary). The decisions live in the pure
 * cheapestFuelRule.ts; this file only loads the inputs.
 *
 * Efficient by construction: drivers are loaded in batches with three
 * queries (users + vehicles + saved home, recent trip starts, last alerts),
 * and station prices come from fuel.ts's in-memory cache, so a driver costs
 * one bounding-box scan and no network.
 */

import { prisma } from "../lib/prisma.js";
import { getNearbyStations, getNationalAverages } from "./fuel.js";
import { getElectricityRate } from "./evCharging.js";
import {
  DEFAULT_EV_MILES_PER_KWH,
  DEFAULT_PUBLIC_RAPID_PENCE_PER_KWH,
} from "@mileclear/shared";
import type { CheapestFuelToday, EvRunningCostToday } from "@mileclear/shared";
import {
  ALERT_THRESHOLD_PENCE,
  START_POINT_LOOKBACK_DAYS,
  START_POINT_MAX_TRIPS,
  WIDE_RADIUS_MILES,
  cheapestFuelLine,
  evPencePerMile,
  evRunningCostLine,
  fuelPathForVehicle,
  pickPrimaryVehicle,
  pickStartPoint,
  selectCheapestFuel,
  type FuelPath,
  type FuelSelection,
  type LastAlert,
  type StartPoint,
} from "./cheapestFuelRule.js";

export const FUEL_ALERT_EVENT = "notification.fuel_alert";
export const EV_WEEKLY_EVENT = "notification.ev_weekly_summary";

/** Stations fetched per driver: enough that a busy 10-mile circle is whole. */
const STATION_LIMIT = 400;

export interface DriverContext {
  userId: string;
  pushToken: string | null;
  pushPrefs: unknown;
  vehicle: {
    id: string;
    make: string;
    model: string;
    fuelType: string;
    milesPerKwh: number | null;
  } | null;
  fuelPath: FuelPath | null;
  start: StartPoint | null;
  electricityPencePerKwh: number | null;
  publicChargePencePerKwh: number | null;
}

/** Load everything the rule needs for a batch of drivers in three queries. */
export async function loadDriverContexts(
  userIds: string[],
  now: Date = new Date()
): Promise<DriverContext[]> {
  if (userIds.length === 0) return [];
  const since = new Date(now.getTime() - START_POINT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [users, trips] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        pushToken: true,
        pushPrefs: true,
        electricityPencePerKwh: true,
        publicChargePencePerKwh: true,
        vehicles: {
          select: {
            id: true,
            make: true,
            model: true,
            fuelType: true,
            milesPerKwh: true,
            isPrimary: true,
            createdAt: true,
          },
        },
        savedLocations: {
          where: { locationType: "home" },
          select: { latitude: true, longitude: true },
          take: 1,
        },
      },
    }),
    prisma.trip.findMany({
      where: { userId: { in: userIds }, startedAt: { gte: since } },
      select: { userId: true, startLat: true, startLng: true, startedAt: true },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const startsBy = new Map<string, { startLat: number; startLng: number }[]>();
  for (const t of trips) {
    let list = startsBy.get(t.userId);
    if (!list) startsBy.set(t.userId, (list = []));
    if (list.length < START_POINT_MAX_TRIPS) list.push(t);
  }

  return users.map((u) => {
    const v = pickPrimaryVehicle(u.vehicles);
    return {
      userId: u.id,
      pushToken: u.pushToken,
      pushPrefs: u.pushPrefs,
      vehicle: v
        ? { id: v.id, make: v.make, model: v.model, fuelType: v.fuelType, milesPerKwh: v.milesPerKwh }
        : null,
      fuelPath: v ? fuelPathForVehicle(v.fuelType) : null,
      start: pickStartPoint({
        tripStarts: startsBy.get(u.id) ?? [],
        savedHome: u.savedLocations[0] ?? null,
      }),
      electricityPencePerKwh: u.electricityPencePerKwh,
      publicChargePencePerKwh: u.publicChargePencePerKwh,
    };
  });
}

/** The newest fuel alert per driver since `since`, for the "not the same as
 *  yesterday" check and the once-a-day guard. */
export async function loadLastFuelAlerts(
  userIds: string[],
  since: Date
): Promise<Map<string, { at: Date; last: LastAlert | null }>> {
  const out = new Map<string, { at: Date; last: LastAlert | null }>();
  if (userIds.length === 0) return out;
  const events = await prisma.appEvent.findMany({
    where: { type: FUEL_ALERT_EVENT, userId: { in: userIds }, createdAt: { gte: since } },
    select: { userId: true, createdAt: true, metadata: true },
    orderBy: { createdAt: "desc" },
  });
  for (const e of events) {
    if (!e.userId || out.has(e.userId)) continue;
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    const last =
      typeof m.siteId === "string" && typeof m.pencePerLitre === "number"
        ? { siteId: m.siteId, pencePerLitre: m.pencePerLitre }
        : null; // alerts from before Oct 2026 carry no siteId
    out.set(e.userId, { at: e.createdAt, last });
  }
  return out;
}

/** National median for the fuel, from the same station cache. */
export async function nationalAverageFor(key: "E10" | "B7"): Promise<number | null> {
  const n = await getNationalAverages();
  if (!n) return null;
  return key === "E10" ? n.petrolPencePerLitre : n.dieselPencePerLitre;
}

export async function selectForDriver(
  ctx: DriverContext,
  opts: { nowMs: number; lastAlert: LastAlert | null; nationalAveragePence: number | null }
): Promise<FuelSelection | null> {
  if (!ctx.start || !ctx.fuelPath || ctx.fuelPath.path !== "fuel") return null;
  const { stations } = await getNearbyStations(ctx.start.lat, ctx.start.lng, WIDE_RADIUS_MILES, STATION_LIMIT);
  return selectCheapestFuel({
    stations,
    key: ctx.fuelPath.key,
    nowMs: opts.nowMs,
    nationalAveragePence: opts.nationalAveragePence,
    lastAlert: opts.lastAlert,
  });
}

export interface EvRates {
  milesPerKwh: number;
  milesPerKwhIsDefault: boolean;
  homePencePerKwh: number;
  homeRateSource: "user" | "octopus_agile" | "default";
  publicPencePerKwh: number;
  publicRateIsDefault: boolean;
}

/** The driver's own figures where they have them, honest defaults otherwise. */
export async function evRatesFor(ctx: DriverContext): Promise<EvRates> {
  const eff = ctx.vehicle?.milesPerKwh;
  let homePencePerKwh: number;
  let homeRateSource: EvRates["homeRateSource"];
  if (ctx.electricityPencePerKwh != null && ctx.electricityPencePerKwh > 0) {
    homePencePerKwh = ctx.electricityPencePerKwh;
    homeRateSource = "user";
  } else {
    const r = await getElectricityRate();
    homePencePerKwh = r.pencePerKwh;
    homeRateSource = r.source;
  }
  const pub = ctx.publicChargePencePerKwh;
  return {
    milesPerKwh: eff && eff > 0 ? eff : DEFAULT_EV_MILES_PER_KWH,
    milesPerKwhIsDefault: !(eff && eff > 0),
    homePencePerKwh,
    homeRateSource,
    publicPencePerKwh: pub != null && pub > 0 ? pub : DEFAULT_PUBLIC_RAPID_PENCE_PER_KWH,
    publicRateIsDefault: !(pub != null && pub > 0),
  };
}

/** GET /fuel/cheapest-today for one driver. */
export async function cheapestTodayFor(
  userId: string,
  now: Date = new Date()
): Promise<{ data: CheapestFuelToday | EvRunningCostToday | null; reason?: string }> {
  const [ctx] = await loadDriverContexts([userId], now);
  if (!ctx) return { data: null, reason: "no_user" };
  if (!ctx.vehicle) return { data: null, reason: "no_vehicle" };
  if (!ctx.fuelPath) return { data: null, reason: "unknown_fuel_type" };

  if (ctx.fuelPath.path === "ev") {
    const r = await evRatesFor(ctx);
    return {
      data: {
        kind: "ev",
        ...r,
        homePencePerMile: Math.round(evPencePerMile(r.milesPerKwh, r.homePencePerKwh) * 10) / 10,
        publicPencePerMile: Math.round(evPencePerMile(r.milesPerKwh, r.publicPencePerKwh) * 10) / 10,
        line: evRunningCostLine(r),
      },
    };
  }

  if (!ctx.start) return { data: null, reason: "no_start_point" };
  const label = ctx.fuelPath.label;
  const nationalAveragePence = await nationalAverageFor(ctx.fuelPath.key);
  const sel = await selectForDriver(ctx, { nowMs: now.getTime(), lastAlert: null, nationalAveragePence });
  if (!sel || !sel.cheapest || sel.localAveragePence == null) {
    return { data: null, reason: "too_few_stations" };
  }
  return {
    data: {
      kind: "fuel",
      fuel: label,
      stationName: sel.cheapest.name,
      pencePerLitre: sel.cheapest.pencePerLitre,
      distanceMiles: sel.cheapest.distanceMiles,
      latitude: sel.cheapest.latitude,
      longitude: sel.cheapest.longitude,
      localAveragePence: sel.localAveragePence,
      nationalAveragePence: sel.nationalAveragePence,
      underLocalPence: sel.underLocalPence,
      radiusMiles: sel.radiusMiles,
      stationCount: sel.stationCount,
      startSource: ctx.start.source,
      line: cheapestFuelLine(label, sel)!,
      worthAlerting: sel.underLocalPence >= ALERT_THRESHOLD_PENCE,
    },
  };
}
