import { prisma } from "../lib/prisma.js";
import { VEHICLE_TYPES, type VehicleType } from "@mileclear/shared";

function isVehicleType(v: string | undefined): v is VehicleType {
  return v !== undefined && (VEHICLE_TYPES as readonly string[]).includes(v);
}

/**
 * The AMAP rate class to assume for a trip whose vehicle is unknown.
 *
 * Rule: the primary vehicle's type; else, if every vehicle the user owns is
 * the same type, that type; else "car". This is the pure decision, taking
 * the user's vehicle list, so the rule is unit-testable and the two loaders
 * below share it.
 *
 * Why not just "car": lsstart24 (4 Sep 2026) rides a motorbike and was
 * credited 55p instead of 24p on trips with no vehicle. Attaching the sole
 * vehicle fixed single-vehicle accounts, but a rider with two bikes and no
 * primary flag, or a trip that cannot be attached, still fell through to
 * car. When everything they own is a motorbike, the answer is motorbike.
 * Only a mixed garage with no primary is a genuine guess, and there the
 * most common type wins.
 */
export function fallbackVehicleTypeFromList(
  vehicles: { vehicleType: string; isPrimary: boolean }[],
): VehicleType {
  const primaryType = vehicles.find((v) => v.isPrimary)?.vehicleType;
  if (isVehicleType(primaryType)) return primaryType;
  const types = new Set(vehicles.map((v) => v.vehicleType));
  if (types.size === 1) {
    const only = vehicles[0].vehicleType;
    if (isVehicleType(only)) return only;
  }
  return "car";
}

/** Rate class for one user's vehicle-less trips. One small query. */
export async function fallbackVehicleTypeForUser(userId: string): Promise<VehicleType> {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId },
    select: { vehicleType: true, isPrimary: true },
    take: 20,
  });
  return fallbackVehicleTypeFromList(vehicles);
}

/**
 * Batch variant for jobs that loop many users: one query for the whole set,
 * so a cron over thousands of summaries does not add a per-user lookup.
 * Every requested id is present in the result; users with no vehicles map
 * to "car".
 */
export async function fallbackVehicleTypeForUsers(
  userIds: string[],
): Promise<Map<string, VehicleType>> {
  const ids = [...new Set(userIds)];
  const byUser = new Map<string, { vehicleType: string; isPrimary: boolean }[]>();
  if (ids.length > 0) {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, vehicleType: true, isPrimary: true },
    });
    for (const v of vehicles) {
      const list = byUser.get(v.userId) ?? [];
      list.push(v);
      byUser.set(v.userId, list);
    }
  }
  return new Map(ids.map((id) => [id, fallbackVehicleTypeFromList(byUser.get(id) ?? [])]));
}

/**
 * Which vehicle a trip belongs to when the client did not say.
 *
 * Auto-recorded trips arrive with no vehicleId, and every deduction path
 * treated a trip with no vehicle as a car. lsstart24 (4 Sep 2026) rides a
 * motorbike, so 16 business miles were credited at 55p instead of 24p. The
 * user's primary vehicle is the right default; failing that, their only
 * vehicle; failing that, nothing, and the callers keep their car fallback.
 */
export async function defaultVehicleIdForUser(userId: string): Promise<string | null> {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId },
    select: { id: true, isPrimary: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  if (vehicles.length === 0) return null;
  return (vehicles.find((v) => v.isPrimary) ?? (vehicles.length === 1 ? vehicles[0] : null))?.id ?? null;
}

/**
 * Attach the user's sole vehicle to every trip of theirs that has none.
 *
 * Covers the driver who recorded first and added the bike later, and the
 * fleet's historical auto trips. Only acts when there is exactly one vehicle,
 * so it never guesses between two. Idempotent and cheap (one updateMany), so
 * it is safe to run from the summary recompute and from vehicle creation.
 */
export async function attachSoleVehicleToOrphanTrips(userId: string): Promise<number> {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId },
    select: { id: true },
    take: 2,
  });
  if (vehicles.length !== 1) return 0;
  const result = await prisma.trip.updateMany({
    where: { userId, vehicleId: null },
    data: { vehicleId: vehicles[0].id },
  });
  return result.count;
}
