/**
 * GET /trips/:id/roadworks (17 Oct 2026): the Street Manager works a recorded
 * trip drove through while they were in place. Read only. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tripCoordinate: { findMany: vi.fn() },
    streetWorksEvent: { findMany: vi.fn() },
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

const USER_ID = "00000000-0000-0000-0000-000000000088";
const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

const LAT0 = 52.6;
const LNG0 = -2.0;
const M_LNG = 1 / (111320 * Math.cos((LAT0 * Math.PI) / 180));
const at = (east: number): [number, number] => [LAT0, LNG0 + east * M_LNG];

let updatedAtMs = Date.parse("2026-10-14T09:00:00Z");

function tripRow(extra: Record<string, unknown> = {}) {
  return {
    id: TRIP_ID,
    startedAt: new Date("2026-10-14T08:00:00Z"),
    endedAt: new Date("2026-10-14T08:20:00Z"),
    isManualEntry: false,
    updatedAt: new Date(updatedAtMs),
    ...extra,
  };
}

function coords(n = 50, accuracy: number | null = 8) {
  return Array.from({ length: n }, (_, i) => ({
    lat: at(i * 20)[0],
    lng: at(i * 20)[1],
    accuracy,
    recordedAt: new Date(Date.parse("2026-10-14T08:00:00Z") + i * 5000),
  }));
}

function worksRow(extra: Record<string, unknown> = {}) {
  return {
    id: "w-1",
    reference: "TSR1",
    trafficManagement: "road_closure",
    isTrafficSensitive: true,
    workStatus: "in_progress",
    streetName: "Durham Road",
    town: "Gateshead",
    promoter: "Northumbrian Water Limited",
    startAt: new Date("2026-10-12T07:00:00Z"),
    endAt: new Date("2026-10-16T17:00:00Z"),
    geometry: { lines: [[at(300), at(350)]], points: [] },
    ...extra,
  };
}

/** Phase 1 asks for ids and boxes (a select); phase 2 for full rows by id. */
function mockWorks(rows: Record<string, unknown>[]) {
  vi.mocked(prisma.streetWorksEvent.findMany).mockImplementation((async (args: any) => {
    if (args?.select) {
      return rows.map((r) => {
        const g = r.geometry as { lines: [number, number][][]; points: [number, number][] };
        const all = [...g.points, ...g.lines.flat()];
        return {
          id: r.id,
          minLat: Math.min(...all.map((p) => p[0])),
          maxLat: Math.max(...all.map((p) => p[0])),
          minLng: Math.min(...all.map((p) => p[1])),
          maxLng: Math.max(...all.map((p) => p[1])),
        };
      });
    }
    const ids: string[] = args.where.id.in;
    return rows.filter((r) => ids.includes(r.id as string));
  }) as any);
}

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

const url = `/trips/${TRIP_ID}/roadworks`;

describe("GET /trips/:id/roadworks", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.STREET_MANAGER_SNS_ENABLED = "1";
    updatedAtMs += 60000; // a fresh cache key per test
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(tripRow() as any);
    vi.mocked(prisma.tripCoordinate.findMany).mockResolvedValue(coords() as any);
    mockWorks([worksRow()]);
    app = await createTestApp();
  });

  afterEach(() => {
    delete process.env.STREET_MANAGER_SNS_ENABLED;
  });

  it("needs a login", async () => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode).toBe(401);
  });

  it("lists the works the trip drove through, with the licence credit, and writes nothing", async () => {
    const res = await app.inject({ method: "GET", url, headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.items).toEqual([
      {
        streetName: "Durham Road",
        phrase: "Road closure booked on Durham Road (Northumbrian Water)",
        promoter: "Northumbrian Water",
        startAt: "2026-10-12T07:00:00.000Z",
        endAt: "2026-10-16T17:00:00.000Z",
      },
    ]);
    expect(body.attribution).toMatch(/Street Manager/);
    expect(prisma.trip.update).not.toHaveBeenCalled();

    // Scoped to the driver, reads the breadcrumbs by trip in time order.
    expect(vi.mocked(prisma.trip.findFirst).mock.calls[0][0]).toMatchObject({
      where: { id: TRIP_ID, userId: USER_ID },
    });
    expect(vi.mocked(prisma.tripCoordinate.findMany).mock.calls[0][0]).toMatchObject({
      where: { tripId: TRIP_ID },
      orderBy: { recordedAt: "asc" },
    });
    // Only works with a traffic effect, in the trip's box and time, with no
    // cap; then the full rows by id.
    const first = vi.mocked(prisma.streetWorksEvent.findMany).mock.calls[0][0] as any;
    expect(first.where.trafficManagement.in).toContain("road_closure");
    expect(first.where.trafficManagement.in).not.toContain("some_carriageway_incursion");
    expect(first.where.startAt).toEqual({ lte: new Date("2026-10-14T08:20:00Z") });
    expect(first.take).toBeUndefined();
    expect(Object.keys(first.select).sort()).toEqual(["id", "maxLat", "maxLng", "minLat", "minLng"]);
    const second = vi.mocked(prisma.streetWorksEvent.findMany).mock.calls[1][0] as any;
    expect(second.where).toEqual({ id: { in: ["w-1"] } });
  });

  it("reads emergency works when the work category is stored", async () => {
    mockWorks([worksRow({ workCategory: "immediate_emergency" })]);
    const res = await app.inject({ method: "GET", url, headers: auth });
    expect(res.json().data.items[0]).toMatchObject({
      phrase: "Road closure booked on Durham Road (Emergency works)",
      emergency: true,
    });
  });

  it("404s for another driver's trip (or no trip)", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url, headers: auth });
    expect(res.statusCode).toBe(404);
    expect(prisma.tripCoordinate.findMany).not.toHaveBeenCalled();
  });

  it("404s for an id that is not a trip id", async () => {
    const res = await app.inject({ method: "GET", url: "/trips/nope/roadworks", headers: auth });
    expect(res.statusCode).toBe(404);
  });

  it("returns empty for a manual trip without reading anything else", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(tripRow({ isManualEntry: true }) as any);
    const res = await app.inject({ method: "GET", url, headers: auth });
    expect(res.json().data).toEqual({ items: [], attribution: null });
    expect(prisma.tripCoordinate.findMany).not.toHaveBeenCalled();
    expect(prisma.streetWorksEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns empty for a trip with fewer than 10 breadcrumbs", async () => {
    vi.mocked(prisma.tripCoordinate.findMany).mockResolvedValue(coords(9) as any);
    const res = await app.inject({ method: "GET", url, headers: auth });
    expect(res.json().data.items).toEqual([]);
    expect(prisma.streetWorksEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns empty when Street Manager is off", async () => {
    delete process.env.STREET_MANAGER_SNS_ENABLED;
    const res = await app.inject({ method: "GET", url, headers: auth });
    expect(res.json().data.items).toEqual([]);
    expect(prisma.tripCoordinate.findMany).not.toHaveBeenCalled();
  });

  it("caches per trip, and looks again once the trip is edited", async () => {
    await app.inject({ method: "GET", url, headers: auth });
    const second = await app.inject({ method: "GET", url, headers: auth });
    expect(second.json().data.items).toHaveLength(1);
    expect(prisma.tripCoordinate.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.streetWorksEvent.findMany).toHaveBeenCalledTimes(2);

    vi.mocked(prisma.trip.findFirst).mockResolvedValue(
      tripRow({ updatedAt: new Date(updatedAtMs + 1000) }) as any
    );
    await app.inject({ method: "GET", url, headers: auth });
    expect(prisma.tripCoordinate.findMany).toHaveBeenCalledTimes(2);
  });

  it("leaves out fixes less accurate than 50 m", async () => {
    vi.mocked(prisma.tripCoordinate.findMany).mockResolvedValue([
      ...coords(9, 8),
      ...coords(40, 80).map((c, i) => ({ ...c, recordedAt: new Date(Date.parse("2026-10-14T08:01:00Z") + i * 5000) })),
    ] as any);
    const res = await app.inject({ method: "GET", url, headers: auth });
    expect(res.json().data.items).toEqual([]);
    expect(prisma.streetWorksEvent.findMany).not.toHaveBeenCalled();
  });

  it("a long trip's box full of works far off the route never pushes out the one on it", async () => {
    // 1,200 works in the trip's bbox but 400 m north of the road, then the
    // one on the road last: a capped, unordered query could drop it.
    const far = Array.from({ length: 1200 }, (_, i) =>
      worksRow({ id: `far-${i}`, reference: `F${i}`, geometry: { lines: [], points: [[LAT0 + 400 / 111320, at(i % 900)[1]]] } })
    );
    // Stretch the trip's bbox north so the far works sit inside it.
    vi.mocked(prisma.tripCoordinate.findMany).mockResolvedValue([
      ...coords(50),
      { lat: LAT0 + 500 / 111320, lng: at(980)[1], accuracy: 8, recordedAt: new Date("2026-10-14T08:10:00Z") },
    ] as any);
    mockWorks([...far, worksRow({ id: "on-route" })]);
    const res = await app.inject({ method: "GET", url, headers: auth });
    expect(res.json().data.items.map((i: { streetName: string }) => i.streetName)).toEqual(["Durham Road"]);
    const loads = vi.mocked(prisma.streetWorksEvent.findMany).mock.calls.slice(1).map((c) => (c[0] as any).where.id.in);
    expect(loads.flat()).toEqual(["on-route"]);
  });

  it("stays quiet (empty) when the works lookup fails", async () => {
    vi.mocked(prisma.streetWorksEvent.findMany).mockRejectedValue(new Error("table missing"));
    const res = await app.inject({ method: "GET", url, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.items).toEqual([]);
  });
});
