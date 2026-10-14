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
vi.mock("../../services/splitTailAppend.js", () => ({
  findSplitFamily: vi.fn().mockResolvedValue(null),
  appendToSplitTail: vi.fn(),
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
import { findSplitFamily, appendToSplitTail } from "../../services/splitTailAppend.js";
import { haversineDistance } from "@mileclear/shared";

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
    vi.mocked(findSplitFamily).mockResolvedValue(null);
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

  it("recomputes a split parent's distance from its breadcrumbs instead of taking the phone's cumulative figure", async () => {
    // The server has already cut a visit out of this trip (a child carries
    // autoSplitFromTripId). The phone does not know and PATCHes the parent
    // with its cumulative 11.27 miles for the whole recording. Rachel
    // Rennie, 3 Sep 2026: that figure, shared across the legs that remained,
    // put 4.87 miles on a 3-minute, 1.79-mile leg.
    vi.mocked(prisma.trip.count).mockResolvedValue(1 as any);
    // A short straight trail: three fixes ~0.5 mi apart along a meridian.
    const trail = [
      { lat: 53.5, lng: -2.47, recordedAt: new Date("2026-08-12T17:00:00Z") },
      { lat: 53.5072, lng: -2.47, recordedAt: new Date("2026-08-12T17:02:00Z") },
      { lat: 53.5144, lng: -2.47, recordedAt: new Date("2026-08-12T17:04:00Z") },
    ];
    const tx = {
      trip: { update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...EXISTING_TRIP, ...data })) },
      tripCoordinate: {
        findMany: vi.fn().mockResolvedValue(trail),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { ...MERGE_BODY, distanceMiles: 11.27 },
    });

    expect(res.statusCode).toBe(200);
    // main update, the coordinateCount increment for the appended rows,
    // then the trail-distance recompute.
    expect(tx.trip.update).toHaveBeenCalledTimes(3);
    expect(tx.trip.update.mock.calls[1][0].data.coordinateCount).toEqual({ increment: 3 });
    const second = tx.trip.update.mock.calls[2][0].data.distanceMiles;
    // ~1 mile of trail, never the 11.27 the phone sent.
    expect(second).toBeGreaterThan(0.9);
    expect(second).toBeLessThan(1.1);
    expect(logEvent).toHaveBeenCalledWith(
      "trip.append_distance_recomputed",
      USER_ID,
      expect.objectContaining({ tripId: TRIP_ID, clientMiles: 11.27 })
    );
  });

  it("leaves an unsplit trip's client distance alone on append", async () => {
    vi.mocked(prisma.trip.count).mockResolvedValue(0 as any);
    const tx = wireTransaction([new Date("2026-08-12T17:32:45Z")]);
    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MERGE_BODY,
    });
    expect(res.statusCode).toBe(200);
    // main update plus the coordinateCount increment; no distance recompute
    // for an unsplit trip.
    expect(tx.trip.update).toHaveBeenCalledTimes(2);
    expect(tx.trip.update.mock.calls[1][0].data.coordinateCount).toEqual({ increment: 3 });
    expect(tx.trip.update.mock.calls[0][0].data.distanceMiles).toBe(7.03);
  });

  it("sends a merge into a split trip to its LAST leg, never stretching leg one over the others", async () => {
    // Sonny Grant, 19 Sep 2026: the parent became 14:33-15:34 and 14.48 mi
    // on top of the two legs split out of it.
    const TAIL_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    vi.mocked(findSplitFamily).mockResolvedValue({ familyIds: [TRIP_ID, TAIL_ID], tailId: TAIL_ID });
    vi.mocked(appendToSplitTail).mockResolvedValue({
      tailId: TAIL_ID, appended: 3, duplicates: 0, beforeTail: 0, addedMiles: 2.1,
    });

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
      payload: { ...MERGE_BODY, classification: "business" },
    });

    expect(res.statusCode).toBe(200);
    expect(appendToSplitTail).toHaveBeenCalledWith(
      expect.objectContaining({ coordinates: expect.any(Array), endAddress: MERGE_BODY.endAddress })
    );
    // The parent gets the classification and nothing that moves its end.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const parentData = vi.mocked(prisma.trip.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(parentData.classification).toBe("business");
    expect(parentData.endedAt).toBeUndefined();
    expect(parentData.endLat).toBeUndefined();
    expect(parentData.distanceMiles).toBeUndefined();
    expect(logEvent).toHaveBeenCalledWith(
      "trip.append_redirected_to_split_tail",
      USER_ID,
      expect.objectContaining({ tripId: TRIP_ID, tailId: TAIL_ID, appended: 3 })
    );
  });

  describe("a stale fix in the trail (Katy, 14 Oct 2026, trip b7b5f5fe)", () => {
    // A 2.25-mile drive north from 51.42110,-0.28962, one fix every 10 s.
    const t0 = Date.parse("2026-10-14T09:07:17Z");
    const drive = Array.from({ length: 30 }, (_, i) => ({
      lat: 51.4211 + (i * 0.03257) / 29,
      lng: -0.28962,
      speed: 12 as number | null,
      accuracy: 4 as number | null,
      recordedAt: new Date(t0 + i * 10_000),
    }));
    // Her home fix, accuracy 50 and speed 0, 5 s after a real fix.
    const pinnedAfter = (i: number) => ({
      lat: 51.42827, lng: -0.31077, speed: 0 as number | null, accuracy: 50 as number | null,
      recordedAt: new Date(t0 + i * 10_000 + 5000),
    });
    const pinned = pinnedAfter(0);
    // The leftovers carried her home fix three times: each one a there-and-back
    // jump the phone counted.
    const katyTrail = [
      drive[0], pinnedAfter(0), ...drive.slice(1, 10), pinnedAfter(9),
      ...drive.slice(10, 20), pinnedAfter(19), ...drive.slice(20),
    ];
    const pathMiles = (cs: { lat: number; lng: number }[]) =>
      cs.slice(1).reduce((s, c, k) => s + haversineDistance(cs[k].lat, cs[k].lng, c.lat, c.lng), 0);

    function wireTrail(trail: typeof drive, base: Record<string, unknown> = EXISTING_TRIP) {
      const tx = {
        trip: { update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...base, ...data })) },
        tripCoordinate: {
          // First read: the dedupe timestamps. Second: the trail after the append.
          findMany: vi
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(trail),
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));
      return tx;
    }

    beforeEach(() => {
      vi.mocked(prisma.trip.count).mockResolvedValue(0 as any);
    });

    it("takes the jumps back out of an inflated figure and says why", async () => {
      const client = Math.round(pathMiles(katyTrail) * 100) / 100;
      expect(client).toBeGreaterThan(6);
      const tx = wireTrail(katyTrail);

      const res = await app.inject({
        method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
        payload: { ...MERGE_BODY, distanceMiles: client },
      });

      expect(res.statusCode).toBe(200);
      expect(tx.trip.update).toHaveBeenCalledTimes(3);
      const stored = tx.trip.update.mock.calls[2][0].data.distanceMiles;
      expect(stored).toBeGreaterThan(2.2);
      expect(stored).toBeLessThan(2.3);
      expect(logEvent).toHaveBeenCalledWith(
        "trip.append_distance_recomputed",
        USER_ID,
        expect.objectContaining({ tripId: TRIP_ID, reason: "outlier_inflated", clientMiles: client, dropped: 3 })
      );
      const { upsertMileageSummary } = await import("../../services/mileage.js");
      expect(upsertMileageSummary).toHaveBeenCalled();
    });

    it("keeps the road miles on top: only what the filter removed comes off", async () => {
      // A map-matched figure 0.3 mi over the trail, plus the counted jumps.
      const client = Math.round((pathMiles(katyTrail) + 0.3) * 100) / 100;
      const tx = wireTrail(katyTrail);
      await app.inject({
        method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
        payload: { ...MERGE_BODY, distanceMiles: client },
      });
      const stored = tx.trip.update.mock.calls[2][0].data.distanceMiles;
      expect(stored).toBeCloseTo(pathMiles(drive) + 0.3, 1);
    });

    it("leaves a road distance a little over the straight-line trail alone", async () => {
      // No bad fix at all: a map-matched 2.6 miles on a 2.25-mile trail.
      const clean = wireTrail(drive);
      await app.inject({
        method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
        payload: { ...MERGE_BODY, distanceMiles: 2.6 },
      });
      expect(clean.trip.update).toHaveBeenCalledTimes(2);
      expect(clean.trip.update.mock.calls[0][0].data.distanceMiles).toBe(2.6);
    });

    it("leaves a figure below the raw trail alone (the phone had already filtered the jump)", async () => {
      const tx = wireTrail([drive[0], pinned, ...drive.slice(1)]);
      await app.inject({
        method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
        payload: { ...MERGE_BODY, distanceMiles: 3.2 },
      });
      expect(tx.trip.update).toHaveBeenCalledTimes(2);
      expect(logEvent).not.toHaveBeenCalledWith("trip.append_distance_recomputed", expect.anything(), expect.anything());
    });

    it("never raises a figure below the trail", async () => {
      const tx = wireTrail(katyTrail);
      await app.inject({
        method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
        payload: { ...MERGE_BODY, distanceMiles: 1.1 },
      });
      expect(tx.trip.update).toHaveBeenCalledTimes(2);
      expect(tx.trip.update.mock.calls[0][0].data.distanceMiles).toBe(1.1);
    });

    it("leaves a manual trip alone", async () => {
      vi.mocked(prisma.trip.findFirst).mockResolvedValue({ ...EXISTING_TRIP, isManualEntry: true } as any);
      const tx = wireTrail(katyTrail, { ...EXISTING_TRIP, isManualEntry: true });
      await app.inject({
        method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
        payload: { ...MERGE_BODY, distanceMiles: 6.9 },
      });
      expect(tx.trip.update).toHaveBeenCalledTimes(2);
    });

    // Review of 14 Oct 2026: three trips whose figure is legitimately well over
    // their trail. The append must not touch any of them.
    it("leaves a late-start backfill alone (3.90 on a 2.40 trail)", async () => {
      const base = { ...EXISTING_TRIP, distanceMiles: 3.9, gpsQuality: { lateStartBackfill: { addedMiles: 1.5 } } };
      vi.mocked(prisma.trip.findFirst).mockResolvedValue(base as any);
      const tx = wireTrail(katyTrail, base);
      await app.inject({
        method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
        payload: { ...MERGE_BODY, distanceMiles: 3.9 },
      });
      expect(tx.trip.update).toHaveBeenCalledTimes(2);
      expect(tx.trip.update.mock.calls[0][0].data.distanceMiles).toBe(3.9);
    });

    it("leaves a driver-moved start alone (7.30 on a 3.30 trail)", async () => {
      const base = { ...EXISTING_TRIP, distanceMiles: 7.3, originalStartLat: 51.4, originalStartLng: -0.3 };
      vi.mocked(prisma.trip.findFirst).mockResolvedValue(base as any);
      const tx = wireTrail(katyTrail, base);
      await app.inject({
        method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
        payload: { ...MERGE_BODY, distanceMiles: 7.3 },
      });
      expect(tx.trip.update).toHaveBeenCalledTimes(2);
    });

    it("leaves a 30-mile map-matched drive plus merge alone (31.5 on a 20.68 trail)", async () => {
      // 20.68 miles of straight-line trail, and one 80 m-accuracy fix that the
      // merge put mid-trail, so the filter drops it but removes no distance.
      const long = Array.from({ length: 120 }, (_, i) => ({
        lat: 51.3 + (i * (20.68 / 69.09)) / 119,
        lng: -0.2,
        speed: 25 as number | null,
        accuracy: (i === 60 ? 80 : 5) as number | null,
        recordedAt: new Date(t0 + i * 30_000),
      }));
      const tx = wireTrail(long);
      await app.inject({
        method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth,
        payload: { ...MERGE_BODY, distanceMiles: 31.5 },
      });
      expect(tx.trip.update).toHaveBeenCalledTimes(2);
      expect(tx.trip.update.mock.calls[0][0].data.distanceMiles).toBe(31.5);
    });
  });
});
