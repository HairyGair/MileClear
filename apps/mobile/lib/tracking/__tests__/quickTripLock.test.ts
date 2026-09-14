/**
 * The quick-trip lock rule, checked against the locks it got wrong.
 *
 * The foreground cases are measured from Duncan Norton's 14 Sep 2026 morning:
 * a lock taken at 10:36:08Z, still held at 11:56:54Z, with no breadcrumb for
 * over 20 minutes. He had the app open at 11:26:49Z and the old rule answered
 * "suppress" — which is why telling him to open the app would not have helped.
 */
import { describe, it, expect } from "vitest";
import {
  quickTripLockDecision,
  QUICK_TRIP_LIVE_COORD_MS,
  QUICK_TRIP_STALE_MS,
  QUICK_TRIP_MAX_SPAN_MS,
  QUICK_TRIP_NO_START_MAX_SPAN_MS,
} from "../quickTripLock";

const NOW = Date.parse("2026-09-14T11:56:54Z");
const mins = (n: number) => n * 60_000;
const hours = (n: number) => n * 3_600_000;

describe("a genuinely live quick trip is never touched", () => {
  it("suppresses while breadcrumbs are still arriving", () => {
    expect(
      quickTripLockDecision({
        nowMs: NOW,
        firstCoordMs: NOW - mins(40),
        lastCoordMs: NOW - mins(2),
        quickTripStartMs: NOW - mins(45),
        lockStartedAtMs: NOW - mins(45),
        appActive: true,
      })
    ).toEqual({ action: "suppress", reason: "live_breadcrumb" });
  });

  it("suppresses between tapping Start and the first fix landing", () => {
    expect(
      quickTripLockDecision({
        nowMs: NOW,
        firstCoordMs: null,
        lastCoordMs: null,
        quickTripStartMs: NOW - mins(1),
        lockStartedAtMs: NOW - mins(1),
        appActive: true,
      })
    ).toEqual({ action: "suppress", reason: "recently_started" });
  });

  it("holds on right up to the liveness boundary", () => {
    const d = quickTripLockDecision({
      nowMs: NOW,
      firstCoordMs: NOW - hours(1),
      lastCoordMs: NOW - QUICK_TRIP_LIVE_COORD_MS + 1000,
      quickTripStartMs: NOW - hours(1),
      lockStartedAtMs: NOW - hours(1),
      appActive: false,
    });
    expect(d.action).toBe("suppress");
  });
});

describe("Duncan Norton, 14 Sep 2026 — the case the old rule got wrong", () => {
  // Lock taken 10:36:08Z, checked 11:56:54Z, no breadcrumb for 30 minutes,
  // start row present, app on screen.
  const duncan = {
    nowMs: NOW,
    firstCoordMs: Date.parse("2026-09-14T10:36:08Z"),
    lastCoordMs: Date.parse("2026-09-14T11:26:00Z"),
    quickTripStartMs: Date.parse("2026-09-14T08:00:00Z"),
    lockStartedAtMs: Date.parse("2026-09-14T10:36:08Z"),
    appActive: true,
  };

  it("releases the lock instead of protecting it because the app is open", () => {
    const d = quickTripLockDecision(duncan);
    expect(d.action).toBe("release_lock_only");
    expect(d.reason).toBe("foreground_stale");
  });

  it("leaves the breadcrumbs alone, so Arrive can still recover the trail", () => {
    // "release_lock_only" is the whole point: "recover" here would process a
    // trail the open form still holds and duplicate the trip at Arrive.
    expect(quickTripLockDecision(duncan).action).not.toBe("recover");
  });

  it("with the app closed, the same lock is recovered into trips", () => {
    const d = quickTripLockDecision({ ...duncan, appActive: false });
    expect(d).toEqual({ action: "recover", reason: "orphan" });
  });
});

describe("the lock can no longer outlive its own clock", () => {
  it("ages out on active_shift_started_at even when the other anchors were reset", () => {
    // A fresh Start Trip tap rewrites the breadcrumbs and the start row, which
    // is how a stuck lock used to restart its own span clock indefinitely.
    const d = quickTripLockDecision({
      nowMs: NOW,
      firstCoordMs: NOW - mins(5),
      lastCoordMs: NOW - mins(5),
      quickTripStartMs: NOW - mins(5),
      lockStartedAtMs: NOW - hours(20),
      appActive: false,
    });
    expect(d).toEqual({ action: "recover", reason: "span_cap" });
  });

  it("uses the tighter cap when no start row owns the recording", () => {
    const justOver = NOW - QUICK_TRIP_NO_START_MAX_SPAN_MS - 1000;
    expect(
      quickTripLockDecision({
        nowMs: NOW,
        firstCoordMs: justOver,
        lastCoordMs: justOver,
        quickTripStartMs: null,
        lockStartedAtMs: justOver,
        appActive: false,
      })
    ).toEqual({ action: "recover", reason: "span_cap" });
  });

  it("still allows a long genuine trip under the 18h cap", () => {
    const d = quickTripLockDecision({
      nowMs: NOW,
      firstCoordMs: NOW - QUICK_TRIP_MAX_SPAN_MS + hours(1),
      lastCoordMs: NOW - mins(1),
      quickTripStartMs: NOW - QUICK_TRIP_MAX_SPAN_MS + hours(1),
      lockStartedAtMs: NOW - QUICK_TRIP_MAX_SPAN_MS + hours(1),
      appActive: false,
    });
    expect(d.action).toBe("suppress");
  });
});

describe("an abandoned lock with nothing in it", () => {
  it("is recovered, which also clears it when there is nothing worth keeping", () => {
    expect(
      quickTripLockDecision({
        nowMs: NOW,
        firstCoordMs: null,
        lastCoordMs: null,
        quickTripStartMs: null,
        lockStartedAtMs: NOW - hours(1),
        appActive: false,
      })
    ).toEqual({ action: "recover", reason: "orphan" });
  });

  it("does not suppress forever when every anchor is missing", () => {
    const d = quickTripLockDecision({
      nowMs: NOW,
      firstCoordMs: null,
      lastCoordMs: null,
      quickTripStartMs: null,
      lockStartedAtMs: null,
      appActive: false,
    });
    expect(d.action).not.toBe("suppress");
  });

  it("a stale start row alone does not keep it alive", () => {
    const d = quickTripLockDecision({
      nowMs: NOW,
      firstCoordMs: null,
      lastCoordMs: null,
      quickTripStartMs: NOW - QUICK_TRIP_STALE_MS - 1000,
      lockStartedAtMs: NOW - QUICK_TRIP_STALE_MS - 1000,
      appActive: false,
    });
    expect(d.action).toBe("recover");
  });
});
