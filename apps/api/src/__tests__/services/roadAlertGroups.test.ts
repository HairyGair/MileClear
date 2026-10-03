/**
 * Road alerts (Oct 2026): one card per closure. Both carriageways, every
 * night of an overnight closure and every street of one road plan become one
 * item; closures in place for more than 3 days are "ongoing" and never pushed.
 * Places here are made up (the repo is public).
 */
import { describe, it, expect } from "vitest";
import type { RoadEvent } from "../../services/roadEvents.js";
import { offsetPoint, type LatLng } from "../../services/roadCorridor.js";
import type { MatchedEvent } from "../../services/roadAlertsRule.js";
import {
  buildGroupPushCopy,
  groupMatches,
  selectPushGroup,
  sortGroups,
  windowPhrase,
} from "../../services/roadAlertGroups.js";

// Saturday 3 Oct 2026, 18:00 BST.
const NOW = new Date("2026-10-03T17:00:00Z");
const ORIGIN: LatLng = [52.5, -1.5];

let seq = 0;
function line(from: LatLng, bearing: number, metres = 300): LatLng[] {
  return [from, offsetPoint(from, bearing, metres / 2), offsetPoint(from, bearing, metres)];
}
function ev(over: Partial<RoadEvent> & { at?: LatLng; bearing?: number }): RoadEvent {
  const at = over.at ?? ORIGIN;
  const bearing = over.bearing ?? 0;
  return {
    id: `tt:${++seq}`,
    source: "tomtom",
    category: "road_closed",
    severity: "closure",
    road: null,
    from: null,
    to: null,
    bearing,
    directionMode: "along",
    description: "Closed",
    delayMinutes: null,
    startAt: null,
    endAt: null,
    future: false,
    town: null,
    lines: [line(at, bearing)],
    points: [],
    ...over,
  };
}
const m = (event: RoadEvent, days = 9): MatchedEvent => ({ event, days });
/** The opposite carriageway, 25 m to the east, running the other way. */
const opposite = (e: RoadEvent, over: Partial<RoadEvent> = {}): RoadEvent => {
  const start = offsetPoint(e.lines[0][e.lines[0].length - 1], 90, 25);
  return ev({ ...e, id: `tt:${++seq}`, bearing: 180, lines: [line(start, 180)], ...over });
};

describe("groupMatches", () => {
  it("both carriageways of one closure are one item", () => {
    const nb = ev({ road: "A19", startAt: new Date("2026-10-03T16:00:00Z"), endAt: new Date("2026-10-03T22:00:00Z") });
    const sb = opposite(nb);
    const groups = groupMatches([m(nb), m(sb, 4)], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].bothDirections).toBe(true);
    expect(groups[0].headline).toBe("A19 closed both ways");
    expect(groups[0].sentence).toBe("A19 is closed until about 23:00, in both directions.");
    expect(groups[0].days).toBe(9);
  });

  it("an overnight closure on five nights, both ways, is one item", () => {
    const nights: MatchedEvent[] = [];
    for (let d = 5; d <= 9; d++) {
      const startAt = new Date(`2026-10-0${d}T18:00:00Z`);
      const nb = ev({ placeName: "Front Street", placeTown: "Elmford", startAt, endAt: new Date(startAt.getTime() + 10 * 3600000) });
      nights.push(m(nb, 13), m(opposite(nb), 12));
    }
    const groups = groupMatches(nights, NOW);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.recurring).toBe(true);
    expect(g.occurrences).toBe(5);
    expect(g.when).toBe("upcoming");
    expect(g.headline).toBe("Front Street, Elmford closed overnight");
    expect(g.sentence).toBe("Closed in both directions, 19:00 to 05:00, on 5 nights from Mon 5 Oct to Fri 9 Oct.");
    expect(g.startAt?.toISOString()).toBe("2026-10-05T18:00:00.000Z");
  });

  it("streets closed by one plan (same start and end, close together) are one item", () => {
    const window = { startAt: new Date("2026-10-04T07:30:00Z"), endAt: new Date("2026-10-04T14:00:00Z") };
    const plan = [
      m(ev({ ...window, road: "B1600" }), 17),
      m(ev({ ...window, road: "A186", at: offsetPoint(ORIGIN, 45, 900) }), 15),
      m(ev({ ...window, at: offsetPoint(ORIGIN, 135, 1400) }), 16),
      m(ev({ ...window, placeName: "Mill Lane", at: offsetPoint(ORIGIN, 270, 1800) }), 3),
    ];
    const groups = groupMatches(plan, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].multiPlace).toBe(true);
    expect(groups[0].roads).toEqual(["B1600", "A186", "Mill Lane"]);
    expect(groups[0].headline).toBe("B1600, A186 and nearby roads closed");
    expect(groups[0].sentence).toBe("B1600, A186 and nearby roads closed from 08:30 to 15:00 tomorrow.");
  });

  it("the same window far apart, or the same place at different times, stays separate", () => {
    const window = { startAt: new Date("2026-10-04T07:30:00Z"), endAt: new Date("2026-10-04T14:00:00Z") };
    const far = groupMatches([m(ev({ ...window, road: "A1" })), m(ev({ ...window, road: "A2", at: offsetPoint(ORIGIN, 0, 8000) }))], NOW);
    expect(far).toHaveLength(2);
    const later = groupMatches(
      [
        m(ev({ road: "A1", ...window })),
        m(ev({ road: "A1", startAt: new Date("2026-10-06T09:00:00Z"), endAt: new Date("2026-10-06T10:00:00Z") })),
      ],
      NOW
    );
    expect(later).toHaveLength(2);
  });

  it("a closure and an accident at the same place stay separate", () => {
    const c = ev({ road: "M6" });
    const a = ev({ road: "M6", severity: "major", category: "accident", description: "Accident" });
    expect(groupMatches([m(c), m(a)], NOW)).toHaveLength(2);
  });

  it("an unnamed closure takes its street name; with none, the junction names", () => {
    expect(groupMatches([m(ev({ placeName: "Hill Road", placeTown: "Elmford" }))], NOW)[0].headline).toBe(
      "Hill Road, Elmford closed"
    );
    const stretch = groupMatches([m(ev({ from: "Park Avenue", to: "Station Road" }))], NOW)[0];
    expect(stretch.headline).toBe("Park Avenue to Station Road closed");
    expect(stretch.named).toBe(true);
    const nothing = groupMatches([m(ev({}))], NOW)[0];
    expect(nothing.named).toBe(false);
  });
});

describe("ongoing closures", () => {
  const old = ev({ road: "A167", startAt: new Date("2026-09-20T09:00:00Z") });
  const fresh = ev({ road: "A690", startAt: new Date("2026-10-03T14:00:00Z"), at: offsetPoint(ORIGIN, 0, 5000) });

  it("in place more than 3 days: listed apart, with no end date said plainly", () => {
    const { current, ongoing } = sortGroups(groupMatches([m(old, 20), m(fresh, 4)], NOW));
    expect(current.map((g) => g.lead.road)).toEqual(["A690"]);
    expect(ongoing.map((g) => g.lead.road)).toEqual(["A167"]);
    expect(ongoing[0].sentence).toMatch(/No end date given\.$/);
  });

  it("never pushed", () => {
    const groups = groupMatches([m(old, 20)], NOW);
    expect(selectPushGroup(groups, { departureAt: NOW, sentEventIds: new Set() })).toBeNull();
  });
});

describe("push", () => {
  it("one push per closure: a night already pushed blocks the others", () => {
    const n1 = ev({ road: "A1018", startAt: new Date("2026-10-03T16:30:00Z"), endAt: new Date("2026-10-04T04:00:00Z") });
    const n2 = ev({ road: "A1018", startAt: new Date("2026-10-04T16:30:00Z"), endAt: new Date("2026-10-05T04:00:00Z") });
    const groups = groupMatches([m(n1), m(n2)], NOW);
    expect(groups).toHaveLength(1);
    expect(selectPushGroup(groups, { departureAt: NOW, sentEventIds: new Set([n1.id]) })).toBeNull();
    const pick = selectPushGroup(groups, { departureAt: NOW, sentEventIds: new Set() });
    expect(pick?.pick.members.map((x) => x.event.id).sort()).toEqual([n1.id, n2.id].sort());
  });

  it("copy for a road plan names the roads", () => {
    const window = { startAt: new Date("2026-10-03T16:30:00Z"), endAt: new Date("2026-10-03T20:00:00Z") };
    const groups = groupMatches(
      [m(ev({ ...window, road: "B1600" })), m(ev({ ...window, road: "A186", at: offsetPoint(ORIGIN, 45, 900) }))],
      NOW
    );
    const c = buildGroupPushCopy(groups[0], 0, NOW);
    expect(c.title).toBe("Before you set off: B1600, A186 and nearby roads closed");
    expect(c.body).toBe(
      "B1600, A186 and nearby roads closed from 17:30 to 21:00 today. You've driven this way on 9 days in the last 6 weeks."
    );
  });
});

describe("windowPhrase", () => {
  it("UK times, same day or across days", () => {
    expect(windowPhrase(new Date("2026-10-04T07:30:00Z"), new Date("2026-10-04T14:00:00Z"), NOW)).toBe(
      "from 08:30 to 15:00 tomorrow"
    );
    expect(windowPhrase(new Date("2026-10-10T07:30:00Z"), new Date("2026-10-10T14:00:00Z"), NOW)).toBe(
      "from 08:30 to 15:00 on Sat 10 Oct"
    );
    expect(windowPhrase(new Date("2026-10-05T18:00:00Z"), new Date("2026-10-06T04:00:00Z"), NOW)).toBe(
      "from 19:00 on Mon 5 Oct until 05:00 on Tue 6 Oct"
    );
  });
});
