/**
 * "Road reopened" (Oct 2026): when a Street Manager closure counts as
 * reopened early, the pending row round trip, and the words. Streets and
 * places are made up (the repo is public).
 */
import { describe, it, expect } from "vitest";
import type { StreetWorksRecord } from "../../services/roadEvents.js";
import {
  REOPENED_MIN_DURATION_MS,
  buildReopenedCopy,
  detectReopened,
  findingFromMetadata,
  findingToMetadata,
  isFinishedStatus,
  latestPerReference,
  mightReopen,
  roadReopenedEnabled,
  sentReferencesFrom,
  thinGeometry,
  type StoredWorks,
} from "../../services/roadReopenedRule.js";

const H = 3600000;
// Wednesday 14 Oct 2026, 11:00 BST.
const NOW = new Date("2026-10-14T10:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * H);
const ahead = (h: number) => new Date(NOW.getTime() + h * H);

function stored(over: Partial<StoredWorks> = {}): StoredWorks {
  return {
    trafficManagement: "road_closure",
    workStatus: "in_progress",
    startAt: ago(48),
    endAt: ahead(72), // booked to run three more days
    streetName: "TEST ROAD",
    town: "TESTTOWN",
    promoter: "Test Water Ltd",
    workCategory: "standard",
    geometry: { lines: [[[52.5, -1.5], [52.501, -1.5]]], points: [] },
    ...over,
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
    promoter: "Test Water Ltd",
    workCategory: "standard",
    startAt: ago(48),
    endAt: ago(1),
    plannedEndAt: ahead(72),
    actualEndAt: ago(1),
    eventAt: NOW,
    lines: [[[52.5, -1.5], [52.501, -1.5]]],
    points: [],
    ...over,
  };
}

const upsert = (r: StreetWorksRecord) => ({ kind: "upsert" as const, record: r });
const del = (eventAt: Date = NOW) => ({ kind: "delete" as const, reference: "REF1-01", eventAt });

describe("detectReopened", () => {
  it("a closure stopped three days early: yes", () => {
    const f = detectReopened(stored(), upsert(record()));
    expect(f).not.toBeNull();
    expect(f!.reference).toBe("REF1-01");
    expect(f!.finishedAt).toEqual(ago(1));
    expect(f!.plannedEndAt).toEqual(ahead(72));
    expect(f!.streetName).toBe("TEST ROAD");
  });

  it("works with no stored row too, from the work stop message alone", () => {
    expect(detectReopened(null, upsert(record()))).not.toBeNull();
  });

  it("finished at its booked end (or within 2 hours of it): no", () => {
    expect(detectReopened(stored({ endAt: ago(1) }), upsert(record({ plannedEndAt: ago(1) })))).toBeNull();
    expect(detectReopened(stored(), upsert(record({ plannedEndAt: ahead(0.5), actualEndAt: ago(0.5) })))).toBeNull();
  });

  it("a closure with no booked end at all that finishes: yes, without 'earlier than planned'", () => {
    const f = detectReopened(stored({ endAt: null }), upsert(record({ plannedEndAt: null, endAt: ago(1) })));
    expect(f).not.toBeNull();
    expect(f!.plannedEndAt).toBeNull();
  });

  it("works that lasted under 12 hours (an overnight job): no", () => {
    const start = ago(10);
    expect(detectReopened(stored({ startAt: start }), upsert(record({ startAt: start })))).toBeNull();
    // Exactly 12 hours is enough.
    const twelve = new Date(ago(1).getTime() - REOPENED_MIN_DURATION_MS);
    expect(detectReopened(stored({ startAt: twelve }), upsert(record({ startAt: twelve })))).not.toBeNull();
  });

  it("works that never started: no", () => {
    expect(detectReopened(stored({ startAt: ahead(5) }), upsert(record({ startAt: ahead(5) })))).toBeNull();
    expect(detectReopened(stored({ startAt: null }), upsert(record({ startAt: null })))).toBeNull();
  });

  it("not a road closure (temporary lights finishing): no", () => {
    expect(
      detectReopened(stored({ trafficManagement: "multi_way_signals" }), upsert(record({ trafficManagement: "multi_way_signals" })))
    ).toBeNull();
  });

  it("a closure relaxed to lights that then finishes still counts (the road was closed)", () => {
    expect(detectReopened(stored(), upsert(record({ trafficManagement: "multi_way_signals" })))).not.toBeNull();
  });

  it("dedupe: a second completed message for works already seen finishing says nothing", () => {
    expect(detectReopened(stored({ workStatus: "completed", endAt: ago(1) }), upsert(record()))).toBeNull();
  });

  it("a work stop reported days late is stale: no", () => {
    expect(detectReopened(stored(), upsert(record({ actualEndAt: ago(30), endAt: ago(30) })))).toBeNull();
  });

  it("a permit cancelled while the closure was in place: yes", () => {
    const f = detectReopened(stored(), del());
    expect(f).not.toBeNull();
    expect(f!.finishedAt).toEqual(NOW);
    expect(f!.lines).toHaveLength(1); // geometry kept from the stored row
  });

  it("a permit cancelled before the works began, or after they were due to end: no", () => {
    expect(detectReopened(stored({ startAt: ahead(5), endAt: ahead(50) }), del())).toBeNull();
    expect(detectReopened(stored({ endAt: ago(2) }), del())).toBeNull();
    expect(detectReopened(null, del())).toBeNull();
  });

  it("an activity whose end was pulled forward to now: yes", () => {
    const f = detectReopened(
      stored({ endAt: ahead(48) }),
      upsert(record({ objectType: "ACTIVITY", workStatus: null, actualEndAt: null, endAt: ago(0.5), plannedEndAt: ago(0.5) }))
    );
    expect(f).not.toBeNull();
    // The booked end it had before is what "earlier than planned" means.
    expect(f!.plannedEndAt).toEqual(ahead(48));
  });

  it("an ordinary update to unfinished works: no", () => {
    expect(detectReopened(stored(), upsert(record({ workStatus: "in_progress", endAt: ahead(72), actualEndAt: null })))).toBeNull();
  });

  it("no geometry anywhere: no (nothing to match against)", () => {
    expect(detectReopened(stored({ geometry: {} }), del())).toBeNull();
  });
});

describe("mightReopen (when the store reads the row first)", () => {
  it("only for deletes, finished works and ends at or before now", () => {
    expect(mightReopen(del())).toBe(true);
    expect(mightReopen(upsert(record()))).toBe(true);
    expect(mightReopen(upsert(record({ workStatus: "in_progress", endAt: ahead(5), actualEndAt: null })))).toBe(false);
    expect(mightReopen(upsert(record({ workStatus: "planned", endAt: ago(1), actualEndAt: null })))).toBe(true);
  });
});

describe("isFinishedStatus", () => {
  it("reads Street Manager's statuses in any spelling", () => {
    expect(isFinishedStatus("completed")).toBe(true);
    expect(isFinishedStatus("Works Completed")).toBe(true);
    expect(isFinishedStatus("in_progress")).toBe(false);
    expect(isFinishedStatus(null)).toBe(false);
  });
});

describe("pending rows", () => {
  it("round trip through AppEvent metadata", () => {
    const f = detectReopened(stored(), upsert(record()))!;
    const back = findingFromMetadata(JSON.parse(JSON.stringify(findingToMetadata(f))));
    expect(back).toEqual(f);
  });

  it("newest per works reference, junk ignored", () => {
    const f = detectReopened(stored(), upsert(record()))!;
    const meta = findingToMetadata(f);
    const rows = [
      { createdAt: ago(3), metadata: { ...meta, streetName: "OLD NAME" } },
      { createdAt: ago(1), metadata: meta },
      { createdAt: ago(2), metadata: { ...meta, reference: "REF2-01" } },
      { createdAt: ago(1), metadata: { nonsense: true } },
    ];
    const out = latestPerReference(rows);
    expect(out.map((x) => x.reference).sort()).toEqual(["REF1-01", "REF2-01"]);
    expect(out.find((x) => x.reference === "REF1-01")!.streetName).toBe("TEST ROAD");
  });

  it("sent references from the driver's sent rows", () => {
    expect([...sentReferencesFrom([{ reference: "A" }, null, { reference: 3 }, { reference: "B" }])]).toEqual(["A", "B"]);
  });

  it("geometry is thinned for storage, keeping each line's ends", () => {
    const long = Array.from({ length: 200 }, (_, i): [number, number] => [52.5 + i * 0.0001, -1.5]);
    const t = thinGeometry([long], []);
    expect(t.lines[0].length).toBeLessThanOrEqual(40);
    expect(t.lines[0][0]).toEqual(long[0]);
    expect(t.lines[0][t.lines[0].length - 1]).toEqual(long[199]);
  });
});

describe("buildReopenedCopy", () => {
  const f = () => detectReopened(stored(), upsert(record()))!;

  it("Road reopened: <street> has reopened, earlier than planned.", () => {
    expect(buildReopenedCopy(f())).toEqual({ title: "Road reopened", body: "Test Road has reopened, earlier than planned." });
  });

  it("no booked end: just 'has reopened'", () => {
    expect(buildReopenedCopy({ ...f(), plannedEndAt: null })!.body).toBe("Test Road has reopened.");
  });

  it("names emergency and urgent works", () => {
    expect(buildReopenedCopy({ ...f(), workCategory: "immediate_emergency" })!.body).toBe(
      "Test Road has reopened after emergency works, earlier than planned."
    );
    expect(buildReopenedCopy({ ...f(), workCategory: "immediate_urgent", plannedEndAt: null })!.body).toBe(
      "Test Road has reopened after urgent works."
    );
  });

  it("keeps the street only from a long Street Manager name", () => {
    expect(buildReopenedCopy({ ...f(), streetName: "TEST ROAD FROM MILL LANE TO HIGH STREET" })!.body).toBe(
      "Test Road has reopened, earlier than planned."
    );
  });

  it("no street name: no push", () => {
    expect(buildReopenedCopy({ ...f(), streetName: null })).toBeNull();
  });

  it("no em dashes anywhere", () => {
    expect(buildReopenedCopy(f())!.body).not.toMatch(/\u2014/);
  });
});

describe("roadReopenedEnabled", () => {
  it("only when ROAD_REOPENED_PUSH is exactly 1", () => {
    expect(roadReopenedEnabled({})).toBe(false);
    expect(roadReopenedEnabled({ ROAD_REOPENED_PUSH: "true" })).toBe(false);
    expect(roadReopenedEnabled({ ROAD_REOPENED_PUSH: "1" })).toBe(true);
  });
});
