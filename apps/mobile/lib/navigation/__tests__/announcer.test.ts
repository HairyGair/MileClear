import { describe, it, expect } from "vitest";
import type { NavigationStep } from "@mileclear/shared";
import {
  announce,
  bandFor,
  currentInstruction,
  initialAnnouncerState,
  triggerDistances,
  type AnnouncerState,
} from "../announcer";

const MILE = 1609.344;
const MPH = 0.44704;

function step(p: Partial<NavigationStep>): NavigationStep {
  return { type: "turn", streetName: null, text: "", distanceMeters: 0, durationSeconds: 0, startIndex: 0, endIndex: 0, ...p };
}

const settled = (stepIndex = 0): AnnouncerState => ({ ...initialAnnouncerState(), fresh: null, stepIndex });

/** Approach one manoeuvre from `fromM` at a steady speed, one fix a second. */
function approach(
  next: NavigationStep,
  fromM: number,
  speedMps: number,
  o: { stepLength?: number; state?: AnnouncerState; stepIndex?: number; after?: NavigationStep; gapAfter?: number; current?: NavigationStep } = {}
) {
  let state = o.state ?? settled(o.stepIndex ?? 0);
  const said: Array<{ at: number; text: string; urgent: boolean }> = [];
  for (let d = fromM; d >= 0; d -= speedMps) {
    const r = announce(state, {
      stepIndex: o.stepIndex ?? 0,
      next,
      distanceToNext: d,
      current: o.current ?? null,
      stepLength: o.stepLength ?? fromM,
      after: o.after ?? null,
      gapAfter: o.gapAfter ?? null,
      speedMps,
    });
    state = r.state;
    if (r.say) said.push({ at: d, text: r.say.text, urgent: r.say.urgent });
  }
  return { said, state };
}

const right = step({ modifier: "right", streetName: "Park Lane" });

describe("speed bands", () => {
  it("slow under 35, medium 35 to 55, fast over 55", () => {
    expect(bandFor(30 * MPH)).toBe("slow");
    expect(bandFor(35 * MPH)).toBe("medium");
    expect(bandFor(55 * MPH)).toBe("medium");
    expect(bandFor(60 * MPH)).toBe("fast");
  });
  it("early prompts only on long steps; never 'In 2 miles, you will arrive'", () => {
    expect(triggerDistances({ speedMps: 25 * MPH, stepLength: 0.5 * MILE, next: right }).early).toBeUndefined();
    expect(triggerDistances({ speedMps: 25 * MPH, stepLength: 1 * MILE, next: right }).early).toBeCloseTo(MILE / 2);
    expect(triggerDistances({ speedMps: 45 * MPH, stepLength: 1 * MILE, next: right }).early).toBeUndefined();
    const keep = step({ type: "keep", modifier: "left" });
    expect(triggerDistances({ speedMps: 70 * MPH, stepLength: 4 * MILE, next: keep }).early2).toBeCloseTo(2 * MILE);
    const arrive = step({ type: "arrive" });
    const t = triggerDistances({ speedMps: 70 * MPH, stepLength: 4 * MILE, next: arrive });
    expect(t.early).toBeUndefined();
    expect(t.early2).toBeUndefined();
  });
});

// PLAN.md section 3, "Voice timing": distance to the manoeuvre when speech starts.
describe("voice timing criteria", () => {
  function check(mph: number) {
    const v = mph * MPH;
    const { said } = approach(right, 2.5 * MILE, v, { stepLength: 2.5 * MILE });
    // No two prompts within 2 seconds, each said once.
    for (let i = 1; i < said.length; i++) expect((said[i - 1].at - said[i].at) / v).toBeGreaterThanOrEqual(2);
    expect(new Set(said.map((s) => s.text)).size).toBe(said.length);
    // The spoken distance is within 15% (or 30 m) of the real one.
    for (const s of said) {
      const m = /^In (\d+) yards/.exec(s.text);
      if (m) expect(Math.abs(Number(m[1]) * 0.9144 - s.at)).toBeLessThanOrEqual(Math.max(30, s.at * 0.15));
    }
    return said;
  }

  it("20 to 30 mph: near at 150 to 250 m; now at 25 to 60 m and 3 s or more before", () => {
    for (const mph of [20, 25, 30]) {
      const said = check(mph);
      const near = said.find((s) => /yards/.test(s.text))!;
      expect(near.at).toBeGreaterThanOrEqual(150);
      expect(near.at).toBeLessThanOrEqual(250);
      const now = said.at(-1)!;
      expect(now.text).toBe("Turn right now onto Park Lane");
      expect(now.at).toBeGreaterThanOrEqual(25);
      expect(now.at).toBeLessThanOrEqual(60);
      expect(now.at / (mph * MPH)).toBeGreaterThanOrEqual(3);
    }
  });

  it("40 to 50 mph: half a mile at 0.45 to 0.55 mi; near 320 to 400 m; now 3.5 s or more before", () => {
    for (const mph of [40, 45, 50]) {
      const said = check(mph);
      const half = said.find((s) => s.text.startsWith("In half a mile"))!;
      expect(half.at / MILE).toBeGreaterThanOrEqual(0.45);
      expect(half.at / MILE).toBeLessThanOrEqual(0.55);
      const near = said.find((s) => /^In (a quarter of a mile|\d+ yards)/.test(s.text))!;
      expect(near.at).toBeGreaterThanOrEqual(320);
      expect(near.at).toBeLessThanOrEqual(400);
      expect(said.at(-1)!.at / (mph * MPH)).toBeGreaterThanOrEqual(3.5);
    }
  });

  it("60 to 70 mph: 1 mile at 0.9 to 1.1 mi; half a mile; near 400 to 450 m; now 4 s or more before", () => {
    for (const mph of [60, 65, 70]) {
      const said = check(mph);
      expect(said.map((s) => s.text)).toEqual([
        "In 1 mile, turn right onto Park Lane",
        "In half a mile, turn right onto Park Lane",
        "In a quarter of a mile, turn right onto Park Lane",
        "Turn right now onto Park Lane",
      ]);
      expect(said[0].at / MILE).toBeGreaterThanOrEqual(0.9);
      expect(said[0].at / MILE).toBeLessThanOrEqual(1.1);
      expect(said[2].at).toBeGreaterThanOrEqual(400);
      expect(said[2].at).toBeLessThanOrEqual(450);
      expect(said[3].at / (mph * MPH)).toBeGreaterThanOrEqual(4);
      expect(said[3].urgent).toBe(true);
    }
  });
});

describe("prompts for one manoeuvre", () => {
  it("the roundabout, word for word", () => {
    const rb = step({ type: "roundabout", exit: 2, streetName: "Claremont Road" });
    const { said } = approach(rb, 0.6 * MILE, 45 * MPH, { stepLength: 0.6 * MILE });
    expect(said.map((s) => s.text)).toEqual([
      "In half a mile, at the roundabout, take the second exit onto Claremont Road",
      "In 350 yards, at the roundabout, take the second exit onto Claremont Road",
      "Now take the second exit onto Claremont Road",
    ]);
  });

  it("a short step due late is said with the real distance, and the tier below is not repeated", () => {
    const { said } = approach(right, 500, 45 * MPH, { stepLength: 500 });
    // Half a mile is due straight away at 500 m (62% of it): said once with
    // the real distance, and the 350 m prompt is not said on top.
    expect(said.map((s) => s.text)).toEqual(["In 550 yards, turn right onto Park Lane", "Turn right now onto Park Lane"]);
  });

  it("jitter backwards never repeats a prompt", () => {
    let state = settled();
    const ctx = { stepIndex: 0, next: right, current: null, stepLength: 2000, after: null, gapAfter: null, speedMps: 13 };
    const a = announce(state, { ...ctx, distanceToNext: 240 });
    expect(a.say?.text).toBe("In 250 yards, turn right onto Park Lane");
    state = a.state;
    expect(announce(state, { ...ctx, distanceToNext: 600 }).say).toBeNull();
    expect(announce(state, { ...ctx, distanceToNext: 230 }).say).toBeNull();
  });

  it("a close second manoeuvre is joined on with then, once, and gets only its now prompt", () => {
    const left = step({ modifier: "left", streetName: "Mill Lane" });
    const first = approach(right, 400, 30 * MPH, { after: left, gapAfter: 80 });
    expect(first.said.at(-1)!.text).toBe("Turn right now onto Park Lane, then turn left");
    expect(first.said.filter((s) => s.text.includes("then")).length).toBe(2); // main (slow band) and now
    const second = approach(left, 80, 30 * MPH, { state: first.state, stepIndex: 1 });
    expect(second.said.map((s) => s.text)).toEqual(["Turn left now onto Mill Lane"]);
  });

  it("manoeuvres under 20 m apart are one prompt", () => {
    const left = step({ modifier: "left", streetName: "Mill Lane" });
    const first = approach(right, 300, 30 * MPH, { after: left, gapAfter: 15 });
    const second = approach(left, 15, 30 * MPH, { state: first.state, stepIndex: 1 });
    expect(second.said).toEqual([]);
  });

  it("never more than one then", () => {
    const { said } = approach(right, 400, 30 * MPH, { after: step({ modifier: "left" }), gapAfter: 50 });
    for (const s of said) expect(s.text.split("then").length - 1).toBeLessThanOrEqual(1);
  });

  it("arriving: from the main prompt on, nothing at the spot (the navigator says it)", () => {
    const { said } = approach(step({ type: "arrive" }), 3 * MILE, 70 * MPH, { stepLength: 3 * MILE });
    expect(said[0].text).toBe("In half a mile, you will arrive at your destination");
    expect(said.every((s) => !s.text.startsWith("You have arrived"))).toBe(true);
  });

  it("a road-name change needs a name", () => {
    expect(approach(step({ type: "continue" }), 1000, 30 * MPH).said).toEqual([]);
    expect(approach(step({ type: "continue", streetName: "Broad Street" }), 1000, 30 * MPH).said.map((s) => s.text)).toEqual([
      "In 250 yards, carry straight on onto Broad Street",
      "Carry straight on onto Broad Street",
    ]);
  });
});

describe("start, new steps and reroutes", () => {
  const left = step({ modifier: "left", streetName: "High Street" });
  const depart = step({ type: "depart", streetName: "Station Road" });
  const ctx = (d: number, over: Partial<Parameters<typeof announce>[1]> = {}) => ({
    stepIndex: 0,
    next: left,
    distanceToNext: d,
    current: depart,
    stepLength: d,
    after: null,
    gapAfter: null,
    speedMps: 10,
    ...over,
  });

  it("Start says which road to head along", () => {
    expect(announce(initialAnnouncerState("start"), ctx(1200)).say?.text).toBe("Head along Station Road");
    expect(announce(initialAnnouncerState("start"), ctx(3.2 * MILE)).say?.text).toBe(
      "Head along Station Road, then follow the road for 3 miles"
    );
  });

  it("Start with the first turn close says the turn", () => {
    expect(announce(initialAnnouncerState("start"), ctx(200)).say?.text).toBe("In 200 yards, turn left onto High Street");
  });

  it("a new route says its first instruction straight away, with distance", () => {
    expect(announce(initialAnnouncerState("reroute"), ctx(300 * 0.9144)).say?.text).toBe("In 300 yards, turn left onto High Street");
  });

  it("after a turn onto a long road: Follow the road for, once", () => {
    const a = announce(settled(0), ctx(4.1 * MILE, { stepIndex: 1, current: step({ streetName: "A19" }), speedMps: 25 }));
    expect(a.say?.text).toBe("Follow the A nineteen for 4 miles");
    expect(announce(a.state, ctx(4.0 * MILE, { stepIndex: 1, speedMps: 25 })).say).toBeNull();
  });

  it("repeat: the current instruction with its distance, or nothing far away", () => {
    expect(currentInstruction({ next: left, distanceToNext: 300 * 0.9144 })).toBe("In 300 yards, turn left onto High Street");
    expect(currentInstruction({ next: left, distanceToNext: 2 * MILE }, MILE / 2)).toBeNull();
    expect(currentInstruction({ next: left, distanceToNext: 10 })).toBe("Turn left now onto High Street");
  });
});
