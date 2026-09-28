/**
 * Fixes a shift's breadcrumbs or a saved trip already hold are second copies.
 * Checked against 4cc04bac's 26 Sep 2026 afternoon, which was saved twice
 * (52.0 mi from the native store, 55.1 mi from the shift) after the 18-hour
 * ghost-shift release left both recordings behind.
 */
import { describe, it, expect } from "vitest";
import {
  breadcrumbRuns,
  ownedWindows,
  partitionOwnedFixes,
  isOwned,
  OWNED_EDGE_PAD_MS,
  SAVED_TRIP_MAX_WINDOW_MS,
} from "../ownedFixes";

const at = (hhmm: string, day = 26) => Date.UTC(2026, 8, day, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)));
const iso = (ms: number) => new Date(ms).toISOString();
/** A fix every `stepS` seconds from `from` to `to`. */
function fixesBetween(from: number, to: number, stepS: number) {
  const out: { recorded_at: string }[] = [];
  for (let t = from; t <= to; t += stepS * 1000) out.push({ recorded_at: iso(t) });
  return out;
}
function timesBetween(from: number, to: number, stepS: number) {
  return fixesBetween(from, to, stepS).map((f) => Date.parse(f.recorded_at));
}

describe("breadcrumbRuns", () => {
  it("splits a shift's breadcrumbs where the recorder fell silent", () => {
    const runs = breadcrumbRuns([
      ...timesBetween(at("15:35"), at("17:00"), 7),
      ...timesBetween(at("18:30"), at("21:01"), 7),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual({ startMs: at("15:35"), endMs: at("17:00") - ((at("17:00") - at("15:35")) / 1000 % 7) * 1000 });
    expect(runs[1].startMs).toBe(at("18:30"));
  });

  it("ignores a lone fix and unusable times", () => {
    expect(breadcrumbRuns([at("12:00")])).toEqual([]);
    expect(breadcrumbRuns([NaN, at("12:00"), at("12:00") + 5_000])).toHaveLength(1);
  });
});

describe("partitionOwnedFixes", () => {
  it("drops the native store's copy of a shift afternoon (4cc04bac, 26 Sep)", () => {
    const crumbs = timesBetween(at("15:35"), at("21:01"), 7);
    const shift = new Map([["c82b9129", crumbs]]);
    const engine = fixesBetween(at("15:38"), at("21:05"), 4);
    const { kept, owned } = partitionOwnedFixes(engine, ownedWindows(shift, []));
    // Only the few minutes after the shift's last breadcrumb (plus the edge
    // pad) survive, too short to become a trip.
    expect(owned.length).toBeGreaterThan(engine.length * 0.98);
    const lastCrumb = crumbs[crumbs.length - 1];
    expect(kept.every((f) => Date.parse(f.recorded_at) > lastCrumb + OWNED_EDGE_PAD_MS)).toBe(true);
  });

  it("keeps a drive the engine recorded while the shift's recorder was silent", () => {
    const shift = new Map([
      [
        "s1",
        [...timesBetween(at("09:00"), at("10:00"), 7), ...timesBetween(at("14:00"), at("15:00"), 7)],
      ],
    ]);
    const engine = fixesBetween(at("11:30"), at("12:10"), 4);
    const { kept, owned } = partitionOwnedFixes(engine, ownedWindows(shift, []));
    expect(owned).toHaveLength(0);
    expect(kept).toHaveLength(engine.length);
  });

  it("keeps the drive home after the shift when the store holds both", () => {
    const shift = new Map([["s1", timesBetween(at("08:00"), at("12:00"), 7)]]);
    const engine = [...fixesBetween(at("08:05"), at("11:55"), 4), ...fixesBetween(at("13:00"), at("13:40"), 4)];
    const { kept } = partitionOwnedFixes(engine, ownedWindows(shift, []));
    expect(kept.length).toBe(fixesBetween(at("13:00"), at("13:40"), 4).length);
  });

  it("drops fixes inside a trip already saved from a recording, never inside a hand-typed one", () => {
    const windows = ownedWindows(new Map(), [
      { startedMs: at("15:38"), endedMs: at("21:05"), isManualEntry: false },
      { startedMs: at("07:00"), endedMs: at("08:00"), isManualEntry: true },
    ]);
    expect(isOwned(at("16:00"), windows)).toBe(true);
    expect(isOwned(at("07:30"), windows)).toBe(false);
    // Saved trips carry no edge pad: a drive setting off straight after keeps its start.
    expect(isOwned(at("21:05") + 30_000, windows)).toBe(false);
  });

  it("does not trust a saved trip that claims to span a night", () => {
    const windows = ownedWindows(new Map(), [
      { startedMs: at("15:45", 21), endedMs: at("20:30", 22), isManualEntry: false },
    ]);
    expect(at("20:30", 22) - at("15:45", 21)).toBeGreaterThan(SAVED_TRIP_MAX_WINDOW_MS);
    expect(windows).toEqual([]);
  });

  it("keeps fixes with an unreadable time for finalize to judge", () => {
    const shift = new Map([["s1", timesBetween(at("08:00"), at("12:00"), 7)]]);
    const { kept } = partitionOwnedFixes([{ recorded_at: "not a time" }], ownedWindows(shift, []));
    expect(kept).toHaveLength(1);
  });
});
