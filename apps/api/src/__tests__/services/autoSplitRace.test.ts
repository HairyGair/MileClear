/**
 * Two splits of the same trip must not both create its legs.
 *
 * Two coordinate appends a few milliseconds apart each start a visit split.
 * Both used to plan from the same breadcrumbs and both created legs two
 * onward, so the driver saw the same drive twice (31 duplicate legs across
 * 28 drivers, 28 Aug to 23 Sep 2026). The split now locks the trip and
 * checks nothing moved while it was planning.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = {
  trip: {
    create: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
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
  splitPlanStillCurrent,
  type SplitCoord,
} from "../../services/tripSplit.js";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";

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

const parent = {
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
};

/** What the locked re-read inside the transaction sees. */
function lockedView(view: { endedAt: Date | null; n: number } | null) {
  tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes("FOR UPDATE")) return view ? [{ endedAt: view.endedAt }] : [];
    return [{ n: BigInt(view ? view.n : 0) }];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.trip.findFirst).mockResolvedValue(parent as never);
  vi.mocked(prisma.tripCoordinate.findMany).mockResolvedValue(route() as never);
  let n = 0;
  tx.trip.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `leg-${++n}`, ...data }));
});

describe("autoSplitVisitWelds under a concurrent split", () => {
  it("splits when the trip is still as planned", async () => {
    lockedView({ endedAt: parent.endedAt, n: route().length });
    const res = await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1" });
    expect(res?.legs).toBe(2);
    expect(tx.trip.create).toHaveBeenCalledTimes(1);
    const sqls = tx.$queryRaw.mock.calls.map((c) => (c[0] as TemplateStringsArray).join("?"));
    expect(sqls[0]).toContain("FOR UPDATE");
  });

  it("creates nothing when another split already cut the trip", async () => {
    // The first split shrank the parent to leg one and took leg two's breadcrumbs.
    lockedView({ endedAt: new Date(T0 + 49 * 10_000), n: 50 });
    const res = await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1" });
    expect(res).toBeNull();
    expect(tx.trip.create).not.toHaveBeenCalled();
    expect(tx.trip.update).not.toHaveBeenCalled();
    expect(tx.tripCoordinate.updateMany).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith("trip.visit_auto_split_superseded", "u1", { tripId: "parent-1" });
    expect(vi.mocked(logEvent).mock.calls.some((c) => c[0] === "trip.visit_auto_split")).toBe(false);
  });

  it("leaves it to the next split when an append landed while planning", async () => {
    lockedView({ endedAt: parent.endedAt, n: route().length + 12 });
    const res = await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1" });
    expect(res).toBeNull();
    expect(tx.trip.create).not.toHaveBeenCalled();
  });

  it("creates nothing when the trip was deleted meanwhile", async () => {
    lockedView(null);
    expect(await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1" })).toBeNull();
    expect(tx.trip.create).not.toHaveBeenCalled();
  });

  it("a dry run never takes the lock", async () => {
    const res = await autoSplitVisitWelds({ userId: "u1", tripId: "parent-1", dryRun: true });
    expect(res?.legs).toBe(2);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("splitPlanStillCurrent", () => {
  const end = new Date("2026-09-22T10:00:00.123Z");
  it("is true only for the same end and breadcrumb count", () => {
    expect(splitPlanStillCurrent({ endedAt: end, coordCount: 10 }, { endedAt: new Date(end), coordCount: 10, exists: true })).toBe(true);
    expect(splitPlanStillCurrent({ endedAt: end, coordCount: 10 }, { endedAt: end, coordCount: 9, exists: true })).toBe(false);
    expect(splitPlanStillCurrent({ endedAt: end, coordCount: 10 }, { endedAt: new Date(end.getTime() - 1), coordCount: 10, exists: true })).toBe(false);
    expect(splitPlanStillCurrent({ endedAt: end, coordCount: 10 }, { endedAt: null, coordCount: 10, exists: true })).toBe(false);
    expect(splitPlanStillCurrent({ endedAt: end, coordCount: 10 }, { endedAt: end, coordCount: 10, exists: false })).toBe(false);
  });
});
