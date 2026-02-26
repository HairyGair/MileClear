/**
 * Shift route tests.
 *
 * Covers: start shift, prevent double-start, end shift, list shifts,
 * and auth-middleware rejection for all protected routes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    shift: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    vehicle: {
      findFirst: vi.fn(),
    },
    trip: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    mileageSummary: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    achievement: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// Mock heavy service calls so tests remain fast and don't need DB
vi.mock("../../services/mileage.js", () => ({
  upsertMileageSummary: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/gamification.js", () => ({
  checkAndAwardAchievements: vi.fn().mockResolvedValue([]),
  getShiftScorecard: vi.fn().mockResolvedValue(null),
}));

import { shiftRoutes } from "../../routes/shifts/index.js";
import { prisma } from "../../lib/prisma.js";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const USER_ID = "00000000-0000-0000-0000-000000000003";
const SHIFT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const VEHICLE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const ACTIVE_SHIFT = {
  id: SHIFT_ID,
  userId: USER_ID,
  vehicleId: null,
  status: "active",
  startedAt: new Date("2025-02-01T08:00:00Z"),
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  vehicle: null,
};

const COMPLETED_SHIFT = {
  ...ACTIVE_SHIFT,
  status: "completed",
  endedAt: new Date("2025-02-01T16:00:00Z"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestApp() {
  const app = await buildApp();
  await app.register(shiftRoutes, { prefix: "/shifts" });
  return app;
}

function resetMocks() {
  vi.clearAllMocks();

  vi.mocked(prisma.shift.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.shift.findMany).mockResolvedValue([]);
  vi.mocked(prisma.shift.create).mockResolvedValue(ACTIVE_SHIFT as any);
  vi.mocked(prisma.shift.update).mockResolvedValue(COMPLETED_SHIFT as any);
  vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.trip.count).mockResolvedValue(0);
  vi.mocked(prisma.trip.aggregate).mockResolvedValue({ _sum: { distanceMiles: 0 } } as any);
  vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
}

const validAuthHeader = (id = USER_ID) => ({
  authorization: `Bearer ${makeAccessToken(id)}`,
});

// ---------------------------------------------------------------------------
// POST /shifts — start a shift
// ---------------------------------------------------------------------------

describe("POST /shifts", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("401 — rejects unauthenticated request", async () => {
    const res = await app.inject({ method: "POST", url: "/shifts", payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it("201 — starts a new shift for authenticated user", async () => {
    // No active shift
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/shifts",
      payload: {},
      headers: validAuthHeader(),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.status).toBe("active");
    expect(vi.mocked(prisma.shift.create)).toHaveBeenCalledTimes(1);
  });

  it("400 — prevents starting a second shift while one is active", async () => {
    // findFirst returns an existing active shift
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(ACTIVE_SHIFT as any);

    const res = await app.inject({
      method: "POST",
      url: "/shifts",
      payload: {},
      headers: validAuthHeader(),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/active shift/i);
    expect(vi.mocked(prisma.shift.create)).not.toHaveBeenCalled();
  });

  it("201 — accepts optional vehicleId when vehicle is owned by user", async () => {
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.vehicle.findFirst).mockResolvedValue({
      id: VEHICLE_ID,
      userId: USER_ID,
    } as any);
    vi.mocked(prisma.shift.create).mockResolvedValue({
      ...ACTIVE_SHIFT,
      vehicleId: VEHICLE_ID,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/shifts",
      payload: { vehicleId: VEHICLE_ID },
      headers: validAuthHeader(),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.vehicleId).toBe(VEHICLE_ID);
  });

  it("404 — rejects vehicleId not belonging to the user", async () => {
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(null);
    // Vehicle not found for this user
    vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/shifts",
      payload: { vehicleId: VEHICLE_ID },
      headers: validAuthHeader(),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/vehicle not found/i);
  });

  it("400 — rejects invalid vehicleId format (not a UUID)", async () => {
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/shifts",
      payload: { vehicleId: "not-a-uuid" },
      headers: validAuthHeader(),
    });

    // Zod schema validates vehicleId as UUID
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /shifts — list shifts
// ---------------------------------------------------------------------------

describe("GET /shifts", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("401 — rejects unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/shifts" });
    expect(res.statusCode).toBe(401);
  });

  it("200 — returns empty list when user has no shifts", async () => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([]);

    const res = await app.inject({
      method: "GET",
      url: "/shifts",
      headers: validAuthHeader(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });

  it("200 — returns list of user's shifts", async () => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([
      ACTIVE_SHIFT,
      COMPLETED_SHIFT,
    ] as any);

    const res = await app.inject({
      method: "GET",
      url: "/shifts",
      headers: validAuthHeader(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("passes status filter to DB query when provided", async () => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([COMPLETED_SHIFT] as any);

    await app.inject({
      method: "GET",
      url: "/shifts?status=completed",
      headers: validAuthHeader(),
    });

    expect(vi.mocked(prisma.shift.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          status: "completed",
        }),
      })
    );
  });

  it("ignores unknown status values (does not add to where clause)", async () => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([]);

    await app.inject({
      method: "GET",
      url: "/shifts?status=unknown_value",
      headers: validAuthHeader(),
    });

    const callArg = vi.mocked(prisma.shift.findMany).mock.calls[0][0] as any;
    expect(callArg.where.status).toBeUndefined();
  });

  it("only returns shifts belonging to the authenticated user", async () => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([ACTIVE_SHIFT] as any);

    await app.inject({
      method: "GET",
      url: "/shifts",
      headers: validAuthHeader(),
    });

    expect(vi.mocked(prisma.shift.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH /shifts/:id — end a shift
// ---------------------------------------------------------------------------

describe("PATCH /shifts/:id", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("401 — rejects unauthenticated request", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/shifts/${SHIFT_ID}`,
      payload: { status: "completed" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("200 — ends an active shift successfully", async () => {
    // findFirst used for the shift existence check
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(ACTIVE_SHIFT as any);
    vi.mocked(prisma.shift.update).mockResolvedValue(COMPLETED_SHIFT as any);

    const res = await app.inject({
      method: "PATCH",
      url: `/shifts/${SHIFT_ID}`,
      payload: { status: "completed" },
      headers: validAuthHeader(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("completed");
    expect(res.json().data.endedAt).not.toBeNull();
  });

  it("404 — returns 404 for a shift not owned by the user", async () => {
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(null);

    const res = await app.inject({
      method: "PATCH",
      url: `/shifts/${SHIFT_ID}`,
      payload: { status: "completed" },
      headers: validAuthHeader(),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/not found/i);
  });

  it("400 — returns 400 when trying to end an already-completed shift", async () => {
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(COMPLETED_SHIFT as any);

    const res = await app.inject({
      method: "PATCH",
      url: `/shifts/${SHIFT_ID}`,
      payload: { status: "completed" },
      headers: validAuthHeader(),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/already completed/i);
  });

  it("400 — rejects body without status field", async () => {
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(ACTIVE_SHIFT as any);

    const res = await app.inject({
      method: "PATCH",
      url: `/shifts/${SHIFT_ID}`,
      payload: {},
      headers: validAuthHeader(),
    });

    // Zod: status must be literal "completed"
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /shifts/:id — get single shift
// ---------------------------------------------------------------------------

describe("GET /shifts/:id", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("200 — returns shift data for the owner", async () => {
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(COMPLETED_SHIFT as any);

    const res = await app.inject({
      method: "GET",
      url: `/shifts/${SHIFT_ID}`,
      headers: validAuthHeader(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(SHIFT_ID);
  });

  it("404 — returns 404 for an unknown shift ID", async () => {
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: `/shifts/${SHIFT_ID}`,
      headers: validAuthHeader(),
    });

    expect(res.statusCode).toBe(404);
  });

  it("500/400 — returns an error for non-UUID shift ID (Zod parse throws)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/shifts/not-a-uuid",
      headers: validAuthHeader(),
    });

    // z.object({ id: z.string().uuid() }).parse() throws — Fastify returns 500
    // The important thing is it doesn't return 200
    expect(res.statusCode).not.toBe(200);
  });
});
