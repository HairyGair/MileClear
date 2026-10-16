/**
 * POST /trips trims fixes the driver already has saved on another trip
 * (RECORDED_OVERLAP_TRIM off | log | on).
 *
 * 15 Oct 2026, e84b24f3: the phone re-sent a stretch it had saved plus a real
 * continuation. The 90% refusal could not catch it, so one 15:32-16:00 stretch
 * sat on four trips.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    tripCoordinate: { findMany: vi.fn(), createMany: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    shift: { findFirst: vi.fn() },
    savedLocation: { findMany: vi.fn().mockResolvedValue([]) },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../services/mileage.js", () => ({ upsertMileageSummary: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/apns.js", () => ({
  sendLiveActivityStartPush: vi.fn().mockResolvedValue(undefined),
  isApnsConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("../../services/wakeLagStart.js", () => ({ reconcileWakeLagStart: vi.fn().mockResolvedValue(null) }));
vi.mock("../../services/vehicleDefaults.js", () => ({ defaultVehicleIdForUser: vi.fn().mockResolvedValue(null) }));

import { tripRoutes } from "../../routes/trips/index.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { reconcileWakeLagStart } from "../../services/wakeLagStart.js";

const USER_ID = "00000000-0000-0000-0000-000000000009";
const SAVED_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHIFT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T0 = Date.UTC(2026, 9, 15, 15, 32);
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

function route(startS: number, endS: number, stepS = 10) {
  const out: { lat: number; lng: number; speed: number; accuracy: number; recordedAt: string }[] = [];
  for (let s = startS; s <= endS; s += stepS) {
    out.push({
      lat: 52.48 + (s * 15) / 111_320,
      lng: -1.9,
      speed: 15,
      accuracy: 5,
      recordedAt: new Date(T0 + s * 1000).toISOString(),
    });
  }
  return out;
}

// The saved trip holds the first 600 s.
const savedCoords = route(0, 600).map((c) => ({
  tripId: SAVED_ID,
  lat: c.lat,
  lng: c.lng,
  accuracy: c.accuracy,
  speed: c.speed,
  recordedAt: new Date(c.recordedAt),
}));
const SAVED_TRIP = {
  id: SAVED_ID,
  userId: USER_ID,
  startedAt: new Date(T0),
  endedAt: new Date(T0 + 600_000),
  distanceMiles: 5.6,
  shiftId: null,
  vehicle: null,
  shift: null,
};

function body(coords: ReturnType<typeof route>, extra: Record<string, unknown> = {}) {
  return {
    startLat: coords[0].lat,
    startLng: coords[0].lng,
    endLat: coords[coords.length - 1].lat,
    endLng: coords[coords.length - 1].lng,
    startedAt: coords[0].recordedAt,
    endedAt: coords[coords.length - 1].recordedAt,
    distanceMiles: 99,
    coordinates: coords,
    gpsQuality: { maxSpeedMph: 34, avgAccuracyM: 5 },
    ...extra,
  };
}

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

const fn = (f: unknown) => f as ReturnType<typeof vi.fn>;
const events = (name: string) => fn(logEvent).mock.calls.filter((c) => c[0] === name);
let savedPayload: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  savedPayload = null;
  fn(prisma.trip.findFirst).mockResolvedValue(null);
  fn(prisma.shift.findFirst).mockResolvedValue({ id: SHIFT_ID });
  // Overlap candidates query first; later neighbour queries get nothing.
  fn(prisma.trip.findMany).mockImplementation(async (args: { select?: Record<string, boolean> }) =>
    args?.select?.shiftId ? [{ id: SAVED_ID, shiftId: null }] : args?.select?.id && !args.select.startedAt ? [{ id: SAVED_ID }] : []
  );
  fn(prisma.tripCoordinate.findMany).mockResolvedValue(savedCoords);
  fn(prisma.trip.findUniqueOrThrow).mockResolvedValue(SAVED_TRIP);
  fn(prisma.trip.update).mockImplementation(async ({ data }: { data: object }) => ({ ...SAVED_TRIP, ...data }));
  fn(prisma.$transaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      trip: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          savedPayload = data;
          return { id: "new-trip", ...data };
        }),
        findUniqueOrThrow: vi.fn(async () => ({ id: "new-trip", ...savedPayload, vehicle: null, shift: null })),
      },
      tripCoordinate: { createMany: vi.fn() },
    })
  );
});

afterEach(() => {
  delete process.env.RECORDED_OVERLAP_TRIM;
});

const upload = () => body(route(0, 1800)); // re-sends 0-600, drives on to 1800

describe("POST /trips: fixes already saved on another trip", () => {
  it("log mode (the default) saves the trip whole and logs what it would do", async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: "POST", url: "/trips", headers: auth, payload: upload() });
    expect(res.statusCode).toBe(201);
    expect(savedPayload?.coordinateCount).toBe(181);
    expect(savedPayload?.startedAt).toEqual(new Date(T0));
    expect(events("trip.recorded_overlap_trimmed")).toHaveLength(0);
    const would = events("trip.recorded_overlap_would_trim");
    expect(would).toHaveLength(1);
    expect(would[0][2]).toMatchObject({ verdict: "trim", removedFixes: 61, keptTripIds: [SAVED_ID] });
    await app.close();
  });

  it("off mode does not even look", async () => {
    process.env.RECORDED_OVERLAP_TRIM = "off";
    const app = await createTestApp();
    await app.inject({ method: "POST", url: "/trips", headers: auth, payload: upload() });
    expect(events("trip.recorded_overlap_would_trim")).toHaveLength(0);
    expect(savedPayload?.coordinateCount).toBe(181);
    await app.close();
  });

  it("on mode saves only the remainder, from the last shared fix, with a recomputed distance", async () => {
    process.env.RECORDED_OVERLAP_TRIM = "on";
    const app = await createTestApp();
    const res = await app.inject({ method: "POST", url: "/trips", headers: auth, payload: upload() });
    expect(res.statusCode).toBe(201);
    expect(savedPayload?.coordinateCount).toBe(121);
    expect(savedPayload?.startedAt).toEqual(new Date(T0 + 600_000));
    expect(savedPayload?.distanceMiles).not.toBe(99);
    expect(savedPayload?.distanceMiles as number).toBeGreaterThan(11);
    expect(savedPayload?.distanceMiles as number).toBeLessThan(11.5);
    // The upload's own start is remembered, which also stops late-start extension.
    expect(savedPayload?.originalStartLat).toBeCloseTo(52.48, 5);
    const gq = savedPayload?.gpsQuality as { overlapTrimmed: Record<string, unknown> };
    expect(gq.overlapTrimmed).toMatchObject({
      removedFixes: 61,
      keptTripIds: [SAVED_ID],
      originalStartedAt: new Date(T0).toISOString(),
    });
    expect(gq.overlapTrimmed.toMiles).toBe(savedPayload?.distanceMiles);
    expect(events("trip.recorded_overlap_trimmed")).toHaveLength(1);
    // Never re-extended back over the removed fixes.
    expect(reconcileWakeLagStart).not.toHaveBeenCalled();
    await app.close();
  });

  it("on mode: a retry of the trimmed upload returns the trimmed trip and creates nothing", async () => {
    process.env.RECORDED_OVERLAP_TRIM = "on";
    const trimmed = { id: "trimmed-1", userId: USER_ID, startedAt: new Date(T0 + 600_000), vehicle: null, shift: null };
    fn(prisma.trip.findFirst).mockImplementation(async (args: { where: Record<string, unknown> }) =>
      args.where.gpsQuality ? trimmed : null
    );
    const app = await createTestApp();
    const res = await app.inject({ method: "POST", url: "/trips", headers: auth, payload: upload() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe("trimmed-1");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(prisma.tripCoordinate.findMany).not.toHaveBeenCalled();
    const lookup = fn(prisma.trip.findFirst).mock.calls.find((c) => c[0].where.gpsQuality)![0];
    expect(lookup.where.gpsQuality).toEqual({
      path: "$.overlapTrimmed.originalStartedAt",
      equals: new Date(T0).toISOString(),
    });
    await app.close();
  });

  it("on mode: a remainder too short to be a trip is answered like the duplicate refusal", async () => {
    process.env.RECORDED_OVERLAP_TRIM = "on";
    fn(prisma.tripCoordinate.findMany).mockResolvedValue(
      savedCoords.filter((c) => c.recordedAt.getTime() <= T0 + 60_000)
    );
    const app = await createTestApp();
    const res = await app.inject({ method: "POST", url: "/trips", headers: auth, payload: body(route(0, 80)) });
    expect(res.statusCode).toBe(200);
    expect(res.json().duplicateOf).toBe(SAVED_ID);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(events("trip.recorded_overlap_refused")).toHaveLength(1);
    expect(prisma.trip.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("on mode: a continuation both before and after saves the trip whole and logs multi", async () => {
    process.env.RECORDED_OVERLAP_TRIM = "on";
    fn(prisma.tripCoordinate.findMany).mockResolvedValue(
      savedCoords.filter((c) => c.recordedAt.getTime() >= T0 + 300_000 && c.recordedAt.getTime() <= T0 + 500_000)
    );
    const app = await createTestApp();
    const res = await app.inject({ method: "POST", url: "/trips", headers: auth, payload: body(route(0, 900)) });
    expect(res.statusCode).toBe(201);
    expect(savedPayload?.coordinateCount).toBe(91);
    const multi = events("trip.recorded_overlap_multi");
    expect(multi).toHaveLength(1);
    expect(multi[0][2]).toMatchObject({ stretches: 2, removedFixes: 21 });
    await app.close();
  });

  it("on mode: a shift recording is not trimmed against a trip that is not on the shift", async () => {
    process.env.RECORDED_OVERLAP_TRIM = "on";
    const app = await createTestApp();
    const res = await app.inject({ method: "POST", url: "/trips", headers: auth, payload: body(route(0, 1800), { shiftId: SHIFT_ID }) });
    expect(res.statusCode).toBe(201);
    expect(savedPayload?.coordinateCount).toBe(181);
    expect(events("trip.recorded_overlap_trimmed")).toHaveLength(0);
    await app.close();
  });

  it("never trims a manual trip", async () => {
    process.env.RECORDED_OVERLAP_TRIM = "on";
    fn(prisma.trip.create).mockImplementation(async ({ data }: { data: object }) => ({ id: "manual-1", ...data }));
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/trips",
      headers: auth,
      payload: { startLat: 52.48, startLng: -1.9, endLat: 52.5, endLng: -1.9, startedAt: new Date(T0).toISOString(), endedAt: new Date(T0 + 600_000).toISOString(), distanceMiles: 3 },
    });
    expect(prisma.tripCoordinate.findMany).not.toHaveBeenCalled();
    expect(events("trip.recorded_overlap_trimmed")).toHaveLength(0);
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});
