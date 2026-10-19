/**
 * A past shift's typed total against the rest of /trips (Lucian, 19 Oct 2026).
 *
 * A total is one trip across a whole shift with the driver's own miles. A
 * trip that arrives later inside its hours (a recording the server watchdog
 * delivers late, or a drive added by hand) counts those miles a second time,
 * so it is marked as a possible double of the total wherever its ends are.
 * Join then keeps the total exactly as it is and removes the other trip. And
 * a client can never make a trip into a typed total itself.
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
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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
import { archiveTripBeforeDelete } from "../../services/tripArchive.js";

const USER_ID = "00000000-0000-0000-0000-00000000000b";
const NEW_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const TOTAL_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const RECORDING_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SHIFT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

// Saturday's shift, 10:00 to 18:00 UTC, saved as a total: 84 miles home to home.
const HOME = { lat: 53.8, lng: -1.55 };
const TOTAL = {
  id: TOTAL_ID, userId: USER_ID, shiftId: SHIFT_ID, vehicleId: null,
  startLat: HOME.lat, startLng: HOME.lng, endLat: HOME.lat, endLng: HOME.lng,
  startAddress: "Home", endAddress: "Home",
  distanceMiles: 84,
  startedAt: new Date("2026-10-17T10:00:00.000Z"),
  endedAt: new Date("2026-10-17T18:00:00.000Z"),
  isManualEntry: true,
  classification: "business",
  platformTag: "deliveroo",
  notes: "32 drops, total entered by you",
  gpsQuality: { distanceSource: "typed_total", drops: 32 },
  recordedBy: "added_by_hand",
  joinedCount: null,
  coordinates: [],
};

// A drive 30 miles from home, inside the shift's hours.
const farTrip = (startedAt: string, endedAt: string) => ({
  startLat: 54.2, startLng: -1.2, endLat: 54.25, endLng: -1.1,
  startAddress: "Thirsk", endAddress: "Ripon",
  distanceMiles: 6.1,
  startedAt, endedAt,
  classification: "business",
});

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

describe("a trip arriving inside a typed total's hours", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.create).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
      id: NEW_ID, possibleDuplicateOfId: null, ...data,
    })) as never);
    vi.mocked(prisma.trip.update).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
      id: NEW_ID, ...data,
    })) as never);
    // The possible-double check reads the day around the new trip.
    vi.mocked(prisma.trip.findMany).mockImplementation((async (args: { select?: Record<string, unknown> }) =>
      args?.select?.isManualEntry && args?.select?.gpsQuality ? [TOTAL] : []) as never);
    app = await createTestApp();
  });

  const marks = () =>
    vi.mocked(prisma.trip.update).mock.calls
      .map((c) => (c[0] as { data: Record<string, unknown> }).data.possibleDuplicateOfId)
      .filter((v) => v !== undefined);

  it("is marked as a possible double of the total, however far its ends are from it", async () => {
    const res = await app.inject({
      method: "POST", url: "/trips", headers: auth,
      payload: farTrip("2026-10-17T13:00:00.000Z", "2026-10-17T13:20:00.000Z"),
    });
    expect(res.statusCode).toBe(201);
    expect(marks()).toEqual([TOTAL_ID]);
    expect(res.json().data.possibleDuplicateOfId).toBe(TOTAL_ID);
  });

  it("outside the total's hours it is left alone", async () => {
    const res = await app.inject({
      method: "POST", url: "/trips", headers: auth,
      payload: farTrip("2026-10-17T18:30:00.000Z", "2026-10-17T18:50:00.000Z"),
    });
    expect(res.statusCode).toBe(201);
    expect(marks()).toEqual([]);
  });

  it("a client cannot make a trip a typed total", async () => {
    await app.inject({
      method: "POST", url: "/trips", headers: auth,
      payload: { ...farTrip("2026-10-17T18:30:00.000Z", "2026-10-17T18:50:00.000Z"), gpsQuality: { distanceSource: "typed_total", drops: 3 } },
    });
    const data = vi.mocked(prisma.trip.create).mock.calls[0][0].data as Record<string, unknown>;
    expect((data.gpsQuality as Record<string, unknown>).distanceSource).toBeUndefined();
  });
});

describe("POST /trips/merge with a typed total", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const RECORDING = {
    ...TOTAL,
    id: RECORDING_ID, shiftId: null,
    startLat: 54.2, startLng: -1.2, endLat: 54.25, endLng: -1.1,
    startAddress: "Thirsk", endAddress: "Ripon",
    distanceMiles: 6.1,
    startedAt: new Date("2026-10-17T13:00:00.000Z"),
    endedAt: new Date("2026-10-17T13:20:00.000Z"),
    isManualEntry: false,
    classification: "personal",
    platformTag: null,
    notes: null,
    gpsQuality: { distanceSource: "match" },
    recordedBy: "automatic",
    coordinates: [{ lat: 54.2, lng: -1.2, recordedAt: new Date("2026-10-17T13:00:00.000Z") }],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.findMany).mockResolvedValue([TOTAL, RECORDING] as never);
    vi.mocked(prisma.trip.update).mockImplementation((async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      ...(where.id === TOTAL_ID ? TOTAL : RECORDING), ...data,
    })) as never);
    app = await createTestApp();
  });

  it("keeps the total exactly, removes the recording, and archives it first", async () => {
    // The Trips tab's Join sends the newer trip's classification and app.
    const res = await app.inject({
      method: "POST", url: "/trips/merge", headers: auth,
      payload: { tripIds: [RECORDING_ID, TOTAL_ID], classification: "personal", platformTag: null },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(prisma.tripCoordinate.createMany).not.toHaveBeenCalled();
    expect(archiveTripBeforeDelete).toHaveBeenCalledWith(RECORDING_ID, USER_ID, "user");
    expect(archiveTripBeforeDelete).not.toHaveBeenCalledWith(TOTAL_ID, expect.anything(), expect.anything());
    expect(prisma.trip.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [RECORDING_ID] }, userId: USER_ID } });

    const update = vi.mocked(prisma.trip.update).mock.calls[0][0] as { where: { id: string }; data: Record<string, unknown> };
    expect(update.where.id).toBe(TOTAL_ID);
    // Nothing that makes the total what it is is touched.
    for (const k of ["distanceMiles", "gpsQuality", "isManualEntry", "startLat", "endLat", "startedAt", "endedAt", "shiftId", "classification"]) {
      expect(update.data, k).not.toHaveProperty(k);
    }
    expect(update.data).toMatchObject({ notes: TOTAL.notes, platformTag: "deliveroo", joinedCount: 2 });

    const kept = res.json().data;
    expect(kept).toMatchObject({
      id: TOTAL_ID,
      distanceMiles: 84,
      isManualEntry: true,
      shiftId: SHIFT_ID,
      notes: "32 drops, total entered by you",
      gpsQuality: { distanceSource: "typed_total", drops: 32 },
    });
  });

  it("refuses to join two totals", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([TOTAL, { ...TOTAL, id: RECORDING_ID }] as never);
    const res = await app.inject({
      method: "POST", url: "/trips/merge", headers: auth,
      payload: { tripIds: [RECORDING_ID, TOTAL_ID], classification: "business" },
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.trip.deleteMany).not.toHaveBeenCalled();
  });
});
