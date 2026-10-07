export { calculateHmrcDeduction } from "@mileclear/shared";

import { prisma } from "../lib/prisma.js";
import { attachSoleVehicleToOrphanTrips, fallbackVehicleTypeForUser } from "./vehicleDefaults.js";
import { parseTaxYear } from "@mileclear/shared";
import { isClaimableTrip } from "../lib/claimableTrips.js";
import { claimValuePence, type RatedTrip } from "../lib/mileageRates.js";

/**
 * Recompute and upsert the MileageSummary for a user + tax year.
 * Aggregates all trips in that tax year window, computes deductions per vehicle type.
 *
 * `deductionPence` is the claim value (lib/mileageRates): gig-app trips at
 * the approved rates, untagged trips at the employer's rate when the driver
 * has one set, otherwise everything at the approved rates.
 */
export async function upsertMileageSummary(
  userId: string,
  taxYear: string
): Promise<void> {
  const { start, end } = parseTaxYear(taxYear);

  // A driver with one vehicle means every trip is on it; give the orphans
  // that vehicle before aggregating so the AMAP rate is the right one.
  await attachSoleVehicleToOrphanTrips(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      workType: true,
      employerMileageRatePence: true,
      employerMileageRatePenceAfter10k: true,
    },
  });

  // Rate class for any trip still without a vehicle (two-vehicle accounts
  // with no primary are never attached above).
  const fallbackType = await fallbackVehicleTypeForUser(userId);

  // Aggregate total and business miles, grouped by vehicle type.
  // Phantom trips (auto-detected walking-speed misfires) are excluded
  // so HMRC totals never include rubbish.
  const trips = await prisma.trip.findMany({
    where: {
      userId,
      isPhantomTrip: false,
      startedAt: { gte: start, lte: end },
    },
    select: {
      distanceMiles: true,
      classification: true,
      platformTag: true,
      vehicle: { select: { vehicleType: true, providedByOthers: true } },
    },
  });

  let totalMiles = 0;
  let businessMiles = 0;
  const claimable: RatedTrip[] = [];

  for (const trip of trips) {
    totalMiles += trip.distanceMiles;
    if (trip.classification === "business") {
      businessMiles += trip.distanceMiles;
    }
    // businessMiles keeps every business trip; the deduction leaves out
    // vehicles someone else pays for.
    if (isClaimableTrip(trip)) {
      claimable.push({
        distanceMiles: trip.distanceMiles,
        vehicleType: (trip.vehicle?.vehicleType ?? fallbackType) as RatedTrip["vehicleType"],
        platformTag: trip.platformTag,
      });
    }
  }

  const deductionPence = claimValuePence(claimable, user, taxYear);

  await prisma.mileageSummary.upsert({
    where: { userId_taxYear: { userId, taxYear } },
    create: {
      userId,
      taxYear,
      totalMiles,
      businessMiles,
      deductionPence,
    },
    update: {
      totalMiles,
      businessMiles,
      deductionPence,
    },
  });
}
