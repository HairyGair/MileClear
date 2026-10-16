// Integration tests that run the buffer's SQL against a real SQLite engine
// (Node's built-in node:sqlite, wrapped to look like expo-sqlite). They cover
// the database-level cores: the per-fix memory, the insert-only reconcile, the
// same-start split and the v12 migration. The finalize function itself pulls in
// the native stack and cannot run under vitest, so the finalize steps are
// replayed here in the order detection.ts runs them.

import { createRequire } from "node:module";
import { describe, it, expect, beforeEach } from "vitest";
import { ensureRecordedMs, RECORDED_MS_INDEX } from "../../db/recordedMs";
import { cutFlights, findFlights } from "../flightRule";
import { insertMissingNativeFixes } from "../nativeBufferRules";
import {
  applySameStartTrim,
  decideSameStart,
  dropSavedFixesFromBuffer,
  fixTimeMs,
  recordSavedFixes,
} from "../savedFixes";

type Row = Record<string, unknown>;
interface Shim {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: Array<string | number | null>): Promise<unknown>;
  getAllAsync<T>(sql: string, params: Array<string | number | null>): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: Array<string | number | null>): Promise<T | null>;
  raw: { exec(sql: string): void; prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): Row[] } };
}

let DatabaseSync: (new (path: string) => Shim["raw"] & { prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): Row[] } }) | null =
  null;
try {
  const require = createRequire(import.meta.url);
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch {
  DatabaseSync = null;
}

function openShim(): Shim {
  const d = new DatabaseSync!(":memory:");
  return {
    raw: d,
    async execAsync(sql) {
      d.exec(sql);
    },
    async runAsync(sql, params) {
      return d.prepare(sql).run(...params);
    },
    async getAllAsync<T>(sql: string, params: Array<string | number | null>) {
      return d.prepare(sql).all(...params) as unknown as T[];
    },
    async getFirstAsync<T>(sql: string, params: Array<string | number | null>) {
      return (d.prepare(sql).all(...params)[0] ?? null) as unknown as T | null;
    },
  };
}

const LEGACY_TABLE = `
  CREATE TABLE detection_coordinates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL, lng REAL NOT NULL, speed REAL, accuracy REAL,
    activity TEXT, activity_confidence REAL, recorded_at TEXT NOT NULL
  );
  CREATE TABLE saved_fix_times (recorded_ms INTEGER PRIMARY KEY, trip_key TEXT, saved_at INTEGER NOT NULL);
`;

const T = (hms: string) => Date.parse(`2026-10-15T${hms}.000Z`);
const iso = (ms: number) => new Date(ms).toISOString();

/** A native-store fix heading north. */
function nat(ms: number, i: number) {
  return {
    timestamp: iso(ms),
    coords: { latitude: 51.5 + i * 0.0006, longitude: -0.12, speed: 13, accuracy: 8 },
    activity: null,
  };
}

async function insertBufferRow(db: Shim, ms: number, i: number, opts: { anchor?: boolean; ts?: string } = {}) {
  await db.runAsync(
    "INSERT OR IGNORE INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at, recorded_ms) VALUES (?, ?, ?, ?, ?, ?)",
    [51.5 + i * 0.0006, -0.12, opts.anchor ? 0 : 13, opts.anchor ? 50 : 8, opts.ts ?? iso(ms), opts.anchor ? null : ms]
  );
}

const bufferTimes = async (db: Shim) =>
  (await db.getAllAsync<{ recorded_at: string }>("SELECT recorded_at FROM detection_coordinates ORDER BY recorded_at", [])).map((r) =>
    fixTimeMs(r.recorded_at)
  );

describe.skipIf(!DatabaseSync)("buffer SQL against a real SQLite", () => {
  let db: Shim;
  beforeEach(async () => {
    db = openShim();
    db.raw.exec(LEGACY_TABLE);
    await ensureRecordedMs(db);
  });

  // The saved drive of 0929a432 (15:32:08 to 16:01:39) with the stray leading
  // fix 3f652a2b started from (15:32:02), then ten more minutes of driving.
  const stray = T("15:32:02");
  const savedFixes: number[] = [];
  for (let ms = T("15:32:08"); ms < T("16:01:39"); ms += 10_000) savedFixes.push(ms);
  savedFixes.push(T("16:01:39"));
  const newDriving: number[] = [];
  for (let ms = T("16:05:00"); ms <= T("16:15:00"); ms += 10_000) newDriving.push(ms);
  const nativeStore = [stray, ...savedFixes, ...newDriving].map((ms, i) => nat(ms, i));

  async function finalizeAndRemember(remember: "whole_leg" | "wire_span_only") {
    // The buffer holds the first drive, including the stray leading fix that
    // finalize trims (an outlier / bad endpoint).
    await insertMissingNativeFixes(db, nativeStore.filter((f) => fixTimeMs(f.timestamp) <= T("16:01:39")), 6000);
    const leg = await db.getAllAsync<{ id: number; recorded_at: string }>("SELECT id, recorded_at FROM detection_coordinates ORDER BY recorded_at", []);
    expect(leg).toHaveLength(savedFixes.length + 1);
    // ...save is durable, THEN remember...
    const toRemember =
      remember === "whole_leg" ? leg : leg.filter((r) => fixTimeMs(r.recorded_at) >= savedFixes[0] && fixTimeMs(r.recorded_at) <= savedFixes[savedFixes.length - 1]);
    await recordSavedFixes(db, toRemember, "trip-1");
    // ...then consume.
    await db.runAsync("DELETE FROM detection_coordinates", []);
  }

  it("(a) a refill with new driving keeps only the continuation, starting after the saved end", async () => {
    await finalizeAndRemember("whole_leg");
    // Refill: the native store was never cleared and now also holds new driving.
    await insertMissingNativeFixes(db, nativeStore, 6000);
    const plan = await dropSavedFixesFromBuffer(db);
    expect(plan).not.toBeNull();
    const left = await bufferTimes(db);
    // The stray 15:32:02 fix is gone, so no straight line across the saved drive.
    expect(left).not.toContain(stray);
    // What remains: the last saved fix as the joining point, then every new fix.
    expect(left).toEqual([savedFixes[savedFixes.length - 1], ...newDriving]);
    // No unsaved fix was removed.
    for (const ms of newDriving) expect(left).toContain(ms);
    // The new leg's miles come from new driving only: the joining point is the
    // saved trip's own last fix, so the path starts at the saved end.
    expect(left[0]).toBe(T("16:01:39"));
  });

  it("(a, contrast) remembering only the saved span lets the stray fix back and bridges the saved drive", async () => {
    await finalizeAndRemember("wire_span_only");
    await insertMissingNativeFixes(db, nativeStore, 6000);
    await dropSavedFixesFromBuffer(db);
    const left = await bufferTimes(db);
    expect(left).toContain(stray); // the old behaviour this commit removes
  });

  it("(c) reconcile adds only what is missing when the buffer has MORE rows than the native store", async () => {
    // The buffer holds 20 rows; 5 are not in the native store (JS-engine fixes).
    const native = Array.from({ length: 10 }, (_, i) => nat(T("10:00:00") + i * 10_000, i));
    for (let i = 0; i < 7; i++) await insertBufferRow(db, fixTimeMs(native[i].timestamp), i); // 7 of the 10 native
    for (let i = 0; i < 13; i++) await insertBufferRow(db, T("11:00:00") + i * 10_000, 20 + i); // 13 others
    const before = (await bufferTimes(db)).length;
    expect(before).toBe(20);
    const r = await insertMissingNativeFixes(db, native, 6000);
    expect(r.added).toBe(3);
    const after = await bufferTimes(db);
    expect(after).toHaveLength(23);
    // Nothing that was there has gone.
    for (let i = 0; i < 13; i++) expect(after).toContain(T("11:00:00") + i * 10_000);
    // Running it again adds nothing.
    expect((await insertMissingNativeFixes(db, native, 6000)).added).toBe(0);
  });

  it("(e) same-start split, then the app is killed before the second pass: nothing new is lost", async () => {
    // Buffer: a saved trip's fixes then new driving, as one leg.
    await insertMissingNativeFixes(db, nativeStore.filter((f) => fixTimeMs(f.timestamp) !== stray), 6000);
    const rows = await db.getAllAsync<{ id: number; recorded_at: string }>("SELECT id, recorded_at FROM detection_coordinates ORDER BY recorded_at", []);
    const decision = decideSameStart(rows, rows, T("16:01:39"));
    expect(decision.kind).toBe("trim");
    if (decision.kind !== "trim") return;
    const removed = await applySameStartTrim(db, decision, "trip:1");
    expect(removed).toBe(savedFixes.length - 1);
    // KILL: the second pass never runs. The state on disk is joining + new.
    let left = await bufferTimes(db);
    expect(left).toEqual([savedFixes[savedFixes.length - 1], ...newDriving]);
    // Next boot: the native store refills the covered fixes, finalize strips
    // them again from the memory; the new driving is untouched.
    await insertMissingNativeFixes(db, nativeStore.filter((f) => fixTimeMs(f.timestamp) !== stray), 6000);
    await dropSavedFixesFromBuffer(db);
    left = await bufferTimes(db);
    expect(left).toEqual([savedFixes[savedFixes.length - 1], ...newDriving]);
  });

  it("(e, crash between trim and memory) the rows are deleted by id and a missing memory only risks a duplicate", async () => {
    await insertMissingNativeFixes(db, nativeStore.filter((f) => fixTimeMs(f.timestamp) !== stray), 6000);
    const rows = await db.getAllAsync<{ id: number; recorded_at: string }>("SELECT id, recorded_at FROM detection_coordinates ORDER BY recorded_at", []);
    const decision = decideSameStart(rows, rows, T("16:01:39"));
    if (decision.kind !== "trim") throw new Error("expected trim");
    // Memory is written before the delete, so a kill after the memory write
    // leaves every row in place; nothing is lost either way.
    await recordSavedFixes(db, decision.covered, "trip:1");
    expect((await bufferTimes(db)).length).toBe(rows.length);
    await dropSavedFixesFromBuffer(db);
    expect(await bufferTimes(db)).toEqual([savedFixes[savedFixes.length - 1], ...newDriving]);
  });

  it("refill after a flight: the consumed drive to the airport is stripped, the flight is re-detected and cut, no trip spans it", async () => {
    const MPL = 69.05;
    const EDI = { lat: 55.95, lng: -3.37 };
    const YYZ = { lat: 43.68, lng: -79.63 };
    const T0 = Date.parse("2026-10-12T10:00:00Z");
    const mk = (lat: number, lng: number, ms: number) => ({
      timestamp: iso(ms),
      coords: { latitude: lat, longitude: lng, speed: 10, accuracy: 8 },
      activity: null,
    });
    // Drive to the airport (25 min at 55 mph), then three fixes at the gate.
    const toAirport = [];
    for (let i = 0; i <= 150; i++) toAirport.push(mk(55.88 + i * ((55 * (10 / 3600)) / MPL), EDI.lng, T0 + i * 10_000));
    const lastDrive = Date.parse(toAirport[toAirport.length - 1].timestamp);
    const gate = [1, 2, 3].map((i) => mk(EDI.lat, EDI.lng, lastDrive + i * 20 * 60_000));
    const takeoffAt = Date.parse(gate[2].timestamp) + 30 * 60_000;
    const roll = [];
    let lat = EDI.lat;
    let t = takeoffAt;
    for (const mph of [40, 90, 140, 180]) {
      t += 10_000;
      lat += (mph * (10 / 3600)) / MPL;
      roll.push(mk(lat, EDI.lng, t));
    }
    const cruise = [];
    for (let i = 1; i < 420; i++) {
      const f = i / 420;
      cruise.push(mk(lat + (YYZ.lat - lat) * f, EDI.lng + (YYZ.lng - EDI.lng) * f, t + i * 60_000));
    }
    const landT = t + 7 * 3600_000;
    const landing = mk(YYZ.lat, YYZ.lng, landT);
    const away = [];
    for (let i = 0; i <= 90; i++) away.push(mk(YYZ.lat + 0.01 + i * ((45 * (10 / 3600)) / MPL), YYZ.lng, landT + 40 * 60_000 + i * 10_000));
    const flightFixes = [...roll, ...cruise, landing, ...away];
    const store = [...toAirport, ...gate, ...flightFixes];

    // The drive to the airport (with the gate) was finalized and saved: the
    // flight fixes were NEVER remembered. The buffer was consumed.
    await insertMissingNativeFixes(db, [...toAirport, ...gate], 6000);
    const consumed = await db.getAllAsync<{ recorded_at: string }>("SELECT recorded_at FROM detection_coordinates", []);
    await recordSavedFixes(db, consumed, "trip-airport");
    await db.runAsync("DELETE FROM detection_coordinates", []);

    // Refill from the native store (never cleared), then the finalize start.
    await insertMissingNativeFixes(db, store, 6000);
    await dropSavedFixesFromBuffer(db);
    const rows = await db.getAllAsync<{ lat: number; lng: number; recorded_at: string }>(
      "SELECT lat, lng, recorded_at FROM detection_coordinates ORDER BY recorded_at",
      []
    );
    // Only the gate's last fix (joining point) survives from the saved drive.
    expect(rows.filter((r) => fixTimeMs(r.recorded_at) <= lastDrive + 3 * 20 * 60_000)).toHaveLength(1);
    const spans = findFlights(rows);
    expect(spans).toHaveLength(1);
    const { kept, legStarts } = cutFlights(rows, spans);
    expect(legStarts).toHaveLength(1);
    // No leg contains a step at aeroplane speed, so no trip spans the flight.
    const legs = [kept.slice(0, legStarts[0]), kept.slice(legStarts[0])];
    for (const leg of legs) {
      for (let i = 1; i < leg.length; i++) {
        const dtH = (fixTimeMs(leg[i].recorded_at) - fixTimeMs(leg[i - 1].recorded_at)) / 3600000;
        const mi = Math.hypot((leg[i].lat - leg[i - 1].lat) * MPL, (leg[i].lng - leg[i - 1].lng) * MPL * Math.cos((leg[i].lat * Math.PI) / 180));
        expect(mi / dtH).toBeLessThan(100);
      }
    }
  });

  it("a fully saved buffer is emptied", async () => {
    await insertMissingNativeFixes(db, nativeStore.filter((f) => fixTimeMs(f.timestamp) <= T("16:01:39")), 6000);
    const rows = await db.getAllAsync<{ recorded_at: string }>("SELECT recorded_at FROM detection_coordinates", []);
    await recordSavedFixes(db, rows, "trip-1");
    const plan = await dropSavedFixesFromBuffer(db);
    expect(plan?.allSaved).toBe(true);
    expect(await bufferTimes(db)).toEqual([]);
  });

  it("duplicate timestamps collapse through the unique index, and an anchor never collides", async () => {
    const ms = T("12:00:00");
    await insertBufferRow(db, ms, 0);
    await insertBufferRow(db, ms, 0); // same fix delivered twice
    await insertBufferRow(db, ms, 0, { ts: String(ms) }); // same fix spelled as an epoch (same recorded_ms)
    expect(await bufferTimes(db)).toHaveLength(1);
    // The departure anchor shares the millisecond of a real fix: both stay.
    await insertBufferRow(db, ms, 1, { anchor: true });
    expect(await bufferTimes(db)).toHaveLength(2);
  });
});

describe.skipIf(!DatabaseSync)("v12 migration (ensureRecordedMs)", () => {
  it("collapses duplicates, backfills, leaves anchors NULL, and is safe to repeat", async () => {
    const db = openShim();
    db.raw.exec(LEGACY_TABLE);
    const ms = T("09:00:00");
    const ins = (at: string, speed: number, acc: number) =>
      db.runAsync("INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at) VALUES (51.5, -0.1, ?, ?, ?)", [speed, acc, at]);
    await ins(iso(ms), 10, 8);
    await ins(iso(ms), 10, 8); // duplicate
    await ins(String(ms), 10, 8); // duplicate, epoch spelling
    await ins(iso(ms + 10_000), 10, 8);
    await ins(iso(ms), 0, 50); // anchor at the same time as a real fix
    await ensureRecordedMs(db);
    const rows = await db.getAllAsync<{ id: number; recorded_ms: number | null; accuracy: number }>(
      "SELECT id, recorded_ms, accuracy FROM detection_coordinates ORDER BY id",
      []
    );
    expect(rows).toHaveLength(3); // two real fixes and the anchor
    expect(rows.find((r) => r.accuracy === 50)?.recorded_ms).toBeNull();
    expect(rows.filter((r) => r.accuracy !== 50).map((r) => r.recorded_ms)).toEqual([ms, ms + 10_000]);
    await ensureRecordedMs(db); // again: nothing changes
    expect((await db.getAllAsync("SELECT id FROM detection_coordinates", [])).length).toBe(3);
  });

  it("builds the index when two identical real fixes carry the anchor's signature (Android: activity always null)", async () => {
    const db = openShim();
    db.raw.exec(LEGACY_TABLE);
    // Column and index exist from an earlier boot; real fixes were stored with
    // recorded_ms set but the index was lost, and a duplicate crept in.
    await ensureRecordedMs(db);
    db.raw.exec(`DROP INDEX ${RECORDED_MS_INDEX}`);
    const ms = T("09:30:00");
    for (let i = 0; i < 2; i++) {
      await db.runAsync(
        "INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at, recorded_ms) VALUES (51.5, -0.1, 0, 50, ?, ?)",
        [iso(ms), ms]
      );
    }
    // And an unmigrated legacy pair with the same signature, no recorded_ms.
    for (let i = 0; i < 2; i++) {
      await db.runAsync(
        "INSERT INTO detection_coordinates (lat, lng, speed, accuracy, recorded_at) VALUES (51.5, -0.1, 0, 50, ?)",
        [iso(ms + 10_000)]
      );
    }
    await ensureRecordedMs(db);
    const idx = await db.getAllAsync<{ name: string }>("PRAGMA index_list(detection_coordinates)", []);
    expect(idx.some((i) => i.name === RECORDED_MS_INDEX)).toBe(true);
    const rows = await db.getAllAsync<{ recorded_ms: number | null }>("SELECT recorded_ms FROM detection_coordinates ORDER BY id", []);
    // The set pair collapsed to one; the unset pair stays as NULLs (never a clash).
    expect(rows.filter((r) => r.recorded_ms === ms)).toHaveLength(1);
    expect(rows).toHaveLength(3);
  });

  it("recreates the unique index on a later boot when it is missing", async () => {
    const db = openShim();
    db.raw.exec(LEGACY_TABLE);
    await ensureRecordedMs(db);
    db.raw.exec(`DROP INDEX ${RECORDED_MS_INDEX}`);
    await db.runAsync("INSERT INTO detection_coordinates (lat, lng, recorded_at, recorded_ms) VALUES (1, 1, ?, ?)", [iso(T("08:00:00")), T("08:00:00")]);
    await db.runAsync("INSERT INTO detection_coordinates (lat, lng, recorded_at, recorded_ms) VALUES (1, 1, ?, ?)", [iso(T("08:00:00")), T("08:00:00")]);
    await ensureRecordedMs(db);
    const idx = await db.getAllAsync<{ name: string }>("PRAGMA index_list(detection_coordinates)", []);
    expect(idx.some((i) => i.name === RECORDED_MS_INDEX)).toBe(true);
    expect((await db.getAllAsync("SELECT id FROM detection_coordinates", [])).length).toBe(1);
  });
});
