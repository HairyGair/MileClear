/**
 * The already-saved guard on the orphan-route sweep, checked against the case
 * that found it: Lohitha (lsstart24), 5-8 Sep 2026, Android 5. She tracked by
 * shift; the native store kept the same fixes; the next app open saved them
 * again as 85.75, 33.44 and 31.87 duplicate miles.
 */
import { describe, expect, it } from "vitest";
import { ALREADY_SAVED_MIN_OVERLAP, orphanRouteDecision, savedTripOverlap } from "../orphanRoute";

const T = (iso: string) => new Date(iso).getTime();

describe("savedTripOverlap", () => {
  it("covers Lohitha's Tuesday: shift trip 17:52-20:55, native store 17:52-21:02", () => {
    const f = savedTripOverlap(T("2026-09-08T17:52:00Z"), T("2026-09-08T21:02:00Z"), [
      { id: "f8d3e475", startedMs: T("2026-09-08T17:52:00Z"), endedMs: T("2026-09-08T20:55:00Z") },
    ]);
    expect(f).toBeGreaterThan(0.95);
    expect(f).toBeLessThanOrEqual(1);
  });

  it("merges the legs of a split journey instead of double counting", () => {
    const f = savedTripOverlap(T("2026-09-05T12:45:00Z"), T("2026-09-05T20:23:00Z"), [
      { id: "a", startedMs: T("2026-09-05T12:45:00Z"), endedMs: T("2026-09-05T19:37:00Z") },
      { id: "b", startedMs: T("2026-09-05T19:46:00Z"), endedMs: T("2026-09-05T19:51:00Z") },
      { id: "c", startedMs: T("2026-09-05T19:52:00Z"), endedMs: T("2026-09-05T20:23:00Z") },
      // an overlapping duplicate leg must not push the fraction over 1
      { id: "d", startedMs: T("2026-09-05T13:00:00Z"), endedMs: T("2026-09-05T19:00:00Z") },
    ]);
    expect(f).toBeGreaterThan(0.9);
    expect(f).toBeLessThanOrEqual(1);
  });

  it("is zero with no saved trips, a trip elsewhere in the day, or a bad span", () => {
    expect(savedTripOverlap(T("2026-09-08T17:52:00Z"), T("2026-09-08T21:02:00Z"), [])).toBe(0);
    expect(
      savedTripOverlap(T("2026-09-08T17:52:00Z"), T("2026-09-08T21:02:00Z"), [
        { id: "x", startedMs: T("2026-09-08T08:00:00Z"), endedMs: T("2026-09-08T09:00:00Z") },
      ])
    ).toBe(0);
    expect(savedTripOverlap(5, 5, [{ id: "x", startedMs: 0, endedMs: 10 }])).toBe(0);
  });

  it("gives a partial fraction when only the first half is saved (a real second leg)", () => {
    const f = savedTripOverlap(T("2026-09-07T18:46:00Z"), T("2026-09-07T21:24:00Z"), [
      { id: "manual", startedMs: T("2026-09-07T18:39:00Z"), endedMs: T("2026-09-07T19:33:00Z") },
    ]);
    expect(f).toBeGreaterThan(0.25);
    expect(f).toBeLessThan(ALREADY_SAVED_MIN_OVERLAP);
  });
});

describe("orphanRouteDecision with savedOverlap", () => {
  const NOW = T("2026-09-08T23:04:00Z");
  const base = {
    armed: false,
    jsCoordCount: 0,
    jsNewestMs: 0,
    nativeCount: 718,
    nativeNewestMs: T("2026-09-08T21:02:00Z"),
    shiftActive: false,
    now: NOW,
  };

  it("discards the native store's copy of a shift that is already saved", () => {
    const d = orphanRouteDecision({ ...base, savedOverlap: 0.97 });
    expect(d.finalize).toBe(false);
    expect(d.discard).toBe(true);
    expect(d.reason).toBe("already_saved");
  });

  it("still finalizes a genuinely lost route", () => {
    for (const savedOverlap of [null, undefined, 0, 0.3]) {
      const d = orphanRouteDecision({ ...base, savedOverlap });
      expect(d.finalize).toBe(true);
      expect(d.discard).toBe(false);
      expect(d.reason).toBe("orphaned_route");
    }
  });

  it("sits exactly on the threshold", () => {
    expect(orphanRouteDecision({ ...base, savedOverlap: ALREADY_SAVED_MIN_OVERLAP }).reason).toBe("already_saved");
    expect(orphanRouteDecision({ ...base, savedOverlap: ALREADY_SAVED_MIN_OVERLAP - 0.01 }).reason).toBe("orphaned_route");
  });

  it("never discards while armed or during a shift, whatever the overlap", () => {
    expect(orphanRouteDecision({ ...base, armed: true, savedOverlap: 1 })).toMatchObject({ reason: "recording_armed", discard: false });
    expect(orphanRouteDecision({ ...base, shiftActive: true, savedOverlap: 1 })).toMatchObject({ reason: "shift_owns_gps", discard: false });
  });
});
