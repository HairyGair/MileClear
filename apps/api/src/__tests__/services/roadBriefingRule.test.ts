/**
 * Roadworks line in the morning briefing (Oct 2026): which works make it, in
 * what order, in what words, and that it never pushes the briefing past its
 * length. Coordinates are a made-up grid, not anyone's roads.
 */
import { describe, it, expect } from "vitest";
import { streetWorksToRoadEvent } from "../../services/roadEvents.js";
import type { LatLng } from "../../services/roadCorridor.js";
import type { WeekAheadCandidate } from "../../services/roadWeekAheadRule.js";
import {
  BRIEFING_BODY_MAX,
  addRoadworksLine,
  briefingRoadworksEnabled,
  buildBriefingRoadworksLine,
  selectBriefingWorks,
} from "../../services/roadBriefingRule.js";

// Wednesday 14 Oct 2026, 08:30 BST.
const NOW = new Date("2026-10-14T07:30:00Z");
const H = 3600000;

let seq = 0;
function line(i: number): LatLng[] {
  const lat = 50.1 + i * 0.01;
  return [[lat, -2.0], [lat + 0.001, -2.0]];
}

function works(opts: {
  street?: string | null;
  tm?: string;
  sensitive?: boolean;
  status?: string | null;
  promoter?: string | null;
  category?: string | null;
  startH?: number | null; // hours from now (negative = started)
  endH?: number | null;
  at?: number;
  days?: number;
}): WeekAheadCandidate {
  const ref = `REF${++seq}`;
  const tm = opts.tm ?? "road_closure";
  const event = streetWorksToRoadEvent(
    {
      reference: ref,
      trafficManagement: tm,
      isTrafficSensitive: opts.sensitive ?? false,
      streetName: opts.street === undefined ? "TEST ROAD" : opts.street,
      town: "Testtown",
      promoter: opts.promoter ?? null,
      workCategory: opts.category ?? null,
      startAt: opts.startH === null ? null : new Date(NOW.getTime() + (opts.startH ?? -2) * H),
      endAt: opts.endH === null ? null : new Date(NOW.getTime() + (opts.endH ?? 8) * H),
      lines: [line(opts.at ?? seq)],
      points: [],
    },
    NOW
  );
  return {
    event,
    days: opts.days ?? 5,
    works: { trafficManagement: tm, isTrafficSensitive: opts.sensitive ?? false, workStatus: opts.status ?? "in_progress", promoter: opts.promoter ?? null },
  };
}

describe("selectBriefingWorks", () => {
  it("only works in place now: not before they start, not after they end, not completed", () => {
    const sel = selectBriefingWorks(
      [
        works({ street: "LIVE ROAD" }),
        works({ street: "LATER ROAD", startH: 2 }),
        works({ street: "ENDED ROAD", startH: -10, endH: -1 }),
        works({ street: "DONE ROAD", status: "completed" }),
        works({ street: "OPEN ENDED ROAD", startH: null, endH: null }),
      ],
      { now: NOW }
    );
    expect(sel.map((e) => e.name).sort()).toEqual(["Live Road", "Open Ended Road"]);
  });

  it("closures first, then lights, lanes and boards", () => {
    const sel = selectBriefingWorks(
      [
        works({ street: "LIGHTS ROAD", tm: "multi_way_signals", days: 30 }),
        works({ street: "LANE ROAD", tm: "lane_closure", days: 20 }),
        works({ street: "CLOSED ROAD", tm: "road_closure", days: 2 }),
      ],
      { now: NOW }
    );
    expect(sel[0].name).toBe("Closed Road");
    expect(sel.map((e) => e.name)).toContain("Lights Road");
  });

  it("emergency, then urgent, works first within the same level", () => {
    const sel = selectBriefingWorks(
      [
        // Different hours, so they are not taken for one road plan.
        works({ street: "PLAIN ROAD", days: 30, startH: -2 }),
        works({ street: "URGENT ROAD", category: "immediate_urgent", days: 3, startH: -3 }),
        works({ street: "EMERGENCY ROAD", category: "immediate_emergency", days: 1, startH: -4 }),
      ],
      { now: NOW }
    );
    expect(sel.map((e) => e.name)).toEqual(["Emergency Road", "Urgent Road", "Plain Road"]);
  });

  it("an emergency set of lights never outranks a closure", () => {
    const sel = selectBriefingWorks(
      [works({ street: "LIGHTS ROAD", tm: "two_way_signals", category: "immediate_emergency" }), works({ street: "CLOSED ROAD" })],
      { now: NOW }
    );
    expect(sel[0].name).toBe("Closed Road");
  });

  it("leaves out dismissed works, works in place for more than 3 days, unnamed works and ones that do not change the drive", () => {
    const dismissedOne = works({ street: "DISMISSED ROAD" });
    const sel = selectBriefingWorks(
      [
        dismissedOne,
        works({ street: "OLD ROAD", startH: -24 * 5 }),
        works({ street: null }),
        works({ street: "FOOTWAY ROAD", tm: "some_other_tm", sensitive: true }),
      ],
      { now: NOW, dismissed: new Set([dismissedOne.event.id]) }
    );
    expect(sel).toEqual([]);
  });
});

describe("buildBriefingRoadworksLine", () => {
  it("one closure, with the works company", () => {
    const sel = selectBriefingWorks([works({ street: "DURHAM ROAD", promoter: "BRITISH TELECOMMUNICATIONS PLC" })], { now: NOW });
    expect(buildBriefingRoadworksLine(sel)).toBe("Durham Road closed today (BT)");
  });

  it("lights", () => {
    const sel = selectBriefingWorks(
      [works({ street: "HIGH STREET", tm: "multi_way_signals", promoter: "Yorkshire Water Services Ltd" })],
      { now: NOW }
    );
    expect(buildBriefingRoadworksLine(sel)).toBe("Temporary lights on High Street today (Yorkshire Water Services)");
  });

  it("plus N more", () => {
    const sel = selectBriefingWorks(
      [
        works({ street: "DURHAM ROAD" }),
        works({ street: "HIGH STREET", tm: "multi_way_signals", startH: -3 }),
        works({ street: "MILL LANE", tm: "stop_go_boards", startH: -4 }),
      ],
      { now: NOW }
    );
    expect(buildBriefingRoadworksLine(sel)).toBe("Durham Road closed today, plus 2 more");
  });

  it("emergency works say so", () => {
    const sel = selectBriefingWorks([works({ street: "DURHAM ROAD", category: "immediate_emergency" })], { now: NOW });
    expect(buildBriefingRoadworksLine(sel)).toBe("Emergency works: Durham Road closed today");
    const lights = selectBriefingWorks([works({ street: "HIGH STREET", tm: "two_way_signals", category: "immediate_urgent" })], { now: NOW });
    expect(buildBriefingRoadworksLine(lights)).toBe("Urgent works: temporary lights on High Street today");
  });

  it("nothing in place: no line", () => {
    expect(buildBriefingRoadworksLine([])).toBeNull();
  });
});

describe("addRoadworksLine", () => {
  const sel = () => selectBriefingWorks([works({ street: "DURHAM ROAD", promoter: "Northumbrian Water Limited" })], { now: NOW });

  it("adds one line to the briefing parts", () => {
    const parts = ["Yesterday: 42 mi across 6 trips", "3 to sort in Trips"];
    const out = addRoadworksLine(parts, sel());
    expect(out).toEqual([...parts, "Durham Road closed today (Northumbrian Water)"]);
    expect(out.join(". ") + ".").toBe(
      "Yesterday: 42 mi across 6 trips. 3 to sort in Trips. Durham Road closed today (Northumbrian Water)."
    );
  });

  it("drops the works company before dropping the line", () => {
    const filler = "x".repeat(BRIEFING_BODY_MAX - "Durham Road closed today".length - 4);
    const out = addRoadworksLine([filler], sel());
    expect(out[1]).toBe("Durham Road closed today");
    expect((out.join(". ") + ".").length).toBeLessThanOrEqual(BRIEFING_BODY_MAX);
  });

  it("leaves the briefing alone when the line cannot fit, or there is nothing", () => {
    const parts = ["x".repeat(BRIEFING_BODY_MAX - 5)];
    expect(addRoadworksLine(parts, sel())).toBe(parts);
    expect(addRoadworksLine(["Yesterday: 1 mi across 1 trip"], [])).toEqual(["Yesterday: 1 mi across 1 trip"]);
  });
});

describe("briefingRoadworksEnabled", () => {
  it("only when BRIEFING_ROADWORKS is exactly 1", () => {
    expect(briefingRoadworksEnabled({})).toBe(false);
    expect(briefingRoadworksEnabled({ BRIEFING_ROADWORKS: "yes" })).toBe(false);
    expect(briefingRoadworksEnabled({ BRIEFING_ROADWORKS: "1" })).toBe(true);
  });
});
