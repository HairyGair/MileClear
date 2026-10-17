/**
 * Street Manager store (17 Oct 2026). Two SNS messages for one reference at
 * once used to make prisma.upsert (a read then an INSERT on MySQL) insert
 * twice and fail with P2002 on street_works_events_reference_key. The fake
 * table below behaves like MySQL: each statement is atomic, the reference is
 * unique, and every call yields first so concurrent calls interleave.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  reference: string;
  lastEventAt: Date;
  streetName: string | null;
}

const db = vi.hoisted(() => ({ rows: new Map<string, Row>(), creates: 0, clashes: 0 }));

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    streetWorksEvent: {
      updateMany: vi.fn(async (args: { where: { reference: string; lastEventAt: { lte: Date } }; data: Row }) => {
        await tick();
        const row = db.rows.get(args.where.reference);
        if (!row || row.lastEventAt > args.where.lastEventAt.lte) return { count: 0 };
        db.rows.set(row.reference, { ...row, lastEventAt: args.data.lastEventAt, streetName: args.data.streetName });
        return { count: 1 };
      }),
      create: vi.fn(async (args: { data: Row }) => {
        await tick();
        if (db.rows.has(args.data.reference)) {
          db.clashes++;
          throw Object.assign(new Error("Unique constraint failed on the constraint: `street_works_events_reference_key`"), {
            code: "P2002",
          });
        }
        db.creates++;
        db.rows.set(args.data.reference, {
          reference: args.data.reference,
          lastEventAt: args.data.lastEventAt,
          streetName: args.data.streetName,
        });
        return args.data;
      }),
    },
  },
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: () => {} }));

import { upsertWorks } from "../../services/streetManager.js";
import type { StreetWorksRecord } from "../../services/roadEvents.js";

function record(eventAt: string, streetName: string, reference = "RB123-PERMIT-1"): StreetWorksRecord {
  return {
    reference,
    objectType: "PERMIT",
    trafficManagement: "road_closure",
    isTrafficSensitive: true,
    workStatus: "planned",
    streetName,
    town: "Leeds",
    areaName: null,
    highwayAuthority: null,
    promoter: null,
    startAt: null,
    endAt: null,
    eventAt: new Date(eventAt),
    lines: [],
    points: [[53.8, -1.55]],
  };
}

const OLDER = "2026-10-16T22:00:00Z";
const NEWER = "2026-10-16T22:05:00Z";

beforeEach(() => {
  db.rows.clear();
  db.creates = 0;
  db.clashes = 0;
});

describe("Street Manager store", () => {
  it("one after the other, newer then older: the newer stays", async () => {
    expect(await upsertWorks(record(NEWER, "New Road"))).toBe("created");
    expect(await upsertWorks(record(OLDER, "Old Road"))).toBe("older");
    expect(db.rows.get("RB123-PERMIT-1")).toMatchObject({ streetName: "New Road", lastEventAt: new Date(NEWER) });
  });

  it("one after the other, older then newer: the newer replaces it", async () => {
    expect(await upsertWorks(record(OLDER, "Old Road"))).toBe("created");
    expect(await upsertWorks(record(NEWER, "New Road"))).toBe("updated");
    expect(db.rows.get("RB123-PERMIT-1")).toMatchObject({ streetName: "New Road", lastEventAt: new Date(NEWER) });
  });

  it("the same message twice (an SNS redelivery) is harmless", async () => {
    await upsertWorks(record(NEWER, "New Road"));
    expect(await upsertWorks(record(NEWER, "New Road"))).toBe("updated");
    expect(db.rows.size).toBe(1);
  });

  it("two at once for a new reference, older first: no error, newer wins", async () => {
    const results = await Promise.all([upsertWorks(record(OLDER, "Old Road")), upsertWorks(record(NEWER, "New Road"))]);
    expect(db.clashes).toBe(1); // the race really happened, and was absorbed
    expect(db.creates).toBe(1);
    expect(results.sort()).toEqual(["created", "updated"]);
    expect(db.rows.get("RB123-PERMIT-1")).toMatchObject({ streetName: "New Road", lastEventAt: new Date(NEWER) });
  });

  it("two at once for a new reference, newer first: no error, the older one is dropped", async () => {
    const results = await Promise.all([upsertWorks(record(NEWER, "New Road")), upsertWorks(record(OLDER, "Old Road"))]);
    expect(db.clashes).toBe(1);
    expect(results).toEqual(["created", "older"]);
    expect(db.rows.get("RB123-PERMIT-1")).toMatchObject({ streetName: "New Road", lastEventAt: new Date(NEWER) });
  });

  it("a burst of ten for one reference in any order ends on the newest, with no error", async () => {
    const times = Array.from({ length: 10 }, (_, i) => new Date(Date.UTC(2026, 9, 16, 22, i)).toISOString());
    const shuffled = [3, 7, 0, 9, 1, 5, 2, 8, 6, 4].map((i) => record(times[i], `Road ${i}`));
    await expect(Promise.all(shuffled.map((r) => upsertWorks(r)))).resolves.toHaveLength(10);
    expect(db.creates).toBe(1);
    expect(db.rows.get("RB123-PERMIT-1")).toMatchObject({ streetName: "Road 9", lastEventAt: new Date(times[9]) });
  });

  it("different references at once each get their own row", async () => {
    await Promise.all([upsertWorks(record(OLDER, "A", "REF-A")), upsertWorks(record(OLDER, "B", "REF-B"))]);
    expect(db.clashes).toBe(0);
    expect([...db.rows.keys()].sort()).toEqual(["REF-A", "REF-B"]);
  });

  it("saves the work category, and a message without one never clears it", async () => {
    const { prisma } = await import("../../lib/prisma.js");
    const update = vi.mocked(prisma.streetWorksEvent.updateMany);
    update.mockClear();
    await upsertWorks({ ...record(OLDER, "Old Road"), workCategory: "immediate_emergency" });
    const created = vi.mocked(prisma.streetWorksEvent.create).mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(created.data.workCategory).toBe("immediate_emergency");
    // An activity-style message with no category: the update leaves the
    // column out altogether, so the stored value stays.
    await upsertWorks({ ...record(NEWER, "New Road"), workCategory: null });
    const data = (update.mock.calls.at(-1)![0] as { data: Record<string, unknown> }).data;
    expect("workCategory" in data).toBe(false);
  });

  it("any other database error still fails the message, so SNS retries it", async () => {
    const { prisma } = await import("../../lib/prisma.js");
    vi.mocked(prisma.streetWorksEvent.create).mockRejectedValueOnce(Object.assign(new Error("Can't reach database"), { code: "P1001" }));
    await expect(upsertWorks(record(OLDER, "Old Road"))).rejects.toThrow("Can't reach database");
  });
});
