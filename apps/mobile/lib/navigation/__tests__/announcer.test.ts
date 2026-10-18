import { describe, it, expect } from "vitest";
import type { NavigationStep } from "@mileclear/shared";
import { announce, initialAnnouncerState, triggerDistances, type AnnouncerState } from "../announcer";

const MILE = 1609.344;
const MPH = 0.44704;

function step(p: Partial<NavigationStep>): NavigationStep {
  return { type: "turn", streetName: null, text: "", distanceMeters: 0, durationSeconds: 0, startIndex: 0, endIndex: 0, ...p };
}

/** Approach one manoeuvre from `fromM` at a steady speed, a fix every second. */
function approach(
  next: NavigationStep,
  fromM: number,
  speedMps: number,
  opts: { state?: AnnouncerState; stepIndex?: number; after?: NavigationStep; gapAfter?: number } = {}
) {
  let state = opts.state ?? { ...initialAnnouncerState(), fresh: false, stepIndex: opts.stepIndex ?? 0 };
  const said: Array<{ at: number; text: string }> = [];
  for (let d = fromM; d >= 0; d -= speedMps) {
    const r = announce(state, {
      stepIndex: opts.stepIndex ?? 0,
      next,
      distanceToNext: d,
      after: opts.after ?? null,
      gapAfter: opts.gapAfter ?? null,
      speedMps,
    });
    state = r.state;
    if (r.speak) said.push({ at: d, text: r.speak });
  }
  return { said, state };
}

describe("trigger distances scale with speed", () => {
  it("town and motorway", () => {
    const town = triggerDistances(30 * MPH);
    const mway = triggerDistances(70 * MPH);
    expect(town.far).toBeNull();
    expect(mway.far).toBe(MILE);
    expect(town.mid).toBeCloseTo(MILE / 2);
    expect(mway.near).toBeGreaterThan(town.near);
    expect(mway.now).toBeGreaterThan(town.now);
    expect(triggerDistances(3).mid).toBeNull();
  });
});

describe("prompts for one manoeuvre", () => {
  const right = step({ modifier: "right", streetName: "Park Lane" });

  it("70 mph: about a mile, half a mile, a few hundred yards, then now; each once", () => {
    const { said } = approach(right, 2.5 * MILE, 70 * MPH);
    expect(said.map((s) => s.text)).toEqual([
      "In 1 mile, turn right onto Park Lane",
      "In half a mile, turn right onto Park Lane",
      expect.stringMatching(/^In (400|450) yards, turn right onto Park Lane$/),
      "Turn right now",
    ]);
  });

  it("30 mph: no mile prompt", () => {
    const { said } = approach(right, 1.5 * MILE, 30 * MPH);
    expect(said.map((s) => s.text)).toEqual([
      "In half a mile, turn right onto Park Lane",
      "In 250 yards, turn right onto Park Lane",
      "Turn right now",
    ]);
  });

  it("15 mph in town: just the close prompt and the turn", () => {
    const { said } = approach(right, 800, 15 * MPH);
    expect(said.map((s) => s.text)).toEqual(["In 150 yards, turn right onto Park Lane", "Turn right now"]);
  });

  it("the roundabout, as the spec words it", () => {
    const rb = step({ type: "roundabout", exit: 2, streetName: "Claremont Road" });
    const { said } = approach(rb, 0.6 * MILE, 30 * MPH);
    expect(said.map((s) => s.text)).toEqual([
      "In half a mile, at the roundabout, take the 2nd exit onto Claremont Road",
      "In 250 yards, at the roundabout, take the 2nd exit onto Claremont Road",
      "At the roundabout, take the 2nd exit",
    ]);
  });

  it("a fix that jumps past a tier skips it rather than saying two at once", () => {
    let state: AnnouncerState = { ...initialAnnouncerState(), fresh: false, stepIndex: 0 };
    const ctx = { stepIndex: 0, next: right, after: null, gapAfter: null, speedMps: 13.4 };
    const a = announce(state, { ...ctx, distanceToNext: 900 });
    expect(a.speak).toBeNull();
    state = a.state;
    const b = announce(state, { ...ctx, distanceToNext: 200 });
    expect(b.speak).toBe("In 200 yards, turn right onto Park Lane");
    const c = announce(b.state, { ...ctx, distanceToNext: 600 }); // jitter backwards
    expect(c.speak).toBeNull();
  });

  it("a close second manoeuvre is joined on, and not repeated", () => {
    const left = step({ modifier: "left", streetName: "Mill Lane" });
    const first = approach(right, 400, 30 * MPH, { after: left, gapAfter: 80 });
    expect(first.said.at(-1)!.text).toBe("Turn right now, then turn left");
    // Now on the next step, 80 m from the left turn: only "now" is left.
    const second = approach(left, 80, 30 * MPH, { state: first.state, stepIndex: 1 });
    expect(second.said.map((s) => s.text)).toEqual(["Turn left now"]);
  });

  it("arriving: a distance prompt, and nothing at the spot (the navigator says it)", () => {
    const { said } = approach(step({ type: "arrive" }), 0.6 * MILE, 30 * MPH);
    expect(said.map((s) => s.text)).toEqual([
      "In half a mile, you will arrive at your destination",
      "In 250 yards, you will arrive at your destination",
    ]);
  });

  it("a name change along the road is said once, close to it", () => {
    const { said } = approach(step({ type: "continue", streetName: "Broad Street" }), 1000, 30 * MPH);
    expect(said.map((s) => s.text)).toEqual(["Continue onto Broad Street"]);
    const nameless = approach(step({ type: "continue" }), 1000, 30 * MPH);
    expect(nameless.said).toEqual([]);
  });
});

describe("start and new steps", () => {
  const left = step({ modifier: "left", streetName: "High Street" });
  it("a fresh route says the first manoeuvre straight away", () => {
    const r = announce(initialAnnouncerState(), {
      stepIndex: 0, next: left, distanceToNext: 1200, after: null, gapAfter: null, speedMps: 10,
    });
    expect(r.speak).toBe("In three quarters of a mile, turn left onto High Street");
  });
  it("a fresh route with a long road first says how far", () => {
    const r = announce(initialAnnouncerState(), {
      stepIndex: 0, next: left, distanceToNext: 3 * MILE, after: null, gapAfter: null, speedMps: 10,
    });
    expect(r.speak).toBe("Continue for 3 miles");
  });
  it("after a turn onto a long road: Continue for, once", () => {
    let state: AnnouncerState = { ...initialAnnouncerState(), fresh: false, stepIndex: 0 };
    const ctx = { next: left, after: null, gapAfter: null, speedMps: 25 };
    const a = announce(state, { ...ctx, stepIndex: 1, distanceToNext: 4.1 * MILE });
    expect(a.speak).toBe("Continue for 4 miles");
    state = a.state;
    const b = announce(state, { ...ctx, stepIndex: 1, distanceToNext: 4.0 * MILE });
    expect(b.speak).toBeNull();
  });
});
