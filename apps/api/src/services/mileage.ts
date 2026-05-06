export { calculateHmrcDeduction } from "@mileclear/shared";

import { prisma } from "../lib/prisma.js";
import { calculateMileageDeduction, parseTaxYear, resolveMileageRates } from "@mileclear/shared";

/**
 * Recompute and upsert the MileageSummary for a user + tax year.
 * Aggregates all trips in that tax year window, computes deductions per vehicle type.
 *
 * Honours the user's employer rate when workType is "employee" or "both";
 * otherwise applies HMRC AMAP rates. The MileageSummary stores a single
 * `deductionPence` figure - whichever rate set produced it.
 */
export async function upsertMileageSummary(
  userId: string,
  taxYear: string
): Promise<void> {
  const { start, end } = parseTaxYear(taxYear);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      workType: true,
      employerMileageRatePence: true,
      employerMileageRatePenceAfter10k: true,
    },
  });

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
      vehicle: { select: { vehicleType: true } },
    },
  });

  let totalMiles = 0;
  let businessMiles = 0;
  const businessMilesByType: Record<string, number> = {
    car: 0,
    van: 0,
    motorbike: 0,
  };

  for (const trip of trips) {
    totalMiles += trip.distanceMiles;
    if (trip.classification === "business") {
      businessMiles += trip.distanceMiles;
      const vType = trip.vehicle?.vehicleType ?? "car";
      businessMilesByType[vType] =
        (businessMilesByType[vType] ?? 0) + trip.distanceMiles;
    }
  }

  const rateOpts = user ? resolveMileageRates(user) : {};

  // Calculate deduction across all vehicle types
  let deductionPence = 0;
  for (const [vType, miles] of Object.entries(businessMilesByType)) {
    if (miles > 0) {
      deductionPence += calculateMileageDeduction(
        vType as "car" | "van" | "motorbike",
        miles,
        rateOpts,
      ).deductionPence;
    }
  }

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
