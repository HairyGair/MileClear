/**
 * The New Zealand vehicle answers (23 Oct 2026): nzRecordBasis and
 * nzHybridKind are only stored for a driver whose effective country is New
 * Zealand; for anyone else they're dropped. odometerUnit is stored for anyone.
 * Prisma is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("../../services/vehicleDefaults.js", () => ({ attachSoleVehicleToOrphanTrips: vi.fn() }));
vi.mock("../../services/proEntitlement.js", () => ({ isProUser: vi.fn(async () => true) }));
vi.mock("../../services/mileage.js", () => ({ upsertMileageSummary: vi.fn() }));

import { vehicleRoutes } from "../../routes/vehicles/index.js";
import { prisma } from "../../lib/prisma.js";

const USER_ID = "00000000-0000-0000-0000-0000000000e1";
const VEHICLE_ID = "11111111-1111-4111-8111-111111111111";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };
const p = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  vehicle: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

async function patch(body: unknown) {
  const app = await buildApp();
  await app.register(vehicleRoutes, { prefix: "/vehicles" });
  const res = await app.inject({ method: "PATCH", url: `/vehicles/${VEHICLE_ID}`, headers: auth, payload: body as object });
  await app.close();
  return res;
}

describe("vehicle New Zealand answers", () => {
  const saved = process.env.COUNTRY_SETTING;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COUNTRY_SETTING = "on";
    p.vehicle.findFirst.mockResolvedValue({ id: VEHICLE_ID, userId: USER_ID, providedByOthers: false, registrationPlate: null });
    p.vehicle.update.mockImplementation(async (args: { data: object }) => ({
      id: VEHICLE_ID,
      fuelType: "hybrid",
      vehicleType: "car",
      ...args.data,
    }));
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.COUNTRY_SETTING;
    else process.env.COUNTRY_SETTING = saved;
  });

  it("are saved for a New Zealand driver", async () => {
    p.user.findUnique.mockResolvedValue({ isAdmin: false, country: "NZ" });
    const res = await patch({ nzRecordBasis: "records", nzHybridKind: "petrol", odometerUnit: "km" });
    expect(res.statusCode).toBe(200);
    expect(p.vehicle.update.mock.calls[0][0].data).toMatchObject({ nzRecordBasis: "records", nzHybridKind: "petrol", odometerUnit: "km" });
  });

  it("are dropped for a UK driver (odometer unit kept)", async () => {
    p.user.findUnique.mockResolvedValue({ isAdmin: false, country: "GB" });
    await patch({ nzRecordBasis: "records", nzHybridKind: "petrol", odometerUnit: "km" });
    const data = p.vehicle.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("nzRecordBasis");
    expect(data).not.toHaveProperty("nzHybridKind");
    expect(data.odometerUnit).toBe("km");
  });

  it("are dropped for a New Zealand driver while the Country switch is off", async () => {
    process.env.COUNTRY_SETTING = "off";
    p.user.findUnique.mockResolvedValue({ isAdmin: false, country: "NZ" });
    await patch({ nzRecordBasis: "none" });
    expect(p.vehicle.update.mock.calls[0][0].data).not.toHaveProperty("nzRecordBasis");
  });

  it("a save without them doesn't look the driver up", async () => {
    await patch({ make: "Toyota" });
    expect(p.user.findUnique).not.toHaveBeenCalled();
  });
});
