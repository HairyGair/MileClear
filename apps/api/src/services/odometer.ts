import { prisma } from "../lib/prisma.js";
import { defaultVehicleIdForUser } from "./vehicleDefaults.js";
import { buildOdometerTimeline, odometerDays } from "@mileclear/shared";
import type {
  OdometerAnchorInput,
  OdometerDay,
  OdometerListSummary,
  OdometerTimeline,
  OdometerTripInput,
} from "@mileclear/shared";

/**
 * Running odometer (9 Oct 2026): loads a vehicle's trips and readings and
 * hands them to the pure calculation in shared/utils/odometer.ts. Nothing is
 * stored per day, so every read reflects the trips as they are now.
 *
 * A trip or fuel log with no vehicle belongs to the driver's default vehicle
 * (defaultVehicleIdForUser: the primary, or the only vehicle), the same rule
 * new trips are saved with.
 */

export interface VehicleOdometerInputs {
  trips: OdometerTripInput[];
  anchors: OdometerAnchorInput[];
}

/**
 * Load the calculation inputs for some of a user's vehicles. `vehicleIds`
 * must already be known to belong to the user.
 *
 * With `tripsOnlyIfAnchors` the trips are only read when at least one real
 * reading exists anywhere (typed, fuel or on a trip), so a list screen costs
 * a few small queries for the many drivers who never use the odometer.
 */
export async function loadOdometerInputs(
  userId: string,
  vehicleIds: string[],
  opts: { tripsOnlyIfAnchors?: boolean } = {}
): Promise<Map<string, VehicleOdometerInputs>> {
  const result = new Map<string, VehicleOdometerInputs>();
  for (const id of vehicleIds) result.set(id, { trips: [], anchors: [] });
  if (vehicleIds.length === 0) return result;

  const defaultId = await defaultVehicleIdForUser(userId);
  const includesDefault = defaultId !== null && vehicleIds.includes(defaultId);
  const vehicleFilter = includesDefault
    ? [{ vehicleId: { in: vehicleIds } }, { vehicleId: null }]
    : [{ vehicleId: { in: vehicleIds } }];

  const [readings, fuelLogs] = await Promise.all([
    prisma.odometerReading.findMany({
      where: { userId, vehicleId: { in: vehicleIds } },
      select: { id: true, vehicleId: true, readingMiles: true, readAt: true, createdAt: true },
    }),
    prisma.fuelLog.findMany({
      where: { userId, odometerReading: { gt: 0 }, OR: vehicleFilter },
      select: { id: true, vehicleId: true, odometerReading: true, loggedAt: true },
    }),
  ]);

  for (const r of readings) {
    result.get(r.vehicleId)?.anchors.push({
      id: r.id,
      at: r.readAt,
      readingMiles: r.readingMiles,
      source: "user",
      createdAt: r.createdAt,
    });
  }
  for (const f of fuelLogs) {
    const owner = f.vehicleId ?? defaultId;
    if (!owner || f.odometerReading === null) continue;
    result.get(owner)?.anchors.push({
      id: f.id,
      at: f.loggedAt,
      readingMiles: f.odometerReading,
      source: "fuel",
    });
  }

  if (opts.tripsOnlyIfAnchors && readings.length === 0 && fuelLogs.length === 0) {
    const withOdo = await prisma.trip.count({
      where: {
        userId,
        endedAt: { not: null },
        isPhantomTrip: false,
        OR: [{ odometerStart: { gt: 0 } }, { odometerEnd: { gt: 0 } }],
      },
    });
    if (withOdo === 0) return result;
  }

  const trips = await prisma.trip.findMany({
    where: { userId, endedAt: { not: null }, isPhantomTrip: false, OR: vehicleFilter },
    select: {
      id: true,
      vehicleId: true,
      startedAt: true,
      distanceMiles: true,
      classification: true,
      odometerStart: true,
      odometerEnd: true,
    },
  });
  for (const t of trips) {
    const owner = t.vehicleId ?? defaultId;
    if (!owner) continue;
    result.get(owner)?.trips.push({
      id: t.id,
      startedAt: t.startedAt,
      distanceMiles: t.distanceMiles,
      classification: t.classification,
      odometerStart: t.odometerStart,
      odometerEnd: t.odometerEnd,
    });
  }
  return result;
}

export async function loadOdometerTimelines(
  userId: string,
  vehicleIds: string[],
  opts: { tripsOnlyIfAnchors?: boolean } = {}
): Promise<Map<string, OdometerTimeline>> {
  const inputs = await loadOdometerInputs(userId, vehicleIds, opts);
  const out = new Map<string, OdometerTimeline>();
  for (const [id, input] of inputs) out.set(id, buildOdometerTimeline(input));
  return out;
}

/** `{ miles, isEstimated }` per vehicle for the vehicle list; null when no real reading exists. */
export async function vehicleOdometerSummaries(
  userId: string,
  vehicleIds: string[]
): Promise<Map<string, OdometerListSummary | null>> {
  const timelines = await loadOdometerTimelines(userId, vehicleIds, { tripsOnlyIfAnchors: true });
  const out = new Map<string, OdometerListSummary | null>();
  for (const [id, tl] of timelines) {
    out.set(id, tl.current ? { miles: tl.current.miles, isEstimated: tl.current.isEstimated } : null);
  }
  return out;
}

export interface TripOdometerFigures {
  start: number | null;
  end: number | null;
  /** "Recorded" only when both ends are real readings. */
  source: "Recorded" | "Estimated" | null;
}

/**
 * Odometer start and end for exported trips. The figures come from ALL the
 * vehicle's trips, so a "business trips only" export still jumps by the
 * personal miles in between, as an employer's form expects.
 */
export async function odometerForExportTrips(
  userId: string,
  trips: Array<{ id: string; vehicleId: string | null }>
): Promise<Map<string, TripOdometerFigures>> {
  const out = new Map<string, TripOdometerFigures>();
  if (trips.length === 0) return out;
  const defaultId = await defaultVehicleIdForUser(userId);
  const vehicleIds = new Set<string>();
  for (const t of trips) {
    const v = t.vehicleId ?? defaultId;
    if (v) vehicleIds.add(v);
  }
  if (vehicleIds.size === 0) return out;

  const timelines = await loadOdometerTimelines(userId, [...vehicleIds], { tripsOnlyIfAnchors: true });
  const byTrip = new Map<string, { start: number | null; end: number | null; recorded: boolean }>();
  for (const tl of timelines.values()) {
    for (const ev of tl.events) {
      if (ev.kind !== "trip") continue;
      byTrip.set(ev.id, {
        start: ev.odoStart,
        end: ev.odoEnd,
        recorded: ev.startRecorded && ev.endRecorded,
      });
    }
  }
  for (const t of trips) {
    const fig = byTrip.get(t.id);
    if (!fig || fig.start === null || fig.end === null) continue;
    out.set(t.id, {
      start: Math.round(fig.start),
      end: Math.round(fig.end),
      source: fig.recorded ? "Recorded" : "Estimated",
    });
  }
  return out;
}

// -- Odometer log CSV (GET /exports/odometer-log) ----------------------

// Mirrors services/export.ts's escapeCsvField (formula-injection guard).
// Finite numbers are written as they are so a negative difference stays a number.
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let str = value;
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function oneDecimal(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

function ukDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export const ODOMETER_LOG_CSV_HEADERS = [
  "Date",
  "Vehicle",
  "Registration",
  "Odometer start",
  "Start source",
  "Odometer end",
  "End source",
  "Business miles",
  "Personal miles",
  "Not sorted miles",
  "Difference from readings (miles)",
];

export function odometerLogToCsv(
  days: OdometerDay[],
  vehicle: { make: string; model: string; registrationPlate: string | null }
): string {
  const name = `${vehicle.make} ${vehicle.model}`;
  const rows = days.map((d) =>
    [
      ukDate(d.date),
      name,
      vehicle.registrationPlate ?? "",
      d.opening === null ? "" : Math.round(d.opening),
      d.opening === null ? "" : d.openingRecorded ? "Recorded" : "Estimated",
      d.closing === null ? "" : Math.round(d.closing),
      d.closing === null ? "" : d.closingRecorded ? "Recorded" : "Estimated",
      oneDecimal(d.businessMiles),
      oneDecimal(d.personalMiles),
      oneDecimal(d.notSortedMiles),
      oneDecimal(d.difference),
    ]
      .map(csvCell)
      .join(",")
  );
  return [ODOMETER_LOG_CSV_HEADERS.join(","), ...rows].join("\r\n") + "\r\n";
}

/** Days between two YYYY-MM-DD dates, inclusive. */
export function inclusiveDayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

export async function odometerDaysForVehicle(
  userId: string,
  vehicleId: string,
  from: string,
  to: string
): Promise<OdometerDay[]> {
  const timelines = await loadOdometerTimelines(userId, [vehicleId]);
  const tl = timelines.get(vehicleId);
  return tl ? odometerDays(tl, from, to) : [];
}

/** The first and last London dates of a tax year ("2026-27" -> 2026-04-06 to 2027-04-05). */
export function taxYearDateRange(taxYear: string): { from: string; to: string } {
  const m = taxYear.match(/^(\d{4})-(\d{2})$/);
  if (!m || Number(m[2]) !== (Number(m[1]) + 1) % 100) throw new Error(`Invalid tax year format: ${taxYear}`);
  return { from: `${m[1]}-04-06`, to: `${Number(m[1]) + 1}-04-05` };
}

/**
 * The Odometer log (CSV) download: one row per day, oldest first, for one
 * vehicle. Returns null rows when the vehicle is not the user's.
 */
export async function generateOdometerLogCsv(
  userId: string,
  opts: { vehicleId: string; from: string; to: string }
): Promise<{ csv: string; dayCount: number } | null> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: opts.vehicleId, userId },
    select: { id: true, make: true, model: true, registrationPlate: true },
  });
  if (!vehicle) return null;
  const days = await odometerDaysForVehicle(userId, vehicle.id, opts.from, opts.to);
  return { csv: odometerLogToCsv(days, vehicle), dayCount: days.length };
}
