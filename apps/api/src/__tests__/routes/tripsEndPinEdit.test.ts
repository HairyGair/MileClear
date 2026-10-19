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
 *
 * Tom (14-15 Oct 2026) then moved an end twice and the second stretch was
 * stacked on the first: 1.17 + 20.82 + 20.85 = 42.84 miles. The second half
 * of this file runs edits one after another against a stored trip, so what
 * one edit leaves behind is what the next one reads.
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
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    vehicle: { findFirst: vi.fn() },
    shift: { findFirst: vi.fn() },
    appEvent: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn() },
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
vi.mock("../../services/tripSplit.js", async (orig) => ({
  ...(await orig<typeof import("../../services/tripSplit.js")>()),
  autoSplitVisitWelds: vi.fn().mockResolvedValue(null),
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
// A mile and a bit past the lights, and a spot a few doors from Home.
const FURTHER = { lat: 51.656, lng: -0.77 };
const NEAR_HOME = { lat: 51.6495, lng: -0.7745 };
// A start a little further back than the phone's first fix.
const EARLIER_START = { lat: 51.605, lng: -0.765 };

const RECORDED_END_AT = "2026-09-17T14:35:00.000Z";

/** Chris's drive as the phone saved it: 3.4 miles ending at the lights. */
const RECORDED_TRIP = {
  id: TRIP_ID,
  userId: USER_ID,
  startLat: 51.6102,
  startLng: -0.7601,
  endLat: LIGHTS.lat,
  endLng: LIGHTS.lng,
  startedAt: new Date("2026-09-17T14:20:00Z"),
  endedAt: new Date(RECORDED_END_AT),
  distanceMiles: 3.4,
  isManualEntry: false,
  isPhantomTrip: false,
  classification: "business",
  classificationAutoAccepted: null,
  routePolyline: "abc_stale_polyline" as string | null,
  originalStartLat: null as number | null,
  originalStartLng: null as number | null,
  gpsQuality: null as Record<string, unknown> | null,
  coordinateCount: 4,
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
const FIRST_BREADCRUMB = "2026-09-17T14:40:00.000Z";

// ── A stored trip the mocks read and write ────────────────────────────────

interface Fix {
  tripId: string;
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recordedAt: Date;
}
type TripRow = typeof RECORDED_TRIP;

const db: { trip: TripRow; coords: Fix[]; events: { type: string; userId: string; metadata: Record<string, unknown> }[] } = {
  trip: RECORDED_TRIP,
  coords: [],
  events: [],
};

/** The phone's four real fixes, ending at the lights at 14:35: 3.45 mi in straight lines. */
function recordedTrail(): Fix[] {
  const pts = [
    { lat: 51.6102, lng: -0.7601, t: "2026-09-17T14:20:00.000Z" },
    { lat: 51.62, lng: -0.74, t: "2026-09-17T14:25:00.000Z" },
    { lat: 51.634, lng: -0.755, t: "2026-09-17T14:30:00.000Z" },
    { lat: LIGHTS.lat, lng: LIGHTS.lng, t: RECORDED_END_AT },
  ];
  return pts.map((p) => ({ tripId: TRIP_ID, lat: p.lat, lng: p.lng, speed: 8, accuracy: 5, recordedAt: new Date(p.t) }));
}

function seed(trip: Partial<TripRow> = {}, coords: Fix[] = recordedTrail(), events: typeof db.events = []) {
  db.trip = structuredClone({ ...RECORDED_TRIP, ...trip, coordinateCount: coords.length, ...pick(trip, "coordinateCount") });
  db.coords = coords.map((c) => ({ ...c }));
  db.events = events.map((e) => structuredClone(e));
}
function pick<T extends object>(o: T, k: keyof T): Partial<T> {
  return k in o ? ({ [k]: o[k] } as Partial<T>) : {};
}

function timeMatches(cond: unknown, at: Date): boolean {
  if (cond == null) return true;
  if (cond instanceof Date) return cond.getTime() === at.getTime();
  const c = cond as { in?: Date[]; gte?: Date; lt?: Date };
  if (c.in) return c.in.some((d) => d.getTime() === at.getTime());
  if (c.gte && at < c.gte) return false;
  if (c.lt && at >= c.lt) return false;
  return true;
}
function fixMatches(where: Record<string, unknown>, f: Fix): boolean {
  if (where.tripId !== undefined && where.tripId !== f.tripId) return false;
  if (!timeMatches(where.recordedAt, f.recordedAt)) return false;
  if ("speed" in where && where.speed !== f.speed) return false;
  if ("accuracy" in where && where.accuracy !== f.accuracy) return false;
  return true;
}
function sorted(fixes: Fix[], orderBy?: { recordedAt?: "asc" | "desc" }): Fix[] {
  const out = [...fixes].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  return orderBy?.recordedAt === "desc" ? out.reverse() : out;
}

function applyTripData(data: Record<string, unknown>) {
  const row = db.trip as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !Array.isArray(v) && ("increment" in v || "decrement" in v)) {
      const d = v as { increment?: number; decrement?: number };
      row[k] = Number(row[k] ?? 0) + (d.increment ?? 0) - (d.decrement ?? 0);
    } else {
      row[k] = structuredClone(v);
    }
  }
}

function wireStore() {
  // No split family: the merge stays on this trip.
  vi.mocked(prisma.trip.findMany).mockResolvedValue([] as any);
  vi.mocked(prisma.trip.findFirst).mockImplementation((async () => structuredClone(db.trip)) as any);
  vi.mocked(prisma.trip.update).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => {
    applyTripData(data);
    return structuredClone(db.trip);
  }) as any);
  vi.mocked(prisma.tripCoordinate.findFirst).mockImplementation((async (a: { where: Record<string, unknown>; orderBy?: { recordedAt?: "asc" | "desc" } }) =>
    sorted(db.coords.filter((f) => fixMatches(a.where, f)), a.orderBy)[0] ?? null) as any);
  vi.mocked(prisma.tripCoordinate.findMany).mockImplementation((async (a: { where: Record<string, unknown>; orderBy?: { recordedAt?: "asc" | "desc" }; take?: number }) => {
    const list = sorted(db.coords.filter((f) => fixMatches(a.where, f)), a.orderBy);
    return a.take ? list.slice(0, a.take) : list;
  }) as any);
  vi.mocked(prisma.tripCoordinate.create).mockImplementation((async ({ data }: { data: Fix }) => {
    db.coords.push({ ...data });
    return data;
  }) as any);
  vi.mocked(prisma.tripCoordinate.createMany).mockImplementation((async ({ data }: { data: Fix[] }) => {
    db.coords.push(...data.map((d) => ({ ...d })));
    return { count: data.length };
  }) as any);
  vi.mocked(prisma.tripCoordinate.deleteMany).mockImplementation((async ({ where }: { where: Record<string, unknown> }) => {
    const before = db.coords.length;
    db.coords = db.coords.filter((f) => !fixMatches(where, f));
    return { count: before - db.coords.length };
  }) as any);
  vi.mocked(prisma.tripCoordinate.count).mockImplementation((async () => db.coords.length) as any);
  vi.mocked(prisma.appEvent.findMany).mockImplementation((async ({ where }: { where: { type: string; metadata: { equals: string } } }) =>
    db.events.filter((e) => e.type === where.type && e.metadata.tripId === where.metadata.equals)) as any);
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: typeof prisma) => unknown) => fn(prisma)) as any);
  vi.mocked(logEvent).mockImplementation(((type: string, userId: string, metadata: Record<string, unknown>) => {
    db.events.push({ type, userId, metadata: structuredClone(metadata) });
  }) as any);
}

/** Road miles between two of the places above, keyed by their latitudes. */
const ROUTES: Record<string, number> = {
  [`${LIGHTS.lat},${HOME.lat}`]: 0.82,
  [`${LIGHTS.lat},${FURTHER.lat}`]: 1.5,
  [`${LIGHTS.lat},${NEAR_HOME.lat}`]: 0.9,
  [`${HOME.lat},${FURTHER.lat}`]: 1.3,
  [`${EARLIER_START.lat},${RECORDED_TRIP.startLat}`]: 0.5,
};
function routeByPlaces() {
  vi.mocked(resolveRouteDistance).mockImplementation((async (a: { startLat: number; endLat: number }) => {
    const miles = ROUTES[`${a.startLat},${a.endLat}`];
    return miles == null ? null : { ...HOME_STRETCH, distanceMiles: miles };
  }) as any);
}

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

function firstUpdateData(): Record<string, any> {
  return vi.mocked(prisma.trip.update).mock.calls[0][0].data as Record<string, any>;
}

const standIns = () => db.coords.filter((f) => f.speed == null && f.accuracy == null);
const endNote = () => (db.trip.gpsQuality as Record<string, any> | null)?.endExtension;

// ── One edit ──────────────────────────────────────────────────────────────

describe("PATCH /trips/:id moving a recorded trip's end pin", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    seed();
    wireStore();
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

  it("records where the recording stopped", async () => {
    await app.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MOVE_END_HOME });

    expect(firstUpdateData().gpsQuality).toEqual({
      endExtension: {
        recordedEndLat: LIGHTS.lat,
        recordedEndLng: LIGHTS.lng,
        recordedEndedAt: RECORDED_END_AT,
        addedMiles: 0.82,
        breadcrumbAt: FIRST_BREADCRUMB,
      },
    });
  });

  it("logs the edit in the same shape as a start edit and recomputes the tax year", async () => {
    await app.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MOVE_END_HOME });

    expect(logEvent).toHaveBeenCalledWith("trip.end_edited", USER_ID, {
      tripId: TRIP_ID,
      addedMiles: 0.82,
      replacedMiles: 0,
      priorSource: null,
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
    seed(MANUAL_TRIP, []);
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

  // A past shift saved from its totals (Lucian, 19 Oct 2026): 84 miles typed
  // for the whole shift, home to home. Its miles are the driver's own figure.
  const TYPED_TOTAL = {
    ...MANUAL_TRIP,
    distanceMiles: 84,
    endLat: MANUAL_TRIP.startLat,
    endLng: MANUAL_TRIP.startLng,
    gpsQuality: { distanceSource: "typed_total", drops: 32 },
  };

  it("keeps a typed shift total's miles when its finish is moved", async () => {
    seed(TYPED_TOTAL, []);
    vi.mocked(resolveRouteDistance).mockResolvedValue({ ...HOME_STRETCH, distanceMiles: 3.9 });

    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: MOVE_END_HOME,
    });

    expect(res.statusCode).toBe(200);
    expect(resolveRouteDistance).not.toHaveBeenCalled();
    expect(firstUpdateData()).not.toHaveProperty("distanceMiles");
    expect(db.trip.distanceMiles).toBe(84);
    expect(db.trip.endLat).toBe(HOME.lat);
  });

  it("still takes miles the driver types on a typed shift total", async () => {
    seed(TYPED_TOTAL, []);
    const res = await app.inject({
      method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: { distanceMiles: 86.5 },
    });
    expect(res.statusCode).toBe(200);
    expect(db.trip.distanceMiles).toBe(86.5);
  });

  it("Recalculate distance leaves a typed shift total alone", async () => {
    seed(TYPED_TOTAL, []);
    vi.mocked(resolveRouteDistance).mockResolvedValue({ ...HOME_STRETCH, distanceMiles: 120 });
    const res = await app.inject({ method: "POST", url: `/trips/${TRIP_ID}/recalc`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ changed: false, oldMiles: 84, newMiles: 84, source: null });
    expect(resolveRouteDistance).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
  });
});

// ── Edits one after another, against the stored trip ─────────────────────

describe("PATCH /trips/:id editing a recorded trip's end more than once", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  const patch = (payload: Record<string, unknown>) =>
    app.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload });
  const moveEnd = (p: { lat: number; lng: number }, extra: Record<string, unknown> = {}) =>
    patch({ endLat: p.lat, endLng: p.lng, ...extra });

  beforeEach(async () => {
    vi.clearAllMocks();
    seed();
    wireStore();
    routeByPlaces();
    app = await createTestApp();
  });

  it("replaces the first stretch instead of stacking a second on top", async () => {
    await patch(MOVE_END_HOME);
    expect(db.trip.distanceMiles).toBe(4.22);

    vi.mocked(resolveRouteDistance).mockClear();
    const res = await moveEnd(FURTHER);

    expect(res.statusCode).toBe(200);
    // Priced from the lights, where the recording stopped, not from Home.
    expect(resolveRouteDistance).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveRouteDistance).mock.calls[0][0]).toMatchObject({
      startLat: LIGHTS.lat, startLng: LIGHTS.lng, endLat: FURTHER.lat, endLng: FURTHER.lng,
    });
    // 3.4 recorded + 1.5, never 4.22 + 1.3.
    expect(db.trip.distanceMiles).toBe(4.9);
    expect(endNote()).toMatchObject({ recordedEndLat: LIGHTS.lat, addedMiles: 1.5 });
    // Home's stand-in point has gone; one at the new end, and the count agrees.
    expect(standIns().map((f) => f.lat)).toEqual([FURTHER.lat]);
    expect(db.trip.coordinateCount).toBe(db.coords.length);
    expect(logEvent).toHaveBeenCalledWith("trip.end_edited", USER_ID, expect.objectContaining({
      addedMiles: 1.5, replacedMiles: 0.82, priorSource: "note",
    }));
  });

  it("gives a second, nearby edit one stretch, not two (Tom's case)", async () => {
    await moveEnd(FURTHER);
    await moveEnd(NEAR_HOME);

    expect(db.trip.distanceMiles).toBe(4.3);
    expect(standIns()).toHaveLength(1);
  });

  it("comes back to the same figure after going out and back", async () => {
    await moveEnd(HOME);
    await moveEnd(FURTHER);
    await moveEnd(HOME);

    expect(db.trip.distanceMiles).toBe(4.22);
    expect(standIns().map((f) => f.lat)).toEqual([HOME.lat]);
  });

  it("gives the recorded miles back when the end goes back to where the recording stopped", async () => {
    await moveEnd(HOME);
    vi.mocked(resolveRouteDistance).mockClear();
    await moveEnd(LIGHTS, { endAddress: "West Wycombe Road" });

    expect(resolveRouteDistance).not.toHaveBeenCalled();
    expect(db.trip).toMatchObject({ endLat: LIGHTS.lat, endLng: LIGHTS.lng, distanceMiles: 3.4, coordinateCount: 4 });
    expect(standIns()).toHaveLength(0);
    expect(endNote()).toBeNull();
    expect(logEvent).toHaveBeenCalledWith("trip.end_edited", USER_ID, expect.objectContaining({
      addedMiles: 0, replacedMiles: 0.82,
    }));
  });

  it("keeps the miles and the note when a later stretch cannot be priced, and the next edit still replaces", async () => {
    await moveEnd(HOME);
    vi.mocked(resolveRouteDistance).mockResolvedValueOnce(null);
    await moveEnd(FURTHER);
    expect(db.trip.distanceMiles).toBe(4.22);
    expect(endNote()).toMatchObject({ addedMiles: 0.82 });

    await moveEnd(NEAR_HOME);
    expect(db.trip.distanceMiles).toBe(4.3);
  });

  it("lets a distance the driver typed win, and does not take an old stretch off it later", async () => {
    await moveEnd(HOME);
    await patch({ distanceMiles: 6 });
    expect(db.trip.distanceMiles).toBe(6);
    expect(endNote()).toBeNull();

    await moveEnd(FURTHER);
    // Priced from the end as it stands, on top of the typed figure.
    expect(db.trip.distanceMiles).toBe(7.3);
  });

  it("never takes a stretch off later when the same save typed the miles", async () => {
    await moveEnd(HOME, { distanceMiles: 9 });
    expect(db.trip.distanceMiles).toBe(9);
    expect(endNote()).toBeNull();
    expect(logEvent).toHaveBeenCalledWith("trip.end_edited", USER_ID, expect.objectContaining({
      addedMiles: 0, clientDistance: true, routedMiles: 0.82,
    }));

    await moveEnd(FURTHER);
    // From Home, where the trip now ends, on top of the driver's 9.
    expect(db.trip.distanceMiles).toBe(10.3);
  });

  it("keeps a start extension and an end edit in the same save apart", async () => {
    await moveEnd(HOME);
    await patch({
      startLat: EARLIER_START.lat, startLng: EARLIER_START.lng,
      endLat: FURTHER.lat, endLng: FURTHER.lng,
    });

    // 4.22 - 0.82 (old end stretch) + 0.5 (new start stretch) + 1.5 (new end stretch).
    expect(db.trip.distanceMiles).toBe(5.4);
    expect(endNote()).toMatchObject({ addedMiles: 1.5 });
    expect(db.trip).toMatchObject({
      originalStartLat: RECORDED_TRIP.startLat, originalStartLng: RECORDED_TRIP.startLng,
    });
  });

  it("does not undo an earlier start extension when the end is edited again", async () => {
    await moveEnd(HOME);
    await patch({ startLat: EARLIER_START.lat, startLng: EARLIER_START.lng });
    expect(db.trip.distanceMiles).toBe(4.72);

    await moveEnd(FURTHER);
    expect(db.trip.distanceMiles).toBe(5.4);
  });

  it("keeps the record of stale-fix miles already taken off", async () => {
    const cut = { removedMiles: 1.2, fromMiles: 4.6, toMiles: 3.4 };
    seed({ gpsQuality: { appendOutlierCut: cut } });
    await moveEnd(HOME);
    await moveEnd(FURTHER);

    expect(db.trip.distanceMiles).toBe(4.9);
    expect((db.trip.gpsQuality as Record<string, unknown>).appendOutlierCut).toEqual(cut);
  });

  it("re-routes a manual trip end to end every time, with no note", async () => {
    seed(MANUAL_TRIP, []);
    vi.mocked(resolveRouteDistance).mockResolvedValue({ ...HOME_STRETCH, distanceMiles: 3.9 });
    await moveEnd(HOME);
    vi.mocked(resolveRouteDistance).mockResolvedValue({ ...HOME_STRETCH, distanceMiles: 4.6 });
    await moveEnd(FURTHER);

    for (const call of vi.mocked(resolveRouteDistance).mock.calls) {
      expect(call[0]).toMatchObject({ startLat: MANUAL_TRIP.startLat, startLng: MANUAL_TRIP.startLng });
    }
    expect(db.trip.distanceMiles).toBe(4.6);
    expect(db.trip.gpsQuality).toBeNull();
  });

  it("ignores a note a client tries to plant, on a PATCH", async () => {
    await patch({
      gpsQuality: {
        driverKeptGoing: true,
        endExtension: { recordedEndLat: FURTHER.lat, recordedEndLng: FURTHER.lng, addedMiles: 3, recordedEndedAt: null, breadcrumbAt: null },
        appendOutlierCut: { removedMiles: 9, fromMiles: 9, toMiles: 0 },
      },
    });
    expect(db.trip.gpsQuality).toEqual({ driverKeptGoing: true });

    await moveEnd(HOME);
    expect(db.trip.distanceMiles).toBe(4.22);
  });

  it("ignores a note left behind by a visit split and prices from the end leg one now has", async () => {
    // Leg one of a split: 0.9 mi, ending at the lights, but still carrying a
    // note for a 20.82 mile stretch whose stand-in point went to the last leg.
    seed({
      distanceMiles: 0.9,
      gpsQuality: {
        endExtension: {
          recordedEndLat: 51.7, recordedEndLng: -0.8, recordedEndedAt: RECORDED_END_AT, addedMiles: 20.82,
          breadcrumbAt: "2026-09-17T15:10:00.000Z",
        },
      },
    });
    await moveEnd(HOME);

    expect(vi.mocked(resolveRouteDistance).mock.calls[0][0]).toMatchObject({ startLat: LIGHTS.lat });
    expect(db.trip.distanceMiles).toBe(1.72);
    expect(endNote()).toMatchObject({ recordedEndLat: LIGHTS.lat, addedMiles: 0.82 });
    expect(logEvent).toHaveBeenCalledWith("trip.end_edited", USER_ID, expect.objectContaining({
      replacedMiles: 0, priorSource: "note_ignored",
    }));
  });

  it("drops the stand-in point when a phone merge brings its own distance", async () => {
    await moveEnd(HOME);
    expect(standIns()).toHaveLength(1);

    const res = await patch({
      distanceMiles: 5.1,
      endLat: FURTHER.lat,
      endLng: FURTHER.lng,
      coordinates: [
        { lat: 51.645, lng: -0.775, speed: 9, accuracy: 6, recordedAt: "2026-09-17T14:45:00.000Z" },
        { lat: FURTHER.lat, lng: FURTHER.lng, speed: 9, accuracy: 6, recordedAt: "2026-09-17T14:50:00.000Z" },
      ],
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(standIns()).toHaveLength(0);
    expect(db.trip.coordinateCount).toBe(db.coords.length);
    expect(db.trip.distanceMiles).toBe(5.1);
    expect(endNote()).toBeNull();
  });
});

// ── Trips whose end was edited before the note existed ────────────────────

describe("PATCH /trips/:id on a trip edited before notes existed", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const moveEnd = (p: { lat: number; lng: number }) =>
    app.inject({ method: "PATCH", url: `/trips/${TRIP_ID}`, headers: auth, payload: { endLat: p.lat, endLng: p.lng } });

  const standIn = (p: { lat: number; lng: number }, t: string): Fix => ({
    tripId: TRIP_ID, lat: p.lat, lng: p.lng, speed: null, accuracy: null, recordedAt: new Date(t),
  });
  const edited = (addedMiles: number) => ({
    type: "trip.end_edited", userId: USER_ID, metadata: { tripId: TRIP_ID, addedMiles, crowMiles: 1, wasManual: false },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    wireStore();
    routeByPlaces();
    app = await createTestApp();
  });

  it("takes both old stretches off, Tom style, and prices from the last real fix", async () => {
    // Two old edits, each stacked: 3.4 + 0.82 + 1.3 = 5.52.
    seed(
      { endLat: FURTHER.lat, endLng: FURTHER.lng, distanceMiles: 5.52, endedAt: new Date("2026-09-17T14:50:00.000Z") },
      [...recordedTrail(), standIn(HOME, FIRST_BREADCRUMB), standIn(FURTHER, "2026-09-17T14:50:00.000Z")],
      [edited(0.82), edited(1.3)]
    );
    wireStore();

    await moveEnd(NEAR_HOME);

    expect(vi.mocked(resolveRouteDistance).mock.calls[0][0]).toMatchObject({ startLat: LIGHTS.lat });
    expect(db.trip.distanceMiles).toBe(4.3);
    expect(standIns().map((f) => f.lat)).toEqual([NEAR_HOME.lat]);
    expect(db.trip.coordinateCount).toBe(db.coords.length);
    expect(endNote()).toMatchObject({ recordedEndLat: LIGHTS.lat, addedMiles: 0.9 });
    expect(logEvent).toHaveBeenCalledWith("trip.end_edited", USER_ID, expect.objectContaining({
      replacedMiles: 2.12, priorSource: "legacy",
    }));
  });

  it("falls back to today's behaviour when the stand-ins and the events do not agree", async () => {
    seed(
      { endLat: HOME.lat, endLng: HOME.lng, distanceMiles: 4.22, endedAt: new Date(FIRST_BREADCRUMB) },
      [...recordedTrail(), standIn(HOME, FIRST_BREADCRUMB)],
      [edited(0.82), edited(0.5)]
    );
    wireStore();

    await moveEnd(FURTHER);

    expect(vi.mocked(resolveRouteDistance).mock.calls[0][0]).toMatchObject({ startLat: HOME.lat });
    expect(db.trip.distanceMiles).toBe(5.52);
  });

  it("falls back when the stored miles were the website's own figure, not trail plus stretch", async () => {
    // Before notes: the website moved the end AND sent 9 miles. The stand-in
    // and an event with 0.82 added were left, but 9 is the driver's figure.
    seed(
      { endLat: HOME.lat, endLng: HOME.lng, distanceMiles: 9, endedAt: new Date(FIRST_BREADCRUMB) },
      [...recordedTrail(), standIn(HOME, FIRST_BREADCRUMB)],
      [edited(0.82)]
    );
    wireStore();

    await moveEnd(FURTHER);

    expect(db.trip.distanceMiles).toBe(10.3);
  });

  it("falls back when the trip no longer ends on the newest stand-in", async () => {
    seed(
      { endLat: NEAR_HOME.lat, endLng: NEAR_HOME.lng, distanceMiles: 4.22, endedAt: new Date(FIRST_BREADCRUMB) },
      [...recordedTrail(), standIn(HOME, FIRST_BREADCRUMB)],
      [edited(0.82)]
    );
    wireStore();

    await moveEnd(FURTHER);

    expect(vi.mocked(resolveRouteDistance).mock.calls[0][0]).toMatchObject({ startLat: NEAR_HOME.lat });
  });

  it("falls back when the old stretch is more than the trip now holds", async () => {
    seed(
      { endLat: HOME.lat, endLng: HOME.lng, distanceMiles: 0.5, endedAt: new Date(FIRST_BREADCRUMB) },
      [...recordedTrail(), standIn(HOME, FIRST_BREADCRUMB)],
      [edited(0.82)]
    );
    wireStore();

    await moveEnd(FURTHER);

    expect(db.trip.distanceMiles).toBe(1.8);
  });
});
