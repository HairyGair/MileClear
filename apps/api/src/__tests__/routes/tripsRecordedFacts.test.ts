/**
 * Trip facts on create and merge (11 Oct 2026, decision T-F).
 *
 * The phone says how it recorded a trip; an old app says nothing and the
 * server only fills in what it knows for sure (a trip with no route was typed
 * in). A value it doesn't know is dropped, never a 400: a 400 deletes the
 * phone's copy of the trip. A merge records how many trips went in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => {
  const trip = {
    create: vi.fn(),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    groupBy: vi.fn().mockResolvedValue([]),
  };
  const tripCoordinate = { createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() };
  const prisma: Record<string, unknown> = {
    trip,
    tripCoordinate,
    vehicle: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    shift: { findFirst: vi.fn().mockResolvedValue(null) },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    savedLocation: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  prisma.$transaction = vi.fn(async (fn: (t: unknown) => unknown) => fn(prisma));
  return { prisma };
});

vi.mock("../../services/mileage.js", () => ({ upsertMileageSummary: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/gamification.js", () => ({ checkAndAwardAchievements: vi.fn().mockResolvedValue([]) }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/userActivity.js", () => ({ advanceLastTripAt: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/referral.js", () => ({ qualifyReferralOnFirstTrip: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/tripArchive.js", async (importActual) => ({
  ...(await importActual<typeof import("../../services/tripArchive.js")>()),
  archiveTripBeforeDelete: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../jobs/notifications.js", () => ({
  sendMilestonePush: vi.fn().mockResolvedValue(undefined),
  sendAchievementPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/apns.js", () => ({
  sendLiveActivityStartPush: vi.fn().mockResolvedValue(undefined),
  isApnsConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("../../services/routing.js", async (importActual) => ({
  ...(await importActual<typeof import("../../services/routing.js")>()),
  resolveRouteDistance: vi.fn().mockResolvedValue(null),
}));

import { tripRoutes } from "../../routes/trips/index.js";
import { prisma } from "../../lib/prisma.js";

const USER_ID = "00000000-0000-0000-0000-00000000000a";
const TRIP_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const STARTED = "2026-10-10T09:00:00.000Z";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

const manualPayload = (extra: Record<string, unknown> = {}) => ({
  startLat: 53.4, startLng: -2.9,
  endLat: 53.48, endLng: -2.24,
  startAddress: "Liverpool", endAddress: "Manchester",
  distanceMiles: 34.5,
  startedAt: STARTED,
  endedAt: "2026-10-10T10:00:00.000Z",
  classification: "business",
  ...extra,
});

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

const createdData = () => vi.mocked(prisma.trip.create).mock.calls[0][0].data as Record<string, unknown>;

describe("POST /trips records how the trip was recorded", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.create).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
      id: TRIP_ID, ...data,
    })) as never);
    app = await createTestApp();
  });

  it("keeps what the app says", async () => {
    const res = await app.inject({
      method: "POST", url: "/trips", headers: auth,
      payload: manualPayload({ recordedBy: "missing_report" }),
    });
    expect(res.statusCode).toBe(201);
    expect(createdData().recordedBy).toBe("missing_report");
  });

  it("an old app sending nothing: a typed-in trip is added_by_hand", async () => {
    const res = await app.inject({ method: "POST", url: "/trips", headers: auth, payload: manualPayload() });
    expect(res.statusCode).toBe(201);
    expect(createdData().recordedBy).toBe("added_by_hand");
  });

  it("drops a value it doesn't know instead of refusing the trip", async () => {
    const res = await app.inject({
      method: "POST", url: "/trips", headers: auth,
      payload: manualPayload({ recordedBy: "teleport" }),
    });
    expect(res.statusCode).toBe(201);
    expect(createdData().recordedBy).toBe("added_by_hand");
  });
});

describe("POST /trips/merge records how many trips were joined", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const row = (id: string, startMin: number, extra: Record<string, unknown> = {}) => ({
    id, userId: USER_ID, shiftId: null, vehicleId: null,
    startLat: 53.4, startLng: -2.9, endLat: 53.45, endLng: -2.5,
    startAddress: "x", endAddress: "y", distanceMiles: 5, isManualEntry: false,
    startedAt: new Date(Date.parse(STARTED) + startMin * 60_000),
    endedAt: new Date(Date.parse(STARTED) + (startMin + 10) * 60_000),
    coordinates: [], recordedBy: "automatic", joinedCount: null,
    ...extra,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.create).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
      id: TRIP_ID, ...data,
    })) as never);
    vi.mocked(prisma.trip.findUniqueOrThrow).mockResolvedValue({ id: TRIP_ID } as never);
    app = await createTestApp();
  });

  it("two plain trips: joined from 2, recorded the way the first was", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([row(A, 0), row(B, 15, { recordedBy: "start_trip" })] as never);
    const res = await app.inject({
      method: "POST", url: "/trips/merge", headers: auth,
      payload: { tripIds: [A, B], classification: "business" },
    });
    expect(res.statusCode).toBe(201);
    expect(createdData()).toMatchObject({ joinedCount: 2, recordedBy: "automatic" });
  });

  it("joining an earlier join counts the trips inside it", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([row(A, 0, { joinedCount: 2 }), row(B, 15)] as never);
    await app.inject({
      method: "POST", url: "/trips/merge", headers: auth,
      payload: { tripIds: [A, B], classification: "personal" },
    });
    expect(createdData().joinedCount).toBe(3);
  });

  it("old trips with no facts still join", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([
      row(A, 0, { recordedBy: undefined, joinedCount: undefined }),
      row(B, 15, { recordedBy: undefined, joinedCount: undefined }),
    ] as never);
    const res = await app.inject({
      method: "POST", url: "/trips/merge", headers: auth,
      payload: { tripIds: [A, B], classification: "business" },
    });
    expect(res.statusCode).toBe(201);
    expect(createdData()).toMatchObject({ joinedCount: 2, recordedBy: null });
  });
});
