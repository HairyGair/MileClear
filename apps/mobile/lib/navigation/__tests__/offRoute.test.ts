import { describe, it, expect } from "vitest";
import {
  rerouteIntervalMs,
  assessOffRoute,
  initialOffRouteState,
  shouldReroute,
  softLimit,
  type OffRouteState,
} from "../offRoute";

function run(fixes: Array<{ distance: number; accuracyM?: number | null; speedMps?: number | null }>): OffRouteState[] {
  let s: OffRouteState = initialOffRouteState;
  const out: OffRouteState[] = [];
  for (const f of fixes) {
    s = assessOffRoute(s, { speedMps: 12, accuracyM: 8, ...f });
    out.push(s);
  }
  return out;
}

describe("off route", () => {
  it("three fixes over about 50 m in a row", () => {
    const s = run([{ distance: 5 }, { distance: 60 }, { distance: 70 }, { distance: 80 }]);
    expect(s.map((x) => x.offRoute)).toEqual([false, false, false, true]);
  });

  it("one fix back on the line resets the count", () => {
    const s = run([{ distance: 5 }, { distance: 60 }, { distance: 60 }, { distance: 10 }, { distance: 60 }, { distance: 60 }]);
    expect(s.some((x) => x.offRoute)).toBe(false);
  });

  it("more than 150 m once is enough", () => {
    const s = run([{ distance: 5 }, { distance: 160 }]);
    expect(s[1].offRoute).toBe(true);
  });

  it("allows for reported accuracy", () => {
    expect(softLimit(8)).toBe(50);
    expect(softLimit(40)).toBe(75);
    const s = run([{ distance: 5 }, { distance: 65, accuracyM: 40 }, { distance: 65, accuracyM: 40 }, { distance: 65, accuracyM: 40 }]);
    expect(s.at(-1)!.offRoute).toBe(false);
  });

  it("ignores fixes worse than 50 m, even 300 m out", () => {
    const s = run([{ distance: 5 }, { distance: 300, accuracyM: 60 }, { distance: 300, accuracyM: 250 }, { distance: 300, accuracyM: 51 }]);
    expect(s.at(-1)!.offRoute).toBe(false);
  });

  it("parked: GPS wander does not add up", () => {
    const s = run([{ distance: 5 }, { distance: 60, speedMps: 0 }, { distance: 60, speedMps: 0 }, { distance: 60, speedMps: 0 }, { distance: 60, speedMps: 0 }]);
    expect(s.at(-1)!.offRoute).toBe(false);
  });

  it("starting in a car park off the line is not off route until driving away", () => {
    const s = run([{ distance: 90 }, { distance: 95 }, { distance: 100 }, { distance: 85 }]);
    expect(s.some((x) => x.offRoute)).toBe(false);
    expect(s.at(-1)!.joined).toBe(false);
    const away = run([{ distance: 90 }, { distance: 200 }, { distance: 260 }]);
    expect(away.at(-1)!.offRoute).toBe(true);
    const joins = run([{ distance: 90 }, { distance: 30 }, { distance: 60 }, { distance: 60 }, { distance: 60 }]);
    expect(joins[1].joined).toBe(true);
    expect(joins.at(-1)!.offRoute).toBe(true);
  });
});

describe("reroute throttle", () => {
  it("at most every 10 seconds, never two at once", () => {
    expect(shouldReroute({ offRoute: true, nowMs: 0, lastRequestAtMs: null, inFlight: false })).toBe(true);
    expect(shouldReroute({ offRoute: true, nowMs: 9_999, lastRequestAtMs: 0, inFlight: false })).toBe(false);
    expect(shouldReroute({ offRoute: true, nowMs: 10_000, lastRequestAtMs: 0, inFlight: false })).toBe(true);
    expect(shouldReroute({ offRoute: true, nowMs: 60_000, lastRequestAtMs: 0, inFlight: true })).toBe(false);
    expect(shouldReroute({ offRoute: false, nowMs: 60_000, lastRequestAtMs: null, inFlight: false })).toBe(false);
  });
});

describe("reroute backoff (PLAN Dev3, DESIGN 2.4)", () => {
  it("10 / 20 / 40 s after failures in a row, never sooner than the failure asks", () => {
    expect(rerouteIntervalMs(0, null)).toBe(10_000);
    expect(rerouteIntervalMs(1, "ROUTING_UNAVAILABLE")).toBe(20_000);
    expect(rerouteIntervalMs(1, "NO_ROUTE")).toBe(30_000);
    expect(rerouteIntervalMs(2, "OFFLINE")).toBe(40_000);
    expect(rerouteIntervalMs(9, "OFFLINE")).toBe(40_000);
    expect(shouldReroute({ offRoute: true, nowMs: 25_000, lastRequestAtMs: 0, inFlight: false, failures: 2, lastFailure: "OFFLINE" })).toBe(false);
    expect(shouldReroute({ offRoute: true, nowMs: 40_000, lastRequestAtMs: 0, inFlight: false, failures: 2, lastFailure: "OFFLINE" })).toBe(true);
  });
});
