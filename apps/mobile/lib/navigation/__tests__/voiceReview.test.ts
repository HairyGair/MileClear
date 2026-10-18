// The 1.4.0 voice review (R2) fixes, each pinned by a test.

import { describe, it, expect } from "vitest";
import type { NavigationRoute, NavigationStep } from "@mileclear/shared";
import { announce, initialAnnouncerState, type AnnouncerState } from "../announcer";
import { offset } from "../geo";
import { bannerAction, glyphFor, inDistancePhrase, nowPhrase, thenPhrase } from "../phrases";
import { startNavigation, stepNavigation, type NavFix, type NavigatorState } from "../navigator";
import { buildRoute, drive, pointAt, READING, roundaboutArc, routeLine } from "./fixtures";

const MPH = 0.44704;

function step(p: Partial<NavigationStep>): NavigationStep {
  return { type: "turn", streetName: null, text: "", distanceMeters: 0, durationSeconds: 0, startIndex: 0, endIndex: 0, ...p };
}
const right = step({ modifier: "right", streetName: "Park Lane" });

function approach(next: NavigationStep, fromM: number, v: number, o: { current?: NavigationStep; after?: NavigationStep; gapAfter?: number } = {}) {
  let state: AnnouncerState = { ...initialAnnouncerState(), fresh: null, stepIndex: 0 };
  const said: Array<{ at: number; text: string }> = [];
  for (let d = fromM; d >= 0; d -= v) {
    const r = announce(state, {
      stepIndex: 0,
      next,
      distanceToNext: d,
      current: o.current ?? null,
      stepLength: fromM,
      after: o.after ?? null,
      gapAfter: o.gapAfter ?? null,
      speedMps: v,
    });
    state = r.state;
    if (r.say) said.push({ at: d, text: r.say.text });
  }
  return said;
}

function replay(route: NavigationRoute, fixes: NavFix[], state?: NavigatorState) {
  let s = state ?? startNavigation(route);
  const said: string[] = [];
  for (const f of fixes) {
    const r = stepNavigation(s, f);
    s = r.state;
    if (r.say) said.push(r.say.text);
  }
  return { said, state: s };
}

const townRoute = buildRoute(READING, [
  { step: { type: "depart", streetName: "Station Road" }, pieces: [{ bearing: 0, metres: 600 }] },
  { step: { type: "turn", modifier: "right", streetName: "Park Lane" }, pieces: [{ bearing: 90, metres: 800 }] },
  {
    step: { type: "roundabout", exit: 2, streetName: "Claremont Road" },
    pieces: [...roundaboutArc(90, 180), { bearing: 180, metres: 1500 }],
  },
  { step: { type: "keep", modifier: "left", streetName: "Bath Road" }, pieces: [{ bearing: 150, metres: 500 }] },
]);
const townLine = routeLine(townRoute);

describe("announcer", () => {
  it("'now' at 20 mph is at least 3 s out even with a second of fix lag", () => {
    const v = 20 * MPH;
    const now = approach(right, 400, v).at(-1)!;
    expect(now.text).toBe("Turn right now onto Park Lane");
    expect(now.at / v).toBeGreaterThanOrEqual(3);
  });

  it("a new route's first prompt is not said again a few seconds later", () => {
    let state = initialAnnouncerState("reroute");
    const said: string[] = [];
    for (let d = 860; d >= 0; d -= 20) {
      const r = announce(state, { stepIndex: 0, next: right, distanceToNext: d, current: null, stepLength: 900, after: null, gapAfter: null, speedMps: 20 });
      state = r.state;
      if (r.say) said.push(r.say.text);
    }
    expect(said[0]).toBe("In half a mile, turn right onto Park Lane");
    expect(said.filter((t) => t.startsWith("In half a mile")).length).toBe(1);
  });

  it("no 'carry straight on' onto the road the car is already on", () => {
    expect(approach(step({ type: "continue", streetName: "Front Street" }), 600, 13, { current: step({ streetName: "Front Street" }) })).toEqual([]);
    expect(approach(step({ type: "continue", roadRef: "A1" }), 600, 13, { current: step({ roadRef: "A1" }) })).toEqual([]);
  });

  it("never '..., then carry straight on'", () => {
    const said = approach(right, 400, 13, { after: step({ type: "continue", streetName: "Broad Street" }), gapAfter: 40 });
    for (const s of said) expect(s.text).not.toContain("then carry");
  });
});

describe("whole drives", () => {
  it("a prompt the voice could not say yet is tried again on the next fix, not lost", () => {
    const fixes = drive(townLine, { speedMps: 30 * MPH, heading: true });
    let s = startNavigation(townRoute);
    const said: string[] = [];
    let busyUntil = 0;
    fixes.forEach((f, i) => {
      // The voice stays busy for 3 fixes after every prompt.
      const r = stepNavigation(s, f, { canSay: (a) => a.urgent || i >= busyUntil });
      s = r.state;
      if (r.say) {
        said.push(r.say.text);
        busyUntil = i + 3;
      }
    });
    expect(said).toContain("In 250 yards, turn right onto Park Lane");
    expect(said).toContain("Turn right now onto Park Lane");
    expect(said).toContain("Now take the second exit onto Claremont Road");
    expect(said).toContain("Keep left now onto Bath Road");
    expect(said.at(-1)).toBe("You have arrived");
  });

  it("does not arrive while a manoeuvre is left before the end", () => {
    const route = buildRoute(READING, [
      { step: { type: "depart", streetName: "Long Road" }, pieces: [{ bearing: 0, metres: 600 }] },
      { step: { type: "turn", modifier: "left", streetName: "Short Close" }, pieces: [{ bearing: 270, metres: 25 }] },
    ]);
    const { said } = replay(route, drive(routeLine(route), { speedMps: 20 * MPH }));
    const turnAt = said.findIndex((t) => t.startsWith("Turn left now onto Short Close"));
    expect(turnAt, said.join(" | ")).toBeGreaterThan(-1);
    expect(turnAt).toBeLessThan(said.indexOf("You have arrived"));
  });

  it("a route that starts with a U-turn says and shows it first", () => {
    const route = buildRoute(READING, [
      { step: { type: "uturn", streetName: "Kings Road" }, pieces: [{ bearing: 270, metres: 400 }] },
      { step: { type: "turn", modifier: "left", streetName: "Queens Road" }, pieces: [{ bearing: 180, metres: 400 }] },
    ]);
    const first = stepNavigation(startNavigation(route), {
      lat: READING.lat,
      lng: READING.lng,
      speedMps: 0,
      accuracyM: 5,
      headingDeg: 90,
      atMs: 1000,
    });
    expect(first.say?.text).toBe("Turn around when it is safe");
    expect(first.view.next?.type).toBe("uturn");
    const run = replay(route, drive(routeLine(route), { speedMps: 20 * MPH, startMs: 2000, heading: true }), first.state);
    expect(run.said).not.toContain("Turn around when it is safe");
    expect(run.said).toContain("Turn left now onto Queens Road");
  });

  it("no speed limit while off the route", () => {
    const withLimit = { ...townRoute, speedLimitsMph: [{ startIndex: 0, endIndex: 10_000, mph: 30 }] };
    let s = startNavigation(withLimit);
    const fixes = drive(townLine, { speedMps: 30 * MPH, untilM: 200, heading: true });
    let last = stepNavigation(s, fixes[0]);
    for (const f of fixes) {
      last = stepNavigation(s, f);
      s = last.state;
    }
    expect(last.view.speedLimitMph).toBe(30);
    const off = stepNavigation(s, { ...fixes.at(-1)!, ...offset(pointAt(townLine, 220).p, 90, 200), atMs: fixes.at(-1)!.atMs + 1000 });
    expect(off.view.offRoute).toBe(true);
    expect(off.view.speedLimitMph).toBeNull();
  });
});

// Re-test round, 19 Oct 2026.
describe("re-test fixes", () => {
  // Jesmond Dene Road, left onto Jesmond Road, keep left 7 m later, then left
  // onto Newton Road 300 m on.
  const jesmond = buildRoute(READING, [
    { step: { type: "depart", streetName: "Jesmond Dene Road" }, pieces: [{ bearing: 0, metres: 500 }] },
    { step: { type: "turn", modifier: "left", streetName: "Jesmond Road" }, pieces: [{ bearing: 270, metres: 7 }] },
    { step: { type: "keep", modifier: "left", streetName: "Jesmond Road" }, pieces: [{ bearing: 260, metres: 300 }] },
    { step: { type: "turn", modifier: "left", streetName: "Newton Road" }, pieces: [{ bearing: 170, metres: 400 }] },
  ]);
  const line = routeLine(jesmond);

  it("a turn after two steps passed in one fix is still announced", () => {
    for (const speed of [8, 11, 13.4, 15]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const fixes = drive(line, { speedMps: speed, intervalS: 2, jitterM: 5, seed, heading: true });
        const { said } = replay(jesmond, fixes);
        expect(said.some((t) => t.startsWith("Turn left now onto Newton Road")), `${speed} m/s seed ${seed}: ${said.join(" | ")}`).toBe(true);
      }
    }
  });

  it("the merge carry-over only moves to the very next step", () => {
    let st: AnnouncerState = { ...initialAnnouncerState(), fresh: null, stepIndex: 0, chained: "merged" };
    const r = announce(st, { stepIndex: 2, next: right, distanceToNext: 30, current: null, stepLength: 300, after: null, gapAfter: null, speedMps: 10 });
    expect(r.say?.text).toBe("Turn right now onto Park Lane");
    st = { ...initialAnnouncerState(), fresh: null, stepIndex: 0, chained: "merged" };
    expect(announce(st, { stepIndex: 1, next: right, distanceToNext: 30, current: null, stepLength: 300, after: null, gapAfter: null, speedMps: 10 }).say).toBeNull();
  });

  it("a roundabout exit never says the junction's own name", () => {
    const named = step({ type: "roundabout", exit: 2, streetName: "Holystone Interchange", roadRef: "A191" });
    const said = approach(named, 600, 13);
    expect(said.at(-1)!.text).toBe("Now take the second exit onto the A one nine one");
    const bare = step({ type: "roundabout", exit: 2, streetName: "Silverlink Roundabout" });
    expect(approach(bare, 600, 13).at(-1)!.text).toBe("Now take the second exit");
  });

  it("the banner skips a same-name continue and shows the real turn after it", () => {
    const route = buildRoute(READING, [
      { step: { type: "depart", streetName: "Front Street" }, pieces: [{ bearing: 0, metres: 300 }] },
      { step: { type: "continue", streetName: "Front Street" }, pieces: [{ bearing: 0, metres: 300 }] },
      { step: { type: "turn", modifier: "right", streetName: "Park Lane" }, pieces: [{ bearing: 90, metres: 300 }] },
    ]);
    let s = startNavigation(route);
    const fixes = drive(routeLine(route), { speedMps: 13, untilM: 100, heading: true });
    let last = stepNavigation(s, fixes[0]);
    for (const f of fixes) {
      last = stepNavigation(s, f);
      s = last.state;
    }
    expect(last.view.next?.type).toBe("turn");
    expect(last.view.distanceToNext).toBeGreaterThan(450);
    const run = replay(route, drive(routeLine(route), { speedMps: 13, heading: true }));
    expect(run.said.filter((t) => /carry straight on/i.test(t))).toEqual([]);
    expect(run.said).toContain("In 250 yards, turn right onto Park Lane");
  });

  it("a reroute whose step 1 is a U-turn near the start turns around first", () => {
    const route = buildRoute(READING, [
      { step: { type: "depart", streetName: "Kings Road" }, pieces: [{ bearing: 90, metres: 40 }] },
      { step: { type: "uturn", streetName: "Kings Road" }, pieces: [{ bearing: 270, metres: 400 }] },
      { step: { type: "turn", modifier: "left", streetName: "Queens Road" }, pieces: [{ bearing: 180, metres: 400 }] },
    ]);
    const first = stepNavigation(startNavigation(route, undefined, { fresh: "reroute" }), {
      lat: READING.lat,
      lng: READING.lng,
      speedMps: 0,
      accuracyM: 5,
      headingDeg: 90,
      atMs: 1000,
    });
    expect(first.say?.text).toBe("Turn around when it is safe");
    expect(first.view.next?.type).toBe("uturn");
  });
});

// Gallowgate reroute, 19 Oct 2026: a legal right into Strawberry Place and
// right back, which GraphHopper labels a U-turn; the server sends `via`.
describe("turn round using a side street (via)", () => {
  const viaStep = step({ type: "uturn", streetName: "Gallowgate", via: "Strawberry Place" });

  it("says and shows the side street, with the usual distance tiers", () => {
    const said = approach(viaStep, 400, 10);
    expect(said.map((s) => s.text)).toEqual([
      "In 250 yards, turn round using Strawberry Place",
      "Turn round using Strawberry Place now",
    ]);
    expect(inDistancePhrase(91, viaStep)).toBe("In 100 yards, turn round using Strawberry Place");
    expect(bannerAction(viaStep)).toBe("Turn round using Strawberry Place");
    expect(glyphFor(viaStep)).toBe("uturn");
    expect(thenPhrase(viaStep)).toBe(", then turn round using Strawberry Place");
  });

  it("a plain U-turn on one road still says Turn around when it is safe", () => {
    const plain = step({ type: "uturn", streetName: "Gallowgate" });
    expect(nowPhrase(plain)).toBe("Turn around when it is safe");
    expect(bannerAction(plain)).toBe("Turn around");
  });

  it("the start-of-route U-turn handling never replaces it", () => {
    const route = buildRoute(READING, [
      { step: { type: "depart", streetName: "Gallowgate" }, pieces: [{ bearing: 90, metres: 50 }] },
      { step: { type: "uturn", streetName: "Gallowgate", via: "Strawberry Place" }, pieces: [{ bearing: 270, metres: 400 }] },
      { step: { type: "turn", modifier: "left", streetName: "St James Street" }, pieces: [{ bearing: 180, metres: 400 }] },
    ]);
    const run = replay(route, drive(routeLine(route), { speedMps: 8, heading: true }));
    expect(run.said).not.toContain("Turn around when it is safe");
    expect(run.said).toContain("Turn round using Strawberry Place now");
    const first = stepNavigation(startNavigation(route, undefined, { fresh: "reroute" }), {
      lat: READING.lat,
      lng: READING.lng,
      speedMps: 0,
      accuracyM: 5,
      headingDeg: 90,
      atMs: 1000,
    });
    expect(first.say?.text).toBe("In 50 yards, turn round using Strawberry Place");
    expect(first.view.next?.via).toBe("Strawberry Place");
  });
});
