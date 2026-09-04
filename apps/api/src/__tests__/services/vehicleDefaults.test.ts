import { describe, it, expect, vi, beforeEach } from "vitest";

const prisma = {
  vehicle: { findMany: vi.fn() },
  trip: { updateMany: vi.fn() },
};
vi.mock("../../lib/prisma.js", () => ({ prisma }));

const { defaultVehicleIdForUser, attachSoleVehicleToOrphanTrips } = await import(
  "../../services/vehicleDefaults.js"
);

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
