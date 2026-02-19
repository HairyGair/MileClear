export { calculateHmrcDeduction } from "@mileclear/shared";

import { prisma } from "../lib/prisma.js";
import { calculateHmrcDeduction, parseTaxYear } from "@mileclear/shared";

/**
 * Recompute and upsert the MileageSummary for a user + tax year.
 * Aggregates all trips in that tax year window, computes deductions per vehicle type.
 */
export async function upsertMileageSummary(
  userId: string,
  taxYear: string
): Promise<void> {
  const { start, end } = parseTaxYear(taxYear);

  // Aggregate total and business miles, grouped by vehicle type
  const trips = await prisma.trip.findMany({
    where: {
      userId,
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

  // Calculate deduction across all vehicle types
  let deductionPence = 0;
  for (const [vType, miles] of Object.entries(businessMilesByType)) {
    if (miles > 0) {
      deductionPence += calculateHmrcDeduction(
        vType as "car" | "van" | "motorbike",
        miles
      );
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
