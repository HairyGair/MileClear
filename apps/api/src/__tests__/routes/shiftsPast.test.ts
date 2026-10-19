/**
 * POST /shifts/past (Oct 2026): a whole earlier shift added in one go.
 *
 * Pins what the route does: the shift is saved completed with the times
 * given, every trip is linked to it and saved as Business, the earning is
 * saved for the shift's period, all in one transaction; the rules shared
 * with the app refuse a bad window before anything is written; a repeat of
 * the same save answers with what was saved; and the same follow-up work as
 * an ended shift runs (mileage summary, scorecard, event).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    shift: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    trip: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    earning: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    vehicle: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../services/mileage.js", () => ({
  upsertMileageSummary: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/gamification.js", () => ({
  checkAndAwardAchievements: vi.fn().mockResolvedValue([]),
  getShiftScorecard: vi.fn().mockResolvedValue({ tripsCompleted: 2, totalMiles: 7.5 }),
}));
vi.mock("../../services/appEvents.js", () => ({
  logEvent: vi.fn(),
}));
vi.mock("../../services/routing.js", () => ({
  resolveRouteDistance: vi.fn().mockResolvedValue({ distanceMiles: 4.2, durationSecs: 600, source: "cache" }),
  routedDurationUsable: vi.fn().mockReturnValue(false),
}));
vi.mock("../../services/geocoding.js", () => ({
  reverseGeocode: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../services/userActivity.js", () => ({
  advanceLastTripAt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../jobs/notifications.js", () => ({
  sendMilestonePush: vi.fn().mockResolvedValue(undefined),
  sendAchievementPush: vi.fn().mockResolvedValue(undefined),
  sendShiftSummaryPush: vi.fn().mockResolvedValue(undefined),
}));

import { shiftRoutes } from "../../routes/shifts/index.js";
import { prisma } from "../../lib/prisma.js";
import { upsertMileageSummary } from "../../services/mileage.js";
import { getShiftScorecard } from "../../services/gamification.js";
import { resolveRouteDistance } from "../../services/routing.js";
import { logEvent } from "../../services/appEvents.js";
import { sendShiftSummaryPush } from "../../jobs/notifications.js";

const USER_ID = "00000000-0000-0000-0000-000000000021";
const SHIFT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
const VEHICLE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

const SHIFT_START = "2026-10-03T09:00:00.000Z";
const SHIFT_END = "2026-10-03T13:00:00.000Z";

function body(overrides: Record<string, unknown> = {}) {
  return {
    startedAt: SHIFT_START,
    endedAt: SHIFT_END,
    trips: [
      {
        startLat: 53.8, startLng: -1.55, endLat: 53.81, endLng: -1.56,
        startAddress: "Leeds", endAddress: "Headingley",
        distanceMiles: 3.3,
        startedAt: "2026-10-03T09:10:00.000Z", endedAt: "2026-10-03T09:30:00.000Z",
        platformTag: "deliveroo",
      },
      {
        startLat: 53.81, startLng: -1.56, endLat: 53.79, endLng: -1.54,
        startAddress: "Headingley", endAddress: "Leeds",
        startedAt: "2026-10-03T09:30:00.000Z", endedAt: "2026-10-03T09:50:00.000Z",
      },
    ],
    ...overrides,
  };
}

let tripSeq = 0;

function resetMocks() {
  vi.clearAllMocks();
  tripSeq = 0;
  vi.mocked(prisma.shift.findMany).mockResolvedValue([]);
  vi.mocked(prisma.earning.findFirst).mockResolvedValue(null);
  vi.mocked(resolveRouteDistance).mockResolvedValue({ distanceMiles: 4.2, durationSecs: 600, source: "cache" } as never);
  vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.vehicle.findMany).mockResolvedValue([]);
  vi.mocked(prisma.trip.findMany).mockResolvedValue([]);
  vi.mocked(prisma.shift.create).mockImplementation((async (args: { data: Record<string, unknown> }) => ({
    id: SHIFT_ID,
    ...args.data,
    vehicle: null,
  })) as never);
  vi.mocked(prisma.trip.create).mockImplementation((async (args: { data: Record<string, unknown> }) => ({
    id: `aaaaaaaa-aaaa-aaaa-aaaa-00000000000${++tripSeq}`,
    possibleDuplicateOfId: null,
    ...args.data,
  })) as never);
  vi.mocked(prisma.earning.create).mockImplementation((async (args: { data: Record<string, unknown> }) => ({
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    ...args.data,
  })) as never);
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);
}

async function createTestApp() {
  const app = await buildApp();
  await app.register(shiftRoutes, { prefix: "/shifts" });
  return app;
}

describe("POST /shifts/past", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  it("401 without a token", async () => {
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: body() });
    expect(res.statusCode).toBe(401);
  });

  it("saves a completed shift with every trip linked and marked Business", async () => {
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: body(), headers: auth });
    expect(res.statusCode).toBe(201);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const shiftData = vi.mocked(prisma.shift.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(shiftData).toMatchObject({ userId: USER_ID, status: "completed" });
    expect((shiftData.startedAt as Date).toISOString()).toBe(SHIFT_START);
    expect((shiftData.endedAt as Date).toISOString()).toBe(SHIFT_END);

    const tripCalls = vi.mocked(prisma.trip.create).mock.calls.map((c) => c[0].data as Record<string, unknown>);
    expect(tripCalls).toHaveLength(2);
    for (const t of tripCalls) {
      expect(t).toMatchObject({
        userId: USER_ID,
        shiftId: SHIFT_ID,
        classification: "business",
        isManualEntry: true,
        recordedBy: "added_by_hand",
      });
    }
    expect(tripCalls[0].platformTag).toBe("deliveroo");
    expect(tripCalls[1].platformTag).toBeNull();

    const json = res.json();
    expect(json.data.id).toBe(SHIFT_ID);
    expect(json.trips).toHaveLength(2);
    expect(json.earning).toBeNull();
    expect(json.scorecard).toEqual({ tripsCompleted: 2, totalMiles: 7.5 });
  });

  it("keeps the app's miles and works out the road miles when none were sent", async () => {
    await app.inject({ method: "POST", url: "/shifts/past", payload: body(), headers: auth });
    const tripCalls = vi.mocked(prisma.trip.create).mock.calls.map((c) => c[0].data as Record<string, unknown>);
    expect(tripCalls[0].distanceMiles).toBe(3.3);
    expect(tripCalls[1].distanceMiles).toBe(4.2);
    // The first routing call is the trip with no miles (route lines run after the save).
    expect(vi.mocked(resolveRouteDistance).mock.calls[0][0]).toMatchObject({ startLat: 53.81, endLat: 53.79 });
  });

  it("saves the earning for the shift's period", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/shifts/past",
      payload: body({ earning: { platform: "deliveroo", amountPence: 6450 } }),
      headers: auth,
    });
    expect(res.statusCode).toBe(201);
    const e = vi.mocked(prisma.earning.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(e).toMatchObject({ userId: USER_ID, platform: "deliveroo", amountPence: 6450, source: "manual" });
    expect((e.periodStart as Date).toISOString()).toBe(SHIFT_START);
    expect((e.periodEnd as Date).toISOString()).toBe(SHIFT_END);
    expect(res.json().earning.amountPence).toBe(6450);
  });

  it("runs the ended-shift work without a push and logs shift.past_added", async () => {
    await app.inject({ method: "POST", url: "/shifts/past", payload: body(), headers: auth });
    expect(upsertMileageSummary).toHaveBeenCalledWith(USER_ID, "2026-27");
    expect(getShiftScorecard).toHaveBeenCalledWith(USER_ID, SHIFT_ID, expect.objectContaining({ newAchievements: expect.any(Array) }));
    expect(sendShiftSummaryPush).not.toHaveBeenCalled();
    const added = vi.mocked(logEvent).mock.calls.find((c) => c[0] === "shift.past_added");
    expect(added?.[2]).toMatchObject({ tripCount: 2, hasEarning: false, durationSeconds: 4 * 3600 });
    const created = vi.mocked(logEvent).mock.calls.filter((c) => c[0] === "trip.created");
    expect(created).toHaveLength(2);
    expect(created[0][2]).toMatchObject({ source: "past_shift", isManualEntry: true });
  });

  it("400 when a trip sits outside the shift, and nothing is written", async () => {
    const b = body();
    (b.trips as Array<Record<string, unknown>>)[1].startedAt = "2026-10-03T13:30:00.000Z";
    (b.trips as Array<Record<string, unknown>>)[1].endedAt = "2026-10-03T13:45:00.000Z";
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: b, headers: auth });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Trip 2 is outside the shift's times.");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("400 when the shift ends before it starts", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/shifts/past",
      payload: body({ endedAt: "2026-10-03T08:00:00.000Z" }),
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("The shift has to end after it starts.");
  });

  it("400 for a shift in the future", async () => {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const res = await app.inject({
      method: "POST",
      url: "/shifts/past",
      payload: body({
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        trips: [{ startLat: 53.8, startLng: -1.55, endLat: 53.81, endLng: -1.56, startedAt: start.toISOString() }],
      }),
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("The shift can't end later than now.");
  });

  it("400 with no trips", async () => {
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: body({ trips: [] }), headers: auth });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Add at least one trip.");
  });

  it("404 for a car that is not the driver's", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/shifts/past",
      payload: body({ vehicleId: VEHICLE_ID }),
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({ where: { id: VEHICLE_ID, userId: USER_ID } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("uses the driver's car for the shift and every trip", async () => {
    vi.mocked(prisma.vehicle.findFirst).mockResolvedValue({ id: VEHICLE_ID, userId: USER_ID } as never);
    await app.inject({ method: "POST", url: "/shifts/past", payload: body({ vehicleId: VEHICLE_ID }), headers: auth });
    expect((vi.mocked(prisma.shift.create).mock.calls[0][0].data as Record<string, unknown>).vehicleId).toBe(VEHICLE_ID);
    for (const c of vi.mocked(prisma.trip.create).mock.calls) {
      expect((c[0].data as Record<string, unknown>).vehicleId).toBe(VEHICLE_ID);
    }
  });

  // ── An earlier save of the same hours ──────────────────────────────

  const SAVED_SHIFT = {
    id: SHIFT_ID,
    userId: USER_ID,
    status: "completed",
    startedAt: new Date(SHIFT_START),
    endedAt: new Date(SHIFT_END),
    vehicle: null,
  };
  const SAVED_TRIPS = [
    { id: "t1", startedAt: new Date("2026-10-03T09:10:00.000Z"), startLat: 53.8, startLng: -1.55 },
    { id: "t2", startedAt: new Date("2026-10-03T09:30:00.000Z"), startLat: 53.81, startLng: -1.56 },
  ];
  const SAVED_EARNING = { id: "e1", platform: "deliveroo", amountPence: 6450 };

  it("answers the same save sent again with what was saved, earning included, writing nothing", async () => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([SAVED_SHIFT] as never);
    vi.mocked(prisma.trip.findMany).mockResolvedValue(SAVED_TRIPS as never);
    vi.mocked(prisma.earning.findFirst).mockResolvedValue(SAVED_EARNING as never);
    const res = await app.inject({
      method: "POST",
      url: "/shifts/past",
      payload: body({ earning: { platform: "deliveroo", amountPence: 6450 } }),
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ duplicate: true, data: { id: SHIFT_ID }, earning: { id: "e1", amountPence: 6450 } });
    expect(res.json().trips).toHaveLength(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses, never merges, a different save over the same hours (a 4th trip and £40)", async () => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([SAVED_SHIFT] as never);
    vi.mocked(prisma.trip.findMany).mockResolvedValue(SAVED_TRIPS as never);
    const b = body({ earning: { platform: "deliveroo", amountPence: 4000 } });
    (b.trips as Array<Record<string, unknown>>).push({
      startLat: 53.79, startLng: -1.54, endLat: 53.8, endLng: -1.55,
      startedAt: "2026-10-03T10:00:00.000Z", endedAt: "2026-10-03T10:20:00.000Z",
    });
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: b, headers: auth });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/^You already have a shift from \d\d:\d\d to \d\d:\d\d on Sat 3 Oct\./);
    expect(res.json().existingShiftId).toBe(SHIFT_ID);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a past shift that overlaps one already saved, before any lookups", async () => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([
      { ...SAVED_SHIFT, startedAt: new Date("2026-10-03T08:10:00.000Z"), endedAt: new Date("2026-10-03T11:40:00.000Z") },
    ] as never);
    const b = body();
    delete (b.trips as Array<Record<string, unknown>>)[0].distanceMiles;
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: b, headers: auth });
    expect(res.statusCode).toBe(409);
    // 08:10 to 11:40 UTC is 09:10 to 12:40 in the UK on 3 Oct (BST).
    expect(res.json().error).toBe(
      "You already have a shift from 09:10 to 12:40 on Sat 3 Oct. Change this shift's times so they don't overlap it."
    );
    expect(resolveRouteDistance).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // Overlap means: starts before this one ends, and has not ended or ends after this one starts.
    const where = vi.mocked(prisma.shift.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where).toMatchObject({
      userId: USER_ID,
      startedAt: { lt: new Date(SHIFT_END) },
      OR: [{ endedAt: null }, { endedAt: { gt: new Date(SHIFT_START) } }],
    });
  });

  it("refuses a past shift that overlaps the shift running now", async () => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([
      { ...SAVED_SHIFT, status: "active", startedAt: new Date("2026-10-03T08:10:00.000Z"), endedAt: null },
    ] as never);
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: body(), headers: auth });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe(
      "You have a shift running now, started at 09:10 on Sat 3 Oct. End it first, or change this shift's times so they don't overlap it."
    );
  });

  // ── Other edges ────────────────────────────────────────────────────

  it("refreshes both tax years for a shift across 5 April", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/shifts/past",
      payload: body({
        startedAt: "2026-04-05T12:00:00.000Z",
        endedAt: "2026-04-06T11:00:00.000Z",
        trips: [
          { startLat: 53.8, startLng: -1.55, endLat: 53.81, endLng: -1.56, distanceMiles: 3,
            startedAt: "2026-04-05T13:00:00.000Z", endedAt: "2026-04-05T13:20:00.000Z" },
          { startLat: 53.81, startLng: -1.56, endLat: 53.8, endLng: -1.55, distanceMiles: 3,
            startedAt: "2026-04-06T10:00:00.000Z", endedAt: "2026-04-06T10:20:00.000Z" },
        ],
      }),
      headers: auth,
    });
    expect(res.statusCode).toBe(201);
    const years = vi.mocked(upsertMileageSummary).mock.calls.map((c) => c[1]);
    expect(years).toContain("2025-26");
    expect(years).toContain("2026-27");
  });

  it("lets the driver's next save through after one fails", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("database went away"));
    const first = await app.inject({ method: "POST", url: "/shifts/past", payload: body(), headers: auth });
    expect(first.statusCode).toBe(500);
    const second = await app.inject({ method: "POST", url: "/shifts/past", payload: body(), headers: auth });
    expect(second.statusCode).toBe(201);
  });

  it("gives a trip with no end one from its route, held inside the shift", async () => {
    const b = body();
    const trips = b.trips as Array<Record<string, unknown>>;
    trips.splice(1, 1);
    trips[0].startedAt = "2026-10-03T12:55:00.000Z";
    delete trips[0].endedAt;
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: b, headers: auth });
    expect(res.statusCode).toBe(201);
    const t = vi.mocked(prisma.trip.create).mock.calls[0][0].data as Record<string, unknown>;
    // 600 s of route from 12:55 would be 13:05; the shift ends at 13:00.
    expect((t.endedAt as Date).toISOString()).toBe(SHIFT_END);
  });

  it("refuses over 1,000 miles once the server has worked out the miles", async () => {
    vi.mocked(resolveRouteDistance).mockResolvedValue({ distanceMiles: 1001, durationSecs: 600, source: "cache" } as never);
    const b = body();
    (b.trips as Array<Record<string, unknown>>).splice(1, 1);
    delete (b.trips as Array<Record<string, unknown>>)[0].distanceMiles;
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: b, headers: auth });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("That's over 1,000 miles for one shift. Check where each trip started and ended.");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("marks a trip that doubles one already saved, leaving the shift's own trips out", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      // A sibling from this save: never compared.
      {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-000000000002",
        startedAt: new Date("2026-10-03T09:10:00.000Z"), endedAt: new Date("2026-10-03T09:30:00.000Z"),
        startLat: 53.8, startLng: -1.55, endLat: 53.81, endLng: -1.56, isManualEntry: true,
      },
      // A recording of the first trip already on file.
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        startedAt: new Date("2026-10-03T09:11:00.000Z"), endedAt: new Date("2026-10-03T09:29:00.000Z"),
        startLat: 53.8, startLng: -1.55, endLat: 53.81, endLng: -1.56, isManualEntry: false,
      },
    ] as never);
    // Prisma answers an update with the whole row.
    const rows = new Map<string, Record<string, unknown>>();
    const create = vi.mocked(prisma.trip.create).getMockImplementation()!;
    vi.mocked(prisma.trip.create).mockImplementation((async (args: never) => {
      const row = (await create(args)) as unknown as Record<string, unknown>;
      rows.set(row.id as string, row);
      return row;
    }) as never);
    vi.mocked(prisma.trip.update).mockImplementation((async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
      ...rows.get(args.where.id),
      ...args.data,
    })) as never);
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: body(), headers: auth });
    expect(res.statusCode).toBe(201);
    const updates = vi.mocked(prisma.trip.update).mock.calls;
    expect(updates[0][0]).toMatchObject({
      where: { id: "aaaaaaaa-aaaa-aaaa-aaaa-000000000001" },
      data: { possibleDuplicateOfId: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
    });
    expect(
      updates.some((u) => (u[0].data as Record<string, unknown>).possibleDuplicateOfId === "aaaaaaaa-aaaa-aaaa-aaaa-000000000002")
    ).toBe(false);
  });
});

// ── Just the totals (Lucian, 19 Oct 2026) ──────────────────────────────

describe("POST /shifts/past with just the totals", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  // Home to home: start and finish are the same place.
  const HOME = { lat: 53.8, lng: -1.55 };
  function totalsBody(totals: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
    return {
      startedAt: SHIFT_START,
      endedAt: SHIFT_END,
      totals: {
        startLat: HOME.lat, startLng: HOME.lng, endLat: HOME.lat, endLng: HOME.lng,
        startAddress: "Home", endAddress: "Home",
        distanceMiles: 84,
        drops: 32,
        platformTag: "deliveroo",
        ...totals,
      },
      ...extra,
    };
  }
  const post = (payload: unknown) => app.inject({ method: "POST", url: "/shifts/past", payload: payload as object, headers: auth });
  const tripData = () => vi.mocked(prisma.trip.create).mock.calls.map((c) => c[0].data as Record<string, unknown>);

  it("saves one Business trip across the whole shift, home to home, with exactly the typed miles", async () => {
    const res = await post(totalsBody());
    expect(res.statusCode).toBe(201);

    const trips = tripData();
    expect(trips).toHaveLength(1);
    const t = trips[0];
    expect(t).toMatchObject({
      userId: USER_ID,
      shiftId: SHIFT_ID,
      classification: "business",
      isManualEntry: true,
      isPhantomTrip: false,
      recordedBy: "added_by_hand",
      distanceMiles: 84,
      startLat: HOME.lat, startLng: HOME.lng, endLat: HOME.lat, endLng: HOME.lng,
      startAddress: "Home", endAddress: "Home",
      platformTag: "deliveroo",
      notes: "32 drops, total entered by you",
      gpsQuality: { distanceSource: "typed_total", drops: 32 },
    });
    expect((t.startedAt as Date).toISOString()).toBe(SHIFT_START);
    expect((t.endedAt as Date).toISOString()).toBe(SHIFT_END);

    const json = res.json();
    expect(json.trips).toHaveLength(1);
    expect(json.trips[0].distanceMiles).toBe(84);
  });

  it("never looks up a route, draws a route line or marks the total itself as a possible double", async () => {
    // A recording inside the shift that would match on time and place.
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        startedAt: new Date("2026-10-03T10:00:00.000Z"), endedAt: new Date("2026-10-03T10:20:00.000Z"),
        startLat: 53.8, startLng: -1.55, endLat: 53.81, endLng: -1.56, isManualEntry: false, distanceMiles: 3,
      },
    ] as never);
    const res = await post(totalsBody());
    expect(res.statusCode).toBe(201);
    // Let the fire-and-forget hooks run.
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveRouteDistance).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ distanceMiles: expect.anything() }) })
    );
    expect(prisma.trip.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ possibleDuplicateOfId: expect.anything() }) })
    );
    expect(prisma.trip.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ routePolyline: expect.anything() }) })
    );
  });

  it("keeps the typed miles even when every router is down (no straight-line stand-in)", async () => {
    vi.mocked(resolveRouteDistance).mockResolvedValue(null as never);
    const res = await post(totalsBody({ endLat: 53.9, endLng: -1.4, endAddress: "Wetherby", distanceMiles: 12.5 }));
    expect(res.statusCode).toBe(201);
    expect(tripData()[0].distanceMiles).toBe(12.5);
  });

  it("saves without drops, with a plain note", async () => {
    const b = totalsBody();
    delete (b.totals as Record<string, unknown>).drops;
    const res = await post(b);
    expect(res.statusCode).toBe(201);
    expect(tripData()[0]).toMatchObject({
      notes: "Shift total entered by you",
      gpsQuality: { distanceSource: "typed_total", drops: null },
    });
  });

  it("saves the earning and runs the ended-shift work, logging the totals", async () => {
    const res = await post(totalsBody({}, { earning: { platform: "deliveroo", amountPence: 9850 } }));
    expect(res.statusCode).toBe(201);
    expect(res.json().earning.amountPence).toBe(9850);
    expect(upsertMileageSummary).toHaveBeenCalledWith(USER_ID, "2026-27");
    expect(getShiftScorecard).toHaveBeenCalled();
    const added = vi.mocked(logEvent).mock.calls.find((c) => c[0] === "shift.past_added");
    expect(added?.[2]).toMatchObject({ tripCount: 1, totalMiles: 84, fromTotals: true, drops: 32, hasEarning: true });
    const created = vi.mocked(logEvent).mock.calls.find((c) => c[0] === "trip.created");
    expect(created?.[2]).toMatchObject({ source: "past_shift_totals", distanceMiles: 84 });
  });

  it.each([
    [{ distanceMiles: 0 }, "Add the total miles for the shift."],
    [{ distanceMiles: -4 }, "Add the total miles for the shift."],
    [{ distanceMiles: "lots" }, "Add the total miles for the shift."],
    [{ distanceMiles: 1000.5 }, "That's over 1,000 miles for one shift. Check the total miles."],
    [{ drops: 0 }, "The number of drops must be a whole number from 1 to 500."],
    [{ drops: 501 }, "The number of drops must be a whole number from 1 to 500."],
    [{ drops: 3.5 }, "The number of drops must be a whole number from 1 to 500."],
    [{ drops: "ten" }, "The number of drops must be a whole number from 1 to 500."],
  ])("400 for %o", async (patch, message) => {
    const res = await post(totalsBody(patch));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe(message);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("400 when the miles are missing", async () => {
    const b = totalsBody();
    delete (b.totals as Record<string, unknown>).distanceMiles;
    const res = await post(b);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Add the total miles for the shift.");
  });

  it("400 for trips and totals together", async () => {
    const res = await post({ ...body(), totals: totalsBody().totals });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Send the trips or the totals, not both.");
  });

  it("400 for neither trips nor totals", async () => {
    const res = await post({ startedAt: SHIFT_START, endedAt: SHIFT_END });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Add at least one trip.");
  });

  it("checks the shift's times by the same rules", async () => {
    const res = await post(totalsBody({}, { endedAt: "2026-10-03T08:00:00.000Z" }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("The shift has to end after it starts.");
  });

  it("refuses a total over hours another shift already covers", async () => {
    vi.mocked(prisma.shift.findMany).mockResolvedValue([
      {
        id: SHIFT_ID, userId: USER_ID, status: "completed", vehicle: null,
        startedAt: new Date("2026-10-03T08:10:00.000Z"), endedAt: new Date("2026-10-03T11:40:00.000Z"),
      },
    ] as never);
    const res = await post(totalsBody());
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe(
      "You already have a shift from 09:10 to 12:40 on Sat 3 Oct. Change this shift's times so they don't overlap it."
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe("the same hours saved before", () => {
    const SAVED_SHIFT = {
      id: SHIFT_ID, userId: USER_ID, status: "completed", vehicle: null,
      startedAt: new Date(SHIFT_START), endedAt: new Date(SHIFT_END),
    };
    const savedTotal = (miles: number) => [
      {
        id: "t1", startedAt: new Date(SHIFT_START), startLat: HOME.lat, startLng: HOME.lng, distanceMiles: miles,
        platformTag: "deliveroo", gpsQuality: { distanceSource: "typed_total", drops: 32 },
      },
    ];

    it("answers the same total sent again with what was saved", async () => {
      vi.mocked(prisma.shift.findMany).mockResolvedValue([SAVED_SHIFT] as never);
      vi.mocked(prisma.trip.findMany).mockResolvedValue(savedTotal(84) as never);
      const res = await post(totalsBody());
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ duplicate: true, data: { id: SHIFT_ID } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses a different total over the same hours", async () => {
      vi.mocked(prisma.shift.findMany).mockResolvedValue([SAVED_SHIFT] as never);
      vi.mocked(prisma.trip.findMany).mockResolvedValue(savedTotal(60) as never);
      const res = await post(totalsBody());
      expect(res.statusCode).toBe(409);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it("leaves today's trip-by-trip save exactly as it was (no note, no typed-total mark)", async () => {
    const res = await post(body());
    expect(res.statusCode).toBe(201);
    for (const t of tripData()) {
      expect(t).not.toHaveProperty("notes");
      expect(t).not.toHaveProperty("gpsQuality");
    }
    expect(tripData()[1].distanceMiles).toBe(4.2);
    const created = vi.mocked(logEvent).mock.calls.find((c) => c[0] === "trip.created");
    expect(created?.[2]).toMatchObject({ source: "past_shift" });
  });
});

describe("POST /shifts/past with totals: trips already in those hours", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    resetMocks();
    app = await createTestApp();
  });

  const HOME = { lat: 53.8, lng: -1.55 };
  const payload = (totals: Record<string, unknown> = {}) => ({
    startedAt: SHIFT_START,
    endedAt: SHIFT_END,
    totals: {
      startLat: HOME.lat, startLng: HOME.lng, endLat: HOME.lat, endLng: HOME.lng,
      distanceMiles: 84, drops: 32, platformTag: "deliveroo",
      ...totals,
    },
  });
  const trip = (id: string, start: string, end: string | null, miles: number, extra: Record<string, unknown> = {}) => ({
    id, startedAt: new Date(start), endedAt: end ? new Date(end) : null,
    startLat: 54.2, startLng: -1.2, endLat: 54.25, endLng: -1.1,
    isManualEntry: false, gpsQuality: null, distanceMiles: miles, ...extra,
  });

  it("marks every trip inside the shift as a possible double of the total, and says how many", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      trip("t1", "2026-10-03T09:30:00.000Z", "2026-10-03T09:50:00.000Z", 6.2),
      trip("t2", "2026-10-03T11:00:00.000Z", "2026-10-03T11:30:00.000Z", 15.7, { classification: "unclassified" }),
      trip("t3", "2026-10-03T12:00:00.000Z", null, 0.5),
      trip("out", "2026-10-03T12:50:00.000Z", "2026-10-03T13:10:00.000Z", 9), // runs past the end
      trip("tot", "2026-10-03T10:00:00.000Z", "2026-10-03T11:00:00.000Z", 40, { gpsQuality: { distanceSource: "typed_total" } }),
    ] as never);
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: payload(), headers: auth });
    expect(res.statusCode).toBe(201);
    expect(res.json().overlapping).toEqual({ trips: 3, miles: 22.4 });

    const mark = vi.mocked(prisma.trip.updateMany).mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(mark.where).toEqual({ userId: USER_ID, id: { in: ["t1", "t2", "t3"] } });
    expect(mark.data).toEqual({ possibleDuplicateOfId: "aaaaaaaa-aaaa-aaaa-aaaa-000000000001" });
    // Only trips in no shift, from the shift's hours.
    const where = vi.mocked(prisma.trip.findMany).mock.calls.at(-1)![0]!.where as Record<string, unknown>;
    // Personal trips are left unmarked.
    expect(where).toMatchObject({ userId: USER_ID, shiftId: null, isPhantomTrip: false, classification: { not: "personal" } });
  });

  it("reports none when the hours are clear", async () => {
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: payload(), headers: auth });
    expect(res.json().overlapping).toEqual({ trips: 0, miles: 0 });
    expect(prisma.trip.updateMany).not.toHaveBeenCalled();
  });

  it("trip by trip carries no overlapping figure", async () => {
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: body(), headers: auth });
    expect(res.json()).not.toHaveProperty("overlapping");
  });

  describe("the same hours saved before as a total", () => {
    const SAVED_SHIFT = {
      id: SHIFT_ID, userId: USER_ID, status: "completed", vehicle: null,
      startedAt: new Date(SHIFT_START), endedAt: new Date(SHIFT_END),
    };
    const saved = (extra: Record<string, unknown> = {}) => [{
      id: "t1", startedAt: new Date(SHIFT_START), startLat: HOME.lat, startLng: HOME.lng,
      distanceMiles: 84, platformTag: "deliveroo", gpsQuality: { distanceSource: "typed_total", drops: 32 }, ...extra,
    }];

    it.each([
      ["drops", { drops: 30 }],
      ["app", { platformTag: "uber" }],
      ["no drops", { drops: undefined }],
    ])("refuses a total with different %s, in words that say so", async (_label, change) => {
      vi.mocked(prisma.shift.findMany).mockResolvedValue([SAVED_SHIFT] as never);
      vi.mocked(prisma.trip.findMany).mockResolvedValue(saved() as never);
      const res = await app.inject({ method: "POST", url: "/shifts/past", payload: payload(change), headers: auth });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatch(/^You already saved a shift from \d\d:\d\d to \d\d:\d\d on Sat 3 Oct with different totals\. To change them, edit that shift's trip in Trips\.$/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("keeps the usual wording when the shift over those hours was saved trip by trip", async () => {
      vi.mocked(prisma.shift.findMany).mockResolvedValue([SAVED_SHIFT] as never);
      vi.mocked(prisma.trip.findMany).mockResolvedValue([
        { id: "t1", startedAt: new Date(SHIFT_START), startLat: HOME.lat, startLng: HOME.lng, distanceMiles: 4, platformTag: null, gpsQuality: null },
        { id: "t2", startedAt: new Date("2026-10-03T10:00:00.000Z"), startLat: HOME.lat, startLng: HOME.lng, distanceMiles: 5, platformTag: null, gpsQuality: null },
      ] as never);
      const res = await app.inject({ method: "POST", url: "/shifts/past", payload: payload(), headers: auth });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatch(/^You already have a shift from .* Change this shift's times so they don't overlap it\.$/);
    });

    it("answers the same total, drops and app included, with what was saved", async () => {
      vi.mocked(prisma.shift.findMany).mockResolvedValue([SAVED_SHIFT] as never);
      vi.mocked(prisma.trip.findMany).mockResolvedValue(saved() as never);
      const res = await app.inject({ method: "POST", url: "/shifts/past", payload: payload(), headers: auth });
      expect(res.statusCode).toBe(200);
      expect(res.json().duplicate).toBe(true);
    });
  });
});
