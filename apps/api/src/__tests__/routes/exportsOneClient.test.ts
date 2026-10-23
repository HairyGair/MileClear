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
    $queryRaw: vi.fn(),
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
import {
  isLabelCollisionCount,
  labelCollisionCount,
  labelQueryRaw,
  type LabelMockOptions,
  type SpellingRow,
} from "../helpers/projectLabels.js";

const USER_ID = "00000000-0000-0000-0000-0000000000d2";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };
const SECOND = { id: "vb", make: "Ford", model: "Fiesta", registrationPlate: null };

// Spellings as stored, byte for byte: two of NHS Trust and one other client.
const LABELS: SpellingRow[] = [
  { label: "NHS Trust", trips: 5 },
  { label: "NHS  Trust", trips: 1 },
  { label: "Private practice", trips: 2 },
];

async function createTestApp() {
  const app = await buildApp();
  await app.register(exportRoutes, { prefix: "/exports" });
  return app;
}

/** Label lookups answer from `rows`; the export's own empty check answers `exportTrips`. */
function useLabels(rows: SpellingRow[], exportTrips: number, opts: LabelMockOptions = {}) {
  vi.mocked(prisma.$queryRaw).mockImplementation(labelQueryRaw(USER_ID, rows, opts) as never);
  vi.mocked(prisma.trip.count).mockImplementation((async (args: { where?: Record<string, unknown> }) =>
    isLabelCollisionCount(args) ? labelCollisionCount(args, rows, opts) : exportTrips) as never);
}

/** The where of the export's empty check. */
function exportCountWhere(): Record<string, unknown> {
  const call = vi.mocked(prisma.trip.count).mock.calls.find((c) => !isLabelCollisionCount(c[0] as never));
  return call![0]!.where as Record<string, unknown>;
}

describe("exports: one client", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.earning.count).mockResolvedValue(0 as never);
    useLabels(LABELS, 3);
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
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
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
    expect(exportCountWhere()).toMatchObject({ userId: USER_ID, projectLabel: { in: ["NHS Trust", "NHS  Trust"] } });
  });

  it("pdf: one client in one car, both in the file name and passed through", async () => {
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
    expect(exportCountWhere()).toMatchObject({ vehicleId: "vb", projectLabel: { in: ["Private practice"] } });
  });

  it("says so when that client has no trips in the period", async () => {
    useLabels(LABELS, 0);
    const res = await app.inject({ method: "GET", url: "/exports/pdf?taxYear=2026-27&projectLabel=NHS%20Trust", headers: auth });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("no trips for that client in the 2026-27 tax year");
    expect(generateTripsPdf).not.toHaveBeenCalled();
  });

  it("accent-only spellings are two clients: each one exports, counted byte-exact", async () => {
    useLabels([{ label: "Cafe", trips: 1 }, { label: "Café", trips: 2 }], 1, { accentTwins: 2, ids: ["t1"] });
    const res = await app.inject({ method: "GET", url: "/exports/csv?taxYear=2026-27&projectLabel=Cafe", headers: auth });
    // Not a 404: the old groupBy folded the two spellings into one row.
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(generateTripsCsv).mock.calls[0][1].project?.label).toBe("Cafe");
    expect(exportCountWhere()).toMatchObject({ id: { in: ["t1"] } });

    vi.clearAllMocks();
    useLabels([{ label: "Cafe", trips: 1 }, { label: "Café", trips: 2 }], 2, { accentTwins: 1, ids: ["t2", "t3"] });
    const accented = await app.inject({ method: "GET", url: "/exports/csv?taxYear=2026-27&projectLabel=Caf%C3%A9", headers: auth });
    expect(accented.statusCode).toBe(200);
    expect(vi.mocked(generateTripsCsv).mock.calls[0][1].project?.label).toBe("Café");
  });

  it("names both when one client in one car has no trips", async () => {
    useLabels(LABELS, 0);
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
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
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
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(generateSelfAssessmentPdf).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(generateSelfAssessmentPdf).mock.calls[0])).not.toContain("NHS");
  });
});
