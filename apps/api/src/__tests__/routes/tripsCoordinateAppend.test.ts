/**
 * PATCH /trips/:id — coordinate appending (multi-stop merge).
 *
 * Before 12 Aug 2026 the mobile merge sent only endedAt/distance when it folded
 * a new segment into a recent trip, so the trip grew a stretch of time and
 * mileage with no breadcrumbs behind it (Dempsey Chimwara: endedAt pushed out
 * 46 minutes and distance 4.16 -> 7.03mi, with coordinates stopping at the
 * pre-merge fix). These tests pin the three properties that fix depends on:
 * appended, never replaced; idempotent on replay; stale polyline dropped.
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
      count: vi.fn(),
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
import { logEvent } from "../../services/appEvents.js";

const USER_ID = "00000000-0000-0000-0000-000000000009";
const TRIP_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

/** The trip being merged into: 48 breadcrumbs ending 17:32:45. */
const EXISTING_TRIP = {
  id: TRIP_ID,
  userId: USER_ID,
  startLat: 53.52172,
  startLng: -2.49866,
  endLat: 53.53064,
  endLng: -2.47475,
  startedAt: new Date("2026-08-12T16:37:06Z"),
  endedAt: new Date("2026-08-12T17:32:45Z"),
  distanceMiles: 4.16,
  isManualEntry: false,
  classification: "unclassified",
  classificationAutoAccepted: null,
  routePolyline: "abc_stale_polyline",
};

/** The merged segment's breadcrumbs. */
const SEGMENT = [
  { lat: 53.53, lng: -2.474, speed: 12, accuracy: 5, recordedAt: "2026-08-12T17:42:45.000Z" },
  { lat: 53.528, lng: -2.48, speed: 14, accuracy: 5, recordedAt: "2026-08-12T18:00:00.000Z" },
  { lat: 53.52601, lng: -2.48565, speed: 0, accuracy: 4, recordedAt: "2026-08-12T18:18:26.000Z" },
];

const MERGE_BODY = {
  endLat: 53.52601,
  endLng: -2.48565,
  endAddress: "Asda, Bolton Road, Atherton, M46 9JZ",
  endedAt: "2026-08-12T18:18:26.000Z",
  distanceMiles: 7.03,
  coordinates: SEGMENT,
};

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

/** Captures what the handler did inside the transaction. */
function wireTransaction(storedTimestamps: Date[]) {
  const tx = {
    trip: { update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...EXISTING_TRIP, ...data })) },
    tripCoordinate: {
      findMany: vi.fn().mockResolvedValue(storedTimestamps.map((recordedAt) => ({ recordedAt }))),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));
  return tx;
}

describe("PATCH /trips/:id — merge coordinate append", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(EXISTING_TRIP as any);
    vi.mocked(prisma.trip.update).mockResolvedValue(EXISTING_TRIP as any);
    app = await createTestApp();
  });

  it("appends the merged segment's coordinates instead of dropping them", async () => {
    const tx = wireTransaction([new Date("2026-08-12T17:32:45Z")]);

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MERGE_BODY,
    });

    expect(res.statusCode).toBe(200);
    expect(tx.tripCoordinate.createMany).toHaveBeenCalledTimes(1);
    const written = tx.tripCoordinate.createMany.mock.calls[0][0].data;
    expect(written).toHaveLength(3);
    expect(written[0]).toMatchObject({ tripId: TRIP_ID, lat: 53.53, lng: -2.474, speed: 12 });
    // Never a delete: the pre-merge route must survive.
    expect(prisma.tripCoordinate.deleteMany).not.toHaveBeenCalled();
  });

  it("does not duplicate coordinates when the sync queue replays the PATCH", async () => {
    // Every incoming timestamp is already stored — the replay case.
    const tx = wireTransaction(SEGMENT.map((c) => new Date(c.recordedAt)));

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MERGE_BODY,
    });

    expect(res.statusCode).toBe(200);
    expect(tx.tripCoordinate.createMany).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith(
      "trip.coordinates_appended",
      USER_ID,
      expect.objectContaining({ received: 3, appended: 0, duplicatesSkipped: 3 })
    );
  });

  it("appends only the coordinates it does not already hold", async () => {
    const tx = wireTransaction([new Date(SEGMENT[0].recordedAt)]);

    await app.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MERGE_BODY });

    const written = tx.tripCoordinate.createMany.mock.calls[0][0].data;
    expect(written.map((c: any) => c.recordedAt.toISOString())).toEqual([
      SEGMENT[1].recordedAt,
      SEGMENT[2].recordedAt,
    ]);
  });

  it("clears the map-matched polyline, which no longer covers the extended route", async () => {
    const tx = wireTransaction([]);

    await app.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MERGE_BODY });

    expect(tx.trip.update.mock.calls[0][0].data).toMatchObject({ routePolyline: null });
  });

  it("leaves an ordinary edit on the non-transactional path", async () => {
    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { classification: "business" },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.trip.update).toHaveBeenCalledTimes(1);
    // An edit that touches no coordinates must not discard the polyline.
    expect(prisma.trip.update.mock.calls[0][0].data.routePolyline).toBeUndefined();
  });
});
