import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { fallbackVehicleTypeForUser } from "./vehicleDefaults.js";
import { employerRatesFor } from "../lib/mileageRates.js";
import {
  computeProjectMileageTotals,
  distinctProjectLabels,
  exportProjectLabel,
  parseTaxYear,
  projectLabelKey,
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

/**
 * One client the driver has used, for the client filter on the trip list and
 * the one-client CSV and Trip Report (23 Oct 2026).
 */
export interface ProjectLabelMatch {
  /** projectLabelKey of the label: what every trip's label is compared by. */
  key: string;
  /** The most-used spelling, tidied, for headings ("NHS Trust"). */
  label: string;
  /** Every stored spelling with that key, for a `projectLabel: { in }` filter. */
  spellings: string[];
}

/**
 * The driver's client matching `label` by projectLabelKey, the rule Miles by
 * project groups by, so "nhs " finds trips saved as "NHS". Null when no trip
 * of theirs has that label. Scoped to the user.
 *
 * The database compares labels without case or accents (utf8mb4_unicode_ci),
 * so `in: spellings` can also take in a spelling such as "Café" for "Cafe".
 * Callers that need the exact set (the exports) also check each row with
 * projectLabelMatches.
 */
export async function resolveProjectLabel(
  userId: string,
  label: string,
): Promise<ProjectLabelMatch | null> {
  const key = projectLabelKey(label);
  if (!key) return null;
  const rows = await prisma.trip.groupBy({
    by: ["projectLabel"],
    where: { userId, projectLabel: { not: null } },
    _count: { _all: true },
  });
  const matching = rows.filter((r) => r.projectLabel != null && projectLabelKey(r.projectLabel) === key);
  if (matching.length === 0) return null;
  // Most-used spelling; ties keep the first one the database returned.
  const count = (r: (typeof matching)[number]) => r._count?._all ?? 0;
  const best = matching.reduce((a, b) => (count(b) > count(a) ? b : a));
  return {
    key,
    label: exportProjectLabel(best.projectLabel!),
    spellings: matching.map((r) => r.projectLabel!),
  };
}

/** Trip where clause for one client (see resolveProjectLabel). */
export function projectLabelTripWhere(match: Pick<ProjectLabelMatch, "spellings">): Prisma.TripWhereInput {
  return { projectLabel: { in: match.spellings } };
}

/** Trip where clause for trips with no Project / client. */
export function noProjectLabelTripWhere(): Prisma.TripWhereInput {
  // "" too: under the database's collation it also covers a label of spaces.
  return { OR: [{ projectLabel: null }, { projectLabel: "" }] };
}
