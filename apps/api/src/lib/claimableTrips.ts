import type { Prisma } from "@prisma/client";

// Business trips in a vehicle someone else pays for (Vehicle.providedByOthers:
// an employer's or client's van) are real business miles but never part of a
// mileage claim. Every claim (AMAP deduction, tax estimate, exports, Self
// Assessment, MTD, Milesheet) reads business trips through these two helpers,
// so one switch on the vehicle keeps them all in step.
//
// Trips with no vehicle stay claimable. The OR keeps them: a bare
// `vehicle: { isNot: ... }` filter can drop NULL-vehicle rows in SQL.
const CLAIMABLE: Prisma.TripWhereInput = {
  OR: [{ vehicleId: null }, { vehicle: { is: { providedByOthers: false } } }],
};

/** Add "not in a vehicle someone else pays for" to a trip where clause. */
export function claimableWhere(where: Prisma.TripWhereInput): Prisma.TripWhereInput {
  const and = where.AND === undefined ? [] : Array.isArray(where.AND) ? where.AND : [where.AND];
  return { ...where, AND: [...and, CLAIMABLE] };
}

/** In-memory check for trips loaded with `vehicle: { select: { providedByOthers: true } }`. */
export function isClaimableTrip(trip: {
  classification: string;
  vehicle?: { providedByOthers?: boolean | null } | null;
}): boolean {
  return trip.classification === "business" && !trip.vehicle?.providedByOthers;
}
