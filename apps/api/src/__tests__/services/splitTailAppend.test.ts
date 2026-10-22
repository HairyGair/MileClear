import { describe, it, expect, vi } from "vitest";

const db = vi.hoisted(() => {
  const tx = {
    trip: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    tripCoordinate: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn() },
  };
  return { tx, prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock("../../lib/prisma.js", () => ({ prisma: db.prisma }));

import { planTailAppend, appendToSplitTail } from "../../services/splitTailAppend.js";

const at = (iso: string) => new Date(iso);
const TAIL_START = at("2026-09-19T15:15:25Z");

describe("planTailAppend", () => {
  it("skips breadcrumbs already held anywhere in the split family (a replayed PATCH)", () => {
    // These moved from the parent into a later leg when the split ran, so
    // deduping against the parent alone would have re-added them.
    const held = [at("2026-09-19T15:16:00Z"), at("2026-09-19T15:17:00Z")];
    const plan = planTailAppend({
      incoming: held.map((recordedAt) => ({ lat: 51.4, lng: -0.2, recordedAt })),
      familyTimes: new Set(held.map((d) => d.getTime())),
      tailStartedAt: TAIL_START,
      tailLast: { lat: 51.4, lng: -0.2 },
    });
    expect(plan.fresh).toHaveLength(0);
    expect(plan.duplicates).toBe(2);
    expect(plan.addedMiles).toBe(0);
  });

  it("drops breadcrumbs from before the last leg started rather than bending its trail backwards", () => {
    const plan = planTailAppend({
      incoming: [{ lat: 51.4, lng: -0.2, recordedAt: at("2026-09-19T15:00:00Z") }],
      familyTimes: new Set(),
      tailStartedAt: TAIL_START,
      tailLast: null,
    });
    expect(plan.fresh).toHaveLength(0);
    expect(plan.beforeTail).toBe(1);
  });

  it("measures the new stretch from where the last leg stopped, in time order", () => {
    // ~0.5 mi per 0.0072 degrees of latitude.
    const plan = planTailAppend({
      incoming: [
        { lat: 51.4144, lng: -0.2, recordedAt: at("2026-09-19T15:32:00Z") },
        { lat: 51.4072, lng: -0.2, recordedAt: at("2026-09-19T15:30:00Z") },
      ],
      familyTimes: new Set(),
      tailStartedAt: TAIL_START,
      tailLast: { lat: 51.4, lng: -0.2 },
    });
    expect(plan.fresh.map((c) => c.lat)).toEqual([51.4072, 51.4144]);
    expect(plan.addedMiles).toBeGreaterThan(0.9);
    expect(plan.addedMiles).toBeLessThan(1.1);
  });
});

// A late replay (22 Oct 2026): merge A failed offline, a newer merge B then
// extended the tail, and A's breadcrumbs arrive afterwards (the phone keeps
// unsent breadcrumbs queued on their own). They are older than the tail's
// newest stored fix, so they are kept for the record and change nothing else.
describe("a late replay of older breadcrumbs", () => {
  const TAIL_LAST = { lat: 51.4144, lng: -0.2, recordedAt: at("2026-09-19T15:40:00Z") };
  const older = [
    { lat: 51.4072, lng: -0.2, recordedAt: at("2026-09-19T15:30:00Z") },
    { lat: 51.41, lng: -0.2, recordedAt: at("2026-09-19T15:33:00Z") },
  ];
  const newer = [{ lat: 51.4216, lng: -0.2, recordedAt: at("2026-09-19T15:45:00Z") }];

  it("plan: older breadcrumbs are inserted but add no miles and extend nothing", () => {
    const plan = planTailAppend({ incoming: older, familyTimes: new Set(), tailStartedAt: TAIL_START, tailLast: TAIL_LAST });
    expect(plan.fresh).toHaveLength(2);
    expect(plan.extend).toEqual([]);
    expect(plan.backfill).toBe(2);
    expect(plan.addedMiles).toBe(0);
  });

  it("plan: a mixed batch extends only with the newer ones, measured from the tail's last fix", () => {
    const plan = planTailAppend({ incoming: [...newer, ...older], familyTimes: new Set(), tailStartedAt: TAIL_START, tailLast: TAIL_LAST });
    expect(plan.fresh).toHaveLength(3);
    expect(plan.extend.map((c) => c.lat)).toEqual([51.4216]);
    expect(plan.backfill).toBe(2);
    // 0.0072 degrees of latitude is about 0.5 mi: tail's last fix to the new one only.
    expect(plan.addedMiles).toBeGreaterThan(0.45);
    expect(plan.addedMiles).toBeLessThan(0.55);
  });

  it("plan: a fix at exactly the tail's last time extends nothing", () => {
    const plan = planTailAppend({
      incoming: [{ lat: 51.5, lng: -0.2, recordedAt: TAIL_LAST.recordedAt }],
      familyTimes: new Set(),
      tailStartedAt: TAIL_START,
      tailLast: TAIL_LAST,
    });
    expect(plan.extend).toEqual([]);
    expect(plan.addedMiles).toBe(0);
  });

  function seedTail() {
    vi.clearAllMocks();
    db.tx.trip.findUniqueOrThrow.mockResolvedValue({
      id: "tail",
      startedAt: TAIL_START,
      endedAt: at("2026-09-19T15:40:30Z"),
      distanceMiles: 7.5,
      gpsQuality: { endExtension: { recordedEndLat: 51.4, recordedEndLng: -0.2, addedMiles: 1, recordedEndedAt: null, breadcrumbAt: null } },
    });
    db.tx.tripCoordinate.findMany.mockResolvedValue([]);
    db.tx.tripCoordinate.findFirst.mockResolvedValue(TAIL_LAST);
  }
  const family = { familyIds: ["parent", "tail"], tailId: "tail" };

  it("(a) the tail keeps its distance, end pin, end address, end note and end time; the fixes are inserted", async () => {
    seedTail();
    const r = await appendToSplitTail({ userId: "u", family, coordinates: older });
    expect(db.tx.tripCoordinate.createMany).toHaveBeenCalledTimes(1);
    expect(db.tx.tripCoordinate.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(db.tx.trip.update).toHaveBeenCalledTimes(1);
    expect(db.tx.trip.update.mock.calls[0][0]).toEqual({ where: { id: "tail" }, data: { coordinateCount: { increment: 2 } } });
    expect(r).toMatchObject({ appended: 2, extended: 0, addedMiles: 0 });
  });

  it("(b) a mixed batch moves the end to the newest fix and adds only the newer stretch", async () => {
    seedTail();
    const r = await appendToSplitTail({ userId: "u", family, coordinates: [...older, ...newer] });
    const data = db.tx.trip.update.mock.calls[0][0].data;
    expect(data.coordinateCount).toEqual({ increment: 3 });
    expect(data.endLat).toBe(51.4216);
    expect(data.endedAt).toEqual(newer[0].recordedAt);
    expect(data.distanceMiles).toBeCloseTo(7.5 + r.addedMiles, 2);
    expect(r.addedMiles).toBeGreaterThan(0.45);
    expect(r.addedMiles).toBeLessThan(0.55);
    expect(r).toMatchObject({ appended: 3, extended: 1 });
  });
});
