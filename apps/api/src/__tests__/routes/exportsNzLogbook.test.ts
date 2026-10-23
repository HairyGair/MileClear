/**
 * GET /exports/logbook-pdf and /exports/logbook-csv (23 Oct 2026): IRD's
 * 90-day vehicle logbook for New Zealand drivers. Pro only, NZ only (403
 * elsewhere and while the Country setting is off), at least 90 days, km and
 * NZ dates, formula-safe CSV. Prisma is mocked; synthetic data only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn(), count: vi.fn() },
    trip: { findMany: vi.fn(), count: vi.fn() },
    earning: { count: vi.fn() },
    odometerReading: { findMany: vi.fn() },
    fuelLog: { findMany: vi.fn() },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/vehicleDefaults.js", () => ({ defaultVehicleIdForUser: vi.fn() }));
vi.mock("../../services/regimeSummary.js", () => ({ loadRegimeSummary: vi.fn() }));
const premium = vi.hoisted(() => ({ allow: true }));
vi.mock("../../middleware/premium.js", () => ({
  premiumMiddleware: vi.fn(async (_req: unknown, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) => {
    if (!premium.allow) return reply.status(403).send({ error: "Premium subscription required" });
  }),
}));

import { exportRoutes } from "../../routes/exports/index.js";
import { prisma } from "../../lib/prisma.js";
import { defaultVehicleIdForUser } from "../../services/vehicleDefaults.js";
import { loadRegimeSummary } from "../../services/regimeSummary.js";
import { NZ_LOGBOOK_CSV_HEADERS } from "../../services/nzLogbook.js";
import { addLogbookDays, nzToday } from "@mileclear/shared";

const USER_ID = "00000000-0000-0000-0000-0000000000d4";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };
const VEHICLE = { id: "v1", make: "Toyota", model: "Aqua", registrationPlate: "ABC123" };
const p = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  vehicle: { findFirst: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  trip: { findMany: ReturnType<typeof vi.fn> };
};

const trips = [
  {
    startedAt: new Date("2026-06-01T20:30:00Z"),
    startAddress: "Queen St, Auckland",
    endAddress: "Ponsonby Rd, Auckland",
    distanceMiles: 30,
    classification: "business",
    platformTag: "uber",
    projectLabel: null,
    notes: null,
  },
  {
    startedAt: new Date("2026-06-03T02:00:00Z"),
    startAddress: "=HYPERLINK(\"x\")",
    endAddress: "Home, \"the bach\"",
    distanceMiles: 70,
    classification: "personal",
    platformTag: null,
    projectLabel: null,
    notes: null,
  },
];

async function get(url: string) {
  const app = await buildApp();
  await app.register(exportRoutes, { prefix: "/exports" });
  const res = await app.inject({ method: "GET", url, headers: auth });
  await app.close();
  return res;
}

describe("NZ logbook downloads", () => {
  const saved = process.env.COUNTRY_SETTING;
  beforeEach(() => {
    vi.clearAllMocks();
    premium.allow = true;
    process.env.COUNTRY_SETTING = "on";
    p.user.findUnique.mockResolvedValue({ isAdmin: false, country: "NZ" });
    p.vehicle.findFirst.mockImplementation(async (args: { where: { id: string; userId: string } }) =>
      args.where.id === VEHICLE.id && args.where.userId === USER_ID ? VEHICLE : null
    );
    p.vehicle.count.mockResolvedValue(1);
    p.trip.findMany.mockResolvedValue(trips);
    p.odometerReading.findMany.mockResolvedValue([]);
    p.fuelLog.findMany.mockResolvedValue([]);
    vi.mocked(defaultVehicleIdForUser).mockResolvedValue("v1");
    vi.mocked(loadRegimeSummary).mockResolvedValue({
      vehicles: [
        {
          vehicleId: "v1",
          name: "Toyota Aqua",
          fuelType: "hybrid",
          businessDistance: 48.3,
          totalDistance: 160.9,
          claim: {
            amountMinor: 4347,
            currency: "NZD",
            ratesYear: "2025-26",
            provisional: true,
            tiers: [{ label: "Tier 1", distance: 48.3, rateMinor: 90, amountMinor: 4347 }],
          },
          noClaimReason: null,
        },
      ],
    } as never);
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.COUNTRY_SETTING;
    else process.env.COUNTRY_SETTING = saved;
  });

  it("is Pro only: the Pro check answers before anything is read", async () => {
    premium.allow = false;
    const res = await get("/exports/logbook-pdf?from=2026-06-01");
    expect(res.statusCode).toBe(403);
    expect(p.user.findUnique).not.toHaveBeenCalled();
  });

  for (const country of ["GB", "AU"]) {
    it(`403 for a driver in ${country}`, async () => {
      p.user.findUnique.mockResolvedValue({ isAdmin: false, country });
      const res = await get("/exports/logbook-csv?from=2026-06-01");
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("Not available in your country");
      expect(p.trip.findMany).not.toHaveBeenCalled();
    });
  }

  it("403 for an NZ driver while the Country setting is off (treated as the UK)", async () => {
    delete process.env.COUNTRY_SETTING;
    const res = await get("/exports/logbook-csv?from=2026-06-01");
    expect(res.statusCode).toBe(403);
  });

  it("an admin set to NZ can download it with the switch off", async () => {
    delete process.env.COUNTRY_SETTING;
    p.user.findUnique.mockResolvedValue({ isAdmin: true, country: "NZ" });
    const res = await get("/exports/logbook-csv?from=2026-06-01");
    expect(res.statusCode).toBe(200);
  });

  it("refuses fewer than 90 days, and a missing start", async () => {
    let res = await get("/exports/logbook-csv?from=2026-06-01&to=2026-06-30");
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/at least 90 days/);
    res = await get("/exports/logbook-csv");
    expect(res.statusCode).toBe(400);
    expect(p.trip.findMany).not.toHaveBeenCalled();
  });

  it("404 for a vehicle that isn't the driver's; 400 with no vehicle to default to", async () => {
    let res = await get("/exports/logbook-csv?from=2026-06-01&vehicleId=not-mine");
    expect(res.statusCode).toBe(404);
    vi.mocked(defaultVehicleIdForUser).mockResolvedValue(null);
    p.vehicle.count.mockResolvedValue(0);
    res = await get("/exports/logbook-csv?from=2026-06-01");
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Add a vehicle/);
  });

  it("refuses a period that ends today in New Zealand (it must end by yesterday)", async () => {
    const today = nzToday();
    const res = await get(`/exports/logbook-csv?from=${addLogbookDays(today, -89)}&to=${today}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/end by yesterday/);
    expect(p.trip.findMany).not.toHaveBeenCalled();
  });

  it("a period crossing 1 April asks for both tax years' claims", async () => {
    const res = await get("/exports/logbook-csv?from=2026-03-01&to=2026-05-31");
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(loadRegimeSummary).mock.calls.map((c) => c[2])).toEqual(["2025-26", "2026-27"]);
  });

  it("prints the nearest saved odometer reading within a week of each end, in the car's unit and km", async () => {
    p.vehicle.findFirst.mockImplementation(async (args: { where: { id: string; userId: string } }) =>
      args.where.id === VEHICLE.id && args.where.userId === USER_ID ? { ...VEHICLE, odometerUnit: "km" } : null
    );
    // 2 June 2026 10:00 NZST; the period starts at midnight 1 June NZ.
    p.odometerReading.findMany.mockResolvedValue([
      { readAt: new Date("2026-06-01T22:00:00Z"), readingMiles: 28_038.07 },
      // 20 days out: not printed.
      { readAt: new Date("2026-07-15T00:00:00Z"), readingMiles: 28_500 },
    ]);
    const res = await get("/exports/logbook-csv?from=2026-06-01");
    const text = res.body;
    expect(text).toContain("Odometer on first day,\"45,123 km (read 02/06/2026)\"");
    expect(text).toMatch(/Odometer on last day,\r?\n/);
    // Typed readings for this vehicle only, near the two ends.
    const where = p.odometerReading.findMany.mock.calls[0][0].where;
    expect(where.vehicleId).toBe("v1");
    expect(where.userId).toBe(USER_ID);
    expect(where.OR).toHaveLength(2);
  });

  it("a car not set to read km keeps the write-in lines and reads no odometer rows", async () => {
    p.odometerReading.findMany.mockResolvedValue([{ readAt: new Date("2026-06-01T22:00:00Z"), readingMiles: 28_038.07 }]);
    const res = await get("/exports/logbook-csv?from=2026-06-01");
    expect(res.body).toMatch(/Odometer on first day,\r?\n/);
    expect(p.odometerReading.findMany).not.toHaveBeenCalled();
  });

  it("selects the business purpose for the reason", async () => {
    await get("/exports/logbook-csv?from=2026-06-01");
    expect(p.trip.findMany.mock.calls[0][0].select.businessPurpose).toBe(true);
  });

  it("400 when the period has no trips", async () => {
    p.trip.findMany.mockResolvedValue([]);
    const res = await get("/exports/logbook-csv?from=2026-06-01");
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/no trips/);
  });

  it("reads the period in New Zealand days, for this vehicle and its unassigned trips", async () => {
    await get("/exports/logbook-csv?from=2026-06-01");
    const where = p.trip.findMany.mock.calls[0][0].where;
    // Midnight 1 June in Auckland (NZST, UTC+12) to midnight after 29 Aug.
    expect(where.startedAt.gte.toISOString()).toBe("2026-05-31T12:00:00.000Z");
    expect(where.startedAt.lt.toISOString()).toBe("2026-08-29T12:00:00.000Z");
    expect(where.OR).toEqual([{ vehicleId: "v1" }, { vehicleId: null }]);
    expect(where.isPhantomTrip).toBe(false);
  });

  it("CSV: headers, km to 1 dp, NZ dates, formula-safe cells, the summary block", async () => {
    const res = await get("/exports/logbook-csv?from=2026-06-01");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("mileclear-logbook-2026-06-01-to-2026-08-29.csv");
    expect(res.body.startsWith("\uFEFF")).toBe(true);
    const lines = res.body.slice(1).split("\r\n");
    expect(lines[0]).toBe(NZ_LOGBOOK_CSV_HEADERS.join(","));
    expect(lines[0]).toBe("Date,Time,From,To,Distance (km),Use,Reason for journey");
    expect(lines[1]).toBe('02/06/2026,08:30,"Queen St, Auckland","Ponsonby Rd, Auckland",48.3,Business,Uber / Uber Eats');
    expect(lines[2]).toContain(`'=HYPERLINK`);
    expect(lines[2]).toContain('"Home, ""the bach"""');
    expect(lines[2]).toContain(",112.7,Personal,");
    expect(res.body).toContain("Business use,30.0%");
    expect(res.body).toContain("Odometer on first day,");
    expect(res.body).toContain("Prepared by MileClear from your recorded trips. Check it before you use it.");
    expect(res.body).not.toMatch(/HMRC|miles|£/);
  });

  it("PDF renders", async () => {
    const res = await get("/exports/logbook-pdf?from=2026-06-01&to=2026-09-30");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(res.headers["content-disposition"]).toContain("2026-06-01-to-2026-09-30.pdf");
  });
});
