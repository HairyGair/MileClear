/**
 * POST /trips refuses a recording whose breadcrumbs are already saved, and no
 * longer rejects a trip over a shift id that is not a UUID.
 *
 * 28 Sep 2026: 278 pairs of automatic trips overlapping by 80% or more on 87
 * drivers in 14 days, mostly a shift recording and the automatic engine's copy
 * of the same fixes both saved; and the app's quick-trip recovery sent
 * "__quick_trip__" as shiftId, which failed validation, so every trip it
 * rebuilt was rejected and deleted on the phone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
    tripCoordinate: { findMany: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    shift: { findFirst: vi.fn() },
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

import { tripRoutes } from "../../routes/trips/index.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { findRecordedCopy } from "../../services/recordedDuplicateGuard.js";

const USER_ID = "00000000-0000-0000-0000-000000000009";
const SAVED_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHIFT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T0 = Date.UTC(2026, 8, 26, 15, 35);
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

/** ~15 m/s heading north from central Birmingham, one fix every `stepS`. */
function route(startS: number, endS: number, stepS: number, offsetM = 0) {
  const out: { lat: number; lng: number; speed: number; accuracy: number; recordedAt: string }[] = [];
  for (let s = startS; s <= endS; s += stepS) {
    out.push({
      lat: 52.48 + (s * 15) / 111_320,
      lng: -1.9 + offsetM / 68_000,
      speed: 15,
      accuracy: 5,
      recordedAt: new Date(T0 + s * 1000).toISOString(),
    });
  }
  return out;
}

const savedCoords = route(180, 3_600, 4).map((c) => ({
  tripId: SAVED_ID,
  lat: c.lat,
  lng: c.lng,
  recordedAt: new Date(c.recordedAt),
}));

const SAVED_TRIP = {
  id: SAVED_ID,
  userId: USER_ID,
  startedAt: new Date(T0 + 180_000),
  endedAt: new Date(T0 + 3_600_000),
  distanceMiles: 31.9,
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
    distanceMiles: 33.1,
    coordinates: coords,
    ...extra,
  };
}

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.trip.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (prisma.shift.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: SHIFT_ID });
  (prisma.trip.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: SAVED_ID }]);
  (prisma.tripCoordinate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(savedCoords);
  (prisma.trip.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(SAVED_TRIP);
  (prisma.trip.update as ReturnType<typeof vi.fn>).mockImplementation(async ({ data }) => ({ ...SAVED_TRIP, ...data }));
});

describe("POST /trips: a second recording of a saved drive", () => {
  it("answers with the saved trip, saves nothing, and hands the shift to it", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/trips",
      headers: auth,
      payload: body(route(0, 3_550, 7), { shiftId: SHIFT_ID }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(SAVED_ID);
    expect(res.json().duplicateOf).toBe(SAVED_ID);
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SAVED_ID }, data: { shiftId: SHIFT_ID } })
    );
    expect(logEvent).toHaveBeenCalledWith(
      "trip.recorded_duplicate_refused",
      USER_ID,
      expect.objectContaining({ keptTripId: SAVED_ID, incomingHadShift: true })
    );
    await app.close();
  });
});

describe("findRecordedCopy", () => {
  it("finds nothing when no recorded trip overlaps, without reading breadcrumbs", async () => {
    (prisma.trip.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const fixes = route(0, 600, 5).map((c) => ({ t: Date.parse(c.recordedAt), lat: c.lat, lng: c.lng }));
    const r = await findRecordedCopy({
      userId: USER_ID,
      startedAt: new Date(fixes[0].t),
      endedAt: new Date(fixes[fixes.length - 1].t),
      fixes,
    });
    expect(r).toBeNull();
    expect(prisma.tripCoordinate.findMany).not.toHaveBeenCalled();
  });

  it("never matches a different car at the same time on a shared account", async () => {
    const fixes = route(180, 3_600, 5, 3_000).map((c) => ({ t: Date.parse(c.recordedAt), lat: c.lat, lng: c.lng }));
    const r = await findRecordedCopy({
      userId: USER_ID,
      startedAt: new Date(fixes[0].t),
      endedAt: new Date(fixes[fixes.length - 1].t),
      fixes,
    });
    expect(r).toBeNull();
  });

  it("does not refuse a longer recording that only overlaps the saved one", async () => {
    const fixes = route(0, 9_000, 5).map((c) => ({ t: Date.parse(c.recordedAt), lat: c.lat, lng: c.lng }));
    const r = await findRecordedCopy({
      userId: USER_ID,
      startedAt: new Date(fixes[0].t),
      endedAt: new Date(fixes[fixes.length - 1].t),
      fixes,
    });
    expect(r).toBeNull();
  });
});

describe("POST /trips: references that are not UUIDs", () => {
  it("strips a lock id sent as shiftId instead of rejecting the trip", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/trips",
      headers: auth,
      payload: body(route(0, 3_550, 7), { shiftId: "__quick_trip__" }),
    });
    // Refused as a copy here (the saved trip holds it), which proves it got
    // past validation; the point is that it is not a 400.
    expect(res.statusCode).toBe(200);
    expect(logEvent).toHaveBeenCalledWith("trip.dangling_ref_stripped", USER_ID, {
      field: "shiftId",
      value: "__quick_trip__",
      reason: "not_a_uuid",
    });
    expect(prisma.shift.findFirst).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("logs which rule a rejected create broke, never the values", async () => {
    const app = await createTestApp();
    const coords = route(0, 600, 7);
    const res = await app.inject({
      method: "POST",
      url: "/trips",
      headers: auth,
      payload: body(coords, { endedAt: new Date(T0 - 60_000).toISOString() }),
    });
    expect(res.statusCode).toBe(400);
    expect(logEvent).toHaveBeenCalledWith(
      "trip.create_rejected",
      USER_ID,
      expect.objectContaining({ field: "endedAt", coordinateCount: coords.length })
    );
    await app.close();
  });
});
