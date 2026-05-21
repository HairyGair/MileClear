/**
 * QuickBooks Online mileage export tests (Phase B, 21 May 2026).
 *
 * Verifies the behaviour that matters most for Intuit's accreditation
 * review: idempotency, partial-failure tolerance, write-only scope,
 * and per-vehicle caching.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    quickBooksConnection: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    quickBooksSyncedTrip: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    quickBooksSyncedVehicle: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    trip: {
      findMany: vi.fn(),
    },
    vehicle: {
      findMany: vi.fn(),
    },
    appEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ appVersion: null, buildNumber: null }),
    },
  },
}));

vi.mock("../../services/quickbooks.js", () => ({
  qboApi: vi.fn(),
}));

import {
  pushTripsForDateRange,
  countEligibleTripsInRange,
} from "../../services/quickbooksMileage.js";
import { prisma } from "../../lib/prisma.js";
import { qboApi } from "../../services/quickbooks.js";

const USER_ID = "user-1";
const CONN_ID = "conn-1";
const REALM_ID = "realm-1";

const baseConnection = {
  id: CONN_ID,
  userId: USER_ID,
  realmId: REALM_ID,
  accessTokenEncrypted: "enc",
  refreshTokenEncrypted: "enc",
  tokenExpiresAt: new Date(Date.now() + 3_600_000),
  environment: "sandbox",
  companyName: "Acme",
  lastSyncedAt: null,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseVehicle = {
  id: "veh-1",
  userId: USER_ID,
  make: "Honda",
  model: "Civic",
  year: 2020,
  fuelType: "petrol",
  vehicleType: "car",
  registrationPlate: "AB12 CDE",
  bluetoothName: null,
  estimatedMpg: 50,
  actualMpg: null,
  isPrimary: true,
  createdAt: new Date(),
  motExpiryDate: null,
  taxDueDate: null,
  lastDvlaCheckAt: null,
  motReminderSentAt: null,
  taxReminderSentAt: null,
};

function makeTrip(overrides: Partial<any> = {}) {
  return {
    id: `trip-${Math.random().toString(36).slice(2, 7)}`,
    userId: USER_ID,
    shiftId: null,
    vehicleId: "veh-1",
    startLat: 54.9,
    startLng: -1.4,
    endLat: 55.0,
    endLng: -1.3,
    startAddress: "Newcastle",
    endAddress: "Sunderland",
    distanceMiles: 12.5,
    startedAt: new Date("2026-05-10T09:00:00Z"),
    endedAt: new Date("2026-05-10T09:30:00Z"),
    isManualEntry: false,
    classification: "business",
    platformTag: "uber",
    businessPurpose: null,
    category: null,
    notes: null,
    routePolyline: null,
    gpsQuality: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.quickBooksConnection.findUnique).mockResolvedValue(
    baseConnection as any
  );
  vi.mocked(prisma.quickBooksSyncedTrip.findMany).mockResolvedValue([]);
  vi.mocked(prisma.quickBooksSyncedVehicle.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.vehicle.findMany).mockResolvedValue([baseVehicle as any]);
  vi.mocked(qboApi).mockImplementation(async (_, method, path) => {
    if (method === "POST" && path === "/vehicle") {
      return { Vehicle: { Id: "qbo-veh-1" } } as any;
    }
    if (method === "POST" && path === "/vehiclemileage") {
      return { VehicleMileage: { Id: "qbo-mileage-1" } } as any;
    }
    return {} as any;
  });
});

describe("pushTripsForDateRange", () => {
  it("pushes a business trip and creates the QBO vehicle on first sync", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([makeTrip()] as any);

    const result = await pushTripsForDateRange({
      userId: USER_ID,
      from: new Date("2026-05-01"),
      to: new Date("2026-05-31"),
    });

    expect(result.pushed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.vehiclesCreated).toBe(1);
    expect(qboApi).toHaveBeenCalledWith(
      expect.anything(),
      "POST",
      "/vehicle",
      expect.objectContaining({
        Name: "Honda Civic - AB12 CDE",
        Active: true,
      })
    );
    expect(qboApi).toHaveBeenCalledWith(
      expect.anything(),
      "POST",
      "/vehiclemileage",
      expect.objectContaining({
        BusinessMiles: 12.5,
        TotalMiles: 12.5,
        BusinessFlag: "Yes",
        Vehicle: { value: "qbo-veh-1" },
      })
    );
  });

  it("skips trips that are already in the synced-trips table (idempotent)", async () => {
    const trip = makeTrip();
    vi.mocked(prisma.trip.findMany).mockResolvedValue([trip] as any);
    vi.mocked(prisma.quickBooksSyncedTrip.findMany).mockResolvedValue([
      { tripId: trip.id } as any,
    ]);

    const result = await pushTripsForDateRange({
      userId: USER_ID,
      from: new Date("2026-05-01"),
      to: new Date("2026-05-31"),
    });

    expect(result.pushed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(qboApi).not.toHaveBeenCalledWith(
      expect.anything(),
      "POST",
      "/vehiclemileage",
      expect.anything()
    );
  });

  it("reuses an existing QBO vehicle mapping without re-creating", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([makeTrip()] as any);
    vi.mocked(prisma.quickBooksSyncedVehicle.findUnique).mockResolvedValue({
      qboEntityId: "qbo-veh-existing",
    } as any);

    const result = await pushTripsForDateRange({
      userId: USER_ID,
      from: new Date("2026-05-01"),
      to: new Date("2026-05-31"),
    });

    expect(result.pushed).toBe(1);
    expect(result.vehiclesCreated).toBe(0);
    // Vehicle creation was NOT called
    expect(qboApi).not.toHaveBeenCalledWith(
      expect.anything(),
      "POST",
      "/vehicle",
      expect.anything()
    );
    // VehicleMileage references the cached QBO id
    expect(qboApi).toHaveBeenCalledWith(
      expect.anything(),
      "POST",
      "/vehiclemileage",
      expect.objectContaining({ Vehicle: { value: "qbo-veh-existing" } })
    );
  });

  it("continues the batch when a single trip push fails", async () => {
    const t1 = makeTrip({ id: "trip-good-1" });
    const t2 = makeTrip({ id: "trip-bad" });
    const t3 = makeTrip({ id: "trip-good-2" });
    vi.mocked(prisma.trip.findMany).mockResolvedValue([t1, t2, t3] as any);

    let count = 0;
    vi.mocked(qboApi).mockImplementation(async (_, method, path) => {
      if (method === "POST" && path === "/vehicle") {
        return { Vehicle: { Id: "qbo-veh-1" } } as any;
      }
      if (method === "POST" && path === "/vehiclemileage") {
        count += 1;
        if (count === 2) {
          throw new Error("QBO POST /vehiclemileage → 400 [tid=abc123]: ValidationFault");
        }
        return { VehicleMileage: { Id: `qbo-mileage-${count}` } } as any;
      }
      return {} as any;
    });

    const result = await pushTripsForDateRange({
      userId: USER_ID,
      from: new Date("2026-05-01"),
      to: new Date("2026-05-31"),
    });

    expect(result.pushed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].tripId).toBe("trip-bad");
    expect(result.failures[0].reason).toContain("tid=abc123");
  });

  it("falls back to a generic vehicle name when make/model are absent", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([makeTrip()] as any);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      { ...baseVehicle, make: "", model: "", registrationPlate: null } as any,
    ]);

    await pushTripsForDateRange({
      userId: USER_ID,
      from: new Date("2026-05-01"),
      to: new Date("2026-05-31"),
    });

    expect(qboApi).toHaveBeenCalledWith(
      expect.anything(),
      "POST",
      "/vehicle",
      expect.objectContaining({ Name: "MileClear Vehicle" })
    );
  });

  it("flags trips whose vehicle row is missing as failed (not silently dropped)", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      makeTrip({ vehicleId: "veh-missing" }),
    ] as any);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([]);

    const result = await pushTripsForDateRange({
      userId: USER_ID,
      from: new Date("2026-05-01"),
      to: new Date("2026-05-31"),
    });

    expect(result.pushed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failures[0].reason).toContain("vehicle not found");
  });

  it("throws when the user has no active QBO connection", async () => {
    vi.mocked(prisma.quickBooksConnection.findUnique).mockResolvedValue(null);
    await expect(
      pushTripsForDateRange({
        userId: USER_ID,
        from: new Date("2026-05-01"),
        to: new Date("2026-05-31"),
      })
    ).rejects.toThrow(/not connected/);
  });

  it("includes the MileClear trip reference in the QBO Notes field", async () => {
    const trip = makeTrip({ id: "trip-12345" });
    vi.mocked(prisma.trip.findMany).mockResolvedValue([trip] as any);

    await pushTripsForDateRange({
      userId: USER_ID,
      from: new Date("2026-05-01"),
      to: new Date("2026-05-31"),
    });

    const mileageCall = vi
      .mocked(qboApi)
      .mock.calls.find((c) => c[2] === "/vehiclemileage");
    expect(mileageCall).toBeDefined();
    expect((mileageCall![3] as any).Notes).toContain("MileClear ref: trip-12345");
    expect((mileageCall![3] as any).Notes).toContain("Newcastle");
    expect((mileageCall![3] as any).Notes).toContain("Sunderland");
  });
});

describe("countEligibleTripsInRange", () => {
  it("returns eligible + already-synced counts without making any QBO calls", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { id: "t1" },
      { id: "t2" },
      { id: "t3" },
    ] as any);
    vi.mocked(prisma.quickBooksSyncedTrip.count).mockResolvedValue(1);

    const result = await countEligibleTripsInRange({
      userId: USER_ID,
      from: new Date("2026-05-01"),
      to: new Date("2026-05-31"),
    });

    expect(result).toEqual({ eligible: 3, alreadySynced: 1 });
    expect(qboApi).not.toHaveBeenCalled();
  });
});
