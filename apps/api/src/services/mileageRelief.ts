import { prisma } from "../lib/prisma.js";
import { fallbackVehicleTypeFromList } from "./vehicleDefaults.js";
import {
  marClaimableTaxYears,
  marClaimDeadline,
  parseTaxYear,
  type MileageReliefData,
  type MileageReliefYearMiles,
} from "@mileclear/shared";

/**
 * Mileage Allowance Relief for employees (free, no paywall).
 *
 * Returns the business miles per claimable tax year, split into the kinds of
 * vehicle HMRC works out separately (cars and vans together, motorcycles on
 * their own: EIM31240). The relief itself is worked out on the phone with
 * calculateMileageAllowanceRelief() so the driver can correct what their
 * employer paid for a year without that being saved over their settings.
 *
 * What counts:
 *   - classification "business", not a phantom trip
 *   - not tagged with the "commute" category: home to a permanent workplace is
 *     not business travel (https://www.gov.uk/tax-relief-for-employees/vehicles-you-use-for-work)
 *   - for workType "both", not tagged with a gig platform or "freelance": that
 *     is self-employed travel, claimed on the self-employment pages instead,
 *     and MAR is for employment only (EIM31330)
 * Excluded miles are reported so the screen can say what was left out.
 */
export async function loadMileageReliefData(
  userId: string,
  now: Date = new Date()
): Promise<MileageReliefData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      workType: true,
      employerMileageRatePence: true,
      employerMileageRatePenceAfter10k: true,
    },
  });
  if (!user) return null;

  const vehicles = await prisma.vehicle.findMany({
    where: { userId },
    select: { id: true, vehicleType: true, isPrimary: true },
    take: 50,
  });
  const typeById = new Map(vehicles.map((v) => [v.id, v.vehicleType]));
  const fallbackType = fallbackVehicleTypeFromList(vehicles);
  const excludeGigTrips = user.workType === "both";

  const taxYears = marClaimableTaxYears(now);

  const years: MileageReliefYearMiles[] = await Promise.all(
    taxYears.map(async (taxYear) => {
      const { start, end } = parseTaxYear(taxYear);
      const grouped = await prisma.trip.groupBy({
        by: ["vehicleId", "classification", "platformTag", "category"],
        where: { userId, isPhantomTrip: false, startedAt: { gte: start, lte: end } },
        _count: { id: true },
        _sum: { distanceMiles: true },
      });

      const row: MileageReliefYearMiles = {
        taxYear,
        claimBy: marClaimDeadline(taxYear),
        carVanMiles: 0,
        motorcycleMiles: 0,
        businessTrips: 0,
        commuteMilesLeftOut: 0,
        selfEmployedMilesLeftOut: 0,
        unclassifiedTrips: 0,
        unclassifiedMiles: 0,
      };

      for (const g of grouped) {
        const miles = g._sum.distanceMiles ?? 0;
        const trips = g._count.id;
        if (g.classification === "unclassified") {
          row.unclassifiedTrips += trips;
          row.unclassifiedMiles += miles;
          continue;
        }
        if (g.classification !== "business") continue;
        if (g.category === "commute") {
          row.commuteMilesLeftOut += miles;
          continue;
        }
        if (excludeGigTrips && g.platformTag) {
          row.selfEmployedMilesLeftOut += miles;
          continue;
        }
        const type = (g.vehicleId && typeById.get(g.vehicleId)) || fallbackType;
        if (type === "motorbike") row.motorcycleMiles += miles;
        else row.carVanMiles += miles;
        row.businessTrips += trips;
      }

      const round1 = (n: number) => Math.round(n * 10) / 10;
      row.carVanMiles = round1(row.carVanMiles);
      row.motorcycleMiles = round1(row.motorcycleMiles);
      row.commuteMilesLeftOut = round1(row.commuteMilesLeftOut);
      row.selfEmployedMilesLeftOut = round1(row.selfEmployedMilesLeftOut);
      row.unclassifiedMiles = round1(row.unclassifiedMiles);
      return row;
    }),
  );

  const firstTrip = await prisma.trip.findFirst({
    where: { userId, isPhantomTrip: false },
    orderBy: { startedAt: "asc" },
    select: { startedAt: true },
  });

  const data: MileageReliefData = {
    workType: user.workType,
    employerMileageRatePence: user.employerMileageRatePence,
    employerMileageRatePenceAfter10k: user.employerMileageRatePenceAfter10k,
    joinedAt: user.createdAt.toISOString(),
    firstTripAt: firstTrip?.startedAt.toISOString() ?? null,
    years,
  };
  return data;
}
