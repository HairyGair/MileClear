/**
 * Trip archive: the safety net under DELETE /trips/:id.
 *
 * The user delete is a hard delete and trip_coordinates cascades, so until
 * this existed a trip swiped away by accident was gone for good. Twice in one
 * month a paying user deleted a real drive (one a 48-mile commute, three
 * seconds after a small hop) and support could only rebuild it from a
 * diagnostic dump, without its route.
 *
 * Design: a server-side ARCHIVE, not a soft-delete flag. The trips table and
 * every query over it are untouched; the row is copied into deleted_trips
 * (full trip as JSON + coordinates as JSON) just before the delete, and an
 * admin can restore it from the user detail page. Restore creates a NEW trip
 * id, so nothing that referenced the old id (sync queue on the phone, events)
 * is silently resurrected.
 *
 * Retention: no purge job yet. Rows older than 60 days can be purged later;
 * the admin list already limits itself to the last 60 days.
 */
import { Prisma } from "@prisma/client";
import { getTaxYear } from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";
import { logEvent } from "./appEvents.js";
import { upsertMileageSummary } from "./mileage.js";

export const ARCHIVE_COORDINATE_CAP = 6000;
export const DELETED_TRIP_RETENTION_DAYS = 60;

export type DeletedBy = "user" | "admin";

export interface ArchivedCoordinate {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recordedAt: string;
}

/**
 * Pure: keep at most `cap` coordinates, newest kept, chronological order out.
 * Input order does not matter; the result is sorted by recordedAt ascending.
 */
export function capArchivedCoordinates<T extends { recordedAt: Date | string }>(
  coords: T[],
  cap: number = ARCHIVE_COORDINATE_CAP
): T[] {
  const sorted = [...coords].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
  if (cap <= 0) return [];
  if (sorted.length <= cap) return sorted;
  return sorted.slice(sorted.length - cap);
}

/** Pure: serialise a TripCoordinate row into the archived shape. */
export function toArchivedCoordinate(c: {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recordedAt: Date | string;
}): ArchivedCoordinate {
  return {
    lat: c.lat,
    lng: c.lng,
    speed: c.speed ?? null,
    accuracy: c.accuracy ?? null,
    recordedAt: new Date(c.recordedAt).toISOString(),
  };
}

/**
 * Pure: pick the fields of an archived trip JSON blob that a restore recreates.
 * Anything not listed (id, userId, createdAt, updatedAt, syncedAt, shiftId,
 * coordinateCount, the quiet-classification markers) is deliberately left to
 * the new row's defaults.
 */
export function restoreDataFromTripJson(
  t: Record<string, unknown>
): Omit<Prisma.TripUncheckedCreateInput, "userId" | "vehicleId"> {
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const date = (v: unknown): Date | null => {
    if (typeof v !== "string" && !(v instanceof Date)) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const startedAt = date(t.startedAt);
  if (!startedAt) throw new Error("Archived trip has no valid startedAt");
  const startLat = num(t.startLat);
  const startLng = num(t.startLng);
  if (startLat === null || startLng === null) {
    throw new Error("Archived trip has no valid start coordinates");
  }

  return {
    startLat,
    startLng,
    originalStartLat: num(t.originalStartLat),
    originalStartLng: num(t.originalStartLng),
    endLat: num(t.endLat),
    endLng: num(t.endLng),
    startAddress: str(t.startAddress),
    endAddress: str(t.endAddress),
    distanceMiles: num(t.distanceMiles) ?? 0,
    startedAt,
    endedAt: date(t.endedAt),
    isManualEntry: t.isManualEntry === true,
    classification: str(t.classification) ?? "unclassified",
    platformTag: str(t.platformTag),
    businessPurpose: str(t.businessPurpose),
    category: str(t.category),
    notes: str(t.notes),
    routePolyline: str(t.routePolyline),
    projectLabel: str(t.projectLabel),
    gpsQuality:
      t.gpsQuality === null || t.gpsQuality === undefined
        ? Prisma.JsonNull
        : (t.gpsQuality as Prisma.InputJsonValue),
    isPhantomTrip: t.isPhantomTrip === true,
    odometerStart: num(t.odometerStart),
    odometerEnd: num(t.odometerEnd),
  };
}

/**
 * Copy a trip and its coordinates into deleted_trips. Call right before the
 * hard delete. Throws on failure; callers treat it as best-effort (a failed
 * archive must never block the delete the user asked for).
 */
export async function archiveTripBeforeDelete(
  tripId: string,
  userId: string,
  deletedBy: DeletedBy
): Promise<string | null> {
  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) return null;

  // Newest `cap` rows, then flipped back into chronological order.
  const rows = await prisma.tripCoordinate.findMany({
    where: { tripId },
    orderBy: { recordedAt: "desc" },
    take: ARCHIVE_COORDINATE_CAP,
    select: { lat: true, lng: true, speed: true, accuracy: true, recordedAt: true },
  });
  const coordinates = capArchivedCoordinates(rows).map(toArchivedCoordinate);

  const archived = await prisma.deletedTrip.create({
    data: {
      userId,
      originalTripId: trip.id,
      deletedBy,
      // JSON round-trip turns Dates into ISO strings; that is the stored shape.
      tripJson: JSON.parse(JSON.stringify(trip)) as Prisma.InputJsonValue,
      coordinatesJson: coordinates as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  logEvent("trip.archived_on_delete", userId, {
    tripId: trip.id,
    deletedTripId: archived.id,
    deletedBy,
    distanceMiles: trip.distanceMiles,
    coordinateCount: coordinates.length,
    coordinatesTruncated: trip.coordinateCount > coordinates.length,
  });

  return archived.id;
}

export class DeletedTripNotFoundError extends Error {
  constructor() {
    super("Deleted trip not found");
    this.name = "DeletedTripNotFoundError";
  }
}

export class DeletedTripAlreadyRestoredError extends Error {
  restoredTripId: string;
  constructor(restoredTripId: string) {
    super("Deleted trip already restored");
    this.name = "DeletedTripAlreadyRestoredError";
    this.restoredTripId = restoredTripId;
  }
}

/**
 * Recreate a trip (new id) and its coordinates from an archive row, mark the
 * row restored, and recompute the tax-year mileage summary.
 */
export async function restoreDeletedTrip(
  deletedTripId: string,
  restoredByAdminId?: string | null
): Promise<{ tripId: string; coordinateCount: number }> {
  const row = await prisma.deletedTrip.findUnique({ where: { id: deletedTripId } });
  if (!row) throw new DeletedTripNotFoundError();
  if (row.restoredTripId) throw new DeletedTripAlreadyRestoredError(row.restoredTripId);

  const tripJson = (row.tripJson ?? {}) as Record<string, unknown>;
  const data = restoreDataFromTripJson(tripJson);

  // Only re-attach the vehicle if it still belongs to this user.
  let vehicleId: string | null = null;
  const archivedVehicleId =
    typeof tripJson.vehicleId === "string" ? tripJson.vehicleId : null;
  if (archivedVehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: archivedVehicleId, userId: row.userId },
      select: { id: true },
    });
    vehicleId = vehicle?.id ?? null;
  }

  const rawCoords = Array.isArray(row.coordinatesJson)
    ? (row.coordinatesJson as unknown as ArchivedCoordinate[])
    : [];
  const coords = rawCoords.filter(
    (c) =>
      c &&
      typeof c.lat === "number" &&
      typeof c.lng === "number" &&
      typeof c.recordedAt === "string" &&
      !Number.isNaN(new Date(c.recordedAt).getTime())
  );

  const trip = await prisma.$transaction(async (tx) => {
    const created = await tx.trip.create({
      data: {
        ...data,
        userId: row.userId,
        vehicleId,
        coordinateCount: coords.length,
      },
      select: { id: true, startedAt: true },
    });
    if (coords.length > 0) {
      await tx.tripCoordinate.createMany({
        data: coords.map((c) => ({
          tripId: created.id,
          lat: c.lat,
          lng: c.lng,
          speed: c.speed ?? null,
          accuracy: c.accuracy ?? null,
          recordedAt: new Date(c.recordedAt),
        })),
      });
    }
    await tx.deletedTrip.update({
      where: { id: row.id },
      data: { restoredTripId: created.id, restoredAt: new Date() },
    });
    return created;
  });

  const taxYear = getTaxYear(trip.startedAt);
  await upsertMileageSummary(row.userId, taxYear).catch((err: Error) => {
    console.error(
      `[tripArchive] mileage summary recompute failed after restore ${trip.id}:`,
      err?.message ?? err
    );
  });

  logEvent("admin.trip_restored", restoredByAdminId ?? row.userId, {
    targetUserId: row.userId,
    deletedTripId: row.id,
    originalTripId: row.originalTripId,
    restoredTripId: trip.id,
    coordinateCount: coords.length,
    distanceMiles: data.distanceMiles,
  });

  return { tripId: trip.id, coordinateCount: coords.length };
}
