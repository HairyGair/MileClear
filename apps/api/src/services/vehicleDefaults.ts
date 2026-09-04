import { prisma } from "../lib/prisma.js";

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
