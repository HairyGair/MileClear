import { describe, it, expect } from "vitest";
import {
  fixTimeMs,
  nativeFixesBeforeWindow,
  partitionBufferByWindow,
  rowsAddedByOpen,
  STALE_START_ROW_MS,
  windowStartMs,
} from "../lockWindowRule";

const T = (hhmmss: string) => `2026-10-12T${hhmmss}.000Z`;
const ms = (hhmmss: string) => Date.parse(T(hhmmss));

function fixes(from: string, to: string, stepSec: number) {
  const out: { id: number; recorded_at: string }[] = [];
  let id = 1;
  for (let t = ms(from); t <= ms(to); t += stepSec * 1000) {
    out.push({ id: id++, recorded_at: new Date(t).toISOString() });
  }
  return out;
}

describe("raw native timestamps", () => {
  it("compares an epoch-ms string against the window instead of calling it earlier", () => {
    const after = String(ms("17:30:00"));
    const before = String(ms("16:40:00"));
    const { earlier, inWindow } = partitionBufferByWindow(
      [{ recorded_at: before }, { recorded_at: after }],
      ms("17:01:00")
    );
    expect(earlier.map((r) => r.recorded_at)).toEqual([before]);
    expect(inWindow.map((r) => r.recorded_at)).toEqual([after]);
  });
  it("keeps a truly unreadable time on the earlier side", () => {
    expect(fixTimeMs("garbage")).toBeNaN();
    expect(partitionBufferByWindow([{ recorded_at: "garbage" }], ms("17:01:00")).earlier).toHaveLength(1);
  });
});

describe("nativeFixesBeforeWindow", () => {
  it("adds only pre-window native fixes the buffer lacks, from a store over 6,000 fixes", () => {
    // A long Start Trip fills the native store (7,000 fixes after the window);
    // the buffer already holds the first 100 fixes of the earlier drive.
    const drive = fixes("16:36:00", "16:57:00", 7);
    const buffer = drive.slice(0, 100).map((r) => r.recorded_at);
    const native = [
      ...drive.map((r) => ({ timestamp: r.recorded_at })),
      ...Array.from({ length: 7000 }, (_, i) => ({ timestamp: new Date(ms("17:01:00") + i * 1000).toISOString() })),
    ];
    const add = nativeFixesBeforeWindow(native, buffer, ms("17:01:00"));
    expect(add).toHaveLength(drive.length - 100);
    expect(add.every((n) => fixTimeMs(n.timestamp) < ms("17:01:00"))).toBe(true);
  });
  it("earlier drive only in the buffer: the buffer split keeps all of it and adds nothing", () => {
    const drive = fixes("16:36:00", "16:57:00", 7);
    const dup = fixes("17:01:00", "17:30:00", 30);
    const { earlier, inWindow } = partitionBufferByWindow([...drive, ...dup], ms("17:01:00"));
    expect(earlier).toHaveLength(drive.length);
    expect(inWindow).toHaveLength(dup.length);
    expect(nativeFixesBeforeWindow([], drive.map((r) => r.recorded_at), ms("17:01:00"))).toEqual([]);
  });
  it("adds nothing when the window is unknown", () => {
    expect(nativeFixesBeforeWindow([{ timestamp: T("16:40:00") }], [], null)).toEqual([]);
  });
});

describe("rowsAddedByOpen", () => {
  it("selects only rows from a minute before the seed, leaving an in-flight finalize's buffer", () => {
    const old = fixes("16:36:00", "16:57:00", 60);
    const mine = [
      { id: 900, recorded_at: T("17:20:30") },
      { id: 901, recorded_at: T("17:21:00") },
    ];
    expect(rowsAddedByOpen([...old, ...mine], ms("17:21:00"))).toEqual([900, 901]);
  });
});

describe("windowStartMs staleness and kind", () => {
  const lock = ms("17:01:00");
  const stale = "2026-10-09T08:00:00.000Z";
  it("a shift ignores a stale quick_trip_start row", () => {
    expect(windowStartMs({ kind: "shift", quickTripStartIso: stale, lockTakenAtMs: lock })).toBe(lock);
  });
  it("a Start Trip ignores a start row far older than the lock", () => {
    expect(lock - Date.parse(stale)).toBeGreaterThan(STALE_START_ROW_MS);
    expect(windowStartMs({ kind: "start_trip", quickTripStartIso: stale, lockTakenAtMs: lock })).toBe(lock);
  });
  it("but trusts it when the first breadcrumb agrees (a long resumed trip)", () => {
    const old = "2026-10-12T08:00:00.000Z";
    expect(
      windowStartMs({ quickTripStartIso: old, lockTakenAtMs: lock, firstBreadcrumbIso: "2026-10-12T08:00:20.000Z" })
    ).toBe(Date.parse(old));
  });
  it("a promoted drive a little older than the lock is still honoured", () => {
    expect(windowStartMs({ quickTripStartIso: T("16:36:00"), lockTakenAtMs: lock })).toBe(ms("16:36:00"));
  });
});
