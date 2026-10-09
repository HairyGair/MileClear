/**
 * Running odometer routes (9 Oct 2026): per-vehicle figure and readings,
 * recording and deleting a reading, the daily log, the vehicle list field
 * and the Odometer log CSV. Prisma is mocked: nothing touches a database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    vehicle: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    odometerReading: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    fuelLog: { findMany: vi.fn() },
    trip: { findMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
// Premium gate passes here; entitlement is not what this suite tests.
vi.mock("../../middleware/premium.js", () => ({
  premiumMiddleware: vi.fn(async () => {}),
}));
vi.mock("../../services/export.js", () => ({
  generateTripsCsv: vi.fn(),
  generateTripsPdf: vi.fn(),
  generateSelfAssessmentPdf: vi.fn(),
  formatXeroExpense: vi.fn(),
  formatFreeAgentExpense: vi.fn(),
  formatQuickBooksExpense: vi.fn(),
}));

import { vehicleRoutes } from "../../routes/vehicles/index.js";
import { odometerRoutes } from "../../routes/odometer/index.js";
import { exportRoutes } from "../../routes/exports/index.js";
import { prisma } from "../../lib/prisma.js";
import { premiumMiddleware } from "../../middleware/premium.js";

const USER_ID = "00000000-0000-0000-0000-0000000000a1";
const VEHICLE_ID = "00000000-0000-0000-0000-0000000000b1";
const OTHER_VEHICLE_ID = "00000000-0000-0000-0000-0000000000b2";
const READING_ID = "00000000-0000-0000-0000-0000000000c1";
let auth: { authorization: string };

async function createTestApp() {
  const app = await buildApp();
  await app.register(vehicleRoutes, { prefix: "/vehicles" });
  await app.register(odometerRoutes, { prefix: "/odometer" });
  await app.register(exportRoutes, { prefix: "/exports" });
  return app;
}

const vehicleRow = {
  id: VEHICLE_ID,
  userId: USER_ID,
  make: "Ford",
  model: "Focus",
  registrationPlate: "AB12CDE",
  isPrimary: true,
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

function mockData(opts: {
  readings?: Array<{ id: string; readingMiles: number; readAt: string }>;
  fuel?: Array<{ id: string; vehicleId: string | null; odometerReading: number; loggedAt: string }>;
  trips?: Array<{
    id: string;
    vehicleId: string | null;
    startedAt: string;
    distanceMiles: number;
    classification?: string;
  }>;
}) {
  vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(vehicleRow as never);
  vi.mocked(prisma.vehicle.findMany).mockResolvedValue([vehicleRow] as never);
  vi.mocked(prisma.odometerReading.findMany).mockResolvedValue(
    (opts.readings ?? []).map((r) => ({
      ...r,
      vehicleId: VEHICLE_ID,
      readAt: new Date(r.readAt),
      createdAt: new Date(r.readAt),
    })) as never
  );
  vi.mocked(prisma.fuelLog.findMany).mockResolvedValue(
    (opts.fuel ?? []).map((f) => ({ ...f, loggedAt: new Date(f.loggedAt) })) as never
  );
  vi.mocked(prisma.trip.findMany).mockResolvedValue(
    (opts.trips ?? []).map((t) => ({
      classification: "business",
      odometerStart: null,
      odometerEnd: null,
      ...t,
      startedAt: new Date(t.startedAt),
    })) as never
  );
  vi.mocked(prisma.trip.count).mockResolvedValue(0 as never);
}

describe("odometer routes", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(premiumMiddleware).mockImplementation((async () => {}) as never);
    // Fixed "now" so the readings below are never in the future.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
    auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };
    app = await createTestApp();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("auth", () => {
    it("rejects every endpoint without a token", async () => {
      for (const [method, url] of [
        ["GET", `/vehicles/${VEHICLE_ID}/odometer`],
        ["POST", `/vehicles/${VEHICLE_ID}/odometer-readings`],
        ["DELETE", `/vehicles/${VEHICLE_ID}/odometer-readings/${READING_ID}`],
        ["GET", "/odometer/days?from=2026-10-01&to=2026-10-09"],
        ["GET", "/exports/odometer-log?from=2026-10-01&to=2026-10-09"],
      ] as const) {
        const res = await app.inject({ method, url });
        expect(res.statusCode, `${method} ${url}`).toBe(401);
      }
    });
  });

  describe("GET /vehicles/:id/odometer", () => {
    it("returns the running figure with its basis and the readings, newest first", async () => {
      mockData({
        readings: [{ id: READING_ID, readingMiles: 45100, readAt: "2026-10-09T06:30:00Z" }],
        trips: [
          { id: "t1", vehicleId: VEHICLE_ID, startedAt: "2026-10-09T07:00:00Z", distanceMiles: 30.2 },
          // No vehicle: counts towards the default (primary) vehicle.
          { id: "t2", vehicleId: null, startedAt: "2026-10-09T11:00:00Z", distanceMiles: 5 },
          // Before the reading: already in it.
          { id: "t0", vehicleId: VEHICLE_ID, startedAt: "2026-10-08T07:00:00Z", distanceMiles: 99 },
        ],
      });

      const res = await app.inject({ method: "GET", url: `/vehicles/${VEHICLE_ID}/odometer`, headers: auth });
      expect(res.statusCode).toBe(200);
      const { data } = res.json();
      expect(data.current.miles).toBeCloseTo(45135.2, 6);
      expect(data.current.isEstimated).toBe(true);
      expect(data.current.tripMilesSince).toBeCloseTo(35.2, 6);
      expect(data.current.basis).toEqual({
        readingMiles: 45100,
        readAt: "2026-10-09T06:30:00.000Z",
        source: "user",
        sourceId: READING_ID,
      });
      expect(data.readings).toEqual([
        {
          id: READING_ID,
          readingMiles: 45100,
          readAt: "2026-10-09T06:30:00.000Z",
          source: "user",
          sourceId: READING_ID,
          used: true,
          rejectReason: null,
        },
      ]);
    });

    it("counts a fuel log with no vehicle towards the default vehicle and rejects a typo", async () => {
      mockData({
        readings: [{ id: READING_ID, readingMiles: 45100, readAt: "2026-10-09T06:30:00Z" }],
        fuel: [
          { id: "f1", vehicleId: null, odometerReading: 45300, loggedAt: "2026-10-10T10:00:00Z" },
          { id: "f2", vehicleId: VEHICLE_ID, odometerReading: 4530, loggedAt: "2026-10-11T10:00:00Z" },
        ],
      });
      const res = await app.inject({ method: "GET", url: `/vehicles/${VEHICLE_ID}/odometer`, headers: auth });
      const { data } = res.json();
      expect(data.current.miles).toBe(45300);
      expect(data.current.isEstimated).toBe(false);
      expect(data.current.basis.source).toBe("fuel");
      const bad = data.readings.find((r: { id: string }) => r.id === "f2");
      expect(bad.used).toBe(false);
      expect(bad.rejectReason).toMatch(/^Lower than your reading of 45,300 on /);
    });

    it("is null with no readings", async () => {
      mockData({ trips: [{ id: "t1", vehicleId: VEHICLE_ID, startedAt: "2026-10-09T07:00:00Z", distanceMiles: 3 }] });
      const res = await app.inject({ method: "GET", url: `/vehicles/${VEHICLE_ID}/odometer`, headers: auth });
      expect(res.json().data).toEqual({ current: null, readings: [] });
    });

    it("404s for a vehicle that is not the user's, and scopes the lookup to the user", async () => {
      vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(null as never);
      const res = await app.inject({ method: "GET", url: `/vehicles/${OTHER_VEHICLE_ID}/odometer`, headers: auth });
      expect(res.statusCode).toBe(404);
      expect(vi.mocked(prisma.vehicle.findFirst).mock.calls[0][0]).toMatchObject({
        where: { id: OTHER_VEHICLE_ID, userId: USER_ID },
      });
    });

    it("scopes every data query to the user", async () => {
      mockData({});
      await app.inject({ method: "GET", url: `/vehicles/${VEHICLE_ID}/odometer`, headers: auth });
      expect(vi.mocked(prisma.odometerReading.findMany).mock.calls[0][0]).toMatchObject({ where: { userId: USER_ID } });
      expect(vi.mocked(prisma.fuelLog.findMany).mock.calls[0][0]).toMatchObject({ where: { userId: USER_ID } });
      expect(vi.mocked(prisma.trip.findMany).mock.calls[0][0]).toMatchObject({
        where: { userId: USER_ID, endedAt: { not: null }, isPhantomTrip: false },
      });
    });
  });

  describe("POST /vehicles/:id/odometer-readings", () => {
    const post = (body: unknown) =>
      app.inject({
        method: "POST",
        url: `/vehicles/${VEHICLE_ID}/odometer-readings`,
        headers: auth,
        payload: body as object,
      });

    beforeEach(() => {
      vi.mocked(prisma.odometerReading.create).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
        id: READING_ID,
        createdAt: new Date(),
        ...data,
      })) as never);
    });

    it("saves the first reading and returns the new figure", async () => {
      mockData({});
      const res = await post({ readingMiles: 45100 });
      expect(res.statusCode).toBe(201);
      const { data } = res.json();
      expect(data.reading).toMatchObject({ id: READING_ID, vehicleId: VEHICLE_ID, readingMiles: 45100, source: "user" });
      expect(data.estimatedMiles).toBeNull();
      expect(data.current).toMatchObject({ miles: 45100, isEstimated: false });
      expect(vi.mocked(prisma.odometerReading.create).mock.calls[0][0].data).toMatchObject({
        userId: USER_ID,
        vehicleId: VEHICLE_ID,
        readingMiles: 45100,
        source: "user",
      });
    });

    it("tells the app what the trips said, so it can show the difference", async () => {
      mockData({
        readings: [{ id: "r0", readingMiles: 45100, readAt: "2026-10-09T06:30:00Z" }],
        trips: [{ id: "t1", vehicleId: VEHICLE_ID, startedAt: "2026-10-09T07:00:00Z", distanceMiles: 38.2 }],
      });
      const res = await post({ readingMiles: 45146, readAt: "2026-10-09T17:00:00Z" });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.estimatedMiles).toBeCloseTo(45138.2, 6);
      expect(res.json().data.current).toMatchObject({ miles: 45146, isEstimated: false });
    });

    it("blocks a reading lower than an earlier one with 409 LOWER_THAN_EARLIER", async () => {
      mockData({ readings: [{ id: "r0", readingMiles: 45100, readAt: "2026-10-08T17:40:00Z" }] });
      const res = await post({ readingMiles: 45000 });
      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.code).toBe("LOWER_THAN_EARLIER");
      expect(body.earlier).toMatchObject({ id: "r0", readingMiles: 45100, source: "user" });
      expect(prisma.odometerReading.create).not.toHaveBeenCalled();
    });

    it("allows a reading equal to the earlier one, and one lower than the estimate", async () => {
      mockData({
        readings: [{ id: "r0", readingMiles: 45100, readAt: "2026-10-08T17:40:00Z" }],
        trips: [{ id: "t1", vehicleId: VEHICLE_ID, startedAt: "2026-10-09T07:00:00Z", distanceMiles: 20 }],
      });
      expect((await post({ readingMiles: 45100 })).statusCode).toBe(201);
      expect((await post({ readingMiles: 45108 })).statusCode).toBe(201);
    });

    it("checks against the reading that applied at the chosen time, not the latest one", async () => {
      mockData({
        readings: [
          { id: "r0", readingMiles: 45100, readAt: "2026-10-08T17:40:00Z" },
          { id: "r1", readingMiles: 45300, readAt: "2026-10-10T17:40:00Z" },
        ],
      });
      // 45200 on the 9th sits between the two: higher than 45100, so fine.
      expect((await post({ readingMiles: 45200, readAt: "2026-10-09T10:00:00Z" })).statusCode).toBe(201);
      // 45050 on the 9th is lower than the 45100 before it.
      expect((await post({ readingMiles: 45050, readAt: "2026-10-09T10:00:00Z" })).statusCode).toBe(409);
    });

    it("blocks a backdated reading higher than a typed reading taken later with 409 HIGHER_THAN_LATER", async () => {
      mockData({ readings: [{ id: "r1", readingMiles: 45300, readAt: "2026-10-10T17:40:00Z" }] });
      const res = await post({ readingMiles: 45400, readAt: "2026-10-09T10:00:00Z" });
      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.code).toBe("HIGHER_THAN_LATER");
      expect(body.error).toBe(
        "That's higher than your reading of 45,300 on Sat 10 Oct, which was taken later. Check the reading or the time."
      );
      expect(body.later).toMatchObject({ id: "r1", readingMiles: 45300, source: "user" });
      expect(prisma.odometerReading.create).not.toHaveBeenCalled();
    });

    it("refuses a future time", async () => {
      mockData({});
      const res = await post({ readingMiles: 45100, readAt: new Date(Date.now() + 3600_000).toISOString() });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("That time hasn't happened yet.");
    });

    it("treats a phone clock a few seconds ahead as now", async () => {
      mockData({});
      const res = await post({ readingMiles: 45100, readAt: new Date(Date.now() + 30_000).toISOString() });
      expect(res.statusCode).toBe(201);
      const savedAt = vi.mocked(prisma.odometerReading.create).mock.calls[0][0].data.readAt as Date;
      expect(savedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("refuses a time more than a year before the vehicle existed", async () => {
      mockData({});
      const res = await post({ readingMiles: 45100, readAt: "2024-01-01T00:00:00Z" });
      expect(res.statusCode).toBe(400);
    });

    it.each([
      [{}, "Type the reading from your dashboard."],
      [{ readingMiles: 0 }, "That doesn't look like an odometer reading. Check it and try again."],
      [{ readingMiles: -5 }, "That doesn't look like an odometer reading. Check it and try again."],
      [{ readingMiles: 1000000 }, "That doesn't look like an odometer reading. Check it and try again."],
      [{ readingMiles: "45100" }, "That doesn't look like an odometer reading. Check it and try again."],
    ])("rejects %j", async (body, message) => {
      mockData({});
      const res = await post(body);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe(message);
      expect(prisma.odometerReading.create).not.toHaveBeenCalled();
    });

    it("accepts the 999,999 ceiling and keeps tenths", async () => {
      mockData({});
      expect((await post({ readingMiles: 999999 })).statusCode).toBe(201);
      const res = await post({ readingMiles: 45100.46 });
      expect(res.json().data.reading.readingMiles).toBe(45100.5);
    });

    it("404s for someone else's vehicle", async () => {
      vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(null as never);
      const res = await post({ readingMiles: 45100 });
      expect(res.statusCode).toBe(404);
      expect(prisma.odometerReading.create).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /vehicles/:id/odometer-readings/:readingId", () => {
    it("deletes the user's own reading", async () => {
      vi.mocked(prisma.odometerReading.findFirst).mockResolvedValue({ id: READING_ID } as never);
      vi.mocked(prisma.odometerReading.delete).mockResolvedValue({} as never);
      const res = await app.inject({
        method: "DELETE",
        url: `/vehicles/${VEHICLE_ID}/odometer-readings/${READING_ID}`,
        headers: auth,
      });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(prisma.odometerReading.findFirst).mock.calls[0][0]).toMatchObject({
        where: { id: READING_ID, vehicleId: VEHICLE_ID, userId: USER_ID },
      });
      expect(prisma.odometerReading.delete).toHaveBeenCalledWith({ where: { id: READING_ID } });
    });

    it("404s for a reading that is not theirs", async () => {
      vi.mocked(prisma.odometerReading.findFirst).mockResolvedValue(null as never);
      const res = await app.inject({
        method: "DELETE",
        url: `/vehicles/${VEHICLE_ID}/odometer-readings/${READING_ID}`,
        headers: auth,
      });
      expect(res.statusCode).toBe(404);
      expect(prisma.odometerReading.delete).not.toHaveBeenCalled();
    });
  });

  describe("GET /odometer/days", () => {
    const scenario = () =>
      mockData({
        readings: [
          { id: "r1", readingMiles: 45100, readAt: "2026-10-09T06:30:00Z" },
          { id: "r2", readingMiles: 45146, readAt: "2026-10-09T17:00:00Z" },
        ],
        trips: [
          { id: "t1", vehicleId: VEHICLE_ID, startedAt: "2026-10-09T07:00:00Z", distanceMiles: 30.2 },
          { id: "t2", vehicleId: null, startedAt: "2026-10-09T11:00:00Z", distanceMiles: 5, classification: "personal" },
          { id: "t3", vehicleId: VEHICLE_ID, startedAt: "2026-10-09T14:00:00Z", distanceMiles: 3, classification: "unclassified" },
          { id: "t4", vehicleId: VEHICLE_ID, startedAt: "2026-10-10T08:00:00Z", distanceMiles: 20 },
        ],
      });

    it("returns day objects newest first with the vehicle on each", async () => {
      scenario();
      const res = await app.inject({
        method: "GET",
        url: `/odometer/days?vehicleId=${VEHICLE_ID}&from=2026-10-01&to=2026-10-31`,
        headers: auth,
      });
      expect(res.statusCode).toBe(200);
      const days = res.json().data;
      expect(days.map((d: { date: string }) => d.date)).toEqual(["2026-10-10", "2026-10-09"]);
      expect(days[0]).toMatchObject({
        vehicleId: VEHICLE_ID,
        date: "2026-10-10",
        opening: 45146,
        openingRecorded: true,
        closing: 45166,
        closingRecorded: false,
        businessMiles: 20,
        tripCount: 1,
      });
      expect(days[1]).toMatchObject({
        date: "2026-10-09",
        opening: 45100,
        openingRecorded: true,
        closing: 45146,
        closingRecorded: true,
        personalMiles: 5,
        notSortedMiles: 3,
        tripCount: 3,
      });
      expect(days[1].businessMiles).toBeCloseTo(30.2, 6);
      expect(days[1].difference).toBeCloseTo(7.8, 6);
      expect(Object.keys(days[1]).sort()).toEqual(
        [
          "businessMiles", "closing", "closingRecorded", "date", "difference", "notSortedMiles",
          "opening", "openingDifference", "openingRecorded", "personalMiles", "tripCount", "vehicleId",
        ].sort()
      );
    });

    it("defaults to every vehicle of the user when vehicleId is left out", async () => {
      scenario();
      const res = await app.inject({ method: "GET", url: "/odometer/days?from=2026-10-09&to=2026-10-09", headers: auth });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
      expect(vi.mocked(prisma.vehicle.findMany).mock.calls[0][0]).toMatchObject({ where: { userId: USER_ID } });
    });

    it("limits the range to the dates asked for without changing the figures", async () => {
      scenario();
      const res = await app.inject({
        method: "GET",
        url: `/odometer/days?vehicleId=${VEHICLE_ID}&from=2026-10-10&to=2026-10-10`,
        headers: auth,
      });
      expect(res.json().data).toHaveLength(1);
      expect(res.json().data[0].opening).toBe(45146);
    });

    it("accepts exactly 366 days and refuses 367", async () => {
      scenario();
      const ok = await app.inject({ method: "GET", url: "/odometer/days?from=2025-10-10&to=2026-10-10", headers: auth });
      expect(ok.statusCode).toBe(200);
      const tooMany = await app.inject({ method: "GET", url: "/odometer/days?from=2025-10-09&to=2026-10-10", headers: auth });
      expect(tooMany.statusCode).toBe(400);
    });

    it.each([
      "/odometer/days",
      "/odometer/days?from=2026-10-01",
      "/odometer/days?from=09-10-2026&to=10-10-2026",
      "/odometer/days?from=2026-10-10&to=2026-10-01",
      "/odometer/days?from=2026-13-40&to=2026-13-41",
    ])("rejects %s", async (url) => {
      const res = await app.inject({ method: "GET", url, headers: auth });
      expect(res.statusCode).toBe(400);
    });

    it("404s for another user's vehicle", async () => {
      vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(null as never);
      const res = await app.inject({
        method: "GET",
        url: `/odometer/days?vehicleId=${OTHER_VEHICLE_ID}&from=2026-10-01&to=2026-10-09`,
        headers: auth,
      });
      expect(res.statusCode).toBe(404);
      expect(vi.mocked(prisma.vehicle.findFirst).mock.calls[0][0]).toMatchObject({
        where: { id: OTHER_VEHICLE_ID, userId: USER_ID },
      });
    });

    it("returns an empty list for a driver with no vehicles", async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValue([] as never);
      const res = await app.inject({ method: "GET", url: "/odometer/days?from=2026-10-01&to=2026-10-09", headers: auth });
      expect(res.json()).toEqual({ data: [] });
    });
  });

  describe("GET /vehicles (odometer field)", () => {
    it("adds odometer to each vehicle, null when there is no reading", async () => {
      mockData({
        readings: [{ id: "r1", readingMiles: 45100, readAt: "2026-10-09T06:30:00Z" }],
        trips: [{ id: "t1", vehicleId: VEHICLE_ID, startedAt: "2026-10-09T07:00:00Z", distanceMiles: 12 }],
      });
      vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
        { ...vehicleRow, fuelType: "petrol", vehicleType: "car" },
        { ...vehicleRow, id: OTHER_VEHICLE_ID, isPrimary: false, fuelType: "diesel", vehicleType: "van" },
      ] as never);
      const res = await app.inject({ method: "GET", url: "/vehicles", headers: auth });
      expect(res.statusCode).toBe(200);
      const [a, b] = res.json().data;
      expect(a.odometer).toEqual({ miles: 45112, isEstimated: true });
      expect(b.odometer).toBeNull();
    });

    it("reads no trips for a driver who has never used the odometer", async () => {
      mockData({});
      vi.mocked(prisma.vehicle.findMany).mockResolvedValue([{ ...vehicleRow, fuelType: "petrol", vehicleType: "car" }] as never);
      const res = await app.inject({ method: "GET", url: "/vehicles", headers: auth });
      expect(res.json().data[0].odometer).toBeNull();
      expect(prisma.trip.findMany).not.toHaveBeenCalled();
    });

    it("still lists vehicles if the odometer lookup fails", async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValue([{ ...vehicleRow, fuelType: "petrol", vehicleType: "car" }] as never);
      vi.mocked(prisma.odometerReading.findMany).mockRejectedValue(new Error("db down") as never);
      const res = await app.inject({ method: "GET", url: "/vehicles", headers: auth });
      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].odometer).toBeNull();
    });
  });

  describe("GET /exports/odometer-log", () => {
    const setup = () =>
      mockData({
        readings: [
          { id: "r1", readingMiles: 45100, readAt: "2026-10-09T06:30:00Z" },
          { id: "r2", readingMiles: 45146, readAt: "2026-10-09T17:00:00Z" },
        ],
        trips: [{ id: "t1", vehicleId: null, startedAt: "2026-10-09T07:00:00Z", distanceMiles: 38.2 }],
      });

    it("downloads one CSV row per day with the readings and the difference", async () => {
      setup();
      const res = await app.inject({
        method: "GET",
        url: "/exports/odometer-log?from=2026-10-01&to=2026-10-09",
        headers: auth,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain(
        'filename="mileclear-odometer-log-2026-10-01-to-2026-10-09.csv"'
      );
      const lines = res.body.trim().split("\r\n");
      expect(lines[0]).toBe(
        "Date,Vehicle,Registration,Odometer start,Start source,Odometer end,End source,Business miles,Personal miles,Not sorted miles,Difference from readings (miles)"
      );
      expect(lines).toHaveLength(2);
      expect(lines[1]).toBe("09/10/2026,Ford Focus,AB12CDE,45100,Recorded,45146,Recorded,38.2,0,0,7.8");
    });

    it("takes a tax year", async () => {
      setup();
      const res = await app.inject({ method: "GET", url: "/exports/odometer-log?taxYear=2026-27", headers: auth });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-disposition"]).toContain("mileclear-odometer-log-2026-04-06-to-2027-04-05.csv");
    });

    it("refuses a blank document", async () => {
      mockData({});
      const res = await app.inject({
        method: "GET",
        url: "/exports/odometer-log?from=2026-10-01&to=2026-10-09",
        headers: auth,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/empty/);
    });

    it("rejects a missing or oversized range", async () => {
      expect((await app.inject({ method: "GET", url: "/exports/odometer-log", headers: auth })).statusCode).toBe(400);
      const big = await app.inject({
        method: "GET",
        url: "/exports/odometer-log?from=2024-01-01&to=2026-10-09",
        headers: auth,
      });
      expect(big.statusCode).toBe(400);
    });

    it("404s for another user's vehicle", async () => {
      vi.mocked(prisma.vehicle.findMany).mockResolvedValue([vehicleRow] as never);
      vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(null as never);
      const res = await app.inject({
        method: "GET",
        url: `/exports/odometer-log?vehicleId=${OTHER_VEHICLE_ID}&from=2026-10-01&to=2026-10-09`,
        headers: auth,
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
