// The I/O half of the recording-open memory, against an in-memory
// tracking_state. These are the cases the 1 Nov 2026 review found.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = new Map<string, string>();
let writes = 0;
const noteDropped = vi.fn(async (_input: unknown) => {});

function like(key: string, pattern: string): boolean {
  return key.startsWith(pattern.replace(/%$/, ""));
}

const fakeDb = {
  async runAsync(sql: string, params: unknown[] = []) {
    writes++;
    if (sql.startsWith("DELETE FROM tracking_state WHERE key LIKE")) {
      for (const k of [...state.keys()]) if (like(k, String(params[0]))) state.delete(k);
    } else if (sql.startsWith("INSERT OR REPLACE INTO tracking_state (key, value) SELECT")) {
      const [key, value, ctxKey, idLike] = params as string[];
      const id = idLike.replace(/^%"id":"/, "").replace(/"%$/, "");
      if ((state.get(ctxKey) ?? "").includes(`"id":"${id}"`)) state.set(key, value);
    } else if (sql.startsWith("INSERT OR REPLACE")) {
      state.set(String(params[0]), String(params[1]));
    } else if (sql.startsWith("INSERT OR IGNORE")) {
      if (!state.has(String(params[0]))) state.set(String(params[0]), String(params[1]));
    } else if (sql.includes("ON CONFLICT")) {
      const cur = Number(state.get(String(params[0])) ?? 0);
      state.set(String(params[0]), String(cur + Number(params[1])));
    } else {
      throw new Error(`unexpected sql: ${sql}`);
    }
    return { changes: 1 };
  },
  async getAllAsync(_sql: string, params: unknown[] = []) {
    return [...state.entries()].filter(([k]) => like(k, String(params[0]))).map(([key, value]) => ({ key, value }));
  },
  async getFirstAsync(sql: string) {
    const m = /key = '([a-z_]+)'/.exec(sql);
    const v = m ? state.get(m[1]) : undefined;
    return v === undefined ? null : { value: v };
  },
};

vi.mock("react-native", () => ({ AppState: { currentState: "background" }, Platform: { OS: "ios" } }));
vi.mock("../../db/index", () => ({ getDatabase: async () => fakeDb }));
vi.mock("../recordingDrops", () => ({ noteRecordingDropped: (i: unknown) => noteDropped(i) }));

async function load() {
  vi.resetModules();
  return import("../recordingOpen");
}

const settle = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  state.clear();
  writes = 0;
  noteDropped.mockClear();
});

describe("a new recording opens while the old drive's save is running (blocker 1)", () => {
  it("gives the old drive its own id and outcome, and says nothing false", async () => {
    const m = await load();
    const a = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() }))!;
    await m.beginFinalizeScope(); // the save of drive A starts
    const b = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now(), previousStillOwned: true }))!;
    await settle();
    expect(b.id).not.toBe(a.id);
    expect(noteDropped).not.toHaveBeenCalled();
    // A's save finishes: it marks the id it pinned, not the new one.
    expect(m.finalizeScopeContext()?.id).toBe(a.id);
    await m.markOpenOutcome(m.finalizeScopeContext()?.id, "saved");
    const cur = await m.readOpenContext();
    expect(cur?.id).toBe(b.id);
    expect(cur?.done).toBeUndefined();
    m.endFinalizeScope();
  });

  it("a drop reported inside the save is filed under the pinned open", async () => {
    const m = await load();
    const a = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() }))!;
    await m.beginFinalizeScope();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now(), previousStillOwned: true });
    const r = await m.resolveDropOpen({ startedAt: null, pinned: true });
    expect(r.closeId).toBe(a.id);
    expect(r.fields?.openId).toBe(a.id);
  });

  it("a Not driving tap or takeover during the save is about the NEW recording (item 2)", async () => {
    const m = await load();
    const a = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() }))!;
    await m.beginFinalizeScope();
    const b = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now(), previousStillOwned: true }))!;
    state.set("auto_recording_active", "1");
    // The tap's own drop report is not pinned: it is the new open's.
    const tap = await m.resolveDropOpen({ startedAt: null });
    expect(tap.closeId).toBe(b.id);
    await m.closeArmedOpen("cancelled");
    expect((await m.readOpenContext())?.done).toBe("cancelled");
    // The old drive's save still gets its own "saved".
    await m.markOpenOutcome(a.id, "saved");
    state.delete("auto_recording_active");
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    await settle();
    expect(noteDropped).not.toHaveBeenCalled(); // neither is a false superseded
  });

  it("a finalize sweeping old fixes does not close a pending open it is not part of", async () => {
    const m = await load();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    await m.beginFinalizeScope();
    const old = new Date(Date.now() - 20 * 3600_000).toISOString();
    expect(await m.resolveDropOpen({ startedAt: old, pinned: true })).toEqual({ fields: null, closeId: null });
  });

  it("the pin ends when the finalize ends, however it ended (item 4)", async () => {
    const m = await load();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    await m.beginFinalizeScope();
    expect(m.finalizeScopeContext()).not.toBeNull();
    m.endFinalizeScope();
    expect(m.finalizeScopeContext()).toBeNull();
  });

  it("finalize releases the pin in the OUTER finally (source check)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(`${process.cwd()}/lib/tracking/detection.ts`, "utf8");
    const calls = src.match(/endFinalizeScope\(\)/g) ?? [];
    expect(calls.length).toBe(1);
    const end = src.indexOf("endFinalizeScope()");
    const outerFinally = src.lastIndexOf("} finally {", src.indexOf("settleInFlight();\n  }\n}", end));
    expect(outerFinally).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(outerFinally);
    // ...and after the inner finally that deletes finalizing_trip_at.
    expect(end).toBeGreaterThan(src.indexOf("DELETE FROM tracking_state WHERE key = 'finalizing_trip_at'"));
  });

  it("a finalize running in the OTHER runtime counts as owning the old drive (item 3)", async () => {
    const m = await load();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    state.set("finalizing_trip_at", String(Date.now() - 30_000));
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    await settle();
    expect(noteDropped).not.toHaveBeenCalled();
  });

  it("a finalizing row left behind by a crash does not hide a silent open for ever", async () => {
    const m = await load();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    state.set("finalizing_trip_at", String(Date.now() - 10 * 60_000));
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    await settle();
    expect(noteDropped).toHaveBeenCalledTimes(1);
  });

  it("without a save in flight, an open that never reported is called superseded, against its own id", async () => {
    const m = await load();
    const a = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() }))!;
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    await settle();
    expect(noteDropped).toHaveBeenCalledTimes(1);
    const arg = noteDropped.mock.calls[0][0] as { reason: string; open: { openId: string } };
    expect(arg.reason).toBe("superseded");
    expect(arg.open.openId).toBe(a.id);
  });

  it("an open that was saved is not called superseded", async () => {
    const m = await load();
    const a = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() }))!;
    await m.markOpenOutcome(a.id, "saved");
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    await settle();
    expect(noteDropped).not.toHaveBeenCalled();
  });
});

describe("writers do not wipe each other (2)", () => {
  it("fix counts landing while the outcome is written leave the outcome", async () => {
    const m = await load();
    const a = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() }))!;
    for (let i = 0; i < 5; i++) m.noteOpenFix({ kind: "seen" });
    await Promise.all([m.flushOpenCounts(), m.markOpenOutcome(a.id, "saved")]);
    for (let i = 0; i < 3; i++) m.noteOpenFix({ kind: "buffered" });
    await Promise.all([m.markOpenOutcome(a.id, "merged"), m.flushOpenCounts()]);
    const cur = await m.readOpenContext();
    expect(cur?.done).toBe("saved"); // first outcome sticks
    expect(cur?.seen).toBe(5);
  });

  it("counts are keyed by open id: a flush racing a new open cannot spill onto it (item 5)", async () => {
    const m = await load();
    const a = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() }))!;
    m.noteOpenFix({ kind: "seen" });
    m.noteOpenFix({ kind: "buffered" });
    const flushing = m.flushOpenCounts();
    const b = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now(), previousStillOwned: true }))!;
    await flushing;
    await settle();
    const cur = await m.readOpenContext();
    expect(cur?.id).toBe(b.id);
    expect(cur?.seen).toBe(0);
    expect(cur?.buffered).toBe(0);
    expect(a.id).not.toBe(b.id);
  });

  it("a fix noted while a flush is writing is flushed afterwards (item 5)", async () => {
    const m = await load();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    m.noteOpenFix({ kind: "seen" });
    const first = m.flushOpenCounts();
    m.noteOpenFix({ kind: "seen" }); // the last fix, while the flush is mid-write
    await first;
    await settle();
    await settle();
    expect((await m.readOpenContext())?.seen).toBe(2);
  });

  it("counts add up across flushes", async () => {
    const m = await load();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    m.noteOpenFix({ kind: "seen" });
    m.noteOpenFix({ kind: "buffered" });
    await m.flushOpenCounts();
    m.noteOpenFix({ kind: "seen" });
    m.noteOpenFix({ kind: "gate", gate: "paused" });
    await m.flushOpenCounts();
    const cur = await m.readOpenContext();
    expect(cur).toMatchObject({ seen: 2, buffered: 1, gate: "paused" });
    expect(cur?.firstSeenAt).toBeGreaterThan(0);
  });
});

describe("Start Trip, a shift or Not driving taking the recording (3)", () => {
  it("an armed recording gets the outcome", async () => {
    const m = await load();
    const a = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() }))!;
    state.set("auto_recording_active", "1");
    await m.closeArmedOpen("taken_over");
    expect((await m.readOpenContext())?.done).toBe("taken_over");
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    await settle();
    expect(noteDropped).not.toHaveBeenCalled();
    expect(a.id).toBeTruthy();
  });

  it("nothing armed, nothing closed", async () => {
    const m = await load();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    await m.closeArmedOpen("taken_over");
    expect((await m.readOpenContext())?.done).toBeUndefined();
  });
});

describe("an unrelated drop (4)", () => {
  it("an orphan sweep of old fixes neither carries nor closes today's open", async () => {
    const m = await load();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    const old = new Date(Date.now() - 20 * 3600_000).toISOString();
    expect(await m.resolveDropOpen({ startedAt: old })).toEqual({ fields: null, closeId: null });
  });

  it("fixes from this drive do", async () => {
    const m = await load();
    const a = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() }))!;
    const r = await m.resolveDropOpen({ startedAt: new Date().toISOString() });
    expect(r.closeId).toBe(a.id);
  });

  it("an explicit open (the superseded report) is used as given", async () => {
    const m = await load();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    const r = await m.resolveDropOpen({ open: { openId: "oold", openAgeSec: 1, openReason: "motion", via: "live", fixesSeen: 0, fixesBuffered: 0 } });
    expect(r.closeId).toBe("oold");
  });
});

describe("per-fix work stops (5)", () => {
  it("noteOpenFix is synchronous and writes nothing itself", async () => {
    const m = await load();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    const before = writes;
    expect(m.noteOpenFix({ kind: "seen" })).toBeUndefined();
    expect(writes).toBe(before);
  });

  it("after the outcome, further fixes cause no SQLite work at all", async () => {
    const m = await load();
    const a = (await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() }))!;
    await m.markOpenOutcome(a.id, "saved");
    const before = writes;
    const reads = vi.spyOn(fakeDb, "getAllAsync");
    for (let i = 0; i < 100; i++) {
      m.noteOpenFix({ kind: "seen" });
      await m.flushOpenCounts();
    }
    expect(writes).toBe(before);
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();
  });

  it("after the cap, no further writes", async () => {
    const m = await load();
    await m.beginOpenContext({ reason: "motion", seedTimestampMs: Date.now() });
    for (let i = 0; i < 40; i++) m.noteOpenFix({ kind: "seen" });
    await m.flushOpenCounts();
    expect((await m.readOpenContext())?.seen).toBe(25);
    const before = writes;
    for (let i = 0; i < 50; i++) {
      m.noteOpenFix({ kind: "seen" });
      await m.flushOpenCounts();
    }
    expect(writes).toBe(before);
  });
});
