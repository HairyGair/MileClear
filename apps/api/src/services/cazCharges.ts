// "Charges to pay" (Pro, Oct 2026): recent trips that went into a Clean Air
// Zone or the London ULEZ in a vehicle that may not be exempt, with each
// zone's pay-by deadline and an "I've paid" tick.
//
// Detection is the same as the trip screen's (shared
// assessTripCleanAirZoneCharges: vehicle compliance x route through the zone
// boundary). Zones charge per vehicle per DAY, so two trips into Birmingham
// on the same day are one £8 charge, keyed zoneId:day (UK day the trip
// started).
//
// The tick is stored as an app event ("caz.paid", metadata.key), not a new
// table: no migration, and the list only reaches back 28 days, well inside the
// 90-day event retention (jobs/briefing.ts cleanupOldEvents).

import { prisma } from "../lib/prisma.js";
import {
  assessCleanAirZones,
  assessTripCleanAirZoneCharges,
  cazChargeKey,
  cazChargesOnDay,
  cazChargeStatus,
  cazPayDeadline,
  cazZoneInfoUrl,
  CLEAN_AIR_ZONES,
  ukDayOf,
  type CazChargeItem,
  type CazVehicleClass,
} from "@mileclear/shared";

export const CAZ_PAID_EVENT = "caz.paid";
export const CAZ_LIST_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;
const COORD_CHUNK = 25;
const MAX_TRIPS = 400;

export function vehicleCazClass(vehicleType: string | null | undefined): CazVehicleClass {
  const t = (vehicleType ?? "").toLowerCase();
  if (t.includes("van") || t.includes("lgv") || t.includes("truck")) return "van";
  if (t.includes("motor") || t.includes("bike")) return "motorcycle";
  return "car";
}

interface VehicleRow {
  id: string;
  euroStatus: string | null;
  fuelType: string;
  firstRegistration: string | null;
  vehicleType: string;
}

function vehicleInput(v: VehicleRow) {
  return {
    euroStatus: v.euroStatus,
    fuelType: v.fuelType,
    firstRegistration: v.firstRegistration,
    vehicleClass: vehicleCazClass(v.vehicleType),
  };
}

/** Vehicles that could be charged somewhere (non-compliant or unknown). */
export function chargeableVehicles<T extends VehicleRow>(vehicles: T[]): T[] {
  return vehicles.filter((v) => assessCleanAirZones(vehicleInput(v)).verdict !== "compliant");
}

/** Order: due soonest first, then no known deadline, then overdue, then paid. */
export function sortCazCharges(items: CazChargeItem[]): CazChargeItem[] {
  const rank = { due: 0, unknown_deadline: 1, overdue: 2, paid: 3 } as const;
  return [...items].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === "due" || a.status === "overdue") {
      return (a.deadline?.deadlineAt ?? "").localeCompare(b.deadline?.deadlineAt ?? "");
    }
    return b.travelDay.localeCompare(a.travelDay);
  });
}

async function paidKeys(userId: string, since: Date): Promise<Map<string, string>> {
  const rows = await prisma.appEvent.findMany({
    where: { userId, type: CAZ_PAID_EVENT, createdAt: { gte: since } },
    select: { metadata: true, createdAt: true },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    const key = (r.metadata as { key?: unknown } | null)?.key;
    if (typeof key === "string") out.set(key, r.createdAt.toISOString());
  }
  return out;
}

export async function listCazCharges(
  userId: string,
  now: Date = new Date(),
  opts: { sinceDays?: number } = {}
): Promise<CazChargeItem[]> {
  const since = new Date(now.getTime() - (opts.sinceDays ?? CAZ_LIST_DAYS) * DAY_MS);
  const vehicles = chargeableVehicles(
    await prisma.vehicle.findMany({
      where: { userId },
      select: { id: true, euroStatus: true, fuelType: true, firstRegistration: true, vehicleType: true },
    })
  );
  if (vehicles.length === 0) return [];
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  const trips = await prisma.trip.findMany({
    where: { userId, isPhantomTrip: false, vehicleId: { in: [...vehicleById.keys()] }, startedAt: { gte: since } },
    select: { id: true, vehicleId: true, startedAt: true, startLat: true, startLng: true, endLat: true, endLng: true },
    orderBy: { startedAt: "desc" },
    take: MAX_TRIPS,
  });
  if (trips.length === 0) return [];

  // Route points, a chunk of trips at a time.
  const coordsByTrip = new Map<string, { lat: number; lng: number }[]>();
  for (let i = 0; i < trips.length; i += COORD_CHUNK) {
    const ids = trips.slice(i, i + COORD_CHUNK).map((t) => t.id);
    const rows = await prisma.tripCoordinate.findMany({
      where: { tripId: { in: ids } },
      select: { tripId: true, lat: true, lng: true },
    });
    for (const r of rows) {
      const list = coordsByTrip.get(r.tripId) ?? [];
      list.push({ lat: r.lat, lng: r.lng });
      coordsByTrip.set(r.tripId, list);
    }
  }

  const byKey = new Map<string, CazChargeItem>();
  for (const t of trips) {
    const v = t.vehicleId ? vehicleById.get(t.vehicleId) : undefined;
    if (!v) continue;
    const coords = coordsByTrip.get(t.id) ?? [
      { lat: t.startLat, lng: t.startLng },
      ...(t.endLat != null && t.endLng != null ? [{ lat: t.endLat, lng: t.endLng }] : []),
    ];
    const assessment = assessTripCleanAirZoneCharges({ ...vehicleInput(v), coords });
    if (assessment.charges.length === 0) continue;
    const day = ukDayOf(t.startedAt);
    for (const c of assessment.charges) {
      if (!cazChargesOnDay(c.zoneId, day)) continue;
      const key = cazChargeKey(c.zoneId, day);
      const existing = byKey.get(key);
      if (existing) {
        existing.tripIds.push(t.id);
        continue;
      }
      byKey.set(key, {
        key,
        zoneId: c.zoneId,
        zoneName: c.name,
        travelDay: day,
        chargePence: c.chargePence,
        tripIds: [t.id],
        deadline: cazPayDeadline(c.zoneId, day),
        infoUrl: cazZoneInfoUrl(c.zoneId),
        status: "due",
        paidAt: null,
        confidence: assessment.confidence,
      });
    }
  }
  if (byKey.size === 0) return [];

  const paid = await paidKeys(userId, since);
  for (const item of byKey.values()) {
    item.paidAt = paid.get(item.key) ?? null;
    item.status = cazChargeStatus(item.deadline, item.paidAt != null, now);
  }
  return sortCazCharges([...byKey.values()]);
}

export class CazPaidError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

/** Tick (or untick) "I've paid" for the charge a trip incurred in a zone. */
export async function setCazPaid(userId: string, tripId: string, zoneId: string, paid: boolean): Promise<{ key: string; paid: boolean }> {
  if (!CLEAN_AIR_ZONES.some((z) => z.id === zoneId)) throw new CazPaidError("Unknown zone.", 400);
  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId }, select: { startedAt: true } });
  if (!trip) throw new CazPaidError("Trip not found.", 404);
  const key = cazChargeKey(zoneId, ukDayOf(trip.startedAt));

  const existing = await prisma.appEvent.findMany({
    where: { userId, type: CAZ_PAID_EVENT, createdAt: { gte: new Date(trip.startedAt.getTime() - DAY_MS) } },
    select: { id: true, metadata: true },
  });
  const matching = existing.filter((e) => (e.metadata as { key?: unknown } | null)?.key === key);

  if (paid && matching.length === 0) {
    await prisma.appEvent.create({ data: { type: CAZ_PAID_EVENT, userId, metadata: { key, zoneId, tripId } } });
  } else if (!paid && matching.length > 0) {
    await prisma.appEvent.deleteMany({ where: { id: { in: matching.map((m) => m.id) } } });
  }
  return { key, paid };
}
