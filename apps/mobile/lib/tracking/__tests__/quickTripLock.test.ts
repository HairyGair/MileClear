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
  QUICK_TRIP_PARKED_MS,
  QUICK_TRIP_NEVER_DROVE_MS,
  QUICK_TRIP_UNTIL_ARRIVED_MS,
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

describe("a Start Trip left running after parking finishes itself (Samantha Birch, 30 Sep 2026)", () => {
  // Start Trip tapped 07:54Z; she walked between clients all day, so a
  // breadcrumb landed every few minutes and the old rule called it live.
  const START = Date.parse("2026-09-30T07:54:00Z");
  const base = {
    firstCoordMs: START + mins(1),
    quickTripStartMs: START,
    lockStartedAtMs: START,
  };

  it("finishes once there has been no driving for 15 minutes, despite walking fixes", () => {
    const now = START + mins(45);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(1), // she is walking: fresh fixes
        appActive: false,
        lastDrivingMs: START + mins(16), // parked at 08:10
      })
    ).toEqual({ action: "finish", reason: "parked" });
  });

  it("keeps it while the last driving was under 15 minutes ago", () => {
    const now = START + mins(30);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(1),
        appActive: false,
        lastDrivingMs: now - mins(QUICK_TRIP_PARKED_MS / 60_000 - 1),
      })
    ).toEqual({ action: "suppress", reason: "live_breadcrumb" });
  });

  it("never finishes while the app is on screen: the open form owns Arrive", () => {
    const now = START + hours(9);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(1),
        appActive: true,
        lastDrivingMs: START + mins(16),
      }).action
    ).not.toBe("finish");
  });

  it("lets go of a Start Trip that never drove after an hour, saving nothing", () => {
    const now = START + QUICK_TRIP_NEVER_DROVE_MS + mins(1);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(2),
        appActive: false,
        lastDrivingMs: null,
      })
    ).toEqual({ action: "finish", reason: "never_drove" });
  });

  it("gives a Start Trip that has not driven yet its first hour", () => {
    const now = START + mins(40);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(2),
        appActive: false,
        lastDrivingMs: null,
      })
    ).toEqual({ action: "suppress", reason: "live_breadcrumb" });
  });

  it("ignores driving from before this Start Trip began", () => {
    const now = START + mins(40);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(2),
        appActive: false,
        lastDrivingMs: START - mins(30),
      }).action
    ).toBe("suppress");
  });

  it("leaves the old rules alone when the caller did not judge driving", () => {
    const now = START + mins(45);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(1),
        appActive: false,
      })
    ).toEqual({ action: "suppress", reason: "live_breadcrumb" });
  });

  it("does not apply without a Start Trip row (no trip-form session)", () => {
    const now = START + mins(45);
    expect(
      quickTripLockDecision({
        ...base,
        quickTripStartMs: null,
        nowMs: now,
        lastCoordMs: now - mins(1),
        appActive: false,
        lastDrivingMs: START + mins(16),
      }).action
    ).not.toBe("finish");
  });
});

describe("\"Start Trip runs until I tap Arrived\" (Kada, 9 Oct 2026)", () => {
  // Amazon Flex: Start Trip 05:42 BST, drove to the station, then a 36-minute
  // wait with the app in the background. The parked rule ended the trip.
  const START = Date.parse("2026-10-09T04:42:00Z");
  const base = {
    firstCoordMs: START + mins(1),
    quickTripStartMs: START,
    lockStartedAtMs: START,
    appActive: false,
  };

  it("does not finish a parked Start Trip when the setting is on", () => {
    const now = START + mins(105);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(1),
        lastDrivingMs: START + mins(69), // last drove 36 minutes ago
        untilArrived: true,
      })
    ).toEqual({ action: "suppress", reason: "live_breadcrumb" });
  });

  it("the same wait still finishes it with the setting off", () => {
    const now = START + mins(105);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(1),
        lastDrivingMs: START + mins(69),
      })
    ).toEqual({ action: "finish", reason: "parked" });
  });

  it("keeps the lock through a long silent wait well past three hours", () => {
    const now = START + hours(5);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(45), // phone silent while parked
        lastDrivingMs: now - mins(45),
        untilArrived: true,
      })
    ).toEqual({ action: "suppress", reason: "recently_started" });
  });

  it("does not let go of a Start Trip that has not driven yet", () => {
    const now = START + QUICK_TRIP_NEVER_DROVE_MS + mins(30);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(2),
        lastDrivingMs: null,
        untilArrived: true,
      }).action
    ).toBe("suppress");
  });

  it("a forgotten one is still recovered after the until-Arrived window", () => {
    const now = START + QUICK_TRIP_UNTIL_ARRIVED_MS + mins(5);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(30),
        lastDrivingMs: now - mins(30),
        untilArrived: true,
      })
    ).toEqual({ action: "recover", reason: "orphan" });
  });

  it("the 18-hour span cap still applies", () => {
    const now = START + QUICK_TRIP_MAX_SPAN_MS + mins(1);
    expect(
      quickTripLockDecision({
        ...base,
        nowMs: now,
        lastCoordMs: now - mins(1),
        lastDrivingMs: now - mins(1),
        untilArrived: true,
      })
    ).toEqual({ action: "recover", reason: "span_cap" });
  });
});
