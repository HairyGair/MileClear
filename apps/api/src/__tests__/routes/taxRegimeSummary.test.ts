/**
 * GET /tax/regime-summary (23 Oct 2026): the claim under the driver's
 * country's rules. Null for the UK and for anyone while the Country setting
 * is off for them; New Zealand figures for an NZ driver who has it.
 * Prisma is mocked: nothing touches a database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    trip: { findMany: vi.fn() },
    vehicle: { findMany: vi.fn() },
  },
}));
vi.mock("../../services/taxOverview.js", () => ({ loadTaxOverview: vi.fn() }));

import { taxRoutes } from "../../routes/tax/index.js";
import { prisma } from "../../lib/prisma.js";

const USER_ID = "00000000-0000-0000-0000-0000000000a1";
const p = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  trip: { findMany: ReturnType<typeof vi.fn> };
  vehicle: { findMany: ReturnType<typeof vi.fn> };
};

async function get(path: string, isAdmin = false) {
  const app = await buildApp();
  await app.register(taxRoutes, { prefix: "/tax" });
  const res = await app.inject({
    method: "GET",
    url: path,
    headers: { authorization: `Bearer ${makeAccessToken(USER_ID, isAdmin)}` },
  });
  await app.close();
  return res;
}

describe("GET /tax/regime-summary", () => {
  const saved = process.env.COUNTRY_SETTING;
  beforeEach(() => {
    vi.clearAllMocks();
    p.vehicle.findMany.mockResolvedValue([
      { id: "v1", make: "Toyota", model: "Aqua", fuelType: "hybrid", vehicleType: "car", providedByOthers: false, isPrimary: true },
    ]);
    p.trip.findMany.mockResolvedValue([{ distanceMiles: 62.137119, classification: "business", vehicleId: "v1" }]);
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.COUNTRY_SETTING;
    else process.env.COUNTRY_SETTING = saved;
  });

  it("is null for a UK driver", async () => {
    process.env.COUNTRY_SETTING = "on";
    p.user.findUnique.mockResolvedValue({ isAdmin: false, country: "GB" });
    const res = await get("/tax/regime-summary");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: null });
    expect(p.trip.findMany).not.toHaveBeenCalled();
  });

  it("is null for an NZ driver while the switch is off (treated as GB)", async () => {
    delete process.env.COUNTRY_SETTING;
    p.user.findUnique.mockResolvedValue({ isAdmin: false, country: "NZ" });
    const res = await get("/tax/regime-summary");
    expect(res.json()).toEqual({ data: null });
  });

  it("is null for a country with no rules yet", async () => {
    process.env.COUNTRY_SETTING = "on";
    p.user.findUnique.mockResolvedValue({ isAdmin: false, country: "AU" });
    const res = await get("/tax/regime-summary");
    expect(res.json()).toEqual({ data: null });
  });

  it("gives IRD figures for an NZ driver with the switch on", async () => {
    process.env.COUNTRY_SETTING = "on";
    p.user.findUnique.mockResolvedValue({ isAdmin: false, country: "NZ" });
    const res = await get("/tax/regime-summary?taxYear=2025-26");
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.regime).toBe("nz-ird");
    expect(d.currency).toBe("NZD");
    // 100 km in a petrol hybrid at 90c
    expect(d.totalAmountMinor).toBe(9000);
    expect(d.vehicles[0].claim.tiers[0].rateMinor).toBe(90);
  });

  it("an admin set to NZ gets it with the switch off", async () => {
    delete process.env.COUNTRY_SETTING;
    p.user.findUnique.mockResolvedValue({ isAdmin: true, country: "NZ" });
    const res = await get("/tax/regime-summary?taxYear=2025-26", true);
    expect(res.json().data.regime).toBe("nz-ird");
  });

  it("rejects a bad tax year", async () => {
    process.env.COUNTRY_SETTING = "on";
    p.user.findUnique.mockResolvedValue({ isAdmin: false, country: "NZ" });
    const res = await get("/tax/regime-summary?taxYear=2025");
    expect(res.statusCode).toBe(400);
  });
});
