/**
 * Split application writes names onto the new boundaries.
 *
 * Both places a split creates legs (the automatic visit split and the
 * driver-confirmed split) name the stop at split time: saved place first,
 * then the geocoder. A geocoder that is down leaves the stop null for the
 * backfill job and the split still goes through.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = {
  trip: {
    create: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    findMany: vi.fn(),
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
  reverseGeocodeDetailed: vi.fn(),
}));

vi.mock("../../services/appEvents.js", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../../services/mileage.js", () => ({
  upsertMileageSummary: vi.fn().mockResolvedValue(undefined),
}));

import { autoSplitVisitWelds, executeTripSplit, type SplitCoord } from "../../services/tripSplit.js";
import { prisma } from "../../lib/prisma.js";
import { reverseGeocodeDetailed } from "../../services/geocoding.js";
import { logEvent } from "../../services/appEvents.js";

const T0 = new Date("2026-09-17T17:40:00Z").getTime();

// Same shape as autoVisitSplit.test.ts: ~2 miles, a 6.5 minute stop, ~2 miles.
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

const parent = {
  id: "parent-1",
  userId: "u1",
  shiftId: null,
  vehicleId: null,
  isManualEntry: false,
  isPhantomTrip: false,
  endedAt: new Date(T0 + 140 * 10_000),
  startedAt: new Date(T0),
  distanceMiles: 4,
  gpsQuality: null,
  startAddress: "Station Parade",
  endAddress: "Home",
  classification: "business",
  platformTag: null,
  businessPurpose: null,
  category: null,
  projectLabel: null,
  notes: null,
};

function setUp() {
  vi.clearAllMocks();
  vi.mocked(prisma.trip.findFirst).mockResolvedValue(parent as never);
  vi.mocked(prisma.tripCoordinate.findMany).mockResolvedValue(route() as never);
  vi.mocked(prisma.savedLocation.findMany).mockResolvedValue([] as never);
  let n = 0;
  tx.trip.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `leg-${++n}`, ...data }));
  tx.trip.findMany.mockResolvedValue([]);
  // The split's lock-and-recheck sees the trip exactly as it was planned.
  tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
    strings.join("?").includes("FOR UPDATE") ? [{ endedAt: parent.endedAt }] : [{ n: route().length }]
  );
}

describe("autoSplitVisitWelds names the stop", () => {
  beforeEach(setUp);

  it("writes geocoded names on both sides of the stop and keeps the outer addresses", async () => {
    vi.mocked(reverseGeocodeDetailed).mockResolvedValue({ address: "20 Gildredge Road", outcome: "found", cached: true });

    const res = await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1" });
    expect(res?.legs).toBe(2);

    const parentUpdate = tx.trip.update.mock.calls[0][0].data;
    expect(parentUpdate.endAddress).toBe("20 Gildredge Road");
    expect(parentUpdate).not.toHaveProperty("startAddress");

    const leg = tx.trip.create.mock.calls[0][0].data;
    expect(leg.startAddress).toBe("20 Gildredge Road");
    expect(leg.endAddress).toBe("Home");

    expect(logEvent).toHaveBeenCalledWith("trip.address_backfilled", "u1", {
      tripId: "parent-1",
      filledStart: false,
      filledEnd: true,
      source: "split",
    });
    expect(logEvent).toHaveBeenCalledWith("trip.address_backfilled", "u1", {
      tripId: "leg-1",
      filledStart: true,
      filledEnd: false,
      source: "split",
    });
  });

  it("still splits with null stop names when the geocoder is down", async () => {
    vi.mocked(reverseGeocodeDetailed).mockResolvedValue({ address: null, outcome: "unavailable", cached: false });

    const res = await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1" });
    expect(res?.legs).toBe(2);
    expect(tx.trip.update.mock.calls[0][0].data.endAddress).toBeNull();
    expect(tx.trip.create.mock.calls[0][0].data.startAddress).toBeNull();
    expect(tx.trip.create.mock.calls[0][0].data.endAddress).toBe("Home");
    expect(vi.mocked(logEvent).mock.calls.some((c) => c[0] === "trip.address_backfilled")).toBe(false);
  });

  it("makes no lookup on a dry run", async () => {
    await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1", dryRun: true });
    expect(reverseGeocodeDetailed).not.toHaveBeenCalled();
  });
});

describe("executeTripSplit names the stop", () => {
  beforeEach(setUp);

  it("writes geocoded names on the interior boundaries only", async () => {
    vi.mocked(reverseGeocodeDetailed).mockResolvedValue({ address: "Tesco Express", outcome: "found", cached: true });
    const cut = route()[70].recordedAt;

    await executeTripSplit({ userId: "u1", tripId: "parent-1", cutTimestamps: [cut] });

    const [first, second] = tx.trip.create.mock.calls.map((c) => c[0].data);
    expect(first.startAddress).toBe("Station Parade");
    expect(first.endAddress).toBe("Tesco Express");
    expect(second.startAddress).toBe("Tesco Express");
    expect(second.endAddress).toBe("Home");
    expect(reverseGeocodeDetailed).toHaveBeenCalledTimes(2);
  });
});

describe("executeTripSplit counts each leg's breadcrumbs", () => {
  beforeEach(setUp);

  it("gives every leg the number of breadcrumbs it holds, not the default 0", async () => {
    vi.mocked(reverseGeocodeDetailed).mockResolvedValue({ address: null, outcome: "unavailable", cached: false });
    // The rows moved match the legs exactly: 71 up to the cut, 69 after.
    tx.tripCoordinate.updateMany.mockResolvedValueOnce({ count: 71 }).mockResolvedValueOnce({ count: 69 });
    const cut = route()[70].recordedAt;

    await executeTripSplit({ userId: "u1", tripId: "parent-1", cutTimestamps: [cut] });

    const counts = tx.trip.create.mock.calls.map((c) => c[0].data.coordinateCount);
    expect(counts).toEqual([71, 69]);
    // Nothing to correct, so no extra write.
    expect(tx.trip.update).not.toHaveBeenCalled();
  });

  it("corrects a leg's count to the rows actually moved when they differ", async () => {
    vi.mocked(reverseGeocodeDetailed).mockResolvedValue({ address: null, outcome: "unavailable", cached: false });
    // Two breadcrumbs sharing the cut's timestamp: the time-based move puts
    // one more row on the second leg than the index partition did.
    tx.tripCoordinate.updateMany.mockResolvedValueOnce({ count: 71 }).mockResolvedValueOnce({ count: 70 });
    const cut = route()[70].recordedAt;

    await executeTripSplit({ userId: "u1", tripId: "parent-1", cutTimestamps: [cut] });

    expect(tx.trip.update).toHaveBeenCalledTimes(1);
    expect(tx.trip.update).toHaveBeenCalledWith({
      where: { id: "leg-2" },
      data: { coordinateCount: 70 },
    });
  });
});
