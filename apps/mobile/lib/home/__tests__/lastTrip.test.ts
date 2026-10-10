import { describe, it, expect } from "vitest";
import {
  selectLastTrip,
  whenLabel,
  routeText,
  lastTripFooter,
  RECENT_TRIP_MS,
  type LastTripData,
  type LastTripInputs,
} from "../lastTrip";
import { createTapTracker, MAX_PER_SESSION, MIN_GAP_MS } from "../tapEvents";
import { layoutRoute } from "../miniRoute";

const NOW = new Date(2026, 9, 10, 18, 0).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

const trip = (over: Partial<LastTripData> = {}): LastTripData => ({
  id: "t1",
  startedAt: iso(NOW - 40 * 60000),
  endedAt: iso(NOW - 30 * 60000),
  distanceMiles: 12.44,
  startLabel: "Home",
  endLabel: "Sunderland Depot",
  classification: "unclassified",
  autoSorted: false,
  isShiftTrip: false,
  isManual: false,
  sync: "synced",
  route: [],
  startPoint: null,
  endPoint: null,
  ...over,
});
const base = (over: Partial<LastTripInputs> = {}): LastTripInputs => ({
  mode: "work",
  personalOnlyDriver: false,
  trip: trip(),
  totalTrips: 24,
  unsortedCount: 0,
  missedCount: 0,
  now: NOW,
  ...over,
});
function full(v: ReturnType<typeof selectLastTrip>) {
  if (v.look !== "full" && v.look !== "compact") throw new Error(`look ${v.look}`);
  return v;
}

describe("selectLastTrip looks", () => {
  it("a new driver sees Your first trip", () => {
    expect(selectLastTrip(base({ trip: null, totalTrips: 0 })).look).toBe("first");
  });
  it("no local trip but trips exist elsewhere shows nothing", () => {
    expect(selectLastTrip(base({ trip: null })).look).toBe("none");
  });
  it("just finished and unsorted: full, with choice", () => {
    const v = full(selectLastTrip(base()));
    expect(v.look).toBe("full");
    expect(v.showChoice).toBe(true);
    expect(v.eyebrow).toBe("30 min ago\u00a0· 12.4\u00a0mi");
    expect(v.route).toBe("Home to Sunderland Depot");
  });
  it("just finished and auto sorted: full, with the Auto tag", () => {
    const v = full(selectLastTrip(base({ trip: trip({ classification: "business", autoSorted: true }) })));
    expect(v.look).toBe("full");
    expect(v.showAutoTag).toBe(true);
  });
  it("older and sorted: compact, no choice", () => {
    const old = trip({
      startedAt: iso(NOW - 26 * 3600000),
      endedAt: iso(NOW - 25.8 * 3600000),
      classification: "business",
    });
    const v = full(selectLastTrip(base({ trip: old })));
    expect(v.look).toBe("compact");
    expect(v.showChoice).toBe(false);
    expect(v.eyebrow.startsWith("Yesterday")).toBe(true);
  });
  it("older but still unsorted keeps the choice", () => {
    const old = trip({ startedAt: iso(NOW - 30 * 3600000), endedAt: iso(NOW - 29.8 * 3600000) });
    expect(full(selectLastTrip(base({ trip: old }))).showChoice).toBe(true);
  });
  it("Personal mode offers the choice only when unsorted", () => {
    const sorted = trip({ classification: "personal" });
    expect(full(selectLastTrip(base({ mode: "personal", trip: sorted }))).look).toBe("compact");
    expect(full(selectLastTrip(base({ mode: "personal" }))).showChoice).toBe(true);
  });
  it("a Personal-only driver is offered the choice only when unsorted", () => {
    const sorted = trip({ classification: "personal" });
    expect(full(selectLastTrip(base({ personalOnlyDriver: true, trip: sorted }))).showChoice).toBe(false);
    expect(full(selectLastTrip(base({ personalOnlyDriver: true }))).showChoice).toBe(true);
  });
  it("company drivers classify too", () => {
    expect(full(selectLastTrip(base({ trip: trip({ classification: "business" }) }))).showChoice).toBe(true);
  });
  it("the shift chip follows the trip", () => {
    expect(full(selectLastTrip(base({ trip: trip({ isShiftTrip: true }) }))).shiftChip).toBe(true);
  });
  it("sync chip words", () => {
    expect(full(selectLastTrip(base({ trip: trip({ sync: "waiting" }) }))).chipText).toBe("Waiting for signal");
    expect(full(selectLastTrip(base({ trip: trip({ sync: "failed" }) }))).chipText).toBe("Needs attention");
    expect(full(selectLastTrip(base({ trip: trip({ sync: "saving" }) }))).chipText).toBe("Saving");
  });
  it("RECENT_TRIP_MS is twelve hours", () => {
    expect(RECENT_TRIP_MS).toBe(12 * 3600000);
  });
});

describe("whenLabel", () => {
  it("just now, minutes, hours, today, yesterday, older", () => {
    const at = (ms: number) => iso(NOW - ms);
    expect(whenLabel(at(90000), at(60000), NOW)).toBe("Just now");
    expect(whenLabel(at(20 * 60000), at(15 * 60000), NOW)).toBe("15 min ago");
    expect(whenLabel(at(3.5 * 3600000), at(3 * 3600000), NOW)).toBe("3 h ago");
    const morning = new Date(2026, 9, 10, 5, 0).getTime();
    expect(whenLabel(iso(morning), iso(morning + 600000), NOW)).toBe("Today 05:00");
    const yest = new Date(2026, 9, 9, 17, 40).getTime();
    expect(whenLabel(iso(yest), iso(yest + 900000), NOW)).toBe("Yesterday 17:40");
    const older = new Date(2026, 9, 5, 9, 5).getTime();
    expect(whenLabel(iso(older), iso(older + 900000), NOW)).toBe("Mon 5 Oct 09:05");
  });
});

describe("routeText", () => {
  it("handles every combination", () => {
    expect(routeText("Home", "Depot")).toBe("Home to Depot");
    expect(routeText("", "Depot")).toBe("To Depot");
    expect(routeText("Home", "")).toBe("From Home");
    expect(routeText("", "")).toBe("Route not recorded");
  });
});

describe("lastTripFooter", () => {
  it("counts the other unsorted trips when the card itself is unsorted", () => {
    expect(lastTripFooter({ unsortedCount: 3, missedCount: 0, shownTripUnsorted: true })).toEqual({
      kind: "unsorted",
      text: "2 more trips to sort",
    });
    expect(lastTripFooter({ unsortedCount: 2, missedCount: 0, shownTripUnsorted: true })?.text).toBe("1 more trip to sort");
  });
  it("counts all of them when the card is sorted", () => {
    expect(lastTripFooter({ unsortedCount: 1, missedCount: 0, shownTripUnsorted: false })?.text).toBe("1 trip to sort");
  });
  it("shows nothing when only the shown trip is unsorted", () => {
    expect(lastTripFooter({ unsortedCount: 1, missedCount: 0, shownTripUnsorted: true })).toBeNull();
  });
  it("falls back to a possible missed drive", () => {
    expect(lastTripFooter({ unsortedCount: 0, missedCount: 1, shownTripUnsorted: false })).toEqual({
      kind: "missed",
      text: "We may have missed a drive",
    });
    expect(lastTripFooter({ unsortedCount: null, missedCount: 3, shownTripUnsorted: false })?.text).toBe(
      "We may have missed 3 drives"
    );
  });
  it("nothing when everything is sorted", () => {
    expect(lastTripFooter({ unsortedCount: 0, missedCount: 0, shownTripUnsorted: false })).toBeNull();
    expect(lastTripFooter({ unsortedCount: null, missedCount: null, shownTripUnsorted: false })).toBeNull();
  });
});

describe("home tap tracker", () => {
  it("sends once per target per 2 seconds", () => {
    let t = 1000;
    const sent: string[] = [];
    const track = createTapTracker((_type, m) => sent.push(m.target), () => t);
    expect(track("hero", "work", "fine")).toBe(true);
    expect(track("hero", "work", "fine")).toBe(false);
    expect(track("start_trip", "work", "fine")).toBe(true);
    t += MIN_GAP_MS;
    expect(track("hero", "work", "fine")).toBe(true);
    expect(sent).toEqual(["hero", "start_trip", "hero"]);
  });
  it("caps a session", () => {
    let t = 0;
    const track = createTapTracker(() => {}, () => (t += MIN_GAP_MS));
    let count = 0;
    for (let n = 0; n < MAX_PER_SESSION + 10; n++) if (track("hero", "work", "fine")) count++;
    expect(count).toBe(MAX_PER_SESSION);
  });
  it("never throws when the sender does", () => {
    const track = createTapTracker(() => {
      throw new Error("boom");
    });
    expect(() => track("hero", "work", "fine")).not.toThrow();
  });
});


describe("layoutRoute", () => {
  const A = { lat: 54.9, lng: -1.6 };
  const B = { lat: 54.95, lng: -1.5 };

  it("draws nothing without two points", () => {
    expect(layoutRoute({ route: [], start: A, end: null, size: 56 }).pieces).toEqual([]);
    expect(layoutRoute({ route: [], start: null, end: null, size: 56 }).start).toBeNull();
  });

  it("falls back to a straight line from start to end", () => {
    const d = layoutRoute({ route: [], start: A, end: B, size: 56 });
    expect(d.pieces).toHaveLength(1);
    expect(d.start).not.toBeNull();
    expect(d.end).not.toBeNull();
  });

  it("keeps every piece and both ends inside the square", () => {
    const route = [A, { lat: 54.92, lng: -1.58 }, { lat: 54.93, lng: -1.52 }, B];
    const d = layoutRoute({ route, start: A, end: B, size: 56, pad: 8 });
    for (const pt of [d.start!, d.end!]) {
      expect(pt.x).toBeGreaterThanOrEqual(7.9);
      expect(pt.x).toBeLessThanOrEqual(48.1);
      expect(pt.y).toBeGreaterThanOrEqual(7.9);
      expect(pt.y).toBeLessThanOrEqual(48.1);
    }
    expect(d.pieces.length).toBe(3);
  });

  it("puts north at the top: a later, more northern point has a smaller y", () => {
    const d = layoutRoute({ route: [A, B], start: A, end: B, size: 56 });
    expect(d.end!.y).toBeLessThan(d.start!.y);
  });

  it("dashes a hand-added trip into many short pieces", () => {
    const solid = layoutRoute({ route: [], start: A, end: B, size: 56 });
    const dashed = layoutRoute({ route: [], start: A, end: B, size: 56, dashed: true });
    expect(dashed.pieces.length).toBeGreaterThan(solid.pieces.length);
    expect(Math.max(...dashed.pieces.map((p) => p.length))).toBeLessThanOrEqual(3.01);
  });

  it("survives a trip that never moved", () => {
    const d = layoutRoute({ route: [A, A, A], start: A, end: A, size: 56 });
    expect(d.pieces).toEqual([]);
  });
});
