/**
 * PATCH /trips/:id with only the phone's Directions note
 * ({ gpsQuality: { directions } }, PLAN-recording.md): one key set atomically
 * in the database (MySQL JSON_SET), scoped to the driver's own trip, held to
 * size, counted, and nothing else: no read-modify-write of gpsQuality (which
 * could drop an append's appendOutlierCut), no mileage summary, no
 * achievements, no trip.updated.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => {
  const trip = {
    create: vi.fn(),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };
  const prisma: Record<string, unknown> = {
    trip,
    tripCoordinate: { createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    savedLocation: { findMany: vi.fn().mockResolvedValue([]) },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  prisma.$transaction = vi.fn(async (fn: (t: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("../../services/mileage.js", () => ({ upsertMileageSummary: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/gamification.js", () => ({ checkAndAwardAchievements: vi.fn().mockResolvedValue([]) }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));

import { tripRoutes } from "../../routes/trips/index.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { upsertMileageSummary } from "../../services/mileage.js";
import { checkAndAwardAchievements } from "../../services/gamification.js";

const USER_ID = "00000000-0000-0000-0000-00000000000a";
const TRIP_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

const directions = {
  sessionId: "dir_1",
  mode: "log",
  destination: { savedPlace: true, savedType: "depot", hasName: true },
  wouldFill: { miles: 4.2, gapCount: 1, gaps: [{ fromMs: 1, toMs: 2, miles: 4.2, crowMiles: 4, points: 68 }] },
  wouldName: { use: true, source: "saved", reason: null, metresBucket: "0-50" },
};

async function app() {
  const a = await buildApp();
  await a.register(tripRoutes, { prefix: "/trips" });
  return a;
}

/** The SQL text and bound values of the one raw write. */
function rawWrite() {
  const call = vi.mocked(prisma.$executeRaw).mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
  return { sql: call[0].join("?"), values: call.slice(1) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never);
});

describe("PATCH /trips/:id with only { gpsQuality: { directions } }", () => {
  it("sets only $.directions, atomically, on the driver's own trip", async () => {
    const a = await app();
    const res = await a.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: { gpsQuality: { directions } } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { id: TRIP_ID, directionsNoted: true } });

    const { sql, values } = rawWrite();
    expect(sql).toMatch(/UPDATE trips\s+SET gpsQuality = JSON_SET\(/);
    expect(sql).toContain("'$.directions', CAST(? AS JSON)");
    expect(sql).toMatch(/WHERE id = \? AND userId = \?/);
    expect(values).toEqual([JSON.stringify(directions), TRIP_ID, USER_ID]);
    // Other keys are never read or rewritten: no read-modify-write at all.
    expect(prisma.trip.findFirst).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
    expect(prisma.trip.updateMany).not.toHaveBeenCalled();
  });

  it("logs only trip.directions_noted (counts), and none of an edit's side effects", async () => {
    const a = await app();
    await a.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: { gpsQuality: { directions } } });
    expect(vi.mocked(logEvent).mock.calls.map((c) => c[0])).toEqual(["trip.directions_noted"]);
    expect(vi.mocked(logEvent).mock.calls[0][2]).toMatchObject({ tripId: TRIP_ID, directionsMode: "log", directionsWouldFillMiles: 4.2 });
    expect(upsertMileageSummary).not.toHaveBeenCalled();
    expect(checkAndAwardAchievements).not.toHaveBeenCalled();
  });

  it("another driver's trip, or no trip: 404, nothing written", async () => {
    vi.mocked(prisma.$executeRaw).mockResolvedValue(0 as never);
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(null);
    const a = await app();
    const res = await a.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: { gpsQuality: { directions } } });
    expect(res.statusCode).toBe(404);
    expect(vi.mocked(prisma.trip.findFirst).mock.calls[0][0]).toMatchObject({ where: { id: TRIP_ID, userId: USER_ID } });
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("is held to size like any note", async () => {
    const a = await app();
    await a.inject({
      method: "PATCH",
      url: `/trips/${TRIP_ID}`,
      headers: auth,
      payload: { gpsQuality: { directions: { ...directions, junk: "x".repeat(5000) } } },
    });
    const stored = JSON.parse(rawWrite().values[0] as string);
    expect(stored).toMatchObject({ tooLarge: true, sessionId: "dir_1" });
  });

  it("a note that is not an object writes nothing and is no error", async () => {
    const a = await app();
    const res = await a.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: { gpsQuality: { directions: "x" } } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.directionsNoted).toBe(false);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("with any other field or key it takes the normal path", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(null);
    const a = await app();
    for (const payload of [{ gpsQuality: { directions, driverKeptGoing: true } }, { gpsQuality: { directions }, notes: "x" }]) {
      await a.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload });
    }
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.trip.findFirst).toHaveBeenCalledTimes(2);
  });
});
