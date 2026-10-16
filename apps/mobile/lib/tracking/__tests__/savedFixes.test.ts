import { describe, it, expect } from "vitest";
import type { CreateTripData } from "../../api/trips";
import {
  SAVED_FIX_RETENTION_MS,
  fixTimeMs,
  fixesWithin,
  loadSavedFixTimes,
  planSavedFixRemoval,
  recordSavedFixes,
  splitLegAtSavedEnd,
  type BufferRow,
  type SavedFixDb,
} from "../savedFixes";
import { rescueBufferBeforeOpen, type BufferedFix, type RescueDeps } from "../rescueHandoff";
import { buildDropEvent } from "../recordingDropRule";

const T0 = Date.parse("2026-10-15T15:32:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

/** Rows one fix every 10 s from `fromSec` to `toSec` (inclusive) after T0. */
function rows(fromSec: number, toSec: number, firstId = 1): BufferRow[] {
  const out: BufferRow[] = [];
  let id = firstId;
  for (let s = fromSec; s <= toSec; s += 10) {
    out.push({ id: id++, recorded_at: iso(T0 + s * 1000), speed: 13, accuracy: 8, activity: null });
  }
  return out;
}
const msSet = (rs: BufferRow[]) => new Set(rs.map((r) => fixTimeMs(r.recorded_at)));

/** A tiny in-memory stand-in for the saved_fix_times table. */
function fakeDb() {
  const table = new Map<number, { trip_key: string; saved_at: number }>();
  const db: SavedFixDb = {
    async runAsync(sql, params) {
      if (sql.startsWith("INSERT OR IGNORE INTO saved_fix_times")) {
        for (let i = 0; i < params.length; i += 3) {
          const ms = params[i] as number;
          if (!table.has(ms)) table.set(ms, { trip_key: String(params[i + 1]), saved_at: params[i + 2] as number });
        }
      } else if (sql.startsWith("DELETE FROM saved_fix_times")) {
        const cutoff = params[0] as number;
        for (const [k, v] of table) if (v.saved_at < cutoff) table.delete(k);
      }
      return {};
    },
    async getAllAsync<T>(_sql: string, params: Array<string | number | null>) {
      const [from, to] = params as number[];
      return [...table.keys()].filter((k) => k >= from && k <= to).map((k) => ({ recorded_ms: k }) as unknown as T);
    },
  };
  return { db, table };
}

describe("planSavedFixRemoval", () => {
  it("keeps a continuation after a saved leg and joins it at the last saved fix (the e84b24f3 case)", () => {
    // 15:32 to 16:21 was saved as trips; the driver carried on to 16:31.
    const savedPart = rows(0, 49 * 60);
    const continuation = rows(49 * 60 + 10, 59 * 60, savedPart.length + 1);
    const plan = planSavedFixRemoval([...savedPart, ...continuation], msSet(savedPart));
    expect(plan.allSaved).toBe(false);
    expect(plan.joiningKept).toBe(1);
    // Every continuation fix survives, plus exactly one saved fix to join on.
    expect(plan.kept).toBe(continuation.length + 1);
    expect(plan.removed).toBe(savedPart.length - 1);
    const removed = new Set(plan.removeIds);
    expect(continuation.every((r) => !removed.has(r.id))).toBe(true);
    // The kept saved fix is the LAST saved one.
    const lastSaved = savedPart[savedPart.length - 1];
    expect(removed.has(lastSaved.id)).toBe(false);
  });

  it("drops a leg whose fixes are all saved", () => {
    const leg = rows(0, 600);
    const plan = planSavedFixRemoval(leg, msSet(leg));
    expect(plan.allSaved).toBe(true);
    expect(plan.removed).toBe(leg.length);
    expect(plan.kept).toBe(0);
  });

  it("changes nothing when nothing is remembered", () => {
    const leg = rows(0, 600);
    const plan = planSavedFixRemoval(leg, new Set());
    expect(plan.removed).toBe(0);
    expect(plan.kept).toBe(leg.length);
    expect(plan.allSaved).toBe(false);
  });

  it("keeps every fix when none of them were saved", () => {
    const leg = rows(0, 600);
    const other = rows(5000, 5100, 500);
    const plan = planSavedFixRemoval(leg, msSet(other));
    expect(plan.removed).toBe(0);
  });

  it("keeps a joining fix before each separate run of new driving", () => {
    const a = rows(0, 100, 1);
    const b = rows(110, 200, 100);
    const c = rows(210, 300, 200);
    const d = rows(310, 400, 300);
    const plan = planSavedFixRemoval([...a, ...b, ...c, ...d], new Set([...msSet(a), ...msSet(c)]));
    expect(plan.joiningKept).toBe(2);
    expect(plan.removed).toBe(a.length - 1 + c.length - 1);
    // new driving b and d is untouched
    const removed = new Set(plan.removeIds);
    expect([...b, ...d].every((r) => !removed.has(r.id))).toBe(true);
  });

  it("never judges the planted departure anchor, even at a remembered time", () => {
    const anchor: BufferRow = { id: 1, recorded_at: iso(T0 - 30_000), speed: 0, accuracy: 50, activity: null };
    const rest = rows(0, 100, 2);
    const plan = planSavedFixRemoval([anchor, ...rest], new Set([fixTimeMs(anchor.recorded_at), ...msSet(rest.slice(0, 3))]));
    expect(plan.removeIds).not.toContain(1);
  });

  it("matches a raw native epoch against an ISO time (same fix, two spellings)", () => {
    const epoch = String(T0 + 10_000);
    const buffer: BufferRow[] = [
      { id: 1, recorded_at: epoch, speed: 5, accuracy: 8 },
      { id: 2, recorded_at: iso(T0 + 20_000), speed: 5, accuracy: 8 },
    ];
    const plan = planSavedFixRemoval(buffer, new Set([T0 + 10_000]));
    expect(plan.removeIds).toEqual([]); // row 1 is saved, but it is the joining point before new row 2
    expect(plan.joiningKept).toBe(1);
  });

  it("leaves a fix with an unreadable time alone", () => {
    const buffer: BufferRow[] = [
      { id: 1, recorded_at: "garbage", speed: 5, accuracy: 8 },
      ...rows(0, 20, 2),
    ];
    const plan = planSavedFixRemoval(buffer, new Set([T0]));
    expect(plan.removeIds).not.toContain(1);
  });
});

describe("splitLegAtSavedEnd (the same-start rule)", () => {
  it("keeps the continuation after a saved trip's end", () => {
    const ms = rows(0, 600).map((r) => fixTimeMs(r.recorded_at));
    const split = splitLegAtSavedEnd(ms, T0 + 300_000);
    expect(split.savedCount).toBe(31);
    expect(split.newCount).toBe(ms.length - 31);
    expect(split.removableLeading).toBe(30);
  });

  it("is a full duplicate when the saved trip reaches the last fix", () => {
    const ms = rows(0, 600).map((r) => fixTimeMs(r.recorded_at));
    const split = splitLegAtSavedEnd(ms, T0 + 600_000);
    expect(split.newCount).toBe(0);
  });

  it("treats an unreadable saved end as nothing covered, so nothing is dropped", () => {
    const ms = rows(0, 100).map((r) => fixTimeMs(r.recorded_at));
    const split = splitLegAtSavedEnd(ms, Number.NaN);
    expect(split.savedCount).toBe(0);
    expect(split.removableLeading).toBe(0);
  });
});

describe("saved_fix_times memory", () => {
  it("records, reads back and prunes after three days", async () => {
    const { db, table } = fakeDb();
    const now = T0 + 10 * 86_400_000;
    const old = { recorded_at: iso(T0) };
    await recordSavedFixes(db, [old], "old", T0); // saved long ago
    const fresh = rows(0, 30).map((r) => ({ recorded_at: r.recorded_at }));
    const n = await recordSavedFixes(db, fresh, "new", now);
    expect(n).toBe(4);
    expect(table.has(T0 + 10_000)).toBe(true);
    // the three-day-old record is gone, the new ones stay
    expect([...table.values()].every((v) => now - v.saved_at < SAVED_FIX_RETENTION_MS)).toBe(true);
    const loaded = await loadSavedFixTimes(db, T0, T0 + 60_000);
    expect(loaded.size).toBe(3);
  });

  it("collapses repeated timestamps into one record", async () => {
    const { db, table } = fakeDb();
    const t = iso(T0);
    await recordSavedFixes(db, [{ recorded_at: t }, { recorded_at: t }, { recorded_at: String(T0) }], "k");
    expect(table.size).toBe(1);
  });

  it("returns an empty set, not an error, when the memory cannot be read", async () => {
    const broken: SavedFixDb = {
      async runAsync() {
        throw new Error("db locked");
      },
      async getAllAsync() {
        throw new Error("db locked");
      },
    };
    expect((await loadSavedFixTimes(broken, 0, 1)).size).toBe(0);
    expect(await recordSavedFixes(broken, [{ recorded_at: iso(T0) }], "k")).toBe(0);
  });

  it("fixesWithin takes only the span a save covered", () => {
    const rs = rows(0, 100);
    expect(fixesWithin(rs, T0 + 20_000, T0 + 50_000)).toHaveLength(4);
    expect(fixesWithin(rs, Number.NaN, 1)).toHaveLength(0);
  });
});

describe("a crash between saving and recording leads to a duplicate, never a loss", () => {
  // The finalize order: save the trip, THEN remember its fixes. A process
  // death between the two is modelled by not running the second step.
  async function finalizeLike(opts: { crashAfterSave: boolean }) {
    const { db } = fakeDb();
    const saved: string[] = [];
    const buffer = rows(0, 600);
    saved.push("trip-1"); // the save is durable
    if (!opts.crashAfterSave) await recordSavedFixes(db, buffer, "trip-1");
    // next boot: the native store refills the buffer with the same fixes plus new driving
    const continuation = rows(610, 700, buffer.length + 1);
    const refilled = [...buffer, ...continuation];
    const remembered = await loadSavedFixTimes(db, T0, T0 + 3_600_000);
    return { plan: planSavedFixRemoval(refilled, remembered), continuation, buffer };
  }

  it("crash after the save: nothing is remembered, so nothing is removed (a duplicate the server trims)", async () => {
    const { plan, continuation, buffer } = await finalizeLike({ crashAfterSave: true });
    expect(plan.removed).toBe(0);
    expect(plan.kept).toBe(buffer.length + continuation.length);
  });

  it("no crash: only the saved fixes go, the new driving stays", async () => {
    const { plan, continuation } = await finalizeLike({ crashAfterSave: false });
    expect(plan.removed).toBeGreaterThan(0);
    const removed = new Set(plan.removeIds);
    expect(continuation.every((r) => !removed.has(r.id))).toBe(true);
  });

  it("a record can never name a fix that was not part of the save", async () => {
    const { db, table } = fakeDb();
    const buffer = rows(0, 600);
    const saveSpan = fixesWithin(buffer, T0, T0 + 300_000);
    await recordSavedFixes(db, saveSpan, "trip");
    expect(table.size).toBe(saveSpan.length);
    expect(table.has(T0 + 400_000)).toBe(false);
  });
});

describe("the rescue hand-off remembers a leg only once it is queued", () => {
  function drive(startMs: number, minutes: number): BufferedFix[] {
    const out: BufferedFix[] = [];
    for (let i = 0; i <= (minutes * 60) / 10; i++) {
      out.push({ lat: 51.5 + i * 0.0012, lng: -0.12, speed: 13.4, accuracy: 8, recorded_at: iso(startMs + i * 10_000) });
    }
    return out;
  }
  function deps(buffer: BufferedFix[], queueThrows: boolean) {
    const remembered: string[] = [];
    const queued: CreateTripData[] = [];
    const d: RescueDeps = {
      finalize: null,
      readBuffer: async () => buffer,
      readLegStarts: async () => [],
      readSavedTrips: async () => [],
      queueCreate: async (b) => {
        if (queueThrows) throw new Error("db error");
        queued.push(b);
      },
      recordSaved: async (fixes) => {
        remembered.push(...fixes.map((f) => f.recorded_at));
      },
      noteDrop: async () => {},
      isFinalizeInFlight: () => false,
      waitForFinalize: () => Promise.resolve(),
      log: () => {},
      splitMs: 30 * 60 * 1000,
    };
    return { d, remembered, queued };
  }

  it("records the fixes of a queued leg", async () => {
    const buffer = drive(T0, 12);
    const { d, remembered, queued } = deps(buffer, false);
    const out = await rescueBufferBeforeOpen(d);
    expect(out.kind).toBe("handed_off");
    expect(queued).toHaveLength(1);
    expect(remembered.length).toBeGreaterThan(10);
  });

  it("records nothing when the queue write failed", async () => {
    const { d, remembered } = deps(drive(T0, 12), true);
    const out = await rescueBufferBeforeOpen(d);
    expect(out.kind).toBe("keep");
    expect(remembered).toEqual([]);
  });
});

describe("recording_dropped carries the count of saved fixes skipped", () => {
  it("includes it only when fixes were skipped", () => {
    const withCount = buildDropEvent({ reason: "deduped", detail: "saved_fixes_all", coords: 40, savedFixesSkipped: 40 }, T0, "android");
    expect(withCount.savedFixesSkipped).toBe(40);
    const without = buildDropEvent({ reason: "deduped", coords: 4 }, T0, "android");
    expect(without.savedFixesSkipped).toBeUndefined();
  });
});
