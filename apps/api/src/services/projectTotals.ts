import { Prisma } from "@prisma/client";
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

/**
 * Every stored spelling of a Project / client on the driver's trips, compared
 * byte for byte, with its trip count and last use.
 *
 * Not a Prisma groupBy: the column compares without case or accents
 * (utf8mb4_unicode_ci), so a groupBy folds "Café" and "Cafe" into one row and
 * returns either spelling, while projectLabelKey keeps accents apart. Grouping
 * the raw bytes and then by projectLabelKey in code makes the chips, the list,
 * the summary, the exports and Miles by project agree.
 */
export async function loadProjectLabelSpellings(
  userId: string,
): Promise<{ label: string; trips: number; lastAt: Date }[]> {
  const rows = await prisma.$queryRaw<Array<{ raw: Uint8Array | string; n: bigint | number; lastAt: Date | null }>>`
    SELECT CAST(projectLabel AS BINARY) AS raw, COUNT(*) AS n, MAX(startedAt) AS lastAt
    FROM trips
    WHERE userId = ${userId} AND projectLabel IS NOT NULL
    GROUP BY CAST(projectLabel AS BINARY)
  `;
  return rows.map((r) => ({
    label: typeof r.raw === "string" ? r.raw : Buffer.from(r.raw).toString("utf8"),
    trips: Number(r.n),
    lastAt: r.lastAt ?? new Date(0),
  }));
}

/**
 * Every label the driver has used on a trip, one spelling per client, most
 * recent first. Up to 500: the client pickers list them all, and the trip
 * forms' suggestion chips show only the first few.
 */
export async function loadProjectLabels(userId: string, max = 500): Promise<string[]> {
  const rows = await loadProjectLabelSpellings(userId);
  return distinctProjectLabels(
    rows.map((r) => ({ projectLabel: r.label, startedAt: r.lastAt })),
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
  /** Every stored spelling with that key (byte-exact). */
  spellings: string[];
  /** Exactly this client's trips (see resolveProjectLabel). */
  where: Prisma.TripWhereInput;
}

/**
 * The driver's client matching `label` by projectLabelKey, the rule Miles by
 * project groups by, so "nhs " finds trips saved as "NHS". Null when no trip
 * of theirs has that label. Scoped to the user.
 *
 * `projectLabel: { in: spellings }` is exact unless the driver also has a
 * spelling the database treats as equal but projectLabelKey does not (an
 * accent: "Café" and "Cafe"). One count tells: when the database matches more
 * trips than the byte-exact spellings hold, the where clause becomes the
 * byte-exact trip ids instead. Nearly always it stays the cheap `in`.
 */
export async function resolveProjectLabel(
  userId: string,
  label: string,
): Promise<ProjectLabelMatch | null> {
  const key = projectLabelKey(label);
  if (!key) return null;
  const rows = await loadProjectLabelSpellings(userId);
  const matching = rows.filter((r) => projectLabelKey(r.label) === key);
  if (matching.length === 0) return null;
  // Most-used spelling; ties go to the most recently used.
  const best = matching.reduce((a, b) =>
    b.trips > a.trips || (b.trips === a.trips && b.lastAt > a.lastAt) ? b : a,
  );
  const spellings = matching.map((r) => r.label);
  const exactTrips = matching.reduce((sum, r) => sum + r.trips, 0);
  const inWhere: Prisma.TripWhereInput = { projectLabel: { in: spellings } };
  const dbTrips = await prisma.trip.count({ where: { userId, ...inWhere } });
  let where = inWhere;
  if (dbTrips !== exactTrips) {
    const ids = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM trips
      WHERE userId = ${userId} AND CAST(projectLabel AS BINARY) IN (${Prisma.join(spellings)})
    `;
    where = { id: { in: ids.map((r) => r.id) } };
  }
  return { key, label: exportProjectLabel(best.label), spellings, where };
}

/** Trip where clause for one client (see resolveProjectLabel). */
export function projectLabelTripWhere(match: Pick<ProjectLabelMatch, "where">): Prisma.TripWhereInput {
  return match.where;
}

/** Trip where clause for trips with no Project / client. */
export function noProjectLabelTripWhere(): Prisma.TripWhereInput {
  // "" too: under the database's collation it also covers a label of spaces.
  return { OR: [{ projectLabel: null }, { projectLabel: "" }] };
}
