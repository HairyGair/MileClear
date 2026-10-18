// Whole drives replayed through the navigator: what is said, in what order,
// and when it notices leaving the route or arriving.

import { describe, it, expect } from "vitest";
import type { NavigationRoute } from "@mileclear/shared";
import { offset } from "../geo";
import {
  gpsStale,
  replaceRoute,
  startNavigation,
  stepNavigation,
  type NavFix,
  type NavigatorState,
} from "../navigator";
import { buildRoute, drive, pointAt, READING, roundaboutArc, routeLine } from "./fixtures";

const MILE = 1609.344;
const MPH = 0.44704;

interface Replay {
  said: string[];
  state: NavigatorState;
  rerouteAt: number[];
  arrivedAt: number | null;
}

function replay(route: NavigationRoute, fixes: NavFix[], state?: NavigatorState): Replay {
  let s = state ?? startNavigation(route);
  const said: string[] = [];
  const rerouteAt: number[] = [];
  let arrivedAt: number | null = null;
  fixes.forEach((f, i) => {
    const r = stepNavigation(s, f);
    s = r.state;
    said.push(...r.speak);
    if (r.wantReroute) rerouteAt.push(i);
    if (r.view.arrived && arrivedAt == null) arrivedAt = i;
  });
  return { said, state: s, rerouteAt, arrivedAt };
}

function count(said: string[], text: string): number {
  return said.filter((s) => s === text).length;
}

// Station Road north, right onto Park Lane, a roundabout (2nd exit) onto
// Claremont Road, left onto the A4, keep left onto Bath Road, arrive.
const townRoute = buildRoute(READING, [
  { step: { type: "depart", streetName: "Station Road" }, pieces: [{ bearing: 0, metres: 600 }] },
  { step: { type: "turn", modifier: "right", streetName: "Park Lane" }, pieces: [{ bearing: 90, metres: 800 }] },
  {
    step: { type: "roundabout", exit: 2, streetName: "Claremont Road" },
    pieces: [...roundaboutArc(90, 180), { bearing: 180, metres: 1500 }],
  },
  { step: { type: "turn", modifier: "left", streetName: "A4" }, pieces: [{ bearing: 90, metres: 1200 }] },
  { step: { type: "keep", modifier: "left", streetName: "Bath Road" }, pieces: [{ bearing: 60, metres: 500 }] },
]);
const townLine = routeLine(townRoute);

describe("a town drive with a roundabout", () => {
  const fixes = drive(townLine, { speedMps: 30 * MPH, intervalS: 1, jitterM: 10, seed: 7, heading: true });
  const run = replay(townRoute, fixes);

  it("says each manoeuvre at the turn exactly once, in order", () => {
    const atTurn = run.said.filter((s) =>
      ["Turn right now", "At the roundabout, take the 2nd exit", "Turn left now", "Keep left now"].includes(s)
    );
    expect(atTurn).toEqual(["Turn right now", "At the roundabout, take the 2nd exit", "Turn left now", "Keep left now"]);
  });

  it("warns ahead with distance and street", () => {
    expect(run.said[0]).toMatch(/^In .+, turn right onto Park Lane$/);
    expect(run.said).toContain("In half a mile, at the roundabout, take the 2nd exit onto Claremont Road");
    expect(run.said).toContain("In 250 yards, at the roundabout, take the 2nd exit onto Claremont Road");
    expect(run.said.some((s) => /^In .+, turn left onto A4$/.test(s))).toBe(true);
  });

  it("never repeats a prompt", () => {
    expect(new Set(run.said).size).toBe(run.said.length);
  });

  it("10 m of GPS jitter is not leaving the route", () => {
    expect(run.rerouteAt).toEqual([]);
    expect(count(run.said, "Rerouting")).toBe(0);
  });

  it("arrives once, at the end", () => {
    expect(run.said.at(-1)).toBe("You have arrived");
    expect(count(run.said, "You have arrived")).toBe(1);
    expect(run.arrivedAt).toBeGreaterThan(fixes.length - 8);
  });

  it("time and distance left fall as the car goes", () => {
    let s = startNavigation(townRoute);
    let lastMeters = Infinity;
    let lastSecs = Infinity;
    for (const f of fixes.slice(0, 200)) {
      const r = stepNavigation(s, f);
      s = r.state;
      expect(r.view.remainingMeters).toBeLessThanOrEqual(lastMeters + 45);
      expect(r.view.remainingSeconds).toBeLessThanOrEqual(lastSecs + 5);
      lastMeters = r.view.remainingMeters;
      lastSecs = r.view.remainingSeconds;
    }
  });
});

describe("a tunnel: no fixes for a minute", () => {
  it("picks up where the car comes out, without rerouting", () => {
    const fixes = drive(townLine, { speedMps: 30 * MPH, intervalS: 1, seed: 3, gap: { fromM: 1600, toM: 2500 } });
    const run = replay(townRoute, fixes);
    expect(run.rerouteAt).toEqual([]);
    expect(run.said.at(-1)).toBe("You have arrived");
    expect(count(run.said, "Turn left now")).toBe(1);
  });

  it("stale fixes show Waiting for GPS", () => {
    expect(gpsStale(null, 0)).toBe(true);
    expect(gpsStale(1000, 5000)).toBe(false);
    expect(gpsStale(1000, 10_000)).toBe(true);
  });
});

describe("a missed turn", () => {
  // Drive Station Road past the Park Lane turn and carry straight on north.
  const missed: NavFix[] = [];
  const straight = [READING, offset(READING, 0, 1100)];
  for (const f of drive(straight, { speedMps: 30 * MPH, intervalS: 1, seed: 11, heading: true })) missed.push(f);
  const run = replay(townRoute, missed);

  it("notices within a few fixes of leaving the line, and says Rerouting once", () => {
    expect(run.rerouteAt.length).toBeGreaterThan(0);
    const first = missed[run.rerouteAt[0]];
    const past = Math.abs(first.lat - pointAt(townLine, 600).p.lat) * 111_320;
    expect(past).toBeGreaterThan(50);
    expect(past).toBeLessThan(130);
    expect(count(run.said, "Rerouting")).toBe(1);
    // The turn was announced before it was missed; Rerouting comes after.
    expect(run.said.indexOf("Turn right now")).toBeLessThan(run.said.indexOf("Rerouting"));
    expect(run.said.at(-1)).toBe("Rerouting");
  });

  it("a new route takes over, with fresh prompts and no second Rerouting", () => {
    const here = missed.at(-1)!;
    const fresh = buildRoute({ lat: here.lat, lng: here.lng }, [
      { step: { type: "depart", streetName: "Station Road" }, pieces: [{ bearing: 0, metres: 300 }] },
      { step: { type: "turn", modifier: "right", streetName: "Mill Road" }, pieces: [{ bearing: 90, metres: 700 }] },
    ]);
    const next = replaceRoute(run.state, fresh);
    expect(next.destination).toEqual(run.state.destination);
    const after = replay(fresh, drive(routeLine(fresh), { speedMps: 30 * MPH, startMs: here.atMs }), next);
    expect(after.said[0]).toMatch(/turn right onto Mill Road$/);
    expect(after.said).not.toContain("Rerouting");
    expect(after.rerouteAt).toEqual([]);
  });
});

describe("a U-turn on the same road", () => {
  const route = buildRoute(READING, [
    { step: { type: "depart", streetName: "Kings Road" }, pieces: [{ bearing: 90, metres: 500 }] },
    { step: { type: "uturn", streetName: "Kings Road" }, pieces: [{ bearing: 270, metres: 500 }] },
    { step: { type: "turn", modifier: "left", streetName: "Queens Road" }, pieces: [{ bearing: 180, metres: 600 }] },
  ]);
  const run = replay(route, drive(routeLine(route), { speedMps: 25 * MPH, seed: 5, jitterM: 6, heading: true }));

  it("makes the U-turn, then the left turn, without mixing up the two sides", () => {
    expect(count(run.said, "Make a U-turn now")).toBe(1);
    expect(count(run.said, "Turn left now")).toBe(1);
    expect(run.said.indexOf("Make a U-turn now")).toBeLessThan(run.said.indexOf("Turn left now"));
    expect(run.rerouteAt).toEqual([]);
    expect(run.said.at(-1)).toBe("You have arrived");
  });
});

describe("a round trip that ends where it starts", () => {
  const route = buildRoute(READING, [
    { step: { type: "depart", streetName: "North Street" }, pieces: [{ bearing: 0, metres: 500 }] },
    { step: { type: "turn", modifier: "right", streetName: "East Street" }, pieces: [{ bearing: 90, metres: 500 }] },
    { step: { type: "turn", modifier: "right", streetName: "South Street" }, pieces: [{ bearing: 180, metres: 500 }] },
    { step: { type: "turn", modifier: "right", streetName: "West Street" }, pieces: [{ bearing: 270, metres: 500 }] },
  ]);
  it("does not arrive at the first fix", () => {
    const run = replay(route, drive(routeLine(route), { speedMps: 25 * MPH, heading: true }));
    expect(run.arrivedAt).toBeGreaterThan(50);
    expect(count(run.said, "Turn right now")).toBe(3);
  });
});

describe("a fast road", () => {
  const route = buildRoute(READING, [
    { step: { type: "depart", streetName: "A34" }, pieces: [{ bearing: 0, metres: 4 * MILE }], speedMps: 31 },
    { step: { type: "keep", modifier: "left", streetName: "M4" }, pieces: [{ bearing: 300, metres: 2000 }], speedMps: 31 },
  ]);
  it("starts with how far, then about a mile, half a mile, close, now", () => {
    const run = replay(route, drive(routeLine(route), { speedMps: 70 * MPH, heading: true }));
    expect(run.said.slice(0, 5)).toEqual([
      "Continue for 4 miles",
      "In 1 mile, keep left onto M4",
      "In half a mile, keep left onto M4",
      expect.stringMatching(/^In (400|450) yards, keep left onto M4$/),
      "Keep left now",
    ]);
  });
});

describe("after arriving", () => {
  it("stays arrived and silent", () => {
    const fixes = drive(townLine, { speedMps: 30 * MPH });
    const run = replay(townRoute, fixes);
    const more = stepNavigation(run.state, fixes[0]);
    expect(more.speak).toEqual([]);
    expect(more.view.arrived).toBe(true);
  });
});
