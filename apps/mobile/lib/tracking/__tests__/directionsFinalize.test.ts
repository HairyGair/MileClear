/**
 * Finalize and the heartbeat, LOG ONLY (PLAN-recording.md step 5, after the
 * R1/R3 review).
 *
 * GOLDEN: finalize saves first, with the create body exactly as before this
 * build; the Directions work runs afterwards, never awaited, and its only
 * write is a follow-up update carrying gpsQuality.directions. With no
 * session, or the switch off, it does nothing at all. The heartbeat's
 * question is never awaited between its in-flight check and its finalize.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../db", () => ({
  getDatabase: vi.fn(async () => ({
    getAllAsync: vi.fn(async () => Promise.reject(new Error("no such table: navigation_drives"))),
    getFirstAsync: vi.fn(async () => Promise.reject(new Error("no such table: navigation_state"))),
  })),
}));

const api = vi.hoisted(() => ({ updateTrip: vi.fn(async () => ({ data: {} })) }));
vi.mock("../../api/trips", () => api);
vi.mock("../../sync/actions", () => {
  throw new Error("the Directions note must never go through the sync queue");
});

import {
  directionsLogForTrip,
  noteDirectionsAfterSave,
  noteHeartbeatWouldHold,
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
const LOG = async () => "log" as const;

function session(o: Partial<DriveSession> = {}): DriveSession {
  return {
    ...newDriveSession({
      sessionId: "dir_1",
      mode: "log",
      passenger: false,
      atMs: T0,
      destination: { lat: north(12 * MILE).lat, lng: -1.6, label: "Sunderland", name: "Depot", savedLocationId: "loc1", savedType: "depot" },
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

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const args = (o: Partial<Parameters<typeof noteDirectionsAfterSave>[0]> = {}) => ({
  tripId: "trip_1",
  coords: coords(),
  rawCoords: coords(),
  splitMs: 30 * MIN,
  endAddressKnown: true,
  log: vi.fn(),
  ...o,
});

describe("GOLDEN: no session, or the switch off, nothing at all", () => {
  it("no session: no update, nothing logged", async () => {
    const a = args();
    const update = vi.fn();
    await noteDirectionsAfterSave(a, { read: async () => [], readMode: LOG, update });
    expect(update).not.toHaveBeenCalled();
    expect(a.log).not.toHaveBeenCalled();
  });

  it("the real readers on a phone with no Directions tables: nothing", async () => {
    const a = args();
    const update = vi.fn();
    await noteDirectionsAfterSave(a, { update });
    expect(update).not.toHaveBeenCalled();
    expect(a.log).not.toHaveBeenCalled();
  });

  it("the switch off now (the kill switch) ignores sessions stored earlier, without reading them", async () => {
    const a = args();
    const update = vi.fn();
    const read = vi.fn(async () => [session()]);
    await noteDirectionsAfterSave(a, { read, readMode: async () => "off", update });
    expect(read).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(a.log).not.toHaveBeenCalled();
  });

  it("only sessions that were off themselves: nothing", async () => {
    const a = args();
    const update = vi.fn();
    await noteDirectionsAfterSave(a, { read: async () => [session({ mode: "off" })], readMode: LOG, update });
    expect(update).not.toHaveBeenCalled();
  });

  it("a reader that throws or hangs: nothing, within the time limit", async () => {
    const log = vi.fn();
    expect(await directionsLogForTrip(args(), { read: async () => Promise.reject(new Error("x")), readMode: LOG, log })).toBeNull();
    vi.useFakeTimers();
    const p = directionsLogForTrip(args(), { read: () => new Promise(() => {}), readMode: LOG, log });
    await vi.advanceTimersByTimeAsync(DIRECTIONS_FINALIZE_TIMEOUT_MS + 1);
    expect(await p).toBeNull();
    vi.useRealTimers();
    expect(log).not.toHaveBeenCalled();
  });

  it("starts off the caller's stack: nothing is read before finalize carries on", () => {
    const read = vi.fn(async () => []);
    const readMode = vi.fn(LOG);
    void noteDirectionsAfterSave(args(), { read, readMode, update: vi.fn() });
    expect(readMode).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});

describe("log mode with a session: a follow-up update carrying only gpsQuality.directions", () => {
  for (const mode of ["log", "on"] as const) {
    it(`server switch "${mode}": logs, then updates the saved trip with the note only`, async () => {
      const c = deepFreeze(coords());
      const before = JSON.stringify(c);
      const a = args({ coords: c, rawCoords: c });
      const update = vi.fn(async () => null);
      await noteDirectionsAfterSave(a, {
        read: async () => [withEnd(session({ mode }), T0 + 40 * MIN, "arrived")],
        readMode: async () => mode,
        update,
      });
      expect(JSON.stringify(c)).toBe(before);
      expect(update).toHaveBeenCalledTimes(1);
      const [id, data] = update.mock.calls[0] as unknown as [string, { gpsQuality: { directions: Record<string, any> } }];
      expect(id).toBe("trip_1");
      expect(Object.keys(data)).toEqual(["gpsQuality"]);
      expect(Object.keys(data.gpsQuality)).toEqual(["directions"]);
      const note = data.gpsQuality.directions;
      expect(note.mode).toBe("log");
      expect(note.wouldFill.miles).toBeCloseTo(8.3, 1);
      expect(note.wouldFill.gapCount).toBe(1);

      const logs = (a.log as ReturnType<typeof vi.fn>).mock.calls as Array<[string, Record<string, unknown>]>;
      expect(logs.map(([e]) => e)).toEqual(["finalize_directions_fill", "finalize_directions_named"]);
      expect(logs[0][1]).toMatchObject({ sessionId: "dir_1", mode: "log", planned: 1, applied: 0, wouldJoinNext: false });
      expect(logs[1][1]).toMatchObject({ mode: "log", wouldUse: false, reason: "too_far", endAddressKnown: true });
    });
  }

  it("the server gets the kind of place, never the place", async () => {
    const update = vi.fn(async () => null);
    await noteDirectionsAfterSave(args(), { read: async () => [session()], readMode: LOG, update });
    const note = (update.mock.calls[0] as unknown as [string, { gpsQuality: { directions: Record<string, unknown> } }])[1].gpsQuality.directions;
    expect(note.destination).toEqual({ savedPlace: true, savedType: "depot", hasName: true });
    const text = JSON.stringify(note);
    for (const leak of ["Sunderland", "Depot", "loc1", "54.9", '"lat"', '"lng"']) expect(text).not.toContain(leak);
    expect(text.length).toBeLessThan(2000);
  });

  it("the note goes by one direct API update, never the sync queue (no queue row, no local write)", async () => {
    api.updateTrip.mockClear();
    const a = args();
    await noteDirectionsAfterSave(a, { read: async () => [session()], readMode: LOG });
    expect(api.updateTrip).toHaveBeenCalledTimes(1);
    const [id, data] = api.updateTrip.mock.calls[0] as unknown as [string, { gpsQuality: Record<string, unknown> }];
    expect(id).toBe("trip_1");
    expect(Object.keys(data.gpsQuality)).toEqual(["directions"]);
    const src = readFileSync(join(__dirname, "..", "directionsFinalize.ts"), "utf8");
    expect(src).not.toMatch(/sync\/|syncUpdateTrip|enqueueSync/);
  });

  it("a failed direct update is dropped and logged, never retried", async () => {
    api.updateTrip.mockRejectedValueOnce(new Error("Network request failed"));
    const a = args();
    await noteDirectionsAfterSave(a, { read: async () => [session()], readMode: LOG });
    expect(a.log).toHaveBeenLastCalledWith("finalize_directions_note_dropped", expect.objectContaining({ reason: "error" }));
  });

  it("a create still queued (no server id): the note is dropped and that is logged", async () => {
    const a = args({ tripId: null });
    const update = vi.fn();
    await noteDirectionsAfterSave(a, { read: async () => [session()], readMode: LOG, update });
    expect(update).not.toHaveBeenCalled();
    expect(a.log).toHaveBeenLastCalledWith("finalize_directions_note_dropped", { sessionId: "dir_1", mode: "log", reason: "not_saved_to_server" });
  });

  it("a failing update is logged, never thrown", async () => {
    const a = args();
    await expect(
      noteDirectionsAfterSave(a, { read: async () => [session()], readMode: LOG, update: async () => Promise.reject(new Error("offline")) })
    ).resolves.toBeUndefined();
    expect(a.log).toHaveBeenLastCalledWith("finalize_directions_note_dropped", expect.objectContaining({ reason: "error", error: "offline" }));
  });
});

describe("wouldJoinNext: the gap after this trip, judged once by this trip", () => {
  /** The 20 Oct buffer split by a 10-minute journey end: leg one ends at
   *  1 mile, the next fix comes 15 minutes and 8.3 miles on. */
  const all = coords();
  const legOne = all.slice(0, all.length - 6);
  const legTwo = all.slice(all.length - 6);

  it("with a journey end under 30 minutes, the route would have joined the legs", async () => {
    const log = vi.fn();
    const note = await directionsLogForTrip({ coords: legOne, rawCoords: all, splitMs: 10 * MIN, endAddressKnown: true }, { read: async () => [session()], readMode: LOG, log });
    expect(note!.wouldFill.wouldJoinNext).toBe(true);
  });

  it("the next leg does not count the same gap again", async () => {
    const log = vi.fn();
    const note = await directionsLogForTrip({ coords: legTwo, rawCoords: legTwo, splitMs: 10 * MIN, endAddressKnown: true }, { read: async () => [session()], readMode: LOG, log });
    expect(note!.wouldFill.wouldJoinNext).toBe(false);
  });

  it("with the default 30-minute journey end it can never be true (a fill is 30 minutes at most)", async () => {
    const log = vi.fn();
    const note = await directionsLogForTrip({ coords: legOne, rawCoords: all, splitMs: 30 * MIN, endAddressKnown: true }, { read: async () => [session()], readMode: LOG, log });
    expect(note!.wouldFill.wouldJoinNext).toBe(false);
  });
});

describe("finalize itself (source)", () => {
  const src = readFileSync(join(__dirname, "..", "detection.ts"), "utf8");
  const inner = src.slice(src.indexOf("async function _finalizeAutoTripInner"));
  const save = inner.indexOf("const tripResult = await syncCreateTrip(createBody);");

  it("nothing Directions is touched or awaited before the trip is saved", () => {
    expect(save).toBeGreaterThan(0);
    const beforeSave = inner.slice(0, save);
    // The only Directions lines before the save keep the journey-end setting.
    const mentions = beforeSave.split("\n").filter((l) => /directions/i.test(l) && !/^\s*\/\//.test(l));
    expect(mentions.map((l) => l.trim())).toEqual(["let directionsSplitMs: number | null = null;", "directionsSplitMs = splitMs;"]);
    expect(src).not.toContain("withDirectionsNote");
  });

  it("the create body is the plain literal it always was", () => {
    const body = inner.slice(inner.indexOf("const createBody: CreateTripData = {"), inner.indexOf("pendingCreateBody = createBody;"));
    expect(body).toMatch(/^const createBody: CreateTripData = \{/);
    expect(body).toMatch(/gpsQuality: tripQuality,\s*recordedBy: "automatic",\s*\};\s*$/);
    expect(body).not.toMatch(/directions/i);
  });

  it("the Directions work runs after the save, and is never awaited", () => {
    const call = inner.indexOf("noteDirectionsAfterSave(");
    expect(call).toBeGreaterThan(save);
    expect(inner.slice(call - 5, call)).toBe("void ");
    expect(src.match(/noteDirectionsAfterSave\(/g)?.length).toBe(1);
    expect(src).not.toMatch(/await\s+noteDirectionsAfterSave/);
  });
});

describe("heartbeat: would a live session have held the stale finalize?", () => {
  const live = () => session({ updatedAtMs: Date.now(), startedAtMs: Date.now() - 20 * MIN, routes: [{ routeId: "r1", fromMs: Date.now() - 20 * MIN, toMs: null, geometry: ROUTE }] });
  const lastFix = (o: Partial<DirectionsCoord> = {}) => async () => ({ ...north(3 * MILE), speed: 33 * MPH, accuracy: 8, recorded_at: new Date(Date.now() - 8 * MIN).toISOString(), ...o });

  it("on the route at 33 mph, 8 minutes quiet: would hold (logged only)", async () => {
    const log = vi.fn();
    await noteHeartbeatWouldHold({ idleMs: 8 * MIN, nowMs: Date.now(), lastFix: lastFix() }, { read: async () => [live()], readMode: LOG, log });
    expect(log).toHaveBeenCalledWith(
      "heartbeat_finalize_would_hold_directions",
      expect.objectContaining({ wouldHold: true, onRoute: true, lastFixRead: true, lastSpeedMph: 33, mode: "log" })
    );
  });

  it("off the route, slow, quiet too long, or the fix already gone: logged as not holding", async () => {
    for (const [fix, idle] of [
      [lastFix({ lng: -1.59 }), 8 * MIN],
      [lastFix({ speed: 10 * MPH }), 8 * MIN],
      [lastFix(), 31 * MIN],
      [async () => null, 8 * MIN],
    ] as const) {
      const log = vi.fn();
      await noteHeartbeatWouldHold({ idleMs: idle, nowMs: Date.now(), lastFix: fix }, { read: async () => [live()], readMode: LOG, log });
      expect(log.mock.calls[0][1]).toMatchObject({ wouldHold: false });
    }
  });

  it("no live session (none, ended, passenger, switch off): nothing logged, the buffer is not even read", async () => {
    const cases: Array<[DriveSession[], "log" | "off"]> = [
      [[], "log"],
      [[withEnd(live(), Date.now() - MIN, "arrived")], "log"],
      [[{ ...live(), passenger: true }], "log"],
      [[live()], "off"],
    ];
    for (const [sessions, mode] of cases) {
      const log = vi.fn();
      const read = vi.fn(lastFix());
      await noteHeartbeatWouldHold({ idleMs: 8 * MIN, nowMs: Date.now(), lastFix: read }, { read: async () => sessions, readMode: async () => mode, log });
      expect(log).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    }
  });

  it("never throws", async () => {
    await expect(
      noteHeartbeatWouldHold({ idleMs: 1, nowMs: Date.now(), lastFix: async () => Promise.reject(new Error("x")) }, { read: async () => [live()], readMode: LOG, log: () => {} })
    ).resolves.toBeUndefined();
  });

  describe("handleNativeHeartbeat (source)", () => {
    const src = readFileSync(join(__dirname, "..", "nativeLocation.ts"), "utf8");
    const hb = src.slice(src.indexOf("export async function handleNativeHeartbeat"), src.indexOf("export async function reconcileNativeBufferBeforeFinalize"));
    const inFlight = hb.indexOf("if (isFinalizeInFlight()) return;");
    const fin = hb.indexOf("await finalizeAutoTrip();");

    it("adds no await between the in-flight check and the finalize", () => {
      expect(inFlight).toBeGreaterThan(0);
      expect(fin).toBeGreaterThan(inFlight);
      const window = hb.slice(inFlight, fin);
      expect(window).toContain("void noteHeartbeatWouldHold(");
      expect(window).not.toMatch(/await\s+noteHeartbeatWouldHold/);
      // The only awaits there are the Android retry throttle's two reads and
      // writes, which were there before this build, inside its own if.
      const awaits = window.match(/\bawait\b/g) ?? [];
      expect(awaits).toHaveLength(2);
      const throttle = window.slice(window.indexOf("if (opts.minRetryMs"), window.indexOf("void noteHeartbeatWouldHold("));
      expect(throttle.match(/\bawait\b/g)).toHaveLength(2);
      expect(window.slice(window.indexOf("void noteHeartbeatWouldHold(")).match(/\breturn\b/)).toBeNull();
    });

    it("never wipes the engine's store while another finalize is running", () => {
      const after = hb.slice(fin);
      expect(after).toMatch(/if \(!isFinalizeInFlight\(\)\) await BGGeo\?\.destroyLocations\(\);/);
      expect(after.match(/destroyLocations\(/g)).toHaveLength(1);
    });
  });
});
