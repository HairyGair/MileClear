import { prisma } from "../lib/prisma.js";
import { fallbackVehicleTypeForUser } from "./vehicleDefaults.js";
import { employerRatesFor } from "../lib/mileageRates.js";
import {
  computeProjectMileageTotals,
  distinctProjectLabels,
  parseTaxYear,
  type ProjectMileageTotals,
} from "@mileclear/shared";

/**
 * Miles by project for one driver and one tax year (5 Oct 2026).
 *
 * Business trips only, phantoms excluded, valued in date order by the shared
 * computeProjectMileageTotals so the 10,000-mile threshold lands on the right
 * trips. Same rate rules as upsertMileageSummary (lib/mileageRates): gig-app
 * trips at the approved rates, other work trips at the driver's employer rate
 * when they have one; the vehicle-less fallback type from vehicleDefaults.
 */
export async function loadProjectTotals(
  userId: string,
  taxYear: string,
): Promise<ProjectMileageTotals> {
  const { start, end } = parseTaxYear(taxYear);

  const [user, fallbackType, trips] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        workType: true,
        employerMileageRatePence: true,
        employerMileageRatePenceAfter10k: true,
      },
    }),
    fallbackVehicleTypeForUser(userId),
    prisma.trip.findMany({
      where: {
        userId,
        isPhantomTrip: false,
        classification: "business",
        startedAt: { gte: start, lte: end },
      },
      select: {
        startedAt: true,
        distanceMiles: true,
        projectLabel: true,
        platformTag: true,
        vehicle: { select: { vehicleType: true, providedByOthers: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
  ]);

  return computeProjectMileageTotals(
    trips.map((t) => ({
      startedAt: t.startedAt,
      distanceMiles: t.distanceMiles,
      vehicleType: t.vehicle?.vehicleType ?? null,
      projectLabel: t.projectLabel,
      notClaimed: t.vehicle?.providedByOthers ?? false,
      employerTrip: !t.platformTag,
    })),
    {
      taxYear,
      rates: {},
      employerRates: employerRatesFor(user),
      fallbackVehicleType: fallbackType,
    },
  );
}

/** Every label the driver has used on a trip, most recent first, max 30. */
export async function loadProjectLabels(userId: string, max = 30): Promise<string[]> {
  const rows = await prisma.trip.groupBy({
    by: ["projectLabel"],
    where: { userId, projectLabel: { not: null } },
    _max: { startedAt: true },
  });
  return distinctProjectLabels(
    rows.map((r) => ({ projectLabel: r.projectLabel, startedAt: r._max.startedAt ?? new Date(0) })),
    max,
  );
}
