/**
 * Emergency works first (Oct 2026): the Street Manager work category is read
 * from permits, carried onto the RoadEvent, ranks emergency then urgent works
 * first within the same severity, and is named in the copy. Places are made
 * up (the repo is public).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  normaliseWorkCategory,
  parseStreetManagerMessage,
  streetWorksToRoadEvent,
  urgencyRank,
  worksUrgency,
  type RoadEvent,
} from "../../services/roadEvents.js";
import { eventHeadline, eventSentence, splitForScreen, type MatchedEvent } from "../../services/roadAlertsRule.js";
import { groupMatches, selectPushGroup, sortGroups } from "../../services/roadAlertGroups.js";

const FIX = path.resolve(__dirname, "../fixtures/roadAlerts");
const sm = JSON.parse(readFileSync(path.join(FIX, "street-manager-messages.json"), "utf8"));

// Wednesday 14 Oct 2026, 08:30 BST.
const NOW = new Date("2026-10-14T07:30:00Z");
const H = 3600000;

let seq = 0;
function smEvent(opts: { street: string; tm?: string; category?: string | null; startH?: number; at?: number }): RoadEvent {
  const lat = 50.1 + (opts.at ?? ++seq) * 0.01;
  return streetWorksToRoadEvent(
    {
      reference: `REF${++seq}`,
      trafficManagement: opts.tm ?? "road_closure",
      isTrafficSensitive: true,
      streetName: opts.street,
      town: "TESTTOWN",
      promoter: null,
      workCategory: opts.category ?? null,
      startAt: new Date(NOW.getTime() + (opts.startH ?? -2) * H),
      endAt: new Date(NOW.getTime() + 30 * H),
      lines: [[[lat, -2.0], [lat + 0.001, -2.0]]],
      points: [],
    },
    NOW
  );
}
const m = (event: RoadEvent, days = 5): MatchedEvent => ({ event, days });

describe("work category parsing", () => {
  it("reads work_category_ref from a permit", () => {
    const change = parseStreetManagerMessage(sm.snsNotification.Message);
    expect(change.kind).toBe("upsert");
    if (change.kind === "upsert") expect(change.record.workCategory).toBe("minor");
  });

  it("falls back to the work_category text", () => {
    const change = parseStreetManagerMessage(sm.permitLinestring);
    if (change.kind !== "upsert") throw new Error("expected upsert");
    expect(change.record.workCategory).toBe("standard");
  });

  it("an emergency permit", () => {
    const msg = {
      ...sm.permitLinestring,
      object_data: { ...sm.permitLinestring.object_data, work_category: "Immediate - emergency", work_category_ref: "immediate_emergency" },
    };
    const change = parseStreetManagerMessage(msg);
    if (change.kind !== "upsert") throw new Error("expected upsert");
    expect(change.record.workCategory).toBe("immediate_emergency");
  });

  it("activities carry none", () => {
    const change = parseStreetManagerMessage(sm.activity);
    if (change.kind !== "upsert") throw new Error("expected upsert");
    expect(change.record.workCategory).toBeNull();
  });

  it("keeps the booked end apart from the actual end", () => {
    const msg = {
      ...sm.permitLinestring,
      object_data: { ...sm.permitLinestring.object_data, actual_end_date_time: "2026-10-11T09:00:00.000Z", work_status_ref: "completed" },
    };
    const change = parseStreetManagerMessage(msg);
    if (change.kind !== "upsert") throw new Error("expected upsert");
    expect(change.record.endAt).toEqual(new Date("2026-10-11T09:00:00.000Z"));
    expect(change.record.actualEndAt).toEqual(new Date("2026-10-11T09:00:00.000Z"));
    expect(change.record.plannedEndAt).toEqual(new Date("2026-10-12T23:59:59.000Z"));
  });

  it("normalises every spelling", () => {
    expect(normaliseWorkCategory("immediate_emergency")).toBe("immediate_emergency");
    expect(normaliseWorkCategory("Immediate - Emergency")).toBe("immediate_emergency");
    expect(normaliseWorkCategory("Immediate urgent")).toBe("immediate_urgent");
    expect(normaliseWorkCategory("Major")).toBe("major");
    expect(normaliseWorkCategory("HS2 highway")).toBe("hs2_highway");
    expect(normaliseWorkCategory("")).toBeNull();
    expect(normaliseWorkCategory(null)).toBeNull();
    expect(normaliseWorkCategory("x".repeat(50))).toHaveLength(32);
  });

  it("urgency from the stored category", () => {
    expect(worksUrgency("immediate_emergency")).toBe("emergency");
    expect(worksUrgency("immediate_urgent")).toBe("urgent");
    expect(worksUrgency("major")).toBeNull();
    expect(worksUrgency(null)).toBeNull();
    expect(urgencyRank(smEvent({ street: "A", category: "immediate_emergency" }))).toBe(2);
  });
});

describe("ranking: emergency works first within the same severity", () => {
  it("On your roads now (splitForScreen)", () => {
    const plain = smEvent({ street: "PLAIN ROAD" });
    const urgent = smEvent({ street: "URGENT ROAD", category: "immediate_urgent" });
    const emergency = smEvent({ street: "EMERGENCY ROAD", category: "immediate_emergency" });
    const { current } = splitForScreen([m(plain, 30), m(urgent, 10), m(emergency, 1)], NOW);
    expect(current.map((c) => c.event.road)).toEqual(["Emergency Road", "Urgent Road", "Plain Road"]);
  });

  it("the grouped list and the pre-departure pick", () => {
    const plain = smEvent({ street: "PLAIN ROAD", startH: -2 });
    const emergency = smEvent({ street: "EMERGENCY ROAD", category: "immediate_emergency", startH: -3 });
    const groups = groupMatches([m(plain, 30), m(emergency, 1)], NOW);
    expect(sortGroups(groups).current[0].roads[0]).toBe("Emergency Road");
    const pick = selectPushGroup(groups, { departureAt: NOW, sentEventIds: new Set() });
    expect(pick?.pick.roads[0]).toBe("Emergency Road");
    expect(pick?.extra).toBe(1);
  });

  it("an emergency never outranks a worse severity", () => {
    const closure = smEvent({ street: "CLOSED ROAD", startH: -2 });
    const lights = smEvent({ street: "LIGHTS ROAD", tm: "multi_way_signals", category: "immediate_emergency", startH: -3 });
    const groups = sortGroups(groupMatches([m(lights, 30), m(closure, 1)], NOW)).current;
    expect(groups[0].roads[0]).toBe("Closed Road");
  });
});

describe("copy", () => {
  it("Emergency works: Durham Road closed", () => {
    const e = smEvent({ street: "DURHAM ROAD", category: "immediate_emergency" });
    expect(eventHeadline(e)).toBe("Emergency works: Durham Road, Testtown closed");
    expect(eventSentence(e, NOW)).toBe("Durham Road, Testtown is closed for emergency works until 14:30 tomorrow.");
  });

  it("urgent works, and works other than a closure", () => {
    const urgent = smEvent({ street: "DURHAM ROAD", category: "immediate_urgent" });
    expect(eventHeadline(urgent)).toBe("Urgent works: Durham Road, Testtown closed");
    const lights = smEvent({ street: "HIGH STREET", tm: "multi_way_signals", category: "immediate_emergency" });
    expect(eventHeadline(lights)).toBe("Emergency works: temporary lights on High Street, Testtown");
    expect(eventSentence(lights, NOW)).toBe("High Street, Testtown: temporary lights for emergency works until 14:30 tomorrow.");
  });

  it("ordinary works read as before", () => {
    const e = smEvent({ street: "DURHAM ROAD", category: "major" });
    expect(eventHeadline(e)).toBe("Durham Road, Testtown closed");
    expect(eventSentence(e, NOW)).toBe("Durham Road, Testtown is closed for roadworks until 14:30 tomorrow.");
  });

  it("closed both ways keeps the prefix", () => {
    const north = { ...smEvent({ street: "DURHAM ROAD", category: "immediate_emergency" }), directionMode: "along" as const, bearing: 0 };
    const south: RoadEvent = {
      ...north,
      id: "sm:SOUTH",
      bearing: 180,
      lines: [[[north.lines[0][1][0], -1.9997], [north.lines[0][0][0], -1.9997]]],
    };
    const g = groupMatches([m(north), m(south)], NOW)[0];
    expect(g.bothDirections).toBe(true);
    expect(g.headline).toBe("Emergency works: Durham Road, Testtown closed both ways");
  });

  it("the grouped card carries it", () => {
    const g = groupMatches([m(smEvent({ street: "DURHAM ROAD", category: "immediate_emergency" }))], NOW)[0];
    expect(g.headline).toBe("Emergency works: Durham Road, Testtown closed");
  });
});
