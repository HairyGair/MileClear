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
import { readDriveSessions } from "../driveLog";
import { pruneDriveSessions, saveDriveSession, touchDriveSession } from "../store";

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
    routes: JSON.stringify(s.routes),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(parseDriveSession(row(s))).toEqual(s);
  });
  it("a malformed row is null, never a throw", () => {
    const s = session();
    expect(parseDriveSession({ ...row(s), routes: "not json" })).toBeNull();
    expect(parseDriveSession({ ...row(s), routes: JSON.stringify([{ routeId: "x", fromMs: 1, toMs: null, geometry: [[1, "a"]] }]) })).toBeNull();
    expect(parseDriveSession({ ...row(s), destination: "{}" })).toBeNull();
    expect(parseDriveSession({ ...row(s), started_at: "soon" })).toBeNull();
    expect(parseDriveSession({ ...row(s), session_id: 7 })).toBeNull();
  });
});

describe("readDriveSessions (the recorder's read)", () => {
  it("no table, a broken database or a bad range: no sessions", async () => {
    fakeDb.getAllAsync.mockRejectedValueOnce(new Error("no such table: navigation_drives"));
    expect(await readDriveSessions(T0, T0 + MIN)).toEqual([]);
    getDatabase.mockRejectedValueOnce(new Error("closed"));
    expect(await readDriveSessions(T0, T0 + MIN)).toEqual([]);
    expect(await readDriveSessions(T0 + MIN, T0)).toEqual([]);
    expect(await readDriveSessions(NaN, T0)).toEqual([]);
  });

  it("returns good rows oldest first and skips bad ones", async () => {
    const a = session();
    const b = { ...session(), sessionId: "dir_2", startedAtMs: T0 + 10 * MIN, updatedAtMs: T0 + 10 * MIN };
    fakeDb.getAllAsync.mockResolvedValueOnce([row(b), { ...row(a), session_id: "bad", routes: "x" }, row(a)]);
    const got = await readDriveSessions(T0, T0 + 60 * MIN);
    expect(got.map((s) => s.sessionId)).toEqual(["dir_1", "dir_2"]);
  });

  it("only ever SELECTs", async () => {
    fakeDb.getAllAsync.mockResolvedValueOnce([]);
    await readDriveSessions(T0, T0 + MIN);
    expect(fakeDb.runAsync).not.toHaveBeenCalled();
    expect(fakeDb.execAsync).not.toHaveBeenCalled();
    expect(String(fakeDb.getAllAsync.mock.calls[0][0])).toMatch(/^SELECT /);
    const src = readFileSync(join(__dirname, "..", "driveLog.ts"), "utf8");
    expect(src).not.toMatch(/runAsync|execAsync|CREATE|INSERT|UPDATE|DELETE/);
  });
});

describe("store writes", () => {
  it("never throw", async () => {
    getDatabase.mockRejectedValue(new Error("closed"));
    await expect(saveDriveSession(session())).resolves.toBeUndefined();
    await expect(touchDriveSession("dir_1", T0)).resolves.toBeUndefined();
    await expect(pruneDriveSessions(T0)).resolves.toBeUndefined();
  });

  it("prunes sessions older than three days", async () => {
    fakeDb.execAsync.mockResolvedValue(undefined);
    fakeDb.runAsync.mockResolvedValue(undefined);
    await pruneDriveSessions(T0);
    const del = fakeDb.runAsync.mock.calls.find((c) => String(c[0]).startsWith("DELETE FROM navigation_drives"));
    expect(del?.[1]).toEqual([T0 - DRIVE_KEEP_MS]);
  });

  it("the table is created next to navigation_state, never in tracking_state", () => {
    const src = readFileSync(join(__dirname, "..", "store.ts"), "utf8");
    expect(src).toContain("CREATE TABLE IF NOT EXISTS navigation_drives");
    expect(src).not.toMatch(/(INSERT|UPDATE|DELETE|REPLACE)[^"'`]*tracking_state/i);
  });
});
