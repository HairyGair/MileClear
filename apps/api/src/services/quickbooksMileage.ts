// QuickBooks Online — mileage export (Phase B, 21 May 2026).
//
// Maps every classified business trip in a date range to a QBO
// `VehicleMileage` entity, creating QBO `Vehicle` rows on demand
// where the mapping doesn't already exist.
//
// Design decisions:
//   - WRITE-ONLY: we never modify QBO records we didn't create.
//   - IDEMPOTENT: re-running the same date range is safe.
//     `(userId, tripId)` is unique in `quickbooks_synced_trips`,
//     so a previously-synced trip is silently skipped, not
//     duplicated.
//   - PARTIAL-FAILURE TOLERANT: a single trip failing to push
//     doesn't abort the batch. Failures are captured per trip
//     with the QBO `intuit_tid` for support traceability.
//   - GROSS FIGURES: we push miles only; the user's QBO accountant
//     applies the AMAP/cents-per-mile rate inside QBO. Keeps the
//     integration UK/US-tier-agnostic.
//   - BUSINESS TRIPS ONLY: personal trips never leave MileClear.
//   - VEHICLE MATCHING: per-connection cache (quickbooks_synced_vehicles)
//     so vehicle resolution costs at most one Vehicle list call
//     per fresh QBO company.
//
// Phase B of the QuickBooks roadmap (21 May 2026).

import { prisma } from "../lib/prisma.js";
import type { QuickBooksConnection, Vehicle, Trip } from "@prisma/client";
import { qboApi } from "./quickbooks.js";
import { logEvent } from "./appEvents.js";

// ── QBO entity shapes (the subset we touch) ─────────────────────────

interface QboRef {
  value: string;
  name?: string;
}

interface QboVehicle {
  Id?: string;
  Name: string;
  /** Set true to mark the vehicle as still in use. */
  Active?: boolean;
}

interface QboVehicleMileagePayload {
  TripDate: string; // YYYY-MM-DD
  TotalMiles: number;
  BusinessMiles: number;
  Vehicle: QboRef;
  Notes?: string;
  /** "Yes" / "No" — flag QBO uses to identify business trips. */
  BusinessFlag?: "Yes" | "No";
}

interface QboVehicleMileageResponse {
  VehicleMileage: { Id: string };
}

interface QboQueryResponse<T> {
  QueryResponse: { [K: string]: T[] | number };
}

// ── Public types ────────────────────────────────────────────────────

export interface MileagePushResult {
  pushed: number;
  skipped: number;
  failed: number;
  vehiclesCreated: number;
  failures: Array<{
    tripId: string;
    reason: string;
  }>;
  lastSyncedAt: string;
}

// ── Vehicle resolution ──────────────────────────────────────────────

/**
 * Returns the QBO Vehicle entity ID for a MileClear vehicle, creating
 * one in QBO if no mapping exists. Mappings are persisted in
 * `quickbooks_synced_vehicles` so subsequent syncs short-circuit.
 *
 * Vehicle name format: "{Make} {Model} - {Plate}" (or just make/model
 * if no plate), which makes the entry recognisable to the user inside
 * QBO without revealing private data.
 */
async function ensureQboVehicleId(
  connection: QuickBooksConnection,
  vehicle: Vehicle,
  counters: { vehiclesCreated: number }
): Promise<string> {
  const existing = await prisma.quickBooksSyncedVehicle.findUnique({
    where: { userId_vehicleId: { userId: vehicle.userId, vehicleId: vehicle.id } },
  });
  if (existing) return existing.qboEntityId;

  const name = buildQboVehicleName(vehicle);
  const create = await qboApi<QboVehicleMileageResponse extends never ? never : { Vehicle: { Id: string } }>(
    connection,
    "POST",
    "/vehicle",
    {
      Name: name,
      Active: true,
    } satisfies QboVehicle
  );
  const qboEntityId = create.Vehicle.Id;
  counters.vehiclesCreated += 1;

  await prisma.quickBooksSyncedVehicle.create({
    data: {
      connectionId: connection.id,
      userId: vehicle.userId,
      vehicleId: vehicle.id,
      qboEntityId,
    },
  });

  return qboEntityId;
}

function buildQboVehicleName(vehicle: Vehicle): string {
  const base = [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();
  const safe = base.length > 0 ? base : "MileClear Vehicle";
  if (vehicle.registrationPlate) {
    return `${safe} - ${vehicle.registrationPlate}`.slice(0, 100);
  }
  return safe.slice(0, 100);
}

// ── Trip push ───────────────────────────────────────────────────────

function buildVehicleMileagePayload(
  trip: Trip,
  qboVehicleId: string
): QboVehicleMileagePayload {
  const tripDate = trip.startedAt.toISOString().slice(0, 10);
  const miles = Number(trip.distanceMiles.toFixed(2));

  const noteParts: string[] = [];
  if (trip.startAddress) noteParts.push(`From: ${trip.startAddress}`);
  if (trip.endAddress) noteParts.push(`To: ${trip.endAddress}`);
  if (trip.platformTag) noteParts.push(`Platform: ${trip.platformTag}`);
  if (trip.businessPurpose) noteParts.push(`Purpose: ${trip.businessPurpose}`);
  noteParts.push(`MileClear ref: ${trip.id}`);

  return {
    TripDate: tripDate,
    TotalMiles: miles,
    BusinessMiles: miles,
    BusinessFlag: "Yes",
    Vehicle: { value: qboVehicleId },
    Notes: noteParts.join(" · ").slice(0, 4000),
  };
}

/**
 * Push every classified business trip with a vehicle, in the given
 * date range, that hasn't already been synced. Returns a per-trip
 * summary including failure reasons. Does NOT abort on individual
 * trip failures — partial success is the design.
 */
export async function pushTripsForDateRange(args: {
  userId: string;
  from: Date;
  to: Date;
}): Promise<MileagePushResult> {
  const { userId, from, to } = args;

  const connection = await prisma.quickBooksConnection.findUnique({
    where: { userId },
  });
  if (!connection || connection.status !== "active") {
    throw new Error("QuickBooks is not connected for this user.");
  }

  const tripsInRange = await prisma.trip.findMany({
    where: {
      userId,
      classification: "business",
      vehicleId: { not: null },
      startedAt: { gte: from, lte: to },
    },
    orderBy: { startedAt: "asc" },
  });

  // Pre-load existing sync records in a single round-trip to skip
  // anything already pushed (idempotent re-runs).
  const tripIds = tripsInRange.map((t) => t.id);
  const alreadySynced = await prisma.quickBooksSyncedTrip.findMany({
    where: { userId, tripId: { in: tripIds } },
    select: { tripId: true },
  });
  const syncedIds = new Set(alreadySynced.map((s) => s.tripId));

  // Pre-load all vehicles referenced by this batch in one shot.
  const vehicleIds = Array.from(
    new Set(
      tripsInRange.map((t) => t.vehicleId).filter((v): v is string => !!v)
    )
  );
  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: vehicleIds }, userId },
  });
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  const counters = { vehiclesCreated: 0 };
  let pushed = 0;
  let skipped = 0;
  let failed = 0;
  const failures: MileagePushResult["failures"] = [];

  for (const trip of tripsInRange) {
    if (syncedIds.has(trip.id)) {
      skipped += 1;
      continue;
    }
    const vehicle = trip.vehicleId ? vehicleById.get(trip.vehicleId) : null;
    if (!vehicle) {
      failed += 1;
      failures.push({
        tripId: trip.id,
        reason: "Trip vehicle not found",
      });
      continue;
    }

    try {
      const qboVehicleId = await ensureQboVehicleId(
        connection,
        vehicle,
        counters
      );
      const payload = buildVehicleMileagePayload(trip, qboVehicleId);
      const response = await qboApi<QboVehicleMileageResponse>(
        connection,
        "POST",
        "/vehiclemileage",
        payload
      );
      const qboEntityId = response.VehicleMileage.Id;

      await prisma.quickBooksSyncedTrip.create({
        data: {
          connectionId: connection.id,
          userId,
          tripId: trip.id,
          qboEntityId,
          qboEntityType: "VehicleMileage",
        },
      });
      pushed += 1;
    } catch (err) {
      failed += 1;
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ tripId: trip.id, reason: reason.slice(0, 400) });
    }
  }

  const lastSyncedAt = new Date();
  await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt },
  });

  logEvent("quickbooks.mileage_sync", userId, {
    from: from.toISOString(),
    to: to.toISOString(),
    pushed,
    skipped,
    failed,
    vehiclesCreated: counters.vehiclesCreated,
  });

  return {
    pushed,
    skipped,
    failed,
    vehiclesCreated: counters.vehiclesCreated,
    failures,
    lastSyncedAt: lastSyncedAt.toISOString(),
  };
}

// Helper: count business trips eligible to push in a range (for the
// UI preview before the user triggers the actual sync).
export async function countEligibleTripsInRange(args: {
  userId: string;
  from: Date;
  to: Date;
}): Promise<{ eligible: number; alreadySynced: number }> {
  const { userId, from, to } = args;
  const trips = await prisma.trip.findMany({
    where: {
      userId,
      classification: "business",
      vehicleId: { not: null },
      startedAt: { gte: from, lte: to },
    },
    select: { id: true },
  });
  const tripIds = trips.map((t) => t.id);
  const synced = await prisma.quickBooksSyncedTrip.count({
    where: { userId, tripId: { in: tripIds } },
  });
  return { eligible: trips.length, alreadySynced: synced };
}

// Suppress unused-type warning — kept for reference / future use.
export type { QboVehicleMileagePayload, QboVehicleMileageResponse, QboQueryResponse };
