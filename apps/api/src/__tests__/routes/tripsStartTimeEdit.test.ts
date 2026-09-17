/**
 * PATCH /trips/:id with a startedAt (17 Sep 2026).
 *
 * Emily Russell typed in a morning drive at 13:50, it saved at 13:50, and the
 * start time then could not be changed: the field was left out of the update
 * schema on purpose. These tests pin what the route now does: a manual trip's
 * start time reaches the database, a recorded one is refused, the ordering is
 * checked against the end the PATCH leaves in place, and a move across
 * 5 April recomputes both tax years.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: {
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    tripCoordinate: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    vehicle: { findFirst: vi.fn() },
    shift: { findFirst: vi.fn() },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../services/mileage.js", () => ({
  upsertMileageSummary: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/gamification.js", () => ({
  checkAndAwardAchievements: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../services/appEvents.js", () => ({
  logEvent: vi.fn(),
}));
vi.mock("../../services/routing.js", () => ({
  resolveRouteDistance: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../services/userActivity.js", () => ({
  advanceLastTripAt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/referral.js", () => ({
  qualifyReferralOnFirstTrip: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../jobs/notifications.js", () => ({
  sendMilestonePush: vi.fn().mockResolvedValue(undefined),
  sendAchievementPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/apns.js", () => ({
  sendLiveActivityStartPush: vi.fn().mockResolvedValue(undefined),
  isApnsConfigured: vi.fn().mockReturnValue(false),
}));

import { tripRoutes } from "../../routes/trips/index.js";
import { prisma } from "../../lib/prisma.js";
import { upsertMileageSummary } from "../../services/mileage.js";

const USER_ID = "00000000-0000-0000-0000-000000000011";
const TRIP_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

/** Emily's morning drive, saved at the time she opened the form. */
const MANUAL_TRIP = {
  id: TRIP_ID,
  userId: USER_ID,
  startLat: 51.4545,
  startLng: -2.5879,
  endLat: 51.4816,
  endLng: -2.6161,
  startedAt: new Date("2026-09-16T13:50:00Z"),
  endedAt: new Date("2026-09-16T14:15:00Z"),
  distanceMiles: 3.4,
  isManualEntry: true,
  isPhantomTrip: false,
  classification: "business",
  classificationAutoAccepted: null,
  routePolyline: null,
  originalStartLat: null,
  originalStartLng: null,
  gpsQuality: null,
};
const RECORDED_TRIP = { ...MANUAL_TRIP, isManualEntry: false };

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

describe("PATCH /trips/:id with startedAt", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.update).mockImplementation((({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...MANUAL_TRIP, ...data })) as any);
    app = await createTestApp();
  });

  it("moves a manual trip's start time to when the drive really happened", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(MANUAL_TRIP as any);

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { startedAt: "2026-09-16T08:10:00.000Z", endedAt: "2026-09-16T08:35:00.000Z" },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.trip.update).toHaveBeenCalledTimes(1);
    const written = vi.mocked(prisma.trip.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(written.startedAt).toEqual(new Date("2026-09-16T08:10:00.000Z"));
    expect(written.endedAt).toEqual(new Date("2026-09-16T08:35:00.000Z"));
    // Same tax year: recomputed once.
    expect(upsertMileageSummary).toHaveBeenCalledTimes(1);
    expect(upsertMileageSummary).toHaveBeenCalledWith(USER_ID, "2026-27");
  });

  it("refuses to move the start time of a recorded trip", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(RECORDED_TRIP as any);

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { startedAt: "2026-09-16T08:10:00.000Z" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "The start time of a recorded trip cannot be changed" });
    expect(prisma.trip.update).not.toHaveBeenCalled();
  });

  it("refuses a start after the stored end when only the start moves", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(MANUAL_TRIP as any);

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { startedAt: "2026-09-16T15:00:00.000Z" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Start time cannot be after the end time" });
    expect(prisma.trip.update).not.toHaveBeenCalled();
  });

  it("checks an incoming end against the incoming start, not the stored one", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(MANUAL_TRIP as any);

    // 09:00 is before the STORED 13:50 start, but after the new 08:10 one.
    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { startedAt: "2026-09-16T08:10:00.000Z", endedAt: "2026-09-16T09:00:00.000Z" },
    });

    expect(res.statusCode).toBe(200);
  });

  it("recomputes both tax years when the start moves across 5 April", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue({
      ...MANUAL_TRIP,
      startedAt: new Date("2026-04-07T09:00:00Z"),
      endedAt: new Date("2026-04-07T09:30:00Z"),
    } as any);

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { startedAt: "2026-04-03T09:00:00.000Z", endedAt: "2026-04-03T09:30:00.000Z" },
    });

    expect(res.statusCode).toBe(200);
    expect(upsertMileageSummary).toHaveBeenCalledWith(USER_ID, "2026-27");
    expect(upsertMileageSummary).toHaveBeenCalledWith(USER_ID, "2025-26");
  });

  it("still rejects an end before the start on an ordinary end-only edit", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(MANUAL_TRIP as any);

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { endedAt: "2026-09-16T13:00:00.000Z" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "End time cannot be before the start time" });
  });
});
