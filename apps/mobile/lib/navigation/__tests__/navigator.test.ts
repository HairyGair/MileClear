// Whole drives replayed through the navigator: what is said, in what order,
// and when it notices leaving the route or arriving.

import { describe, it, expect } from "vitest";
import type { NavigationRoute } from "@mileclear/shared";
import { offset } from "../geo";
import {
  gpsStale,
  repeatInstruction,
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

function replay(route: NavigationRoute, fixes: NavFix[], state?: NavigatorState, name?: string): Replay {
  let s = state ?? startNavigation(route, undefined, { name });
  const said: string[] = [];
  const rerouteAt: number[] = [];
  let arrivedAt: number | null = null;
  fixes.forEach((f, i) => {
    const r = stepNavigation(s, f);
    s = r.state;
    if (r.say) said.push(r.say.text);
    if (r.wantReroute) rerouteAt.push(i);
    if (r.view.arrived && arrivedAt == null) arrivedAt = i;
  });
  return { said, state: s, rerouteAt, arrivedAt };
}

const count = (said: string[], text: string) => said.filter((s) => s === text).length;

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
  const run = replay(townRoute, fixes, undefined, "Home");

  it("starts by saying which road to head along", () => {
    expect(run.said[0]).toBe("Head along Station Road");
  });

  it("says each manoeuvre at the turn exactly once, in order", () => {
    const atTurn = run.said.filter((s) => /now|^Now/.test(s));
    expect(atTurn).toEqual([
      "Turn right now onto Park Lane",
      "Now take the second exit onto Claremont Road",
      "Turn left now onto the A four",
      "Keep left now onto Bath Road",
    ]);
  });

  it("warns ahead with distance and street", () => {
    expect(run.said).toContain("In 250 yards, turn right onto Park Lane");
    // Park Lane is under 0.75 mi, so no half-mile prompt in the slow band.
    expect(run.said).toContain("In half a mile, turn left onto the A four");
    expect(run.said).toContain("In 250 yards, at the roundabout, take the second exit onto Claremont Road");
  });

  it("never repeats a prompt", () => {
    expect(new Set(run.said).size).toBe(run.said.length);
  });

  it("10 m of GPS jitter is not leaving the route", () => {
    expect(run.rerouteAt).toEqual([]);
  });

  it("arrives once, at the end, by name, and says nothing after", () => {
    expect(run.said.at(-1)).toBe("You have arrived at Home");
    expect(count(run.said, "You have arrived at Home")).toBe(1);
    expect(run.arrivedAt).toBeGreaterThan(fixes.length - 8);
    const after = stepNavigation(run.state, fixes[3]);
    expect(after.say).toBeNull();
    expect(after.view.arrived).toBe(true);
  });

  it("time and distance left fall as the car goes", () => {
    let s = startNavigation(townRoute);
    let lastMeters = Infinity;
    for (const f of fixes.slice(0, 200)) {
      const r = stepNavigation(s, f);
      s = r.state;
      expect(r.view.remainingMeters).toBeLessThanOrEqual(lastMeters + 45);
      lastMeters = r.view.remainingMeters;
    }
  });

  it("the banner can repeat the current instruction", () => {
    let s = startNavigation(townRoute);
    for (const f of fixes.slice(0, 20)) s = stepNavigation(s, f).state;
    expect(repeatInstruction(s)).toMatch(/^In .+, turn right onto Park Lane$/);
  });
});

describe("a tunnel: no fixes for a minute", () => {
  it("picks up where the car comes out, without rerouting", () => {
    const fixes = drive(townLine, { speedMps: 30 * MPH, intervalS: 1, seed: 3, gap: { fromM: 1600, toM: 2500 } });
    const run = replay(townRoute, fixes);
    expect(run.rerouteAt).toEqual([]);
    expect(run.said.at(-1)).toBe("You have arrived");
    expect(count(run.said, "Turn left now onto the A four")).toBe(1);
  });

  it("the first 2 fixes after a gap can never start a reroute, even well off the line", () => {
    const fixes = drive(townLine, { speedMps: 30 * MPH, untilM: 300, heading: true });
    let s = startNavigation(townRoute);
    for (const f of fixes) s = stepNavigation(s, f).state;
    const last = fixes.at(-1)!;
    // 30 s later, 200 m east of the road (an exit the line does not take).
    const away = (k: number): NavFix => ({
      ...last,
      ...offset(pointAt(townLine, 300 + k * 13).p, 90, 200),
      atMs: last.atMs + 30_000 + k * 1000,
    });
    const a = stepNavigation(s, away(0));
    expect(a.wantReroute).toBe(false);
    const b = stepNavigation(a.state, away(1));
    expect(b.wantReroute).toBe(false);
    const c = stepNavigation(b.state, away(2));
    expect(c.wantReroute).toBe(true);
  });

  it("Waiting for GPS after 5 s with no fix", () => {
    expect(gpsStale(null, 0)).toBe(true);
    expect(gpsStale(1000, 5000)).toBe(false);
    expect(gpsStale(1000, 6500)).toBe(true);
  });
});

describe("fuzzy fixes", () => {
  it("accuracy worse than 50 m is treated as no fix: no off route, no progress", () => {
    const fixes = drive(townLine, { speedMps: 30 * MPH, untilM: 300 });
    let s = startNavigation(townRoute);
    for (const f of fixes) s = stepNavigation(s, f).state;
    const before = s.along;
    for (let k = 0; k < 6; k++) {
      const far: NavFix = { ...fixes.at(-1)!, ...offset(pointAt(townLine, 300).p, 90, 300), accuracyM: 80, atMs: fixes.at(-1)!.atMs + (k + 1) * 1000 };
      const r = stepNavigation(s, far);
      expect(r.usable).toBe(false);
      expect(r.wantReroute).toBe(false);
      s = r.state;
    }
    expect(s.along).toBe(before);
  });

  it("20 m of noise at 20 m accuracy never leaves the route", () => {
    const fixes = drive(townLine, { speedMps: 25 * MPH, jitterM: 20, accuracyM: 20, seed: 99, heading: true });
    expect(replay(townRoute, fixes).rerouteAt).toEqual([]);
  });

  it("the step never goes backwards", () => {
    const fixes = drive(townLine, { speedMps: 30 * MPH, jitterM: 15, seed: 5 });
    let s = startNavigation(townRoute);
    let last = 0;
    for (const f of fixes) {
      s = stepNavigation(s, f).state;
      expect(s.stepIndex).toBeGreaterThanOrEqual(last);
      last = s.stepIndex;
    }
  });
});

describe("a missed turn", () => {
  const straight = [READING, offset(READING, 0, 1100)];
  const missed = drive(straight, { speedMps: 30 * MPH, intervalS: 1, seed: 11, heading: true });
  const run = replay(townRoute, missed);

  it("notices within a few fixes of leaving the line, silently (no 'Rerouting')", () => {
    expect(run.rerouteAt.length).toBeGreaterThan(0);
    const first = missed[run.rerouteAt[0]];
    const past = Math.abs(first.lat - pointAt(townLine, 600).p.lat) * 111_320;
    expect(past).toBeGreaterThan(50);
    expect(past).toBeLessThan(130);
    // Within 8 s of passing the junction at 30 mph (PLAN section 3).
    expect(past / (30 * MPH)).toBeLessThan(8);
    expect(run.said.some((s) => /rerout|recalcul/i.test(s))).toBe(false);
  });

  it("a new route takes over and says its first instruction straight away", () => {
    const here = missed.at(-1)!;
    const fresh = buildRoute({ lat: here.lat, lng: here.lng }, [
      { step: { type: "depart", streetName: "Station Road" }, pieces: [{ bearing: 0, metres: 300 }] },
      { step: { type: "turn", modifier: "right", streetName: "Mill Road" }, pieces: [{ bearing: 90, metres: 700 }] },
    ]);
    const next = replaceRoute(run.state, fresh);
    expect(next.destination).toEqual(run.state.destination);
    const after = replay(fresh, drive(routeLine(fresh), { speedMps: 30 * MPH, startMs: here.atMs + 1000 }), next);
    expect(after.said[0]).toBe("In 350 yards, turn right onto Mill Road");
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

  it("turns around, then left, without mixing up the two sides", () => {
    expect(count(run.said, "Turn around when it is safe")).toBe(1);
    expect(count(run.said, "Turn left now onto Queens Road")).toBe(1);
    expect(run.said.indexOf("Turn around when it is safe")).toBeLessThan(run.said.indexOf("Turn left now onto Queens Road"));
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
    expect(run.said.filter((s) => s.startsWith("Turn right now")).length).toBe(3);
  });
});

describe("a fast road", () => {
  const route = buildRoute(READING, [
    { step: { type: "depart", streetName: "A34" }, pieces: [{ bearing: 0, metres: 4 * MILE }], speedMps: 31 },
    { step: { type: "keep", modifier: "left", streetName: "M4" }, pieces: [{ bearing: 300, metres: 2000 }], speedMps: 31 },
  ]);
  it("Head along, then 2 miles (a keep on a long step), 1 mile, half a mile, close, now", () => {
    const run = replay(route, drive(routeLine(route), { speedMps: 70 * MPH, heading: true }));
    expect(run.said.slice(0, 6)).toEqual([
      "Head along the A thirty-four, then follow the road for 4 miles",
      "In 2 miles, keep left onto the M four",
      "In 1 mile, keep left onto the M four",
      "In half a mile, keep left onto the M four",
      "In a quarter of a mile, keep left onto the M four",
      "Keep left now onto the M four",
    ]);
  });
});
