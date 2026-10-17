/**
 * GET /exports/csv and /exports/pdf with ?vehicleId= (17 Oct 2026): one car's
 * trips, a 404 for a car that isn't the driver's, and a file name that says
 * which car. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: { count: vi.fn() },
    earning: { count: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/export.js", () => ({
  generateTripsCsv: vi.fn().mockResolvedValue("Date\r\n"),
  generateTripsPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-fake")),
  generateSelfAssessmentPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-fake")),
  formatXeroExpense: vi.fn(),
  formatFreeAgentExpense: vi.fn(),
  formatQuickBooksExpense: vi.fn(),
}));
vi.mock("../../middleware/premium.js", () => ({
  premiumMiddleware: vi.fn(async () => {}),
}));

import { exportRoutes } from "../../routes/exports/index.js";
import { prisma } from "../../lib/prisma.js";
import { generateTripsCsv, generateTripsPdf } from "../../services/export.js";

const USER_ID = "00000000-0000-0000-0000-0000000000c2";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };
const PRIMARY = { id: "va", make: "Nissan", model: "Qashqai", registrationPlate: "AB12 CDE" };
const SECOND = { id: "vb", make: "Ford", model: "Fiesta", registrationPlate: null };

async function createTestApp() {
  const app = await buildApp();
  await app.register(exportRoutes, { prefix: "/exports" });
  return app;
}

describe("exports: one car", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.count).mockResolvedValue(3 as never);
    vi.mocked(prisma.vehicle.findFirst).mockImplementation((async (args: { where: { id?: string; userId: string } }) => {
      if (args.where.userId !== USER_ID) return null;
      if (args.where.id === undefined) return { id: PRIMARY.id }; // export fallback
      return [PRIMARY, SECOND].find((v) => v.id === args.where.id) ?? null;
    }) as never);
    app = await createTestApp();
  });

  for (const type of ["csv", "pdf"] as const) {
    it(`${type}: 404 for a car that isn't the driver's, and nothing is generated`, async () => {
      const res = await app.inject({ method: "GET", url: `/exports/${type}?taxYear=2026-27&vehicleId=not-mine`, headers: auth });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Vehicle not found");
      expect(generateTripsCsv).not.toHaveBeenCalled();
      expect(generateTripsPdf).not.toHaveBeenCalled();
    });
  }

  for (const type of ["csv", "pdf"] as const) {
    it(`${type}: 400 "Invalid vehicle" for a repeated, empty or overlong vehicleId, before any lookup`, async () => {
      for (const q of ["vehicleId=va&vehicleId=vb", "vehicleId=", `vehicleId=${"x".repeat(65)}`]) {
        const res = await app.inject({ method: "GET", url: `/exports/${type}?taxYear=2026-27&${q}`, headers: auth });
        expect(res.statusCode, q).toBe(400);
        expect(res.json().error).toBe("Invalid vehicle");
      }
      expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
      expect(prisma.trip.count).not.toHaveBeenCalled();
      expect(generateTripsCsv).not.toHaveBeenCalled();
      expect(generateTripsPdf).not.toHaveBeenCalled();
    });
  }

  it("csv: passes the car through and names the file after it", async () => {
    const res = await app.inject({ method: "GET", url: "/exports/csv?taxYear=2026-27&vehicleId=vb", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(generateTripsCsv).mock.calls[0][1].vehicle?.id).toBe("vb");
    expect(res.headers["content-disposition"]).toMatch(/filename="mileclear-trips-ford-fiesta-2026-27-\d{8}\.csv"/);
    // The empty-check counts this car's trips only.
    expect(vi.mocked(prisma.trip.count).mock.calls[0][0]!.where).toMatchObject({ vehicleId: "vb" });
  });

  it("pdf: the primary car also takes trips with no vehicle", async () => {
    const res = await app.inject({ method: "GET", url: "/exports/pdf?taxYear=2026-27&vehicleId=va", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/filename="mileclear-trips-nissan-qashqai-ab12cde-2026-27-\d{8}\.pdf"/);
    expect(vi.mocked(prisma.trip.count).mock.calls[0][0]!.where).toMatchObject({
      OR: [{ vehicleId: "va" }, { vehicleId: null }],
    });
  });

  it("says so when that car has no trips in the period", async () => {
    vi.mocked(prisma.trip.count).mockResolvedValue(0 as never);
    const res = await app.inject({ method: "GET", url: "/exports/pdf?taxYear=2026-27&vehicleId=vb", headers: auth });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("trips in that car");
    expect(generateTripsPdf).not.toHaveBeenCalled();
  });

  it("without a vehicleId nothing changes: every car, the usual file name", async () => {
    const res = await app.inject({ method: "GET", url: "/exports/csv?taxYear=2026-27", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
    expect(vi.mocked(generateTripsCsv).mock.calls[0][1].vehicle).toBeUndefined();
    expect(res.headers["content-disposition"]).toMatch(/filename="mileclear-trips-2026-27-\d{8}\.csv"/);
  });
});
