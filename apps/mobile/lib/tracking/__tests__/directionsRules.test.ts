/**
 * Directions drive rules (PLAN-recording.md sections 1-4): when guidance may
 * open or arm a recording, when an armed one sees movement, which GPS gaps
 * the followed route fills, and when the trip's end may take the place's
 * name. All pure. In this build every one of them is only logged.
 */
import { describe, it, expect } from "vitest";
import {
  armStep,
  directionsActsOn,
  directionsOpenDecision,
  newArm,
  metresBetween,
  DIRECTIONS_ARM_TTL_MS,
  type DirectionsFix,
  type DirectionsOpenInputs,
} from "../directionsOpenRule";
import { planRouteFill, FILL_MAX_POINTS_PER_GAP, type FillFix } from "../routeFillRule";
import { directionsNameRule, metresBucket } from "../directionsNameRule";
import { newDriveSession, withEnd, withRoute, type DriveSession } from "../../navigation/driveSessions";

const MPH = 0.44704;
const MILE = 1609.344;
const M_PER_DEG_LAT = 111_195;
const T0 = Date.parse("2026-10-20T17:00:00Z");
const SEC = 1000;
const MIN = 60 * SEC;

// A straight road north from (54.9, -1.6), a point every 50 m for 40 miles.
const ORIGIN = { lat: 54.9, lng: -1.6 };
const north = (m: number, eastM = 0): { lat: number; lng: number } => ({
  lat: ORIGIN.lat + m / M_PER_DEG_LAT,
  lng: ORIGIN.lng + eastM / (M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180)),
});
const lineNorth = (fromM: number, toM: number, stepM = 50): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let m = fromM; m <= toM; m += stepM) {
    const p = north(m);
    out.push([p.lat, p.lng]);
  }
  return out;
};
const ROUTE = lineNorth(0, 40 * MILE);

function session(o: Partial<DriveSession> = {}, geometry = ROUTE, atMs = T0): DriveSession {
  return {
    ...newDriveSession({
      sessionId: "dir_1",
      mode: "log",
      passenger: false,
      atMs,
      destination: { lat: north(40 * MILE).lat, lng: ORIGIN.lng, label: "Sunderland", name: null, savedLocationId: null, savedType: null },
      route: { routeId: "r1", geometry },
    }),
    // Kept "live" across the whole test window unless a test ends it.
    updatedAtMs: atMs + 2 * 60 * MIN,
    ...o,
  };
}

const fix = (alongM: number, atMs: number, o: Partial<FillFix> = {}): FillFix => ({
  ...north(alongM),
  speed: 14.75,
  accuracy: 8,
  atMs,
  ...o,
});

/** Mike French, 20 Oct: 33 mph, then 15 minutes and 8.3 miles with no fix. */
function oct20(): FillFix[] {
  const out: FillFix[] = [];
  const v = 33 * MPH;
  let t = T0 + MIN;
  for (let m = 0; m <= MILE; m += v * 10) {
    out.push(fix(m, t));
    t += 10 * SEC;
  }
  const a = out[out.length - 1];
  const bAlong = MILE + 8.3 * MILE + (a.lat - north(MILE).lat) * M_PER_DEG_LAT;
  const tb = a.atMs + 15 * MIN;
  for (let k = 0; k < 6; k++) out.push(fix(bAlong + k * v * 10, tb + k * 10 * SEC));
  return out;
}

describe("routeFillRule: the 20 Oct shape", () => {
  it("fills about 8.3 miles along the route", () => {
    const plan = planRouteFill(oct20(), [session()]);
    expect(plan.gaps).toHaveLength(1);
    expect(plan.miles).toBeCloseTo(8.3, 1);
    expect(plan.gaps[0].crowMiles).toBeCloseTo(8.3, 1);
    expect(plan.gaps[0].sessionId).toBe("dir_1");
    expect(plan.gaps[0].routeId).toBe("r1");
    expect(plan.rejected).toEqual({});
  });

  it("puts a point every 100 m, timed strictly inside the gap and at least 1 s from the real fixes", () => {
    const fixes = oct20();
    const g = planRouteFill(fixes, [session()]).gaps[0];
    expect(g.points.length).toBeGreaterThan(130);
    expect(g.points.length).toBeLessThanOrEqual(134);
    for (let i = 0; i < g.points.length; i++) {
      const p = g.points[i];
      expect(p.atMs).toBeGreaterThanOrEqual(g.fromMs + 1000);
      expect(p.atMs).toBeLessThanOrEqual(g.toMs - 1000);
      expect(Math.abs(p.lng - ORIGIN.lng)).toBeLessThan(1e-9); // on the road
      if (i > 0) {
        expect(p.atMs).toBeGreaterThanOrEqual(g.points[i - 1].atMs);
        expect(metresBetween(g.points[i - 1], p)).toBeCloseTo(100, 0);
      }
      // Never on top of a real fix's time.
      for (const f of fixes) expect(Math.abs(f.atMs - p.atMs)).toBeGreaterThanOrEqual(1000);
    }
  });

  it("is deterministic and leaves its inputs alone", () => {
    const fixes = oct20();
    const sessions = [session()];
    const before = JSON.stringify({ fixes, sessions });
    const a = planRouteFill(fixes, sessions);
    const b = planRouteFill(oct20(), [session()]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify({ fixes, sessions })).toBe(before);
  });

  it("8.3 of 10.3 miles filled is low confidence; with real miles either side it is not", () => {
    expect(planRouteFill(oct20(), [session()]).lowConfidence).toBe(true);
    // 5 real miles before the gap at 33 mph: fixes every 10 s.
    const pre: FillFix[] = [];
    for (let m = 0, t = T0 - 10 * MIN; m < 5 * MILE; m += 147.5, t += 10 * SEC) pre.push(fix(m - 5 * MILE, t));
    const plan = planRouteFill([...pre, ...oct20()], [session({}, lineNorth(-6 * MILE, 40 * MILE), T0 - 11 * MIN)]);
    expect(plan.gaps).toHaveLength(1);
    expect(plan.lowConfidence).toBe(false);
  });
});

describe("routeFillRule: must not fill", () => {
  const A = (o: Partial<FillFix> = {}) => fix(MILE, T0 + 2 * MIN, o);
  const B = (o: Partial<FillFix> = {}, afterMs = 8 * MIN, alongM = MILE + 4 * MILE) => fix(alongM, T0 + 2 * MIN + afterMs, o);
  const judge = (fixes: FillFix[], sessions: DriveSession[] = [session()]) => planRouteFill(fixes, sessions);

  it("the base case does fill (4 miles in 8 minutes)", () => {
    expect(judge([A(), B()]).gaps).toHaveLength(1);
  });

  it("no sessions: nothing judged, nothing filled", () => {
    expect(judge([A(), B()], [])).toEqual({ gaps: [], miles: 0, realMiles: 4, rejected: {}, lowConfidence: false });
  });

  it("under a minute is not a gap at all", () => {
    expect(judge([A(), fix(MILE + 800, T0 + 2 * MIN + 59 * SEC)])).toMatchObject({ gaps: [], rejected: {} });
  });

  it("over 30 minutes", () => {
    expect(judge([A(), B({}, 31 * MIN, MILE + 20 * MILE)]).rejected).toEqual({ too_long: 1 });
  });

  it("under 500 m apart (a stop)", () => {
    expect(judge([A(), B({}, 3 * MIN, MILE + 400)]).rejected).toEqual({ short: 1 });
  });

  it("either fix worse than 50 m, or unknown", () => {
    expect(judge([A({ accuracy: 51 }), B()]).rejected).toEqual({ accuracy: 1 });
    expect(judge([A(), B({ accuracy: 65 })]).rejected).toEqual({ accuracy: 1 });
    expect(judge([A({ accuracy: null }), B()]).rejected).toEqual({ accuracy: 1 });
  });

  it("A parked or speed unknown", () => {
    expect(judge([A({ speed: 1.7 }), B()]).rejected).toEqual({ a_stopped: 1 });
    expect(judge([A({ speed: null }), B()]).rejected).toEqual({ a_stopped: 1 });
  });

  it("a passenger's session, or one with the switch off", () => {
    expect(judge([A(), B()], [session({ passenger: true })]).rejected).toEqual({});
    expect(judge([A(), B()], [session({ passenger: true })]).gaps).toEqual([]);
    expect(judge([A(), B()], [session({ mode: "off" })]).gaps).toEqual([]);
  });

  it("guidance started after A", () => {
    expect(judge([A(), B()], [session({}, ROUTE, T0 + 3 * MIN)]).rejected).toEqual({ no_session: 1 });
  });

  it("guidance ended (End, or arrived) before B", () => {
    for (const reason of ["ended", "arrived", "left"] as const) {
      const s = withEnd(session(), T0 + 5 * MIN, reason);
      expect(judge([A(), B()], [s]).rejected).toEqual({ no_session: 1 });
    }
  });

  it("an app killed mid-guidance covers only 30 minutes past its last update", () => {
    const s = session({ updatedAtMs: T0 - 30 * MIN });
    expect(judge([A(), B()], [s]).rejected).toEqual({ no_session: 1 });
  });

  it("B off the route", () => {
    expect(judge([A(), fix(5 * MILE, T0 + 10 * MIN, { ...north(5 * MILE, 120) })]).rejected).toEqual({ off_route: 1 });
  });

  it("A off the route", () => {
    expect(judge([{ ...A(), ...north(MILE, 90) }, B()]).rejected).toEqual({ off_route: 1 });
  });

  it("B behind A on the route (going the other way)", () => {
    expect(judge([fix(6 * MILE, T0 + 2 * MIN), fix(2 * MILE, T0 + 10 * MIN)]).rejected).toEqual({ backwards: 1 });
  });

  it("the on-route tolerance is max(40 m, 1.5 x accuracy), capped at 75 m", () => {
    const b = (eastM: number, accuracy: number) => ({ ...B({ accuracy }), ...north(5 * MILE, eastM) });
    expect(judge([A(), b(39, 5)]).gaps).toHaveLength(1);
    expect(judge([A(), b(45, 5)]).rejected).toEqual({ off_route: 1 });
    expect(judge([A(), b(55, 40)]).gaps).toHaveLength(1);
    expect(judge([A(), b(74, 50)]).gaps).toHaveLength(1);
    expect(judge([A(), b(80, 50)]).rejected).toEqual({ off_route: 1 });
  });

  it("a reroute in the gap: B is judged against the route followed at A's time", () => {
    // Rerouted east 2 minutes into the gap; B is on the new road only.
    const eastRoad: Array<[number, number]> = [];
    for (let e = 0; e <= 8000; e += 50) {
      const p = north(2 * MILE, e);
      eastRoad.push([p.lat, p.lng]);
    }
    const s = withRoute(session(), { routeId: "r2", geometry: eastRoad }, T0 + 4 * MIN);
    const b = { ...B(), ...north(2 * MILE, 5000) };
    expect(judge([A(), b], [s]).rejected).toEqual({ off_route: 1 });
  });

  it("averaging under 10 mph or over 90 mph along the route", () => {
    expect(judge([A(), B({}, 25 * MIN, MILE + 3 * MILE)]).rejected).toEqual({ speed: 1 });
    expect(judge([A(), B({}, 10 * MIN, MILE + 16 * MILE)]).rejected).toEqual({ speed: 1 });
  });

  it("a route more than 3 x the straight line", () => {
    // Up 3 km, across 600 m, back down 3 km: 6.6 km of road, 600 m apart.
    const u: Array<[number, number]> = [];
    for (let m = 0; m <= 3000; m += 50) u.push([north(m).lat, north(m).lng]);
    for (let e = 50; e <= 600; e += 50) u.push([north(3000, e).lat, north(3000, e).lng]);
    for (let m = 2950; m >= 0; m -= 50) u.push([north(m, 600).lat, north(m, 600).lng]);
    const a = fix(0, T0 + 2 * MIN);
    const b = { ...fix(0, T0 + 12 * MIN), ...north(0, 600) };
    expect(judge([a, b], [session({}, u)]).rejected).toEqual({ detour: 1 });
  });

  it("no more than 50 filled miles per trip", () => {
    const fixes = [
      fix(0, T0 + MIN, { speed: 30 }),
      fix(28 * MILE, T0 + 26 * MIN, { speed: 30 }),
      fix(28 * MILE + 500, T0 + 26 * MIN + 20 * SEC, { speed: 30 }),
      fix(52 * MILE, T0 + 46 * MIN, { speed: 30 }),
    ];
    const plan = judge(fixes, [session({}, lineNorth(0, 60 * MILE))]);
    expect(plan.gaps).toHaveLength(1);
    expect(plan.miles).toBeCloseTo(28, 0);
    expect(plan.rejected).toEqual({ trip_cap: 1 });
  });

  it("at most 300 points in one gap, still inside it", () => {
    const g = judge([fix(0, T0 + MIN, { speed: 30 }), fix(40 * MILE, T0 + 29 * MIN, { speed: 30 })]).gaps[0];
    expect(g.points).toHaveLength(FILL_MAX_POINTS_PER_GAP);
    expect(g.points[0].atMs).toBeGreaterThanOrEqual(g.fromMs + 1000);
    expect(g.points[g.points.length - 1].atMs).toBeLessThanOrEqual(g.toMs - 1000);
  });
});

// ── Opening and arming ────────────────────────────────────────────────────

const moving: DirectionsFix = { lat: 54.9, lng: -1.6, speedMps: 10 * MPH, accuracyM: 10, atMs: T0 };
const parked: DirectionsFix = { ...moving, speedMps: 0 };
const base = (o: Partial<DirectionsOpenInputs> = {}): DirectionsOpenInputs => ({
  mode: "log",
  passenger: false,
  engineAvailable: true,
  switchOn: true,
  paused: false,
  shiftLocked: false,
  recording: false,
  notDrivingCooldown: false,
  fix: moving,
  nowMs: T0 + 2 * SEC,
  ...o,
});

describe("directionsOpenDecision", () => {
  it("opens at once from a moving, good fix", () => {
    expect(directionsOpenDecision(base())).toEqual({ action: "open_now", reason: "moving" });
  });

  it("arms when parked, slow, rough, stale or with no fix", () => {
    expect(directionsOpenDecision(base({ fix: parked })).action).toBe("arm");
    expect(directionsOpenDecision(base({ fix: { ...moving, speedMps: 8.9 * MPH } })).action).toBe("arm");
    expect(directionsOpenDecision(base({ fix: { ...moving, accuracyM: 51 } })).action).toBe("arm");
    expect(directionsOpenDecision(base({ fix: { ...moving, accuracyM: null } })).action).toBe("arm");
    expect(directionsOpenDecision(base({ nowMs: T0 + 31 * SEC })).action).toBe("arm");
    expect(directionsOpenDecision(base({ fix: null }))).toEqual({ action: "arm", reason: "no_fix" });
  });

  it("skips for every reason the recorder would refuse, in order", () => {
    const cases: Array<[Partial<DirectionsOpenInputs>, string]> = [
      [{ mode: "off" }, "mode_off"],
      [{ passenger: true }, "passenger"],
      [{ engineAvailable: false }, "no_engine"],
      [{ switchOn: false }, "switched_off"],
      [{ paused: true }, "paused"],
      [{ shiftLocked: true }, "shift_or_start_trip"],
      [{ recording: true }, "already_recording"],
      [{ notDrivingCooldown: true }, "not_driving_cooldown"],
    ];
    for (const [o, reason] of cases) expect(directionsOpenDecision(base(o))).toEqual({ action: "skip", reason });
    // Off beats everything else.
    expect(directionsOpenDecision(base({ mode: "off", passenger: true, recording: true })).reason).toBe("mode_off");
  });

  it("nothing acts in this build: on is treated exactly like log", () => {
    expect(directionsActsOn("log")).toBe(false);
    expect(directionsActsOn("on")).toBe(false);
    expect(directionsActsOn("off")).toBe(false);
  });
});

describe("armStep", () => {
  const start: DirectionsFix = { ...parked, atMs: T0 };
  const arm = newArm("dir_1", T0, start);

  it("lapses after 15 minutes", () => {
    expect(armStep(arm, { ...moving, atMs: T0 + DIRECTIONS_ARM_TTL_MS + 1 }, T0 + DIRECTIONS_ARM_TTL_MS + 1)).toEqual({ kind: "expired" });
  });

  it("one fix at 9 mph or more, good to 50 m, is movement", () => {
    const f = { ...moving, ...north(150), atMs: T0 + MIN };
    expect(armStep(arm, f, f.atMs)).toEqual({ kind: "move", via: "speed", plantStart: true, plantMetres: 150 });
    expect(armStep(arm, { ...f, accuracyM: 80 }, f.atMs).kind).toBe("wait");
  });

  it("two good fixes 100 m+ apart averaging 9 mph+ is movement", () => {
    const f1 = { ...parked, ...north(0), atMs: T0 + 30 * SEC };
    const w = armStep(newArm("dir_1", T0, null), f1, f1.atMs);
    expect(w.kind).toBe("wait");
    const armed = (w as { arm: typeof arm }).arm;
    const f2 = { ...parked, speedMps: null, ...north(120), atMs: T0 + 40 * SEC }; // 12 m/s
    expect(armStep(armed, f2, f2.atMs)).toMatchObject({ kind: "move", via: "pair", plantStart: false, plantMetres: null });
    // Same distance over 60 s is 4.5 mph: not movement.
    expect(armStep(armed, { ...f2, atMs: T0 + 90 * SEC }, T0 + 90 * SEC).kind).toBe("wait");
    // Under 100 m: not movement however quick.
    expect(armStep(armed, { ...f2, ...north(90), atMs: T0 + 35 * SEC }, T0 + 35 * SEC).kind).toBe("wait");
    // Over two minutes apart: not a pair.
    expect(armStep(armed, { ...f2, ...north(2000), atMs: T0 + 3 * MIN }, T0 + 3 * MIN).kind).toBe("wait");
    // A rough fix in the pair: not movement.
    expect(armStep(armed, { ...f2, accuracyM: 70 }, f2.atMs).kind).toBe("wait");
  });

  it("the start is planted only within 5 minutes and 2 km of guidance starting", () => {
    const at = (ms: number, m: number) => ({ ...moving, ...north(m), atMs: ms });
    expect(armStep(arm, at(T0 + 5 * MIN, 500), T0 + 5 * MIN)).toMatchObject({ plantStart: true });
    expect(armStep(arm, at(T0 + 5 * MIN + 1, 500), T0 + 5 * MIN + 1)).toMatchObject({ plantStart: false });
    expect(armStep(arm, at(T0 + MIN, 2100), T0 + MIN)).toMatchObject({ plantStart: false, plantMetres: 2100 });
  });
});

// ── Naming ────────────────────────────────────────────────────────────────

describe("directionsNameRule", () => {
  const place = north(10 * MILE);
  const dest = (saved: boolean) => ({
    lat: place.lat,
    lng: place.lng,
    label: "Tesco Extra, Washington",
    name: saved ? "Depot" : null,
    savedLocationId: saved ? "loc1" : null,
    savedType: saved ? "depot" : null,
  });
  const s = (o: Partial<DriveSession> = {}, saved = true) => ({ ...session(), destination: dest(saved), ...o });
  const tripEnd = T0 + 20 * MIN;
  const run = (sessions: DriveSession[], endM = 10 * MILE - 80) =>
    directionsNameRule({ sessions, tripStartMs: T0 + MIN, tripEndMs: tripEnd, lastFix: north(endM) });

  it("arrived within 300 m of a saved place: its name", () => {
    expect(run([withEnd(s(), tripEnd - 2 * MIN, "arrived")])).toEqual({
      use: true,
      reason: null,
      sessionId: "dir_1",
      name: "Depot",
      source: "saved",
      metres: 80,
      metresBucket: "50-100",
    });
  });

  it("a searched place: its label", () => {
    expect(run([withEnd(s({}, false), tripEnd, "arrived")])).toMatchObject({ use: true, name: "Tesco Extra, Washington", source: "search" });
  });

  it("parked more than 300 m past it: not named", () => {
    expect(run([withEnd(s(), tripEnd, "arrived")], 10 * MILE + 320)).toMatchObject({ use: false, reason: "too_far", metresBucket: "300-1000" });
  });

  it("ended (not arrived) within 10 minutes of the trip's end: named; earlier, or never ended: not", () => {
    expect(run([withEnd(s(), tripEnd - 9 * MIN, "ended")]).use).toBe(true);
    expect(run([withEnd(s(), tripEnd + 9 * MIN, "left")]).use).toBe(true);
    expect(run([withEnd(s(), tripEnd - 11 * MIN, "ended")])).toMatchObject({ use: false, reason: "not_ended_near_trip_end" });
    expect(run([s()])).toMatchObject({ use: false, reason: "not_ended_near_trip_end" });
  });

  it("no session, a passenger's, one switched off, or one that does not overlap: not named", () => {
    expect(run([]).reason).toBe("no_session");
    expect(run([withEnd(s({ passenger: true }), tripEnd, "arrived")]).reason).toBe("no_session");
    expect(run([withEnd(s({ mode: "off" }), tripEnd, "arrived")]).reason).toBe("no_session");
    const later = { ...s(), startedAtMs: tripEnd + MIN, updatedAtMs: tripEnd + MIN };
    expect(run([later]).reason).toBe("no_session");
  });

  it("the latest session decides", () => {
    const first = withEnd(s(), T0 + 5 * MIN, "ended");
    const second = withEnd({ ...s({}, false), sessionId: "dir_2", startedAtMs: T0 + 6 * MIN }, tripEnd, "arrived");
    expect(run([first, second])).toMatchObject({ sessionId: "dir_2", source: "search" });
  });

  it("buckets", () => {
    expect([10, 50, 99, 300, 301, 999, 1000, null].map(metresBucket)).toEqual([
      "0-50",
      "50-100",
      "50-100",
      "100-300",
      "300-1000",
      "300-1000",
      "1000+",
      null,
    ]);
  });
});
