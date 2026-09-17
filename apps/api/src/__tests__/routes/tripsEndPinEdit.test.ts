/**
 * PATCH /trips/:id moving the END pin of a recorded trip (17 Sep 2026).
 *
 * Chris Saunders' phone finalised a recording at a long red light on West
 * Wycombe Road and he drove the last 0.8 miles home unrecorded. He moved the
 * end pin to Home in the app; the pin moved, the distance stayed at 3.4 and
 * the drawn route still ended at the lights, because the end-move branch only
 * ever handled manual trips. These tests pin what the route now does: a
 * recorded trip gains the routed stretch and a dated breadcrumb, its stale
 * route drawing is dropped, an unpriceable move keeps the mileage honest, and
 * a manual trip stays on the end-to-end re-route it always had.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    tripCoordinate: {
      findMany: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn().mockResolvedValue(48),
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
import { logEvent } from "../../services/appEvents.js";
import { resolveRouteDistance } from "../../services/routing.js";
import { upsertMileageSummary } from "../../services/mileage.js";

const USER_ID = "00000000-0000-0000-0000-000000000012";
const TRIP_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

// Where the phone decided the trip was over: the lights on West Wycombe Road.
const LIGHTS = { lat: 51.64, lng: -0.78105 };
// Home, 0.6 mi as the crow flies and about 0.8 by road.
const HOME = { lat: 51.64837, lng: -0.7753 };

/** Chris's drive as the phone saved it: 3.4 miles ending at the lights. */
const RECORDED_TRIP = {
  id: TRIP_ID,
  userId: USER_ID,
  startLat: 51.6102,
  startLng: -0.7601,
  endLat: LIGHTS.lat,
  endLng: LIGHTS.lng,
  startedAt: new Date("2026-09-17T14:20:00Z"),
  endedAt: new Date("2026-09-17T14:35:00Z"),
  distanceMiles: 3.4,
  isManualEntry: false,
  isPhantomTrip: false,
  classification: "business",
  classificationAutoAccepted: null,
  routePolyline: "abc_stale_polyline",
  originalStartLat: null,
  originalStartLng: null,
  gpsQuality: null,
  coordinateCount: 48,
};
const MANUAL_TRIP = { ...RECORDED_TRIP, isManualEntry: true, coordinateCount: 0 };

/** The last 0.8 miles home, as the router prices them. */
const HOME_STRETCH = {
  distanceMiles: 0.82,
  durationSecs: 180,
  source: "graphhopper" as const,
  routeToHaversineRatio: 1.3,
  encodedPolyline: null,
};

/** What Chris's app sent. */
const MOVE_END_HOME = {
  endLat: HOME.lat,
  endLng: HOME.lng,
  endAddress: "Home",
  endedAt: "2026-09-17T14:40:00.000Z",
};

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

function firstUpdateData(): Record<string, any> {
  return vi.mocked(prisma.trip.update).mock.calls[0][0].data as Record<string, any>;
}

describe("PATCH /trips/:id moving a recorded trip's end pin", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(RECORDED_TRIP as any);
    vi.mocked(prisma.trip.update).mockImplementation((({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...RECORDED_TRIP, ...data })) as any);
    vi.mocked(prisma.tripCoordinate.create).mockResolvedValue({} as any);
    vi.mocked(resolveRouteDistance).mockResolvedValue(HOME_STRETCH);
    app = await createTestApp();
  });

  it("adds the routed stretch to the recorded miles and drops the stale route drawing", async () => {
    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MOVE_END_HOME,
    });

    expect(res.statusCode).toBe(200);
    const written = firstUpdateData();
    expect(written).toMatchObject({
      endLat: HOME.lat,
      endLng: HOME.lng,
      endAddress: "Home",
      endedAt: new Date("2026-09-17T14:40:00.000Z"),
      distanceMiles: 4.22,
      routePolyline: null,
    });
    // Routed from where the recording stopped to the new end, never start to end.
    expect(resolveRouteDistance).toHaveBeenCalledTimes(1);
    expect(resolveRouteDistance).toHaveBeenCalledWith(expect.objectContaining({
      startLat: LIGHTS.lat, startLng: LIGHTS.lng, endLat: HOME.lat, endLng: HOME.lng,
    }));
  });

  it("appends one breadcrumb at Home, dated at the new end time, and counts it", async () => {
    await app.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MOVE_END_HOME });

    expect(prisma.tripCoordinate.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.tripCoordinate.create).mock.calls[0][0].data).toMatchObject({
      tripId: TRIP_ID,
      lat: HOME.lat,
      lng: HOME.lng,
      recordedAt: new Date("2026-09-17T14:40:00.000Z"),
    });
    expect(prisma.trip.update).toHaveBeenCalledTimes(2);
    expect(vi.mocked(prisma.trip.update).mock.calls[1][0].data).toEqual({
      coordinateCount: { increment: 1 },
    });
    // Never a delete: the recorded route must survive.
    expect(prisma.tripCoordinate.deleteMany).not.toHaveBeenCalled();
  });

  it("logs the edit in the same shape as a start edit and recomputes the tax year", async () => {
    await app.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MOVE_END_HOME });

    expect(logEvent).toHaveBeenCalledWith("trip.end_edited", USER_ID, {
      tripId: TRIP_ID,
      addedMiles: 0.82,
      crowMiles: expect.any(Number),
      distanceUnchanged: null,
      wasManual: false,
    });
    expect(upsertMileageSummary).toHaveBeenCalledWith(USER_ID, "2026-27");
  });

  it("lets an explicit distance from the client win over the routed addition", async () => {
    await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { ...MOVE_END_HOME, distanceMiles: 4.5 },
    });

    expect(firstUpdateData()).toMatchObject({ distanceMiles: 4.5, routePolyline: null });
  });

  it("moves the pin but leaves the miles alone when no router can price the stretch", async () => {
    vi.mocked(resolveRouteDistance).mockResolvedValue(null);

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MOVE_END_HOME,
    });

    expect(res.statusCode).toBe(200);
    const written = firstUpdateData();
    expect(written).toMatchObject({ endLat: HOME.lat, endLng: HOME.lng, routePolyline: null });
    expect(written).not.toHaveProperty("distanceMiles");
    expect(prisma.tripCoordinate.create).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith("trip.end_edited", USER_ID, expect.objectContaining({
      addedMiles: 0,
      distanceUnchanged: "route_unavailable",
    }));
    // No crow-flies stand-in either: an unpriced stretch is not a guessed one.
    expect(logEvent).not.toHaveBeenCalledWith("routing.haversine_fallback_used", USER_ID, expect.anything());
  });

  it("moves the pin but never prices a drop across the county", async () => {
    await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { endLat: LIGHTS.lat + 1, endLng: LIGHTS.lng },
    });

    expect(resolveRouteDistance).not.toHaveBeenCalled();
    expect(firstUpdateData()).not.toHaveProperty("distanceMiles");
    expect(logEvent).toHaveBeenCalledWith("trip.end_edited", USER_ID, expect.objectContaining({
      distanceUnchanged: "too_far",
    }));
  });

  it("does not treat a pin nudged a few metres as an end edit", async () => {
    await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { endLat: LIGHTS.lat + 0.00001, endLng: LIGHTS.lng },
    });

    // Label-only: the pin is written, nothing is routed or re-routed, and the
    // recorded miles are not replaced by a start-to-end figure.
    expect(resolveRouteDistance).not.toHaveBeenCalled();
    expect(firstUpdateData()).not.toHaveProperty("distanceMiles");
    expect(prisma.tripCoordinate.create).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalledWith("trip.end_edited", USER_ID, expect.anything());
  });

  it("keeps a manual trip on the end-to-end re-route it always had", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(MANUAL_TRIP as any);
    vi.mocked(resolveRouteDistance).mockResolvedValue({ ...HOME_STRETCH, distanceMiles: 3.9 });

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MOVE_END_HOME,
    });

    expect(res.statusCode).toBe(200);
    // Re-routed from the trip's START to the new end, and the route replaces
    // the distance rather than adding to it.
    expect(vi.mocked(resolveRouteDistance).mock.calls[0][0]).toMatchObject({
      startLat: MANUAL_TRIP.startLat, startLng: MANUAL_TRIP.startLng, endLat: HOME.lat, endLng: HOME.lng,
    });
    expect(firstUpdateData()).toMatchObject({ distanceMiles: 3.9, routePolyline: null });
    expect(prisma.tripCoordinate.create).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalledWith("trip.end_edited", USER_ID, expect.anything());
  });
});
