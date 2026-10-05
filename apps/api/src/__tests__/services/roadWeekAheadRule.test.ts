/**
 * "Next week on your roads" (Oct 2026): which planned works make the Sunday
 * push and the "Coming up" section, in what order, and in what words; and
 * the week in view across the clocks going back on 25 Oct 2026.
 *
 * Coordinates are synthetic (a made-up grid), not anyone's roads.
 */
import { describe, it, expect } from "vitest";
import { streetWorksToRoadEvent } from "../../services/roadEvents.js";
import type { LatLng } from "../../services/roadCorridor.js";
import {
  shortStreetName,
  buildWeekAheadPushCopy,
  disruptionTier,
  inWeekAheadSendWindow,
  isoWeekKey,
  roadWeekAheadEnabled,
  selectWeekAhead,
  shortPromoter,
  ukMidnight,
  weekAheadWindow,
  type WeekAheadCandidate,
} from "../../services/roadWeekAheadRule.js";

// Sunday 18 Oct 2026, 18:00 BST.
const SUN_BST = new Date("2026-10-18T17:00:00Z");
const WINDOW = weekAheadWindow(SUN_BST);

let seq = 0;
/** A synthetic street segment ~110 m long, each one ~1.1 km from the last. */
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
  start: string;
  end?: string;
  at?: number;
  days?: number;
  source?: "tomtom";
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
      startAt: new Date(opts.start),
      endAt: new Date(opts.end ?? new Date(new Date(opts.start).getTime() + 8 * 3600000).toISOString()),
      lines: [line(opts.at ?? seq)],
      points: [],
    },
    SUN_BST
  );
  if (opts.source) event.source = opts.source;
  return {
    event,
    days: opts.days ?? 5,
    works: {
      trafficManagement: tm,
      isTrafficSensitive: opts.sensitive ?? false,
      workStatus: opts.status === undefined ? "planned" : opts.status,
      promoter: opts.promoter ?? null,
    },
  };
}

const sel = (c: WeekAheadCandidate[], dismissed?: Set<string>) =>
  selectWeekAhead(c, { now: SUN_BST, window: WINDOW, dismissed });

describe("weekAheadWindow and the clocks going back (25 Oct 2026)", () => {
  it("on a BST Sunday, covers Mon 19 Oct 00:00 BST to Mon 26 Oct 00:00 GMT", () => {
    expect(WINDOW.which).toBe("next");
    expect(WINDOW.start.toISOString()).toBe("2026-10-18T23:00:00.000Z");
    expect(WINDOW.end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(WINDOW.weekKey).toBe("2026-W43");
  });

  it("on the Sunday the clocks go back, covers Mon 26 Oct to Mon 2 Nov, all GMT", () => {
    const w = weekAheadWindow(new Date("2026-10-25T18:00:00Z"));
    expect(w.start.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(w.weekKey).toBe("2026-W44");
  });

  it("mid-week, covers the rest of this week", () => {
    const now = new Date("2026-10-21T09:00:00Z");
    const w = weekAheadWindow(now);
    expect(w.which).toBe("this");
    expect(w.start).toEqual(now);
    expect(w.end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(w.weekKey).toBe("2026-W43");
  });

  it("UK midnight and ISO weeks", () => {
    expect(ukMidnight("2026-10-25").toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(ukMidnight("2026-10-26").toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(ukMidnight("2027-03-29").toISOString()).toBe("2027-03-28T23:00:00.000Z");
    expect(isoWeekKey("2026-12-28")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-04")).toBe("2027-W01");
  });
});

describe("inWeekAheadSendWindow: Sunday 18:00 UK", () => {
  it("BST: 18:00 to 19:59 local is 17:00 to 18:59 UTC", () => {
    expect(inWeekAheadSendWindow(new Date("2026-10-18T16:59:00Z"))).toBe(false);
    expect(inWeekAheadSendWindow(new Date("2026-10-18T17:00:00Z"))).toBe(true);
    expect(inWeekAheadSendWindow(new Date("2026-10-18T18:59:00Z"))).toBe(true);
    expect(inWeekAheadSendWindow(new Date("2026-10-18T19:00:00Z"))).toBe(false);
  });
  it("GMT from 25 Oct: 18:00 local is 18:00 UTC", () => {
    expect(inWeekAheadSendWindow(new Date("2026-10-25T17:30:00Z"))).toBe(false);
    expect(inWeekAheadSendWindow(new Date("2026-10-25T18:00:00Z"))).toBe(true);
    expect(inWeekAheadSendWindow(new Date("2026-10-25T19:59:00Z"))).toBe(true);
    expect(inWeekAheadSendWindow(new Date("2026-10-25T20:00:00Z"))).toBe(false);
  });
  it("not on other days", () => {
    expect(inWeekAheadSendWindow(new Date("2026-10-19T17:00:00Z"))).toBe(false);
    expect(inWeekAheadSendWindow(new Date("2026-10-17T17:00:00Z"))).toBe(false);
  });
});

describe("roadWeekAheadEnabled", () => {
  it("only when ROAD_WEEK_AHEAD_PUSH is exactly 1", () => {
    expect(roadWeekAheadEnabled({})).toBe(false);
    expect(roadWeekAheadEnabled({ ROAD_WEEK_AHEAD_PUSH: "true" })).toBe(false);
    expect(roadWeekAheadEnabled({ ROAD_WEEK_AHEAD_PUSH: "0" })).toBe(false);
    expect(roadWeekAheadEnabled({ ROAD_WEEK_AHEAD_PUSH: "1" })).toBe(true);
  });
});

describe("selectWeekAhead", () => {
  it("orders road closures, then traffic-sensitive streets, then lights and lanes", () => {
    const lights = works({ street: "LIGHTS LANE", tm: "two_way_signals", start: "2026-10-19T08:00:00Z", days: 20 });
    const busy = works({ street: "BUSY STREET", tm: "lane_closure", sensitive: true, start: "2026-10-20T08:00:00Z", days: 3 });
    const closed = works({ street: "SHUT ROAD", tm: "road_closure", start: "2026-10-23T08:00:00Z", days: 2 });
    const r = sel([lights, busy, closed]);
    expect(r.items.map((i) => i.group.roads[0])).toEqual(["Shut Road", "Busy Street", "Lights Lane"]);
    expect(r.items.map((i) => i.tier)).toEqual([0, 1, 2]);
  });

  it("among closures, the roads driven most come first", () => {
    const a = works({ street: "LESS USED", start: "2026-10-19T08:00:00Z", days: 3 });
    const b = works({ street: "MOST USED", start: "2026-10-22T08:00:00Z", days: 12 });
    expect(sel([a, b]).items[0].group.roads[0]).toBe("Most Used");
  });

  it("drops works already under way, finished, outside the week, dismissed, or not from Street Manager", () => {
    const keep = works({ street: "KEEP ROAD", start: "2026-10-21T08:00:00Z" });
    const inProgress = works({ street: "NOW ROAD", status: "In Progress", start: "2026-10-21T08:00:00Z" });
    const completed = works({ street: "DONE ROAD", status: "completed", start: "2026-10-21T08:00:00Z" });
    const startedAlready = works({ street: "OLD ROAD", start: "2026-10-17T08:00:00Z", end: "2026-10-22T08:00:00Z" });
    const sundayNight = works({ street: "TONIGHT ROAD", start: "2026-10-18T20:00:00Z" });
    const weekAfter = works({ street: "LATER ROAD", start: "2026-10-26T08:00:00Z" });
    const dismissed = works({ street: "HIDDEN ROAD", start: "2026-10-21T08:00:00Z" });
    const tomtom = works({ street: "TT ROAD", start: "2026-10-21T08:00:00Z", source: "tomtom" });
    const r = sel(
      [keep, inProgress, completed, startedAlready, sundayNight, weekAfter, dismissed, tomtom],
      new Set([dismissed.event.id])
    );
    expect(r.items.map((i) => i.group.roads[0])).toEqual(["Keep Road"]);
    expect(r.total).toBe(1);
  });

  it("the last minute of Sunday is in; Monday 00:00 after is out", () => {
    const last = works({ street: "LATE ROAD", start: "2026-10-25T23:59:00Z" });
    const after = works({ street: "NEXT ROAD", start: "2026-10-26T00:00:00Z" });
    expect(sel([last, after]).items.map((i) => i.group.roads[0])).toEqual(["Late Road"]);
  });

  it("one street dug by one company is one item, carrying every permit", () => {
    // Same street and promoter, 2 km apart on different days: geometry alone
    // would not join them.
    const p1 = works({ street: "LONG ROAD", tm: "two_way_signals", sensitive: true, promoter: "NORTHERN WATER LIMITED", start: "2026-10-20T08:00:00Z", at: 1 });
    const p2 = works({ street: "LONG ROAD", tm: "road_closure", promoter: "Northern Water Limited", start: "2026-10-22T08:00:00Z", at: 3 });
    const other = works({ street: "LONG ROAD", tm: "lane_closure", promoter: "Gas Co", start: "2026-10-21T08:00:00Z", at: 5 });
    const r = sel([p1, p2, other]);
    expect(r.total).toBe(2);
    const top = r.items[0];
    expect(top.trafficManagement).toBe("road_closure");
    expect(top.promoter).toBe("Northern Water");
    expect(top.group.members.map((m) => m.event.id).sort()).toEqual([p1.event.id, p2.event.id].sort());
  });

  it("caps at 5 and counts the rest", () => {
    const list = Array.from({ length: 8 }, (_, i) =>
      works({ street: `ROAD ${i}`, start: `2026-10-2${i % 6}T08:00:00Z`, at: 10 + i * 3 })
    );
    const r = sel(list);
    expect(r.items).toHaveLength(5);
    expect(r.more).toBe(3);
    expect(r.total).toBe(8);
  });

  it("nothing in the week: empty", () => {
    expect(sel([])).toEqual({ items: [], more: 0, total: 0 });
  });
});

describe("buildWeekAheadPushCopy", () => {
  it("names the top item, its day, who is doing it, and how many more", () => {
    const top = works({ street: "DURHAM ROAD", promoter: "British Telecommunications PLC", start: "2026-10-20T07:00:00Z", days: 9 });
    const b = works({ street: "SIDE STREET", tm: "two_way_signals", start: "2026-10-21T07:00:00Z" });
    const c = works({ street: "BACK LANE", tm: "lane_closure", start: "2026-10-22T07:00:00Z" });
    const copy = buildWeekAheadPushCopy(sel([b, top, c]));
    expect(copy).toEqual({ title: "Next week on your roads", body: "Durham Road closed from Tue 20 Oct (BT works), plus 2 more" });
  });

  it("lights with no promoter and nothing else", () => {
    const only = works({ street: "HIGH STREET", tm: "multi_way_signals", start: "2026-10-23T07:00:00Z" });
    expect(buildWeekAheadPushCopy(sel([only]))?.body).toBe("Temporary lights on High Street from Fri 23 Oct");
  });

  it("nothing to say: null", () => {
    expect(buildWeekAheadPushCopy({ items: [], more: 0, total: 0 })).toBeNull();
  });

  it("never uses an em dash", () => {
    const top = works({ street: "DURHAM ROAD", start: "2026-10-20T07:00:00Z" });
    expect(buildWeekAheadPushCopy(sel([top]))!.body).not.toMatch(/—/);
  });
});

describe("helpers", () => {
  it("shortPromoter", () => {
    expect(shortPromoter("BRITISH TELECOMMUNICATIONS PLC")).toBe("BT");
    expect(shortPromoter("Openreach Limited")).toBe("Openreach");
    expect(shortPromoter("NORTHUMBRIAN WATER LIMITED")).toBe("Northumbrian Water");
    expect(shortPromoter("Sunderland City Council")).toBe("Sunderland City Council");
    expect(shortPromoter(null)).toBeNull();
    expect(shortPromoter("A Very Long Utility Company Name That Goes On And On")).toBeNull();
  });
  it("disruptionTier", () => {
    expect(disruptionTier({ trafficManagement: "road_closure", isTrafficSensitive: false })).toBe(0);
    expect(disruptionTier({ trafficManagement: "lane_closure", isTrafficSensitive: true })).toBe(1);
    expect(disruptionTier({ trafficManagement: "stop_go_boards", isTrafficSensitive: false })).toBe(2);
    expect(disruptionTier({ trafficManagement: "no_carriageway_incursion", isTrafficSensitive: false })).toBeNull();
  });
});

describe("shortStreetName", () => {
  it("keeps the street and drops the stretch description", () => {
    expect(shortStreetName("Shibdon Road From Blaydon Bus Station To Chainbridge Road")).toBe("Shibdon Road");
    expect(shortStreetName("High Street between Church Lane and Mill Road")).toBe("High Street");
    expect(shortStreetName("Durham Road")).toBe("Durham Road");
    expect(shortStreetName(null)).toBeNull();
  });
});
