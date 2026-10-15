import { describe, it, expect } from "vitest";
import { purgeableBeforeCutoff, recordingLooksLive, ARRIVAL_STOP_TIMEOUT_MS } from "../finalizeSaveRule";

const NOW = Date.parse("2026-10-15T12:00:00.000Z");
const iso = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();

describe("recordingLooksLive (restoring Trip in progress after a failed save)", () => {
  it("restores while the newest fix is within the stop timeout", () => {
    expect(recordingLooksLive(iso(2), NOW)).toBe(true);
    expect(recordingLooksLive(iso(ARRIVAL_STOP_TIMEOUT_MS / 60_000), NOW)).toBe(true);
  });

  it("leaves it down for a recording parked longer than that", () => {
    expect(recordingLooksLive(iso(11), NOW)).toBe(false);
    expect(recordingLooksLive(iso(6 * 60), NOW)).toBe(false);
  });

  it("reads a raw native epoch, and treats a missing or unreadable time as not live", () => {
    expect(recordingLooksLive(String(NOW - 60_000), NOW)).toBe(true);
    expect(recordingLooksLive(null, NOW)).toBe(false);
    expect(recordingLooksLive("garbage", NOW)).toBe(false);
  });
});

describe("purgeableBeforeCutoff (JS engine stale clean-up)", () => {
  const SPLIT = 30 * 60_000;
  const CUTOFF = NOW - 30 * 60_000;
  const fix = (minsAgo: number) => ({ lat: 51.5, lng: -0.12, recorded_at: iso(minsAgo) });

  it("takes everything older than the cutoff when the next fix starts a new journey", () => {
    const fixes = [fix(180), fix(179), fix(178), fix(5), fix(4)];
    expect(purgeableBeforeCutoff(fixes, CUTOFF, SPLIT).map((f) => f.recorded_at)).toEqual([iso(180), iso(179), iso(178)]);
  });

  it("leaves a journey that carries on past the cutoff whole, so one drive is never split", () => {
    // An old drive, then one that started 40 min ago and is still going.
    const fixes = [fix(180), fix(179), fix(40), fix(35), fix(31), fix(28), fix(25)];
    expect(purgeableBeforeCutoff(fixes, CUTOFF, SPLIT).map((f) => f.recorded_at)).toEqual([iso(180), iso(179)]);
  });

  it("stops waiting once a journey running past the cutoff began over 3 hours before it", () => {
    // Fixes every 20 min for 5 hours: a save that keeps failing must not let this grow for ever.
    const fixes = [300, 280, 260, 240, 220, 200, 180, 160, 140, 120, 100, 80, 60, 40, 20].map(fix);
    expect(purgeableBeforeCutoff(fixes, CUTOFF, SPLIT).map((f) => f.recorded_at)).toEqual(
      [300, 280, 260, 240, 220, 200, 180, 160, 140, 120, 100, 80, 60, 40].map(iso)
    );
  });

  it("takes nothing when the whole buffer is one journey running past the cutoff", () => {
    const fixes = [fix(50), fix(45), fix(40), fix(29)];
    expect(purgeableBeforeCutoff(fixes, CUTOFF, SPLIT)).toEqual([]);
  });

  it("takes all of it when every fix is older than the cutoff", () => {
    const fixes = [fix(90), fix(80), fix(70)];
    expect(purgeableBeforeCutoff(fixes, CUTOFF, SPLIT)).toHaveLength(3);
  });
});
