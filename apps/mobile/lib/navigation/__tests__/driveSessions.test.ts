/**
 * Guidance sessions kept on the phone for the recorder (PLAN-recording.md
 * section 4): the row's shape, the caps, and the read-only reader that must
 * read "no sessions" whenever anything is wrong.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fakeDb = { getAllAsync: vi.fn(), runAsync: vi.fn(), execAsync: vi.fn(), getFirstAsync: vi.fn() };
const getDatabase = vi.fn(async () => fakeDb);
vi.mock("../../db", () => ({ getDatabase: () => getDatabase() }));

import {
  DRIVE_KEEP_MS,
  DRIVE_MAX_POINTS,
  DRIVE_MAX_ROUTES,
  DRIVE_OPEN_GRACE_MS,
  directionsModeOf,
  newDriveSession,
  parseDriveSession,
  routeActiveAt,
  sessionCoverEndMs,
  withEnd,
  withRoute,
  type DriveSession,
} from "../driveSessions";
import { readDirectionsRecordingMode, readDriveSessions } from "../driveLog";
import {
  endDriveSession,
  pruneDriveSessions,
  rememberDirectionsRecording,
  saveDriveReroute,
  startDriveSession,
  touchDriveSession,
} from "../store";

const T0 = Date.parse("2026-10-20T17:00:00Z");
const MIN = 60_000;
const line = (n: number): Array<[number, number]> => Array.from({ length: n }, (_, i) => [54.9 + i * 0.001, -1.6]);
const dest = { lat: 55, lng: -1.6, label: "Depot, Gateshead", name: "Depot", savedLocationId: "loc1", savedType: "depot" };

function session(): DriveSession {
  return newDriveSession({ sessionId: "dir_1", mode: "log", passenger: false, atMs: T0, destination: dest, route: { routeId: "r1", geometry: line(10) } });
}

function row(s: DriveSession) {
  return {
    session_id: s.sessionId,
    started_at: s.startedAtMs,
    updated_at: s.updatedAtMs,
    ended_at: s.endedAtMs,
    end_reason: s.endReason,
    mode: s.mode,
    passenger: s.passenger ? 1 : 0,
    truncated: s.truncated ? 1 : 0,
    destination: JSON.stringify(s.destination),
  };
}

function routeRows(s: DriveSession) {
  return s.routes.map((r, seq) => ({ seq, route_id: r.routeId, from_ms: r.fromMs, to_ms: r.toMs, geometry: JSON.stringify(r.geometry) }));
}

beforeEach(() => {
  vi.resetAllMocks();
  getDatabase.mockImplementation(async () => fakeDb);
});

describe("a session's routes", () => {
  it("starts with the first route open", () => {
    const s = session();
    expect(s.routes).toEqual([{ routeId: "r1", fromMs: T0, toMs: null, geometry: line(10) }]);
    expect(routeActiveAt(s, T0 + 5 * MIN)?.routeId).toBe("r1");
    expect(routeActiveAt(s, T0 - 1)).toBeNull();
  });

  it("a reroute closes the old route at that moment", () => {
    const s = withRoute(session(), { routeId: "r2", geometry: line(5) }, T0 + 4 * MIN);
    expect(s.routes.map((r) => [r.routeId, r.fromMs, r.toMs])).toEqual([
      ["r1", T0, T0 + 4 * MIN],
      ["r2", T0 + 4 * MIN, null],
    ]);
    expect(routeActiveAt(s, T0 + 3 * MIN)?.routeId).toBe("r1");
    expect(routeActiveAt(s, T0 + 4 * MIN)?.routeId).toBe("r2");
  });

  it("ending closes the open route; a second end changes nothing", () => {
    const ended = withEnd(session(), T0 + 20 * MIN, "arrived");
    expect(ended.endedAtMs).toBe(T0 + 20 * MIN);
    expect(ended.routes[0].toMs).toBe(T0 + 20 * MIN);
    expect(withEnd(ended, T0 + 30 * MIN, "left")).toBe(ended);
    expect(routeActiveAt(ended, T0 + 21 * MIN)).toBeNull();
  });

  it("a session that never ended covers only a while after its last update", () => {
    const s = session();
    expect(sessionCoverEndMs(s)).toBe(T0 + DRIVE_OPEN_GRACE_MS);
    expect(routeActiveAt(s, T0 + DRIVE_OPEN_GRACE_MS + 1)).toBeNull();
  });

  it("stops keeping routes after 20, and nothing after the cap is covered", () => {
    let s = session();
    for (let i = 2; i <= DRIVE_MAX_ROUTES + 3; i++) s = withRoute(s, { routeId: `r${i}`, geometry: line(3) }, T0 + i * MIN);
    expect(s.routes).toHaveLength(DRIVE_MAX_ROUTES);
    expect(s.truncated).toBe(true);
    expect(s.routes.every((r) => r.toMs != null)).toBe(true);
    expect(routeActiveAt(s, T0 + (DRIVE_MAX_ROUTES + 2) * MIN)).toBeNull();
  });

  it("stops at 30,000 points", () => {
    const s = withRoute(session(), { routeId: "big", geometry: line(DRIVE_MAX_POINTS) }, T0 + MIN);
    expect(s.truncated).toBe(true);
    expect(s.routes).toHaveLength(1);
    expect(s.routes[0].toMs).toBe(T0 + MIN);
  });

  it("the mode is off unless log or on", () => {
    expect(directionsModeOf(undefined)).toBe("off");
    expect(directionsModeOf("ON")).toBe("off");
    expect(directionsModeOf("log")).toBe("log");
    expect(directionsModeOf("on")).toBe("on");
  });
});


describe("parseDriveSession", () => {
  it("reads back what was written", () => {
    const s = withEnd(withRoute(session(), { routeId: "r2", geometry: line(4) }, T0 + MIN), T0 + 9 * MIN, "ended");
    expect(parseDriveSession(row(s), routeRows(s))).toEqual(s);
  });
  it("route rows in any order come back in sequence", () => {
    const s = withRoute(session(), { routeId: "r2", geometry: line(4) }, T0 + MIN);
    expect(parseDriveSession(row(s), [...routeRows(s)].reverse())?.routes.map((r) => r.routeId)).toEqual(["r1", "r2"]);
  });
  it("a malformed row is null, never a throw", () => {
    const s = session();
    const rr = routeRows(s);
    expect(parseDriveSession(row(s), [{ ...rr[0], geometry: "not json" }])).toBeNull();
    expect(parseDriveSession(row(s), [{ ...rr[0], geometry: JSON.stringify([[1, "a"]]) }])).toBeNull();
    expect(parseDriveSession(row(s), [{ ...rr[0], from_ms: "soon" }])).toBeNull();
    expect(parseDriveSession({ ...row(s), destination: "{}" }, rr)).toBeNull();
    expect(parseDriveSession({ ...row(s), started_at: "soon" }, rr)).toBeNull();
    expect(parseDriveSession({ ...row(s), session_id: 7 }, rr)).toBeNull();
  });
});

describe("readDriveSessions (the recorder's read)", () => {
  /** Answer SELECTs from these sessions, as the two tables would. */
  function serve(sessions: Array<{ s: DriveSession; rowOverride?: Record<string, unknown>; routesOverride?: unknown[] }>) {
    fakeDb.getAllAsync.mockImplementation(async (sql: string, args: unknown[]) => {
      if (sql.includes("FROM navigation_drive_routes")) {
        const hit = sessions.find((x) => (x.rowOverride?.session_id ?? x.s.sessionId) === args[0]);
        return hit ? hit.routesOverride ?? routeRows(hit.s) : [];
      }
      return sessions.map((x) => ({ ...row(x.s), ...(x.rowOverride ?? {}) }));
    });
  }

  it("no table, a broken database or a bad range: no sessions", async () => {
    fakeDb.getAllAsync.mockRejectedValueOnce(new Error("no such table: navigation_drives"));
    expect(await readDriveSessions(T0, T0 + MIN)).toEqual([]);
    getDatabase.mockRejectedValueOnce(new Error("closed"));
    expect(await readDriveSessions(T0, T0 + MIN)).toEqual([]);
    expect(await readDriveSessions(T0 + MIN, T0)).toEqual([]);
    expect(await readDriveSessions(NaN, T0)).toEqual([]);
  });

  it("returns good sessions with their routes, oldest first, and skips bad ones", async () => {
    const a = withRoute(session(), { routeId: "r2", geometry: line(3) }, T0 + MIN);
    const b = { ...session(), sessionId: "dir_2", startedAtMs: T0 + 10 * MIN, updatedAtMs: T0 + 10 * MIN };
    serve([{ s: b }, { s: a, rowOverride: { session_id: "bad" }, routesOverride: [{ seq: 0, route_id: "x", from_ms: 1, to_ms: null, geometry: "x" }] }, { s: a }]);
    const got = await readDriveSessions(T0, T0 + 60 * MIN);
    expect(got.map((s) => s.sessionId)).toEqual(["dir_1", "dir_2"]);
    expect(got[0]).toEqual(a);
  });

  it("only ever SELECTs", async () => {
    serve([{ s: session() }]);
    await readDriveSessions(T0, T0 + MIN);
    expect(fakeDb.runAsync).not.toHaveBeenCalled();
    expect(fakeDb.execAsync).not.toHaveBeenCalled();
    for (const c of fakeDb.getAllAsync.mock.calls) expect(String(c[0])).toMatch(/^SELECT /);
    const src = readFileSync(join(__dirname, "..", "driveLog.ts"), "utf8");
    expect(src).not.toMatch(/runAsync|execAsync|CREATE|INSERT|UPDATE|DELETE/);
  });

  it("the stored switch: missing, unreadable or off all read as off", async () => {
    fakeDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await readDirectionsRecordingMode()).toBe("off");
    fakeDb.getFirstAsync.mockRejectedValueOnce(new Error("no such table"));
    expect(await readDirectionsRecordingMode()).toBe("off");
    fakeDb.getFirstAsync.mockResolvedValueOnce({ value: JSON.stringify("log") });
    expect(await readDirectionsRecordingMode()).toBe("log");
    fakeDb.getFirstAsync.mockResolvedValueOnce({ value: JSON.stringify("on") });
    expect(await readDirectionsRecordingMode()).toBe("on");
  });
});

describe("store writes", () => {
  const sqls = () => fakeDb.runAsync.mock.calls.map((c) => String(c[0]));

  it("never throw", async () => {
    getDatabase.mockRejectedValue(new Error("closed"));
    await expect(startDriveSession(session())).resolves.toBeUndefined();
    await expect(saveDriveReroute(session(), withRoute(session(), { routeId: "r2", geometry: line(2) }, T0 + MIN))).resolves.toBeUndefined();
    await expect(endDriveSession(withEnd(session(), T0 + MIN, "ended"))).resolves.toBeUndefined();
    await expect(touchDriveSession("dir_1", T0)).resolves.toBeUndefined();
    await expect(pruneDriveSessions(T0)).resolves.toBeUndefined();
    await expect(rememberDirectionsRecording("off")).resolves.toBeUndefined();
    await expect(rememberDirectionsRecording("log")).resolves.toBeUndefined();
  });

  it("a reroute writes only the new route, never the earlier geometry again", async () => {
    fakeDb.execAsync.mockResolvedValue(undefined);
    fakeDb.runAsync.mockResolvedValue(undefined);
    const big = line(5000);
    const prev = newDriveSession({ sessionId: "dir_1", mode: "log", passenger: false, atMs: T0, destination: dest, route: { routeId: "r1", geometry: big } });
    const next = withRoute(prev, { routeId: "r2", geometry: line(4) }, T0 + MIN);
    await saveDriveReroute(prev, next);
    const inserts = fakeDb.runAsync.mock.calls.filter((c) => String(c[0]).startsWith("INSERT"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(["dir_1", 1, "r2", T0 + MIN, null, JSON.stringify(line(4))]);
    expect(fakeDb.runAsync.mock.calls.some((c) => JSON.stringify(c[1]).length > 2000)).toBe(false);
    expect(sqls()).toContain("UPDATE navigation_drive_routes SET to_ms = ? WHERE session_id = ? AND seq = ?");
  });

  it("past the cap a reroute only closes the last route", async () => {
    fakeDb.execAsync.mockResolvedValue(undefined);
    fakeDb.runAsync.mockResolvedValue(undefined);
    const prev = session();
    const next = withRoute(prev, { routeId: "big", geometry: line(DRIVE_MAX_POINTS) }, T0 + MIN);
    await saveDriveReroute(prev, next);
    expect(sqls().some((q) => q.startsWith("INSERT"))).toBe(false);
  });

  it("ending closes the open route and the session", async () => {
    fakeDb.execAsync.mockResolvedValue(undefined);
    fakeDb.runAsync.mockResolvedValue(undefined);
    await endDriveSession(withEnd(session(), T0 + 9 * MIN, "arrived"));
    expect(fakeDb.runAsync.mock.calls.map((c) => c[1])).toEqual([
      [T0 + 9 * MIN, "dir_1"],
      [T0 + 9 * MIN, "arrived", T0 + 9 * MIN, "dir_1"],
    ]);
  });

  it("prunes sessions older than three days, with their routes", async () => {
    fakeDb.execAsync.mockResolvedValue(undefined);
    fakeDb.runAsync.mockResolvedValue(undefined);
    await pruneDriveSessions(T0);
    const dels = fakeDb.runAsync.mock.calls.filter((c) => String(c[0]).startsWith("DELETE"));
    expect(dels).toHaveLength(3);
    expect(dels[0][1]).toEqual([T0 - DRIVE_KEEP_MS]);
    expect(dels[1][1]).toEqual([T0 - DRIVE_KEEP_MS]);
    // And routes left without a session.
    expect(String(dels[2][0])).toBe("DELETE FROM navigation_drive_routes WHERE session_id NOT IN (SELECT session_id FROM navigation_drives)");
  });

  it("an old-shape navigation_drives (a routes column, first internal build) is dropped and made again", async () => {
    vi.resetModules();
    const fresh = await import("../store");
    fakeDb.getAllAsync.mockResolvedValueOnce([{ name: "session_id" }, { name: "routes" }]);
    fakeDb.execAsync.mockResolvedValue(undefined);
    fakeDb.runAsync.mockResolvedValue(undefined);
    await fresh.touchDriveSession("dir_1", T0);
    const execs = fakeDb.execAsync.mock.calls.map((c) => String(c[0]));
    expect(execs[0]).toBe("DROP TABLE IF EXISTS navigation_drive_routes; DROP TABLE IF EXISTS navigation_drives;");
    expect(execs[1]).toContain("CREATE TABLE IF NOT EXISTS navigation_drives");
  });

  it("the current shape is left alone", async () => {
    vi.resetModules();
    const fresh = await import("../store");
    fakeDb.getAllAsync.mockResolvedValueOnce([{ name: "session_id" }, { name: "destination" }]);
    fakeDb.execAsync.mockResolvedValue(undefined);
    fakeDb.runAsync.mockResolvedValue(undefined);
    await fresh.touchDriveSession("dir_1", T0);
    expect(fakeDb.execAsync.mock.calls.map((c) => String(c[0])).some((q) => q.includes("DROP"))).toBe(false);
  });

  it("the switch off deletes every stored session and never creates a table", async () => {
    fakeDb.runAsync.mockResolvedValue(undefined);
    await rememberDirectionsRecording("off");
    await rememberDirectionsRecording(undefined);
    expect(fakeDb.execAsync).not.toHaveBeenCalled();
    expect(sqls()).toContain("DELETE FROM navigation_drives");
    expect(sqls()).toContain("DELETE FROM navigation_drive_routes");
  });

  it("the switch log or on is kept for the recorder", async () => {
    fakeDb.execAsync.mockResolvedValue(undefined);
    fakeDb.runAsync.mockResolvedValue(undefined);
    await rememberDirectionsRecording("on");
    const w = fakeDb.runAsync.mock.calls.find((c) => String(c[0]).includes("navigation_state"));
    expect(w?.[1]).toEqual(["directions_recording", JSON.stringify("on")]);
  });

  it("the tables are created next to navigation_state, never in tracking_state", () => {
    const src = readFileSync(join(__dirname, "..", "store.ts"), "utf8");
    expect(src).toContain("CREATE TABLE IF NOT EXISTS navigation_drives");
    expect(src).toContain("CREATE TABLE IF NOT EXISTS navigation_drive_routes");
    expect(src).not.toMatch(/(INSERT|UPDATE|DELETE|REPLACE)[^"'`]*tracking_state/i);
  });
});
