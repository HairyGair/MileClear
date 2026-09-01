/**
 * The orphaned-route rule, checked against the case that found it.
 *
 * SteveG, 1 Sep 2026: 135.7 miles Bristol to Hatfield, 2,766 fixes in RNBG's
 * native store and 61 in the JS buffer, no armed flag, five app opens that all
 * did nothing. The numbers below are his.
 */
import { describe, it, expect } from "vitest";
import {
  orphanRouteDecision,
  ORPHAN_MIN_AGE_MS,
  ORPHAN_MIN_COORDS,
} from "../orphanRoute";

const NOW = new Date("2026-09-01T16:52:55Z").getTime();
/** When he parked in Hatfield. */
const PARKED = new Date("2026-09-01T10:10:44Z").getTime();

const base = {
  armed: false,
  jsCoordCount: 0,
  jsNewestMs: 0,
  nativeCount: null as number | null,
  nativeNewestMs: null as number | null,
  shiftActive: false,
  now: NOW,
};

describe("orphanRouteDecision", () => {
  it("finalizes SteveG's stranded 135 miles", () => {
    const d = orphanRouteDecision({
      ...base,
      jsCoordCount: 61,
      jsNewestMs: PARKED,
      nativeCount: 2766,
      nativeNewestMs: PARKED,
    });
    expect(d.finalize).toBe(true);
    expect(d.reason).toBe("orphaned_route");
    expect(d.source).toBe("native_store");
    expect(Math.round(d.ageMs / 3_600_000)).toBe(7);
  });

  it("finds a route the JS buffer never saw at all", () => {
    // Android killed the runtime at the first fix: everything is native-side.
    const d = orphanRouteDecision({
      ...base,
      jsCoordCount: 0,
      jsNewestMs: 0,
      nativeCount: 2766,
      nativeNewestMs: PARKED,
    });
    expect(d.finalize).toBe(true);
    expect(d.source).toBe("native_store");
  });

  it("finds a route the native store never held", () => {
    // JS engine, no RNBG module: the buffer is the only evidence there is.
    const d = orphanRouteDecision({
      ...base,
      jsCoordCount: 480,
      jsNewestMs: PARKED,
      nativeCount: null,
      nativeNewestMs: null,
    });
    expect(d.finalize).toBe(true);
    expect(d.source).toBe("js_buffer");
  });

  it("leaves an armed recording to checkStaleAutoRecording", () => {
    // That path knows the stop timeout and runs the still-driving aliveness
    // check first. Two finalizes racing over one buffer is how trips get
    // duplicated.
    const d = orphanRouteDecision({
      ...base,
      armed: true,
      jsCoordCount: 61,
      jsNewestMs: PARKED,
      nativeCount: 2766,
      nativeNewestMs: PARKED,
    });
    expect(d.finalize).toBe(false);
    expect(d.reason).toBe("recording_armed");
  });

  it("does not touch the approach to the drive starting right now", () => {
    // openNativeRecording calls this with the JS engine's pre-recording buffer
    // in hand: fixes from the last minute that belong to the journey about to
    // open, not to a trip of their own.
    const d = orphanRouteDecision({
      ...base,
      jsCoordCount: 24,
      jsNewestMs: NOW - 40_000,
      nativeCount: 24,
      nativeNewestMs: NOW - 40_000,
    });
    expect(d.finalize).toBe(false);
    expect(d.reason).toBe("still_current");
  });

  it("judges age on the newer of the two stores", () => {
    // A stale JS buffer next to a live native store is a drive in progress,
    // not an orphan. Taking the JS timestamp alone would cut into it.
    const d = orphanRouteDecision({
      ...base,
      jsCoordCount: 61,
      jsNewestMs: NOW - 3 * 60 * 60 * 1000,
      nativeCount: 900,
      nativeNewestMs: NOW - 30_000,
    });
    expect(d.finalize).toBe(false);
    expect(d.reason).toBe("still_current");
  });

  it("waits out the age bound exactly", () => {
    const justInside = orphanRouteDecision({
      ...base,
      jsCoordCount: 40,
      jsNewestMs: NOW - ORPHAN_MIN_AGE_MS + 1000,
    });
    expect(justInside.finalize).toBe(false);
    const justPast = orphanRouteDecision({
      ...base,
      jsCoordCount: 40,
      jsNewestMs: NOW - ORPHAN_MIN_AGE_MS - 1000,
    });
    expect(justPast.finalize).toBe(true);
  });

  it("ignores a buffer too small to be a line", () => {
    const d = orphanRouteDecision({
      ...base,
      jsCoordCount: ORPHAN_MIN_COORDS - 1,
      jsNewestMs: PARKED,
    });
    expect(d.finalize).toBe(false);
    expect(d.reason).toBe("too_few_coords");
  });

  it("does nothing when both stores are empty", () => {
    const d = orphanRouteDecision(base);
    expect(d.finalize).toBe(false);
    expect(d.source).toBe(null);
    expect(d.ageMs).toBe(0);
  });

  it("yields to a shift, which owns the GPS", () => {
    const d = orphanRouteDecision({
      ...base,
      jsCoordCount: 200,
      jsNewestMs: PARKED,
      shiftActive: true,
    });
    expect(d.finalize).toBe(false);
    expect(d.reason).toBe("shift_owns_gps");
  });

  it("clears coordinates whose timestamps are unreadable", () => {
    // A buffer with fixes and no readable time is the corrupt state the sweep
    // exists for. Finalize's own guards decide whether it becomes a trip.
    const d = orphanRouteDecision({
      ...base,
      jsCoordCount: 30,
      jsNewestMs: 0,
      nativeCount: 30,
      nativeNewestMs: 0,
    });
    expect(d.finalize).toBe(true);
    expect(d.reason).toBe("orphaned_route");
    expect(d.ageMs).toBe(0);
  });
});
