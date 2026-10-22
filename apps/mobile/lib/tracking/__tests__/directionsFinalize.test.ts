/**
 * Finalize and the heartbeat, LOG ONLY (PLAN-recording.md step 5).
 *
 * GOLDEN: with no guidance session the trip's create body is the very same
 * object, byte for byte, as before this build; with a session in log mode it
 * differs ONLY by gpsQuality.directions. Segmentation, coordinates, distance
 * and addresses are never handed to the Directions code, and the source
 * check below holds finalize to that.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../db", () => ({ getDatabase: vi.fn(async () => ({ getAllAsync: vi.fn(async () => Promise.reject(new Error("no such table: navigation_drives"))) })) }));

import {
  directionsLogForTrip,
  noteHeartbeatWouldHold,
  withDirectionsNote,
  DIRECTIONS_FINALIZE_TIMEOUT_MS,
  type DirectionsCoord,
} from "../directionsFinalize";
import { newDriveSession, withEnd, type DriveSession } from "../../navigation/driveSessions";

const MPH = 0.44704;
const MILE = 1609.344;
const M_PER_DEG_LAT = 111_195;
const T0 = Date.parse("2026-10-20T17:00:00Z");
const MIN = 60_000;
const north = (m: number) => ({ lat: 54.9 + m / M_PER_DEG_LAT, lng: -1.6 });
const ROUTE: Array<[number, number]> = [];
for (let m = 0; m <= 12 * MILE; m += 50) ROUTE.push([north(m).lat, north(m).lng]);

function session(o: Partial<DriveSession> = {}): DriveSession {
  return {
    ...newDriveSession({
      sessionId: "dir_1",
      mode: "log",
      passenger: false,
      atMs: T0,
      destination: { lat: north(12 * MILE).lat, lng: -1.6, label: "Sunderland", name: null, savedLocationId: null, savedType: null },
      route: { routeId: "r1", geometry: ROUTE },
    }),
    updatedAtMs: T0 + 60 * MIN,
    ...o,
  };
}

/** The 20 Oct shape as finalize holds it: ISO times, 33 mph, a 15-minute hole. */
function coords(): DirectionsCoord[] {
  const out: DirectionsCoord[] = [];
  const v = 33 * MPH * 10;
  let t = T0 + MIN;
  for (let m = 0; m <= MILE; m += v, t += 10_000) out.push({ ...north(m), speed: 33 * MPH, accuracy: 8, recorded_at: new Date(t).toISOString() });
  const lastT = t - 10_000;
  const lastM = Math.floor(MILE / v) * v;
  for (let k = 0; k < 6; k++) {
    out.push({ ...north(lastM + 8.3 * MILE + k * v), speed: 33 * MPH, accuracy: 8, recorded_at: new Date(lastT + 15 * MIN + k * 10_000).toISOString() });
  }
  return out;
}

/** A create body shaped like _finalizeAutoTripInner's. */
function body(c = coords()) {
  return {
    startLat: c[0].lat,
    startLng: c[0].lng,
    endLat: c[c.length - 1].lat,
    endLng: c[c.length - 1].lng,
    startAddress: "Gateshead",
    endAddress: "Washington",
    distanceMiles: 9.31,
    startedAt: String(c[0].recorded_at),
    endedAt: String(c[c.length - 1].recorded_at),
    classification: "unclassified",
    vehicleId: "veh_1",
    coordinates: c.map((x) => ({ lat: x.lat, lng: x.lng, speed: x.speed, accuracy: x.accuracy, recordedAt: String(x.recorded_at) })),
    gpsQuality: { rawCoords: c.length, avgAccuracyM: 8, maxSpeedMph: 33, distanceSource: "match" } as Record<string, unknown>,
    recordedBy: "automatic",
  };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

describe("GOLDEN: no guidance session, no change", () => {
  it("the create body is the very same object, byte for byte, and nothing is logged", async () => {
    const c = coords();
    const b = deepFreeze(body(c));
    const before = JSON.stringify(b);
    const log = vi.fn();
    const note = await directionsLogForTrip({ coords: c, rawCoords: c, splitMs: 5 * MIN, endAddressKnown: true }, { read: async () => [], log });
    expect(note).toBeNull();
    expect(log).not.toHaveBeenCalled();
    const out = withDirectionsNote(b, note);
    expect(out).toBe(b);
    expect(JSON.stringify(out)).toBe(before);
  });

  it("the real reader on a phone with no navigation_drives table: null", async () => {
    const log = vi.fn();
    expect(await directionsLogForTrip({ coords: coords(), endAddressKnown: true }, { log })).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it("only sessions with the switch off: null", async () => {
    const log = vi.fn();
    expect(await directionsLogForTrip({ coords: coords(), endAddressKnown: true }, { read: async () => [session({ mode: "off" })], log })).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it("a reader that throws or hangs: null, within the time limit", async () => {
    const log = vi.fn();
    expect(await directionsLogForTrip({ coords: coords(), endAddressKnown: true }, { read: async () => Promise.reject(new Error("x")), log })).toBeNull();
    vi.useFakeTimers();
    const p = directionsLogForTrip({ coords: coords(), endAddressKnown: true }, { read: () => new Promise(() => {}), log });
    vi.advanceTimersByTime(DIRECTIONS_FINALIZE_TIMEOUT_MS + 1);
    expect(await p).toBeNull();
    vi.useRealTimers();
    expect(log).not.toHaveBeenCalled();
  });
});

describe("GOLDEN: log mode with a session, only gpsQuality.directions differs", () => {
  for (const mode of ["log", "on"] as const) {
    it(`server switch "${mode}": logs what would happen, adds the note, changes nothing else`, async () => {
      const c = deepFreeze(coords());
      const b = deepFreeze(body(c));
      const before = JSON.stringify(b);
      const logs: Array<[string, Record<string, unknown>]> = [];
      const note = await directionsLogForTrip(
        { coords: c, rawCoords: c, splitMs: 5 * MIN, endAddressKnown: true },
        { read: async () => [withEnd(session({ mode }), T0 + 40 * MIN, "arrived")], log: (e, d) => logs.push([e, d]) }
      );
      expect(note).not.toBeNull();
      expect(note!.mode).toBe("log");
      expect(note!.serverMode).toBe(mode);
      expect(note!.wouldFill.miles).toBeCloseTo(8.3, 1);
      expect(note!.wouldFill.gapCount).toBe(1);
      // The 15-minute hole is longer than a 5-minute journey end: today it
      // splits the buffer; the route would have joined it.
      expect(note!.wouldFill.wouldJoinLegs).toBe(1);

      const out = withDirectionsNote(b, note);
      expect(JSON.stringify(b)).toBe(before); // the original is untouched
      const { directions, ...restGq } = out.gpsQuality as Record<string, unknown>;
      expect(directions).toBe(note);
      expect(JSON.stringify({ ...out, gpsQuality: restGq })).toBe(before);
      expect(out.coordinates).toBe(b.coordinates);

      expect(logs.map(([e]) => e)).toEqual(["finalize_directions_fill", "finalize_directions_named"]);
      expect(logs[0][1]).toMatchObject({ sessionId: "dir_1", mode: "log", planned: 1, applied: 0, wouldJoinLegs: 1 });
      expect(logs[1][1]).toMatchObject({ mode: "log", wouldUse: false, reason: "too_far", endAddressKnown: true });
      // Events carry counts and buckets, never a place.
      expect(JSON.stringify(logs)).not.toContain("Sunderland");
      expect(JSON.stringify(logs)).not.toContain("54.9");
    });
  }

  it("the note is small: no fill points, at most 20 gaps", async () => {
    const note = await directionsLogForTrip({ coords: coords(), endAddressKnown: false }, { read: async () => [session()], log: () => {} });
    expect(note!.wouldFill.gaps[0]).toEqual({
      fromMs: expect.any(Number),
      toMs: expect.any(Number),
      miles: expect.any(Number),
      crowMiles: expect.any(Number),
      points: expect.any(Number),
    });
    expect(JSON.stringify(note).length).toBeLessThan(2000);
  });
});

describe("finalize itself (source)", () => {
  const src = readFileSync(join(__dirname, "..", "detection.ts"), "utf8");
  const inner = src.slice(src.indexOf("async function _finalizeAutoTripInner"));

  it("the create body goes through withDirectionsNote with the note as the only extra", () => {
    expect(inner).toMatch(/const createBody: CreateTripData = withDirectionsNote<CreateTripData>\(\{/);
    expect(inner).toMatch(/recordedBy: "automatic",\s*\}, directionsNote\);/);
    expect(src.match(/withDirectionsNote/g)?.length).toBe(2); // import + the one use
  });

  it("the question is asked inside a try/catch, after everything the trip is made of", () => {
    const call = inner.indexOf("directionsLogForTrip(");
    const tryAt = inner.lastIndexOf("try {", call);
    expect(tryAt).toBeGreaterThan(-1);
    expect(inner.slice(tryAt, call)).not.toContain("}");
    for (const made of ["const cleaned = cleanTraceForSave(coords)", "bestTraceDistance(filteredCoords", "const wire = prepareCoordinatesForServer"]) {
      expect(inner.indexOf(made)).toBeGreaterThan(-1);
      expect(inner.indexOf(made)).toBeLessThan(call);
    }
    // What it is given: fixes to read and whether an end name exists. Never
    // the distance, the wire coordinates or the addresses themselves.
    const args = inner.slice(call, inner.indexOf(");", call));
    expect(args).not.toMatch(/totalDistance|roundedDistance|wire\.|startAddress|endAddress:/);
    expect(src.match(/directionsSplitMs/g)?.length).toBe(3); // declared, set, read
  });
});

describe("heartbeat: would a live session have held the stale finalize?", () => {
  const live = () => session({ updatedAtMs: Date.now(), startedAtMs: Date.now() - 20 * MIN, routes: [{ routeId: "r1", fromMs: Date.now() - 20 * MIN, toMs: null, geometry: ROUTE }] });
  const lastFix = (o: Partial<DirectionsCoord> = {}) => async () => ({ ...north(3 * MILE), speed: 33 * MPH, accuracy: 8, recorded_at: new Date(Date.now() - 8 * MIN).toISOString(), ...o });

  it("on the route at 33 mph, 8 minutes quiet: would hold (logged only)", async () => {
    const log = vi.fn();
    await noteHeartbeatWouldHold({ idleMs: 8 * MIN, nowMs: Date.now(), lastFix: lastFix() }, { read: async () => [live()], log });
    expect(log).toHaveBeenCalledWith("heartbeat_finalize_would_hold_directions", expect.objectContaining({ wouldHold: true, onRoute: true, lastSpeedMph: 33, mode: "log" }));
  });

  it("off the route, slow, or quiet too long: logged as not holding", async () => {
    for (const [fix, idle] of [
      [lastFix({ lng: -1.59 }), 8 * MIN],
      [lastFix({ speed: 10 * MPH }), 8 * MIN],
      [lastFix(), 31 * MIN],
    ] as const) {
      const log = vi.fn();
      await noteHeartbeatWouldHold({ idleMs: idle, nowMs: Date.now(), lastFix: fix }, { read: async () => [live()], log });
      expect(log.mock.calls[0][1]).toMatchObject({ wouldHold: false });
    }
  });

  it("no live session (none, ended, passenger): nothing logged, the buffer is not even read", async () => {
    for (const sessions of [[], [withEnd(live(), Date.now() - MIN, "arrived")], [{ ...live(), passenger: true }]]) {
      const log = vi.fn();
      const read = vi.fn(lastFix());
      await noteHeartbeatWouldHold({ idleMs: 8 * MIN, nowMs: Date.now(), lastFix: read }, { read: async () => sessions, log });
      expect(log).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    }
  });

  it("never throws", async () => {
    await expect(
      noteHeartbeatWouldHold({ idleMs: 1, nowMs: Date.now(), lastFix: async () => Promise.reject(new Error("x")) }, { read: async () => [live()], log: () => {} })
    ).resolves.toBeUndefined();
  });

  it("sits before the heartbeat's finalize and cannot skip it", () => {
    const src = readFileSync(join(__dirname, "..", "nativeLocation.ts"), "utf8");
    const hb = src.slice(src.indexOf("export async function handleNativeHeartbeat"));
    const note = hb.indexOf("await noteHeartbeatWouldHold(");
    const fin = hb.indexOf("await finalizeAutoTrip();");
    expect(note).toBeGreaterThan(0);
    expect(note).toBeLessThan(fin);
    expect(hb.slice(note, fin)).not.toMatch(/\breturn\b/);
  });
});
