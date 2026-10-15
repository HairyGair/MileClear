/**
 * Split legs record where they came from (11 Oct 2026, decision T-F): the
 * trip they were split from and "Part 1 of 2", so the Trips tab can say why a
 * drive the driver remembers as one shows as two. Facts only: the cuts are
 * the same as before.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = {
  trip: {
    create: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  },
  tripCoordinate: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  $queryRaw: vi.fn(),
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: { findFirst: vi.fn() },
    tripCoordinate: { findMany: vi.fn() },
    savedLocation: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

vi.mock("../../services/geocoding.js", () => ({
  reverseGeocodeDetailed: vi.fn().mockResolvedValue({ address: null, outcome: "unavailable", cached: false }),
}));

vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));

vi.mock("../../services/mileage.js", () => ({
  upsertMileageSummary: vi.fn().mockResolvedValue(undefined),
}));

import {
  autoSplitVisitWelds,
  executeTripSplit,
  planSplitNumbering,
  type SplitCoord,
} from "../../services/tripSplit.js";
import { prisma } from "../../lib/prisma.js";

const T0 = new Date("2026-09-22T09:00:00Z").getTime();

// ~2 miles, a 6.5 minute stop, ~2 miles: one cut, two legs.
function route(): SplitCoord[] {
  const out: SplitCoord[] = [];
  let lat = 50.7705;
  let i = 0;
  for (const seg of [
    { n: 50, speed: 13.4 },
    { n: 40, speed: 0.4 },
    { n: 50, speed: 13.4 },
  ]) {
    for (let k = 0; k < seg.n; k++) {
      if (seg.speed > 2) lat += 0.00036;
      out.push({ lat, lng: 0.2771, speed: seg.speed, recordedAt: new Date(T0 + i * 10_000) });
      i++;
    }
  }
  return out;
}

const base = {
  id: "parent-1",
  userId: "u1",
  shiftId: null,
  vehicleId: null,
  isManualEntry: false,
  isPhantomTrip: false,
  endedAt: new Date(T0 + 139 * 10_000),
  startedAt: new Date(T0),
  distanceMiles: 4,
  gpsQuality: null,
  startAddress: "A",
  endAddress: "B",
  classification: "business",
  platformTag: null,
  businessPurpose: null,
  category: null,
  projectLabel: null,
  notes: null,
  recordedBy: "automatic",
  splitFromTripId: null,
  splitPart: null,
  splitPartCount: null,
};

function lockedAsPlanned() {
  tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes("FOR UPDATE")) return [{ endedAt: base.endedAt }];
    return [{ n: BigInt(route().length) }];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.tripCoordinate.findMany).mockResolvedValue(route() as never);
  let n = 0;
  tx.trip.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `leg-${++n}`, ...data }));
  lockedAsPlanned();
});

describe("planSplitNumbering", () => {
  it("numbers a first split from 1, under the trip's own id", () => {
    expect(planSplitNumbering({ id: "t" }, 3)).toEqual({
      rootId: "t",
      firstPart: 1,
      partCount: 3,
      shiftLaterBy: 0,
      extendsFamily: false,
    });
  });

  it("splits a leg in its place in the family", () => {
    // Part 2 of 3 split into two: it stays part 2, the new leg is part 3,
    // the old part 3 becomes part 4, and there are now four.
    expect(planSplitNumbering({ id: "leg", splitFromTripId: "root", splitPart: 2, splitPartCount: 3 }, 2)).toEqual({
      rootId: "root",
      firstPart: 2,
      partCount: 4,
      shiftLaterBy: 1,
      extendsFamily: true,
    });
  });

  it("starts afresh when a leg's numbers don't add up", () => {
    expect(planSplitNumbering({ id: "leg", splitFromTripId: "root", splitPart: 5, splitPartCount: 3 }, 2).rootId).toBe("leg");
    expect(planSplitNumbering({ id: "leg", splitFromTripId: "root" }, 2).rootId).toBe("leg");
  });
});

describe("the server's visit split records the parts", () => {
  it("leg one (the original row) and leg two say Part 1 and 2 of 2", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(base as never);
    const res = await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1" });
    expect(res?.legs).toBe(2);

    const leg2 = tx.trip.create.mock.calls[0][0].data;
    expect(leg2).toMatchObject({ splitFromTripId: "parent-1", splitPart: 2, splitPartCount: 2, recordedBy: "automatic" });

    const leg1 = tx.trip.update.mock.calls.find((c) => c[0].where.id === "parent-1")![0].data;
    expect(leg1).toMatchObject({ splitFromTripId: "parent-1", splitPart: 1, splitPartCount: 2 });
    // Nothing else in the family to renumber.
    expect(tx.trip.updateMany).not.toHaveBeenCalled();
  });

  it("splitting the last leg again extends the same family", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue({
      ...base,
      id: "leg-b",
      splitFromTripId: "parent-1",
      splitPart: 2,
      splitPartCount: 2,
    } as never);
    await autoSplitVisitWelds({ userId: "u1", tripId: "leg-b" });

    expect(tx.trip.create.mock.calls[0][0].data).toMatchObject({ splitFromTripId: "parent-1", splitPart: 3, splitPartCount: 3 });
    expect(tx.trip.update.mock.calls.find((c) => c[0].where.id === "leg-b")![0].data).toMatchObject({
      splitFromTripId: "parent-1",
      splitPart: 2,
      splitPartCount: 3,
    });
    // The rest of the family now says "of 3".
    expect(tx.trip.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", splitFromTripId: "parent-1", id: { not: "leg-b" } },
      data: { splitPartCount: 3 },
    });
  });

  it("doesn't change where it cuts", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(base as never);
    const res = await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1" });
    const leg2 = tx.trip.create.mock.calls[0][0].data;
    expect(res?.cutTimestamps).toHaveLength(1);
    expect((leg2.startedAt as Date).getTime()).toBeGreaterThan(res!.cutTimestamps[0].getTime() - 1);
  });
});

describe("a split by hand records the parts", () => {
  it("each new leg names the trip it came from and its part", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue({ ...base, recordedBy: "start_trip" } as never);
    const cut = route()[70].recordedAt;
    await executeTripSplit({ userId: "u1", tripId: "parent-1", cutTimestamps: [cut] });

    const legs = tx.trip.create.mock.calls.map((c) => c[0].data);
    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ splitFromTripId: "parent-1", splitPart: 1, splitPartCount: 2, recordedBy: "start_trip" });
    expect(legs[1]).toMatchObject({ splitFromTripId: "parent-1", splitPart: 2, splitPartCount: 2, recordedBy: "start_trip" });
    // The gpsQuality marker the app reads today is still there.
    expect(legs[0].gpsQuality).toMatchObject({ splitFromTripId: "parent-1" });
  });

  it("an old trip with no facts still splits, and its legs say no recording method", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue({ ...base, recordedBy: null } as never);
    await executeTripSplit({ userId: "u1", tripId: "parent-1", cutTimestamps: [route()[70].recordedAt] });
    const legs = tx.trip.create.mock.calls.map((c) => c[0].data);
    expect(legs[0].recordedBy).toBeNull();
    expect(legs[1]).toMatchObject({ splitPart: 2, splitPartCount: 2 });
  });
});

describe("a visit split drops an end-edit note", () => {
  it("leg one retires the note (its miles and stand-in point went with the far end) and keeps the rest", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue({
      ...base,
      gpsQuality: {
        rawCoords: 140,
        endExtension: {
          recordedEndLat: 50.8, recordedEndLng: 0.27, recordedEndedAt: null, addedMiles: 2, breadcrumbAt: null,
        },
      },
    } as never);
    await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1" });

    const leg1 = tx.trip.update.mock.calls.find((c) => c[0].where.id === "parent-1")![0].data;
    expect(leg1.gpsQuality).toEqual({ rawCoords: 140, endExtension: null });
  });

  it("writes no gpsQuality when there is no note", async () => {
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(base as never);
    await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1" });

    const leg1 = tx.trip.update.mock.calls.find((c) => c[0].where.id === "parent-1")![0].data;
    expect(leg1).not.toHaveProperty("gpsQuality");
  });
});
