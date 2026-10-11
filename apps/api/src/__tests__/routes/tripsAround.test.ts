/**
 * GET /trips/around (11 Oct 2026): the driver's own trips that overlap a time
 * window, for "MileClear already has a trip around then" on the add-trip form
 * and the dots on its calendar. Read only. Synthetic data only.
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
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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

const USER_ID = "00000000-0000-0000-0000-000000000088";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

function row(id: string, start: string, end: string | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    startedAt: new Date(start),
    endedAt: end ? new Date(end) : null,
    startAddress: "Home",
    endAddress: "Tesco Extra",
    distanceMiles: 9.3,
    isManualEntry: false,
    recordedBy: "automatic",
    createdAt: new Date(start),
    ...extra,
  };
}

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

const url = (from: string, to: string) =>
  `/trips/around?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

describe("GET /trips/around", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.findMany).mockResolvedValue([] as any);
    app = await createTestApp();
  });

  it("needs a login", async () => {
    const res = await app.inject({ method: "GET", url: url("2026-10-03T08:35:00Z", "2026-10-03T09:01:00Z") });
    expect(res.statusCode).toBe(401);
  });

  it("returns only trips that overlap the window, scoped to the driver, read only", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      row("earlier", "2026-10-03T07:00:00Z", "2026-10-03T08:35:00Z"), // touches the start: not an overlap
      row("rec", "2026-10-03T08:40:00Z", "2026-10-03T09:05:00Z"),
      row("noend", "2026-10-03T08:50:00Z", null, { isManualEntry: true, recordedBy: "added_by_hand" }),
    ] as any);

    const res = await app.inject({
      method: "GET",
      url: url("2026-10-03T08:35:00Z", "2026-10-03T09:01:00Z"),
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.trips.map((t: { id: string }) => t.id)).toEqual(["rec", "noend"]);
    expect(body.capped).toBe(false);
    expect(body.trips[0]).toMatchObject({
      startAddress: "Home",
      endAddress: "Tesco Extra",
      distanceMiles: 9.3,
      isManualEntry: false,
      recordedBy: "automatic",
    });

    const args = vi.mocked(prisma.trip.findMany).mock.calls[0][0]!;
    const where = args.where as Record<string, any>;
    expect(where.userId).toBe(USER_ID);
    expect(where.isPhantomTrip).toBe(false);
    // A day of slack before the window, for a drive that began earlier.
    expect(where.startedAt.gte).toEqual(new Date("2026-10-02T08:35:00Z"));
    expect(where.startedAt.lt).toEqual(new Date("2026-10-03T09:01:00Z"));
    expect(args.take).toBe(1000);
    expect(Object.keys(args.select as object)).not.toContain("coordinates");
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
    expect(prisma.trip.delete).not.toHaveBeenCalled();
  });

  it("answers a calendar month", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      row("a", "2026-08-01T08:00:00Z", "2026-08-01T08:20:00Z"),
      row("b", "2026-08-15T17:00:00Z", "2026-08-15T17:30:00Z"),
    ] as any);
    const res = await app.inject({
      method: "GET",
      url: url("2026-07-27T00:00:00Z", "2026-09-07T00:00:00Z"),
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.trips).toHaveLength(2);
  });

  it("refuses a window that is backwards, missing or too long", async () => {
    let res = await app.inject({
      method: "GET",
      url: url("2026-10-03T09:00:00Z", "2026-10-03T08:00:00Z"),
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
    res = await app.inject({ method: "GET", url: "/trips/around?from=2026-10-03T09:00:00Z", headers: auth });
    expect(res.statusCode).toBe(400);
    res = await app.inject({
      method: "GET",
      url: url("2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"),
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
  });

  it("says when it stopped at the row cap", async () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      row(`t${i}`, "2026-08-10T08:00:00Z", "2026-08-10T08:10:00Z")
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValue(many as any);
    const res = await app.inject({
      method: "GET",
      url: url("2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z"),
      headers: auth,
    });
    expect(res.json().data.capped).toBe(true);
  });
});
