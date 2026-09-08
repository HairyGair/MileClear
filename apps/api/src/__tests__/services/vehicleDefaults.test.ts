import { describe, it, expect, vi, beforeEach } from "vitest";

const prisma = {
  vehicle: { findMany: vi.fn() },
  trip: { updateMany: vi.fn() },
};
vi.mock("../../lib/prisma.js", () => ({ prisma }));

const {
  defaultVehicleIdForUser,
  attachSoleVehicleToOrphanTrips,
  fallbackVehicleTypeFromList,
  fallbackVehicleTypeForUsers,
} = await import("../../services/vehicleDefaults.js");

beforeEach(() => {
  prisma.vehicle.findMany.mockReset();
  prisma.trip.updateMany.mockReset();
});

describe("defaultVehicleIdForUser", () => {
  it("returns null when the user has no vehicles", async () => {
    prisma.vehicle.findMany.mockResolvedValue([]);
    expect(await defaultVehicleIdForUser("u1")).toBeNull();
  });

  it("prefers the primary vehicle", async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: "old-car", isPrimary: false },
      { id: "bike", isPrimary: true },
    ]);
    expect(await defaultVehicleIdForUser("u1")).toBe("bike");
  });

  it("uses the only vehicle when none is marked primary", async () => {
    prisma.vehicle.findMany.mockResolvedValue([{ id: "bike", isPrimary: false }]);
    expect(await defaultVehicleIdForUser("u1")).toBe("bike");
  });

  it("does not guess between two vehicles with no primary", async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: "car", isPrimary: false },
      { id: "van", isPrimary: false },
    ]);
    expect(await defaultVehicleIdForUser("u1")).toBeNull();
  });
});

describe("fallbackVehicleTypeFromList", () => {
  it("is car for a user with no vehicles", () => {
    expect(fallbackVehicleTypeFromList([])).toBe("car");
  });

  it("uses the primary vehicle's type over the others", () => {
    expect(
      fallbackVehicleTypeFromList([
        { vehicleType: "car", isPrimary: false },
        { vehicleType: "motorbike", isPrimary: true },
      ]),
    ).toBe("motorbike");
  });

  it("uses the one type when every vehicle shares it and none is primary", () => {
    expect(
      fallbackVehicleTypeFromList([
        { vehicleType: "motorbike", isPrimary: false },
        { vehicleType: "motorbike", isPrimary: false },
      ]),
    ).toBe("motorbike");
    expect(fallbackVehicleTypeFromList([{ vehicleType: "van", isPrimary: false }])).toBe("van");
  });

  it("falls back to car for a mixed garage with no primary", () => {
    expect(
      fallbackVehicleTypeFromList([
        { vehicleType: "van", isPrimary: false },
        { vehicleType: "motorbike", isPrimary: false },
      ]),
    ).toBe("car");
  });

  it("ignores an unrecognised stored type", () => {
    expect(fallbackVehicleTypeFromList([{ vehicleType: "", isPrimary: true }])).toBe("car");
    expect(
      fallbackVehicleTypeFromList([
        { vehicleType: "", isPrimary: true },
        { vehicleType: "", isPrimary: false },
      ]),
    ).toBe("car");
  });
});

describe("fallbackVehicleTypeForUsers", () => {
  it("resolves every requested user from one query", async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { userId: "rider", vehicleType: "motorbike", isPrimary: false },
      { userId: "rider", vehicleType: "motorbike", isPrimary: false },
      { userId: "mixed", vehicleType: "car", isPrimary: false },
      { userId: "mixed", vehicleType: "van", isPrimary: false },
    ]);
    const result = await fallbackVehicleTypeForUsers(["rider", "mixed", "rider", "none"]);
    expect(prisma.vehicle.findMany).toHaveBeenCalledTimes(1);
    expect(result.get("rider")).toBe("motorbike");
    expect(result.get("mixed")).toBe("car");
    expect(result.get("none")).toBe("car");
    expect(result.size).toBe(3);
  });

  it("skips the query for an empty id list", async () => {
    const result = await fallbackVehicleTypeForUsers([]);
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});

describe("attachSoleVehicleToOrphanTrips", () => {
  it("attaches the sole vehicle to trips with none", async () => {
    prisma.vehicle.findMany.mockResolvedValue([{ id: "bike" }]);
    prisma.trip.updateMany.mockResolvedValue({ count: 3 });
    expect(await attachSoleVehicleToOrphanTrips("u1")).toBe(3);
    expect(prisma.trip.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", vehicleId: null },
      data: { vehicleId: "bike" },
    });
  });

  it("leaves trips alone when the user has two vehicles", async () => {
    prisma.vehicle.findMany.mockResolvedValue([{ id: "car" }, { id: "van" }]);
    expect(await attachSoleVehicleToOrphanTrips("u1")).toBe(0);
    expect(prisma.trip.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing for a user with no vehicle", async () => {
    prisma.vehicle.findMany.mockResolvedValue([]);
    expect(await attachSoleVehicleToOrphanTrips("u1")).toBe(0);
    expect(prisma.trip.updateMany).not.toHaveBeenCalled();
  });
});
