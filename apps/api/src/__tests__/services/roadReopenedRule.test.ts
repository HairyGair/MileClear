/**
 * "Road reopened" (Oct 2026): when a Street Manager closure counts as
 * reopened early, one closure across several references, the pending row
 * round trip, and the words. Messages are built from the repo fixture's
 * shape (a booked end DATE with no time, as real permits send). Streets and
 * places are made up (the repo is public).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseStreetManagerMessage } from "../../services/roadEvents.js";
import {
  REOPENED_MIN_DURATION_MS,
  buildReopenedCopy,
  clusterFindings,
  detectReopened,
  findingFromMetadata,
  findingToMetadata,
  finishedEarly,
  isFinishedStatus,
  latestPerReference,
  looksLikeEndOfDay,
  mightReopen,
  roadReopenedEnabled,
  sameClosure,
  sentReferencesFrom,
  thinGeometry,
  type AppliedChange,
  type ReopenedFinding,
  type StoredWorks,
} from "../../services/roadReopenedRule.js";

const FIX = path.resolve(__dirname, "../fixtures/roadAlerts");
const sm = JSON.parse(readFileSync(path.join(FIX, "street-manager-messages.json"), "utf8"));

const H = 3600000;

/** The fixture permit (booked 10 Oct 13:50 UTC to the END of 12 Oct, no end
 *  time) with changes to its object_data. */
function permitMessage(data: Record<string, unknown>, eventTime: string, eventType = "WORK_STOP") {
  return {
    ...sm.permitLinestring,
    event_type: eventType,
    event_time: eventTime,
    object_data: { ...sm.permitLinestring.object_data, current_traffic_management_type_ref: "road_closure", ...data },
  };
}

function applied(msg: unknown): AppliedChange {
  const c = parseStreetManagerMessage(msg);
  if (c.kind === "ignore") throw new Error(`ignored: ${c.reason}`);
  return c;
}

/** A work stop: actual start 10 Oct 14:00 UTC, actual end as given. */
function workStop(actualEnd: string, extra: Record<string, unknown> = {}) {
  return applied(
    permitMessage(
      { work_status_ref: "completed", actual_start_date_time: "2026-10-10T14:00:00.000Z", actual_end_date_time: actualEnd, ...extra },
      new Date(new Date(actualEnd).getTime() + 5 * 60000).toISOString()
    )
  );
}

/** The row as stored while the works were under way. */
function stored(over: Partial<StoredWorks> = {}): StoredWorks {
  return {
    trafficManagement: "road_closure",
    workStatus: "in_progress",
    startAt: new Date("2026-10-10T14:00:00.000Z"),
    endAt: new Date("2026-10-12T23:59:59.000Z"), // end of the booked day
    streetName: "HIGH STREET NORTH",
    town: "LONDON",
    promoter: "Smoke Test Promoter",
    workCategory: "standard",
    geometry: { lines: [[[51.88, -0.42], [51.879, -0.419]]], points: [] },
    ...over,
  };
}

describe("detectReopened: the booked end (date only, as real permits send it)", () => {
  it("parses the fixture's end as the last second of the booked day, with no time", () => {
    const c = workStop("2026-10-11T14:00:00.000Z");
    if (c.kind !== "upsert") throw new Error("expected upsert");
    expect(c.record.plannedEndAt).toEqual(new Date("2026-10-12T23:59:59.000Z"));
    expect(c.record.plannedEndHasTime).toBe(false);
    expect(c.record.actualStartAt).toEqual(new Date("2026-10-10T14:00:00.000Z"));
    expect(c.record.workReference).toBe("TSR1591199404915");
  });

  it("finished at 15:00 on its last booked day: on time, not early", () => {
    expect(detectReopened(stored(), workStop("2026-10-12T14:00:00.000Z"))).toBeNull();
    expect(detectReopened(null, workStop("2026-10-12T14:00:00.000Z"))).toBeNull();
  });

  it("finished a day before the booked day: early", () => {
    const f = detectReopened(stored(), workStop("2026-10-11T14:00:00.000Z"));
    expect(f).not.toBeNull();
    expect(f!.reference).toBe("TSR1591199404915-01");
    expect(f!.finishedAt).toEqual(new Date("2026-10-11T14:00:00.000Z"));
    expect(f!.plannedEndAt).toEqual(new Date("2026-10-12T23:59:59.000Z"));
  });

  it("finished late on the evening before the booked day (UK time): early", () => {
    // 11 Oct 22:30 UTC is 23:30 BST on 11 Oct.
    expect(detectReopened(stored(), workStop("2026-10-11T22:30:00.000Z"))).not.toBeNull();
    // 11 Oct 23:30 UTC is 00:30 BST on 12 Oct, the booked day.
    expect(detectReopened(stored(), workStop("2026-10-11T23:30:00.000Z"))).toBeNull();
  });

  it("BST-style dates (the day's UK midnight in UTC) read the same", () => {
    const c = workStop("2026-10-12T14:00:00.000Z", { proposed_end_date: "2026-10-11T23:00:00.000Z" });
    if (c.kind !== "upsert") throw new Error("expected upsert");
    expect(c.record.plannedEndAt).toEqual(new Date("2026-10-12T22:59:59.000Z"));
    expect(detectReopened(stored(), c)).toBeNull(); // 12 Oct both
    expect(detectReopened(stored(), workStop("2026-10-11T14:00:00.000Z", { proposed_end_date: "2026-10-11T23:00:00.000Z" }))).not.toBeNull();
  });

  it("with a booked end time: at least 2 hours early counts, less does not", () => {
    const timed = { proposed_end_time: "2026-10-12T18:00:00.000Z" };
    expect(detectReopened(stored(), workStop("2026-10-12T14:00:00.000Z", timed))).not.toBeNull();
    expect(detectReopened(stored(), workStop("2026-10-12T17:00:00.000Z", timed))).toBeNull();
  });

  it("finishedEarly and looksLikeEndOfDay on their own", () => {
    const eod = new Date("2026-10-12T23:59:59.000Z");
    expect(looksLikeEndOfDay(eod)).toBe(true);
    expect(looksLikeEndOfDay(new Date("2026-10-12T18:00:00.000Z"))).toBe(false);
    expect(finishedEarly(new Date("2026-10-12T09:00:00Z"), eod, false)).toBe(false);
    expect(finishedEarly(new Date("2026-10-11T09:00:00Z"), eod, false)).toBe(true);
    expect(finishedEarly(new Date("2026-10-11T09:00:00Z"), null, false)).toBe(true);
  });

  it("no booked end at all: counts, without 'earlier than planned'", () => {
    const f = detectReopened(stored({ endAt: null }), workStop("2026-10-11T14:00:00.000Z", { proposed_end_date: null }));
    expect(f).not.toBeNull();
    expect(f!.plannedEndAt).toBeNull();
  });
});

describe("detectReopened: what counts as finished", () => {
  it("works that lasted under 12 hours (an overnight job): no", () => {
    const start = new Date("2026-10-11T04:00:00.000Z");
    const c = workStop("2026-10-11T14:00:00.000Z", { actual_start_date_time: start.toISOString() });
    expect(detectReopened(stored({ startAt: start }), c)).toBeNull();
    const twelve = new Date(new Date("2026-10-11T14:00:00.000Z").getTime() - REOPENED_MIN_DURATION_MS);
    expect(
      detectReopened(stored({ startAt: twelve }), workStop("2026-10-11T14:00:00.000Z", { actual_start_date_time: twelve.toISOString() }))
    ).not.toBeNull();
  });

  it("a work stop for works never seen started (no actual start, never in progress): no", () => {
    const c = workStop("2026-10-11T14:00:00.000Z", { actual_start_date_time: null });
    expect(detectReopened(stored({ workStatus: "planned" }), c)).toBeNull();
    expect(detectReopened(null, c)).toBeNull();
    // Stored as in progress is enough.
    expect(detectReopened(stored(), c)).not.toBeNull();
  });

  it("not a road closure (temporary lights finishing): no", () => {
    const c = workStop("2026-10-11T14:00:00.000Z", { current_traffic_management_type_ref: "multi_way_signals" });
    expect(detectReopened(stored({ trafficManagement: "multi_way_signals" }), c)).toBeNull();
  });

  it("a closure relaxed to lights that then finishes still counts (the road was closed)", () => {
    const c = workStop("2026-10-11T14:00:00.000Z", { current_traffic_management_type_ref: "multi_way_signals" });
    expect(detectReopened(stored(), c)).not.toBeNull();
  });

  it("dedupe: a completed message for works already seen finishing says nothing", () => {
    expect(detectReopened(stored({ workStatus: "completed" }), workStop("2026-10-11T14:00:00.000Z"))).toBeNull();
  });

  it("a work stop reported days late is stale: no", () => {
    const c = applied(
      permitMessage(
        { work_status_ref: "completed", actual_start_date_time: "2026-10-09T08:00:00.000Z", actual_end_date_time: "2026-10-10T08:00:00.000Z" },
        "2026-10-12T08:00:00.000Z"
      )
    );
    expect(detectReopened(stored({ startAt: new Date("2026-10-09T08:00:00.000Z") }), c)).toBeNull();
  });

  it("a permit cancelled while we had it in progress: yes", () => {
    const c = applied(permitMessage({}, "2026-10-11T09:00:00.000Z", "PERMIT_CANCELLED"));
    expect(c).toMatchObject({ kind: "delete", reason: "cancelled" });
    const f = detectReopened(stored(), c);
    expect(f).not.toBeNull();
    expect(f!.finishedAt).toEqual(new Date("2026-10-11T09:00:00.000Z"));
    expect(f!.lines).toHaveLength(1); // geometry kept from the stored row
  });

  it("a cancellation of works never seen in progress: no", () => {
    const c = applied(permitMessage({}, "2026-10-11T09:00:00.000Z", "PERMIT_CANCELLED"));
    expect(detectReopened(stored({ workStatus: "planned" }), c)).toBeNull();
    expect(detectReopened(stored({ workStatus: null }), c)).toBeNull();
    expect(detectReopened(null, c)).toBeNull();
  });

  it("a permit whose traffic management dropped to something we do not keep: never a reopening", () => {
    const relaxed = applied(
      permitMessage({ current_traffic_management_type_ref: "no_carriageway_incursion", work_status_ref: "in_progress" }, "2026-10-11T09:00:00.000Z", "PERMIT_VARIATION")
    );
    expect(relaxed).toMatchObject({ kind: "delete", reason: "relaxed" });
    expect(mightReopen(relaxed)).toBe(false);
    expect(detectReopened(stored(), relaxed)).toBeNull();
    const missing = applied(
      permitMessage(
        { current_traffic_management_type_ref: null, traffic_management_type_ref: null, traffic_management_type: null },
        "2026-10-11T09:00:00.000Z",
        "PERMIT_VARIATION"
      )
    );
    expect(missing).toMatchObject({ kind: "delete", reason: "relaxed" });
    expect(detectReopened(stored(), missing)).toBeNull();
  });

  it("dropped to nothing we keep on a message that says the works are completed: yes", () => {
    const c = applied(
      permitMessage(
        {
          current_traffic_management_type_ref: "no_carriageway_incursion",
          work_status_ref: "completed",
          actual_end_date_time: "2026-10-11T08:30:00.000Z",
        },
        "2026-10-11T09:00:00.000Z"
      )
    );
    expect(c).toMatchObject({ kind: "delete", reason: "completed" });
    const f = detectReopened(stored(), c);
    expect(f?.finishedAt).toEqual(new Date("2026-10-11T08:30:00.000Z"));
  });

  it("an activity whose end was pulled forward to now: yes, against its old booked day", () => {
    const msg = {
      ...sm.activity,
      event_type: "ACTIVITY_UPDATED",
      event_time: "2026-10-11T09:05:00.000Z",
      object_data: { ...sm.activity.object_data, end_date: "2026-10-11T00:00:00.000Z", end_time: "2026-10-11T09:00:00.000Z" },
    };
    const before = stored({ startAt: new Date("2026-10-10T08:00:00.000Z"), endAt: new Date("2026-10-12T23:59:59.000Z"), workStatus: null });
    const f = detectReopened(before, applied(msg));
    expect(f).not.toBeNull();
    expect(f!.plannedEndAt).toEqual(new Date("2026-10-12T23:59:59.000Z"));
  });

  it("a permit end pulled forward is not a reopening (only an explicit status says so)", () => {
    const c = applied(
      permitMessage(
        { work_status_ref: "in_progress", actual_start_date_time: "2026-10-10T14:00:00.000Z", proposed_end_date: "2026-10-10T00:00:00.000Z" },
        "2026-10-11T09:00:00.000Z",
        "PERMIT_VARIATION"
      )
    );
    expect(mightReopen(c)).toBe(false);
    expect(detectReopened(stored(), c)).toBeNull();
  });

  it("an ordinary update to unfinished works: no", () => {
    const c = applied(permitMessage({ work_status_ref: "in_progress", actual_start_date_time: "2026-10-10T14:00:00.000Z" }, "2026-10-11T09:00:00.000Z", "WORK_START"));
    expect(mightReopen(c)).toBe(false);
    expect(detectReopened(stored(), c)).toBeNull();
  });

  it("no geometry anywhere: no (nothing to match against)", () => {
    const c = applied(permitMessage({}, "2026-10-11T09:00:00.000Z", "PERMIT_CANCELLED"));
    expect(detectReopened(stored({ geometry: {} }), c)).toBeNull();
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

function finding(over: Partial<ReopenedFinding> = {}): ReopenedFinding {
  return {
    reference: "P1-01",
    workReference: null,
    streetName: "TEST ROAD",
    town: "TESTTOWN",
    promoter: null,
    workCategory: "standard",
    startedAt: new Date("2026-10-10T14:00:00Z"),
    finishedAt: new Date("2026-10-11T14:00:00Z"),
    plannedEndAt: new Date("2026-10-12T23:59:59Z"),
    lines: [[[52.5, -1.5], [52.501, -1.5]]],
    points: [],
    ...over,
  };
}

describe("one closure, several references", () => {
  it("a permit and its activity on the same street within 150 m are one closure", () => {
    const permit = finding();
    const activity = finding({ reference: "ARN-1", streetName: "Test Road", lines: [[[52.5005, -1.5005], [52.502, -1.5]]] });
    expect(sameClosure(permit, activity)).toBe(true);
    const c = clusterFindings([permit, activity]);
    expect(c).toHaveLength(1);
    expect(c[0].references.sort()).toEqual(["ARN-1", "P1-01"]);
  });

  it("two permits for one job (shared works reference) are one closure, whatever the street", () => {
    expect(sameClosure(finding({ workReference: "W1" }), finding({ reference: "P1-02", workReference: "W1", streetName: "OTHER" }))).toBe(true);
  });

  it("the same street far apart, or different streets close together, are two", () => {
    expect(sameClosure(finding(), finding({ reference: "P2-01", lines: [[[52.6, -1.5], [52.601, -1.5]]] }))).toBe(false);
    expect(sameClosure(finding(), finding({ reference: "P3-01", streetName: "MILL LANE" }))).toBe(false);
  });

  it("the lead is the latest finish", () => {
    const early = finding({ finishedAt: new Date("2026-10-11T10:00:00Z") });
    const late = finding({ reference: "ARN-1", finishedAt: new Date("2026-10-11T12:00:00Z") });
    expect(clusterFindings([early, late])[0].lead.reference).toBe("ARN-1");
  });
});

describe("pending rows", () => {
  it("round trip through AppEvent metadata", () => {
    const f = detectReopened(stored(), workStop("2026-10-11T14:00:00.000Z"))!;
    const back = findingFromMetadata(JSON.parse(JSON.stringify(findingToMetadata(f))));
    expect(back).toEqual(f);
  });

  it("newest per works reference, junk ignored", () => {
    const meta = findingToMetadata(finding());
    const at = (h: number) => new Date(Date.UTC(2026, 9, 11, 12) - h * H);
    const rows = [
      { createdAt: at(3), metadata: { ...meta, streetName: "OLD NAME" } },
      { createdAt: at(1), metadata: meta },
      { createdAt: at(2), metadata: { ...meta, reference: "REF2-01" } },
      { createdAt: at(1), metadata: { nonsense: true } },
    ];
    const out = latestPerReference(rows);
    expect(out.map((x) => x.reference).sort()).toEqual(["P1-01", "REF2-01"]);
    expect(out.find((x) => x.reference === "P1-01")!.streetName).toBe("TEST ROAD");
  });

  it("sent references from the driver's sent rows, every part of the closure", () => {
    expect([...sentReferencesFrom([{ reference: "A", references: ["A", "B"] }, null, { reference: 3 }, { reference: "C" }])].sort()).toEqual([
      "A",
      "B",
      "C",
    ]);
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
  it("Road reopened: <street> has reopened, earlier than planned.", () => {
    expect(buildReopenedCopy(finding())).toEqual({ title: "Road reopened", body: "Test Road has reopened, earlier than planned." });
  });

  it("no booked end: just 'has reopened'", () => {
    expect(buildReopenedCopy(finding({ plannedEndAt: null }))!.body).toBe("Test Road has reopened.");
  });

  it("names emergency and urgent works", () => {
    expect(buildReopenedCopy(finding({ workCategory: "immediate_emergency" }))!.body).toBe(
      "Test Road has reopened after emergency works, earlier than planned."
    );
    expect(buildReopenedCopy(finding({ workCategory: "immediate_urgent", plannedEndAt: null }))!.body).toBe(
      "Test Road has reopened after urgent works."
    );
  });

  it("keeps the street only from a long Street Manager name", () => {
    expect(buildReopenedCopy(finding({ streetName: "TEST ROAD FROM MILL LANE TO HIGH STREET" }))!.body).toBe(
      "Test Road has reopened, earlier than planned."
    );
  });

  it("no street name: no push", () => {
    expect(buildReopenedCopy(finding({ streetName: null }))).toBeNull();
  });

  it("no em dashes", () => {
    expect(buildReopenedCopy(finding())!.body).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
  });
});

describe("roadReopenedEnabled", () => {
  it("only when ROAD_REOPENED_PUSH is exactly 1", () => {
    expect(roadReopenedEnabled({})).toBe(false);
    expect(roadReopenedEnabled({ ROAD_REOPENED_PUSH: "true" })).toBe(false);
    expect(roadReopenedEnabled({ ROAD_REOPENED_PUSH: "1" })).toBe(true);
  });
});
