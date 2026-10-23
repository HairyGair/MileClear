/**
 * GET /exports/csv and /exports/pdf with ?projectLabel= (23 Oct 2026): one
 * client's trips, matched however the label was typed, a 404 for a client
 * none of the driver's trips has, a file name that says which client, and
 * the Self Assessment report left whole. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
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
import { generateSelfAssessmentPdf, generateTripsCsv, generateTripsPdf } from "../../services/export.js";

const USER_ID = "00000000-0000-0000-0000-0000000000d2";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };
const SECOND = { id: "vb", make: "Ford", model: "Fiesta", registrationPlate: null };

// Labels as stored: two spellings of NHS Trust (the database groups case
// variants together, but not extra inner spaces), and one other client.
const LABELS = [
  { projectLabel: "NHS Trust", _count: { _all: 5 } },
  { projectLabel: "NHS  Trust", _count: { _all: 1 } },
  { projectLabel: "Private practice", _count: { _all: 2 } },
];

async function createTestApp() {
  const app = await buildApp();
  await app.register(exportRoutes, { prefix: "/exports" });
  return app;
}

describe("exports: one client", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.count).mockResolvedValue(3 as never);
    vi.mocked(prisma.earning.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.trip.groupBy).mockImplementation((async (args: { where: { userId: string } }) =>
      args.where.userId === USER_ID ? LABELS : []) as never);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { projectLabel: "NHS Trust" },
      { projectLabel: "nhs trust" },
    ] as never);
    vi.mocked(prisma.vehicle.findFirst).mockImplementation((async (args: { where: { id?: string; userId: string } }) => {
      if (args.where.userId !== USER_ID) return null;
      if (args.where.id === undefined) return { id: "va" }; // export fallback
      return args.where.id === SECOND.id ? SECOND : null;
    }) as never);
    app = await createTestApp();
  });

  for (const type of ["csv", "pdf"] as const) {
    it(`${type}: 404 for a client none of the driver's trips has, and nothing is generated`, async () => {
      const res = await app.inject({ method: "GET", url: `/exports/${type}?taxYear=2026-27&projectLabel=Acme`, headers: auth });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Client not found");
      expect(generateTripsCsv).not.toHaveBeenCalled();
      expect(generateTripsPdf).not.toHaveBeenCalled();
    });
  }

  for (const type of ["csv", "pdf"] as const) {
    it(`${type}: 400 "Invalid client" for a repeated, blank or overlong label, before any lookup`, async () => {
      for (const q of ["projectLabel=A&projectLabel=B", "projectLabel=", "projectLabel=%20%20", `projectLabel=${"x".repeat(101)}`]) {
        const res = await app.inject({ method: "GET", url: `/exports/${type}?taxYear=2026-27&${q}`, headers: auth });
        expect(res.statusCode, q).toBe(400);
        expect(res.json().error).toBe("Invalid client");
      }
      expect(prisma.trip.groupBy).not.toHaveBeenCalled();
      expect(generateTripsCsv).not.toHaveBeenCalled();
      expect(generateTripsPdf).not.toHaveBeenCalled();
    });
  }

  it("csv: matches the client however it was typed, and names the file after it", async () => {
    const res = await app.inject({ method: "GET", url: "/exports/csv?taxYear=2026-27&projectLabel=%20nhs%20trust%20", headers: auth });
    expect(res.statusCode).toBe(200);
    const project = vi.mocked(generateTripsCsv).mock.calls[0][1].project!;
    expect(project.key).toBe("nhs trust");
    expect(project.label).toBe("NHS Trust"); // the most-used spelling
    expect(res.headers["content-disposition"]).toMatch(/filename="mileclear-trips-nhs-trust-2026-27-\d{8}\.csv"/);
    // The empty check asks for every stored spelling of that client, and only the driver's.
    const where = vi.mocked(prisma.trip.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where).toMatchObject({ userId: USER_ID, projectLabel: { in: ["NHS Trust", "NHS  Trust"] } });
  });

  it("pdf: one client in one car, both in the file name and passed through", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([{ projectLabel: "Private practice" }] as never);
    const res = await app.inject({
      method: "GET",
      url: "/exports/pdf?taxYear=2026-27&projectLabel=Private%20practice&vehicleId=vb",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const opts = vi.mocked(generateTripsPdf).mock.calls[0][1];
    expect(opts.project?.label).toBe("Private practice");
    expect(opts.vehicle?.id).toBe("vb");
    expect(res.headers["content-disposition"]).toMatch(/filename="mileclear-trips-private-practice-ford-fiesta-2026-27-\d{8}\.pdf"/);
    expect(vi.mocked(prisma.trip.findMany).mock.calls[0][0]!.where).toMatchObject({ vehicleId: "vb" });
  });

  it("says so when that client has no trips in the period", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);
    const res = await app.inject({ method: "GET", url: "/exports/pdf?taxYear=2026-27&projectLabel=NHS%20Trust", headers: auth });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("no trips for that client in the 2026-27 tax year");
    expect(generateTripsPdf).not.toHaveBeenCalled();
  });

  it("counts by key, so a label the database only matches without accents doesn't count", async () => {
    vi.mocked(prisma.trip.groupBy).mockResolvedValue([{ projectLabel: "Cafe", _count: { _all: 1 } }] as never);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([{ projectLabel: "Café" }] as never);
    const res = await app.inject({ method: "GET", url: "/exports/csv?taxYear=2026-27&projectLabel=Cafe", headers: auth });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("for that client");
  });

  it("names both when one client in one car has no trips", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);
    const res = await app.inject({
      method: "GET",
      url: "/exports/csv?taxYear=2026-27&projectLabel=NHS%20Trust&vehicleId=vb",
      headers: auth,
    });
    expect(res.json().error).toContain("no trips for that client in that car");
  });

  it("without a projectLabel nothing changes: every client, the usual file name", async () => {
    const res = await app.inject({ method: "GET", url: "/exports/csv?taxYear=2026-27", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(prisma.trip.groupBy).not.toHaveBeenCalled();
    expect(vi.mocked(generateTripsCsv).mock.calls[0][1].project).toBeUndefined();
    expect(res.headers["content-disposition"]).toMatch(/filename="mileclear-trips-2026-27-\d{8}\.csv"/);
  });

  it("the Self Assessment report stays whole-business: a projectLabel is ignored", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/exports/self-assessment?taxYear=2026-27&projectLabel=NHS%20Trust",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.trip.groupBy).not.toHaveBeenCalled();
    expect(generateSelfAssessmentPdf).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(generateSelfAssessmentPdf).mock.calls[0])).not.toContain("NHS");
  });
});
