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
      findFirst: vi.fn(),
    },
    trip: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    earning: { create: vi.fn() },
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
  vi.mocked(prisma.shift.findFirst).mockResolvedValue(null);
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
    expect(getShiftScorecard).toHaveBeenCalledWith(USER_ID, SHIFT_ID);
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

  it("answers a repeat of the same save with what was saved, writing nothing", async () => {
    vi.mocked(prisma.shift.findFirst).mockResolvedValue({ id: SHIFT_ID, userId: USER_ID } as never);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([{ id: "t1" }, { id: "t2" }] as never);
    const res = await app.inject({ method: "POST", url: "/shifts/past", payload: body(), headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ duplicate: true, data: { id: SHIFT_ID } });
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
