/**
 * One-car trip reports (Colin, 17 Oct 2026: "How can I produce reports for
 * two cars?"). The CSV and Trip Report take a vehicleId. Synthetic data only.
 *
 * What must hold:
 *  - only that car's trips, with trips that have no vehicle counted against
 *    the export fallback car (primary, else oldest), the same rule as the
 *    Self Assessment "Vehicle Breakdown", so the miles match its row;
 *  - the 10,000-mile higher rate is per PERSON across all their cars, so a
 *    one-car report prices each trip exactly as the all-cars report does and
 *    never gives each car its own 10,000.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: { findMany: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    earning: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("../../services/odometer.js", () => ({
  odometerForExportTrips: vi.fn(async () => new Map()),
}));
vi.mock("../../services/postcodeLookup.js", () => ({
  postcodesFor: vi.fn(async (pts: unknown[]) => pts.map(() => null)),
}));

import { prisma } from "../../lib/prisma.js";
import {
  exportVehicleIdForTrip,
  exportVehicleTripWhere,
  fetchExportSummary,
  fetchExportTrips,
  resolveExportVehicle,
} from "../../services/export-data.js";
import { generateTripsCsv, generateTripsPdf, ONE_CAR_ALLOWANCE_NOTE } from "../../services/export.js";

const USER = "00000000-0000-0000-0000-0000000000c1";
const QASHQAI = { id: "va", make: "Nissan", model: "Qashqai", vehicleType: "car", registrationPlate: "AB12 CDE", isPrimary: true };
const FIESTA = { id: "vb", make: "Ford", model: "Fiesta", vehicleType: "car", registrationPlate: null, isPrimary: false };
const STRANGER = { id: "vz", make: "Other", model: "Car" };

function trip(id: string, vehicle: typeof QASHQAI | typeof FIESTA | null, day: string, miles: number, classification: string) {
  return {
    id,
    vehicleId: vehicle?.id ?? null,
    vehicle: vehicle
      ? { make: vehicle.make, model: vehicle.model, vehicleType: vehicle.vehicleType, providedByOthers: false }
      : null,
    startedAt: new Date(`${day}T09:00:00Z`),
    endedAt: new Date(`${day}T10:00:00Z`),
    distanceMiles: miles,
    classification,
    startAddress: "A",
    endAddress: "B",
    startLat: 51.5, startLng: -0.1, endLat: 51.6, endLng: -0.2,
    platformTag: null,
    businessPurpose: null,
    projectLabel: null,
  };
}

// 2026-27: 6,000 business miles in the Qashqai, then 6,000 in the Fiesta, so
// the person crosses 10,000 part way through the Fiesta trip.
const TRIPS = [
  trip("t1", QASHQAI, "2026-05-01", 6000, "business"),
  trip("t2", FIESTA, "2026-06-01", 6000, "business"),
  trip("t3", null, "2026-07-01", 100, "business"), // no vehicle: counts as the Qashqai
  trip("t4", FIESTA, "2026-08-01", 50, "personal"),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.trip.findMany).mockResolvedValue(TRIPS as never);
  vi.mocked(prisma.earning.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ fullName: "Colin", displayName: null, email: "c@example.com" } as never);
  vi.mocked(prisma.vehicle.findFirst).mockImplementation((async (args: { where: { id?: string; userId: string } }) => {
    if (args.where.userId !== USER) return null;
    if (args.where.id === undefined) return QASHQAI; // the export fallback
    return [QASHQAI, FIESTA].find((v) => v.id === args.where.id) ?? null;
  }) as never);
});

describe("which car a trip counts against", () => {
  it("is the trip's own car, else the fallback car", () => {
    expect(exportVehicleIdForTrip("vb", "va")).toBe("vb");
    expect(exportVehicleIdForTrip(null, "va")).toBe("va");
    expect(exportVehicleIdForTrip(null, null)).toBeNull();
  });

  it("the database filter matches: the fallback car picks up trips with no vehicle", () => {
    expect(exportVehicleTripWhere({ id: "va", includesUnassigned: true })).toEqual({
      OR: [{ vehicleId: "va" }, { vehicleId: null }],
    });
    expect(exportVehicleTripWhere({ id: "vb", includesUnassigned: false })).toEqual({ vehicleId: "vb" });
  });
});

describe("resolveExportVehicle", () => {
  it("returns null for a car that is not the user's", async () => {
    expect(await resolveExportVehicle(USER, STRANGER.id)).toBeNull();
    expect(await resolveExportVehicle("someone-else", QASHQAI.id)).toBeNull();
  });

  it("marks only the fallback car as taking unassigned trips", async () => {
    expect((await resolveExportVehicle(USER, "va"))?.includesUnassigned).toBe(true);
    expect((await resolveExportVehicle(USER, "vb"))?.includesUnassigned).toBe(false);
  });
});

describe("fetchExportTrips with a vehicleId", () => {
  it("keeps only that car's trips, unassigned ones going to the fallback car", async () => {
    const fiesta = await fetchExportTrips({ userId: USER, taxYear: "2026-27", vehicleId: "vb" });
    expect(fiesta.map((r) => r.vehicleName)).toEqual(["Ford Fiesta", "Ford Fiesta"]);
    expect(fiesta.map((r) => r.distanceMiles)).toEqual([6000, 50]);

    const qashqai = await fetchExportTrips({ userId: USER, taxYear: "2026-27", vehicleId: "va" });
    expect(qashqai.map((r) => r.distanceMiles)).toEqual([6000, 100]);
  });

  it("prices each trip as the all-cars report does: one 10,000 per person, not per car", async () => {
    const all = await fetchExportTrips({ userId: USER, taxYear: "2026-27" });
    const fiesta = await fetchExportTrips({ userId: USER, taxYear: "2026-27", vehicleId: "vb" });

    // The Fiesta's trip straddles the person's 10,000: 4,000 at 55p, 2,000 at 25p.
    expect(fiesta[0].deductionPence).toBe(4000 * 55 + 2000 * 25);
    // A per-car allowance would have priced all 6,000 at 55p.
    expect(fiesta[0].deductionPence).not.toBe(6000 * 55);
    expect(fiesta[0]).toEqual(all[1]);

    // The two one-car reports add up to the all-cars report.
    const qashqai = await fetchExportTrips({ userId: USER, taxYear: "2026-27", vehicleId: "va" });
    const sum = (rows: { deductionPence: number }[]) => rows.reduce((s, r) => s + r.deductionPence, 0);
    expect(sum(qashqai) + sum(fiesta)).toBe(sum(all));
  });

  it("each car's miles equal its row in the Self Assessment vehicle breakdown", async () => {
    const summary = await fetchExportSummary(USER, "2026-27");
    for (const [id, name] of [["va", "Nissan Qashqai"], ["vb", "Ford Fiesta"]]) {
      const rows = await fetchExportTrips({ userId: USER, taxYear: "2026-27", vehicleId: id });
      const breakdown = summary.vehicleBreakdown.find((v) => v.vehicleName === name)!;
      const miles = rows.reduce((s, r) => s + r.distanceMiles, 0);
      const business = rows.filter((r) => r.classification === "business").reduce((s, r) => s + r.distanceMiles, 0);
      expect(miles).toBeCloseTo(breakdown.totalMiles, 2);
      expect(business).toBeCloseTo(breakdown.businessMiles, 2);
    }
  });
});

describe("the one-car documents", () => {
  it("the CSV has only that car's rows and keeps the car name injection-safe", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([
      ...TRIPS,
      { ...trip("t5", FIESTA, "2026-09-01", 10, "business"), vehicle: { make: "=cmd", model: "x", vehicleType: "car", providedByOthers: false } },
    ] as never);
    const csv = await generateTripsCsv(USER, { taxYear: "2026-27", vehicle: { ...FIESTA } });
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(1 + 3);
    expect(csv).not.toContain("Nissan");
    expect(csv).toContain("'=cmd x");
  });

  it("the PDF is titled with the car", async () => {
    const pdf = await generateTripsPdf(USER, { taxYear: "2026-27", vehicle: { ...QASHQAI } });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.toString("latin1")).toContain("Trip Report: Nissan Qashqai \\(AB12 CDE\\)");
  });

  it("the allowance line says the 10,000 is shared across all cars, in plain words", () => {
    expect(ONE_CAR_ALLOWANCE_NOTE).toContain("first 10,000 business miles");
    expect(ONE_CAR_ALLOWANCE_NOTE).toContain("across all your cars and vans, not 10,000 per car");
    expect(ONE_CAR_ALLOWANCE_NOTE).toContain("this car's share");
    expect(ONE_CAR_ALLOWANCE_NOTE).not.toContain(String.fromCharCode(0x2014)); // no em dash
    expect(ONE_CAR_ALLOWANCE_NOTE).not.toContain("HMRC");
  });
});
