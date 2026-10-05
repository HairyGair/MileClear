/**
 * GET /trips/project-totals (5 Oct 2026): business miles by Project / client
 * for one tax year, valued at the approved rates in date order, plus the
 * labels the driver has used. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    vehicle: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../services/mileage.js", () => ({
  upsertMileageSummary: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));

import { tripRoutes } from "../../routes/trips/index.js";
import { prisma } from "../../lib/prisma.js";

const USER_ID = "00000000-0000-0000-0000-000000000077";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

function row(day: string, miles: number, label: string | null, vehicleType: string | null = "car") {
  return {
    startedAt: new Date(`${day}T09:00:00Z`),
    distanceMiles: miles,
    projectLabel: label,
    vehicle: vehicleType ? { vehicleType } : null,
  };
}

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

describe("GET /trips/project-totals", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as any);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.trip.groupBy).mockResolvedValue([] as any);
    app = await createTestApp();
  });

  it("needs a login", async () => {
    const res = await app.inject({ method: "GET", url: "/trips/project-totals?taxYear=2026-27" });
    expect(res.statusCode).toBe(401);
  });

  it("totals business trips by project for the tax year, scoped to the driver", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      row("2026-05-01", 10, "Project A"),
      row("2026-05-02", 10, "project a"),
      row("2026-05-02", 10, "Project A "),
      row("2026-05-03", 5, null),
    ] as any);
    vi.mocked(prisma.trip.groupBy).mockResolvedValue([
      { projectLabel: "Project A", _max: { startedAt: new Date("2026-05-01T09:00:00Z") } },
      { projectLabel: "Project B", _max: { startedAt: new Date("2026-03-01T09:00:00Z") } },
    ] as any);

    const res = await app.inject({ method: "GET", url: "/trips/project-totals?taxYear=2026-27", headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.taxYear).toBe("2026-27");
    expect(body.projects).toEqual([
      { label: "Project A", trips: 3, miles: 30, valuePence: 1650 },
      { label: null, trips: 1, miles: 5, valuePence: 275 },
    ]);
    expect(body.totals).toEqual({ trips: 4, miles: 35, valuePence: 1925 });
    expect(body.labels).toEqual(["Project A", "Project B"]);

    const where = vi.mocked(prisma.trip.findMany).mock.calls[0][0]!.where as Record<string, any>;
    expect(where.userId).toBe(USER_ID);
    expect(where.classification).toBe("business");
    expect(where.isPhantomTrip).toBe(false);
    expect(where.startedAt.gte).toEqual(new Date(2026, 3, 6));
    const groupWhere = vi.mocked(prisma.trip.groupBy).mock.calls[0][0]!.where as Record<string, any>;
    expect(groupWhere.userId).toBe(USER_ID);
  });

  it("uses the 2025-26 rates for that year and the employer rate when set", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([row("2025-05-01", 100, "A")] as any);
    let res = await app.inject({ method: "GET", url: "/trips/project-totals?taxYear=2025-26", headers: auth });
    expect(res.json().data.totals.valuePence).toBe(4500);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      workType: "employee",
      employerMileageRatePence: 30,
      employerMileageRatePenceAfter10k: null,
    } as any);
    res = await app.inject({ method: "GET", url: "/trips/project-totals?taxYear=2025-26", headers: auth });
    expect(res.json().data.totals.valuePence).toBe(3000);
  });

  it("values a vehicle-less trip at the motorbike rate when every vehicle is a motorbike", async () => {
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([{ vehicleType: "motorbike", isPrimary: false }] as any);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([row("2026-05-01", 10, "A", null)] as any);
    const res = await app.inject({ method: "GET", url: "/trips/project-totals?taxYear=2026-27", headers: auth });
    expect(res.json().data.totals.valuePence).toBe(240);
  });

  it("defaults to the current tax year", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([] as any);
    const res = await app.inject({ method: "GET", url: "/trips/project-totals", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.taxYear).toMatch(/^\d{4}-\d{2}$/);
    expect(res.json().data.projects).toEqual([]);
  });

  it("rejects a malformed tax year", async () => {
    for (const ty of ["2026", "2026-28"]) {
      const res = await app.inject({ method: "GET", url: `/trips/project-totals?taxYear=${ty}`, headers: auth });
      expect(res.statusCode).toBe(400);
    }
  });

  it("GET /trips/project-labels returns just the labels, scoped to the driver", async () => {
    vi.mocked(prisma.trip.groupBy).mockResolvedValue([
      { projectLabel: "Old", _max: { startedAt: new Date("2025-01-01T09:00:00Z") } },
      { projectLabel: "New", _max: { startedAt: new Date("2026-09-01T09:00:00Z") } },
    ] as any);
    const res = await app.inject({ method: "GET", url: "/trips/project-labels", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { labels: ["New", "Old"] } });
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
    const groupWhere = vi.mocked(prisma.trip.groupBy).mock.calls[0][0]!.where as Record<string, any>;
    expect(groupWhere.userId).toBe(USER_ID);
  });
});
