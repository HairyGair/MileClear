/**
 * "Road reopened" on the Street Manager store path (Oct 2026): the row is read
 * before a message that could finish a closure, a pending row is written once
 * per works reference when the closure finished early, and nothing is read
 * or written for ordinary messages or older ones.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  updateCount: 1,
  deleteCount: 1,
  seenPending: false,
}));
const logEvent = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn(async () => db.row));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    streetWorksEvent: {
      findUnique,
      updateMany: vi.fn(async () => ({ count: db.updateCount })),
      create: vi.fn(async () => {
        throw Object.assign(new Error("dupe"), { code: "P2002" });
      }),
      deleteMany: vi.fn(async () => ({ count: db.deleteCount })),
    },
    appEvent: { findFirst: vi.fn(async () => (db.seenPending ? { id: "x" } : null)) },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent }));

import { applyStreetWorksChange } from "../../services/streetManager.js";
import { ROAD_REOPENED_PENDING_EVENT } from "../../services/roadReopenedRule.js";
import type { StreetWorksRecord } from "../../services/roadEvents.js";

const H = 3600000;
const NOW = new Date("2026-10-14T10:00:00Z");
const at = (h: number) => new Date(NOW.getTime() + h * H);

function storedClosure() {
  return {
    trafficManagement: "road_closure",
    workStatus: "in_progress",
    startAt: at(-48),
    endAt: at(72),
    streetName: "TEST ROAD",
    town: "TESTTOWN",
    promoter: null,
    workCategory: "standard",
    geometry: { lines: [[[52.5, -1.5], [52.501, -1.5]]], points: [] },
  };
}

function record(over: Partial<StreetWorksRecord> = {}): StreetWorksRecord {
  return {
    reference: "REF1-01",
    objectType: "PERMIT",
    trafficManagement: "road_closure",
    isTrafficSensitive: true,
    workStatus: "completed",
    streetName: "TEST ROAD",
    town: "TESTTOWN",
    areaName: null,
    highwayAuthority: null,
    promoter: null,
    workCategory: "standard",
    startAt: at(-48),
    endAt: at(-1),
    plannedEndAt: at(72),
    actualEndAt: at(-1),
    eventAt: NOW,
    lines: [[[52.5, -1.5], [52.501, -1.5]]],
    points: [],
    ...over,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  db.row = storedClosure();
  db.updateCount = 1;
  db.deleteCount = 1;
  db.seenPending = false;
  logEvent.mockReset();
  findUnique.mockClear();
});

describe("applyStreetWorksChange and Road reopened", () => {
  it("a work stop three days early writes one pending row", async () => {
    expect(await applyStreetWorksChange({ kind: "upsert", record: record() })).toBe("stored");
    await flush();
    const call = logEvent.mock.calls.find((c) => c[0] === ROAD_REOPENED_PENDING_EVENT)!;
    expect(call[1]).toBeNull();
    expect(call[2]).toMatchObject({ reference: "REF1-01", streetName: "TEST ROAD" });
  });

  it("a redelivery after the pending row exists writes nothing more", async () => {
    db.seenPending = true;
    await applyStreetWorksChange({ kind: "upsert", record: record() });
    await flush();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("an older message (not applied) writes nothing", async () => {
    db.updateCount = 0;
    await applyStreetWorksChange({ kind: "upsert", record: record() });
    await flush();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("a cancel while the closure was in place writes one; a cancel that deleted nothing does not", async () => {
    await applyStreetWorksChange({ kind: "delete", reference: "REF1-01", eventAt: NOW });
    await flush();
    expect(logEvent).toHaveBeenCalledTimes(1);
    logEvent.mockReset();
    db.deleteCount = 0;
    await applyStreetWorksChange({ kind: "delete", reference: "REF1-01", eventAt: NOW });
    await flush();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("ordinary updates to unfinished works never read the row first", async () => {
    await applyStreetWorksChange({ kind: "upsert", record: record({ workStatus: "in_progress", endAt: at(72), actualEndAt: null }) });
    await flush();
    expect(findUnique).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });
});
