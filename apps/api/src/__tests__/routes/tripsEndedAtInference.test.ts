/**
 * POST /trips — deriving endedAt for manual entries.
 *
 * The web add-trip form had no end-time field at all and mobile's is optional,
 * so 11% of manual trips (152 of 1365 in the 30 days to 12 Aug 2026, across 25
 * users; 48% in June) were stored with endedAt NULL and silently dropped out of
 * every duration-derived figure: shift grades, earnings per hour, golden hours,
 * the weekly P&L. The route lookup the manual path already performs also
 * returns a drive time, which was being discarded.
 *
 * These tests pin the behaviour: fill the gap when the user left it empty,
 * never overwrite what they entered, never invent one without a real routed
 * duration, and record that the value is an estimate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    tripCoordinate: { createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    vehicle: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    shift: { findFirst: vi.fn().mockResolvedValue(null) },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../services/mileage.js", () => ({ upsertMileageSummary: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/gamification.js", () => ({ checkAndAwardAchievements: vi.fn().mockResolvedValue([]) }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/userActivity.js", () => ({ advanceLastTripAt: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/referral.js", () => ({ qualifyReferralOnFirstTrip: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../jobs/notifications.js", () => ({
  sendMilestonePush: vi.fn().mockResolvedValue(undefined),
  sendAchievementPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/apns.js", () => ({
  sendLiveActivityStartPush: vi.fn().mockResolvedValue(undefined),
  isApnsConfigured: vi.fn().mockReturnValue(false),
}));
// Keep the REAL routedDurationUsable — the plausibility gate is the part
// most worth exercising here — and stub only the network call.
vi.mock("../../services/routing.js", async (importActual) => ({
  ...(await importActual<typeof import("../../services/routing.js")>()),
  resolveRouteDistance: vi.fn(),
}));

import { tripRoutes } from "../../routes/trips/index.js";
import { prisma } from "../../lib/prisma.js";
import { resolveRouteDistance } from "../../services/routing.js";
import { logEvent } from "../../services/appEvents.js";

const USER_ID = "00000000-0000-0000-0000-00000000000a";
const TRIP_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const STARTED = "2026-08-12T09:00:00.000Z";

const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

/** A manual trip: real endpoints, no breadcrumbs. */
const manualPayload = (extra: Record<string, unknown> = {}) => ({
  startLat: 53.4, startLng: -2.9,
  endLat: 53.48, endLng: -2.24,
  startAddress: "Liverpool", endAddress: "Manchester",
  distanceMiles: 34.5,
  startedAt: STARTED,
  classification: "business",
  ...extra,
});

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

/** The fire-and-forget enrichment runs after the response; let it settle. */
const settle = () => new Promise((r) => setTimeout(r, 30));

describe("POST /trips — endedAt inference for manual entries", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.create).mockResolvedValue({
      id: TRIP_ID, userId: USER_ID, startedAt: new Date(STARTED), endedAt: null,
      distanceMiles: 34.5, isManualEntry: true, classification: "business",
    } as any);
    vi.mocked(prisma.trip.findUnique).mockResolvedValue({
      startedAt: new Date(STARTED), endedAt: null, distanceMiles: 34.5, gpsQuality: null,
    } as any);
    vi.mocked(resolveRouteDistance).mockResolvedValue({
      distanceMiles: 34.5, durationSecs: 2_700, source: "graphhopper",
      routeToHaversineRatio: 1.2, encodedPolyline: "poly",
    } as any);
    app = await createTestApp();
  });

  it("fills in an end time from the routed drive time when the user left it blank", async () => {
    const res = await app.inject({ method: "POST", url: "/trips", headers: auth, payload: manualPayload() });
    expect(res.statusCode).toBe(201);
    await settle();

    const update = vi.mocked(prisma.trip.update).mock.calls.find((c) => c[0].data.endedAt);
    expect(update).toBeDefined();
    // 09:00 + 45 min routed drive time.
    expect((update![0].data.endedAt as Date).toISOString()).toBe("2026-08-12T09:45:00.000Z");
  });

  it("labels the value as an estimate rather than passing it off as measured", async () => {
    await app.inject({ method: "POST", url: "/trips", headers: auth, payload: manualPayload() });
    await settle();

    const update = vi.mocked(prisma.trip.update).mock.calls.find((c) => c[0].data.endedAt);
    expect(update![0].data.gpsQuality).toMatchObject({
      endedAtSource: "routed_duration",
      endedAtDurationSecs: 2_700,
    });
    expect(logEvent).toHaveBeenCalledWith("trip.ended_at_inferred", USER_ID, expect.objectContaining({ durationSecs: 2_700 }));
  });

  it("never overwrites an end time the user actually entered", async () => {
    vi.mocked(prisma.trip.findUnique).mockResolvedValue({
      startedAt: new Date(STARTED), endedAt: new Date("2026-08-12T11:30:00.000Z"),
      distanceMiles: 34.5, gpsQuality: null,
    } as any);

    await app.inject({
      method: "POST", url: "/trips", headers: auth,
      payload: manualPayload({ endedAt: "2026-08-12T11:30:00.000Z" }),
    });
    await settle();

    const touched = vi.mocked(prisma.trip.update).mock.calls.some((c) => c[0].data.endedAt);
    expect(touched).toBe(false);
    expect(logEvent).not.toHaveBeenCalledWith("trip.ended_at_inferred", expect.anything(), expect.anything());
  });

  it("leaves endedAt null rather than inventing one when routing gives no duration", async () => {
    vi.mocked(resolveRouteDistance).mockResolvedValue({
      distanceMiles: 34.5, durationSecs: 0, source: "cache",
      routeToHaversineRatio: 1.2, encodedPolyline: "poly",
    } as any);

    await app.inject({ method: "POST", url: "/trips", headers: auth, payload: manualPayload() });
    await settle();

    const touched = vi.mocked(prisma.trip.update).mock.calls.some((c) => c[0].data.endedAt);
    expect(touched).toBe(false);
  });

  it("refuses to time a round trip logged as one row", async () => {
    // Stored 34.5mi but the route out is only 17mi: the user logged there and
    // back, so the one-way drive time would halve their apparent time.
    vi.mocked(resolveRouteDistance).mockResolvedValue({
      distanceMiles: 17, durationSecs: 1_400, source: "graphhopper",
      routeToHaversineRatio: 1.2, encodedPolyline: "poly",
    } as any);

    await app.inject({ method: "POST", url: "/trips", headers: auth, payload: manualPayload() });
    await settle();

    const touched = vi.mocked(prisma.trip.update).mock.calls.some((c) => c[0].data.endedAt);
    expect(touched).toBe(false);
  });

  it("still stores the route geometry when it fills the end time in", async () => {
    await app.inject({ method: "POST", url: "/trips", headers: auth, payload: manualPayload() });
    await settle();

    const update = vi.mocked(prisma.trip.update).mock.calls.find((c) => c[0].data.endedAt);
    expect(update![0].data.routePolyline).toBe("poly");
  });
});
