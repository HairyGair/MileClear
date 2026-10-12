/**
 * What finalize sends, and what it does when the server refuses (12 Oct 2026
 * review of the flight fix): real drives get 400s, so only the known-garbage
 * distance verdict may clear a recording.
 */
import { describe, it, expect } from "vitest";
import {
  COORDINATE_TARGET,
  SERVER_MAX_COORDINATES,
  downsampleCoordinates,
  exceedsServerDistance,
  nextRejectBackoff,
  normaliseRecordedAt,
  parseFlightCutState,
  parseRejectBackoff,
  planFlightCut,
  prepareCoordinatesForServer,
  pruneFlightCutState,
  rejectBackoffActive,
  rejectBackoffDelayMs,
  type WireFix,
} from "../finalizeSaveRule";
import { cutFlights, findFlights } from "../flightRule";
import { ApiError } from "../../api/apiError";
import { isKeepAndBackOffRejection, isKnownGarbageRejection } from "../../sync/errors";

const MIN = 60_000;
const T0 = Date.parse("2026-10-12T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("exceedsServerDistance", () => {
  it("is the server's cap: over 2,000 miles only", () => {
    expect(exceedsServerDistance(2000)).toBe(false);
    expect(exceedsServerDistance(2000.01)).toBe(true);
    expect(exceedsServerDistance(153)).toBe(false);
    expect(exceedsServerDistance(NaN)).toBe(false);
  });
});

describe("backoff after a refusal", () => {
  it("waits 15 min, 1 h, 6 h, then a day, for ever", () => {
    expect([1, 2, 3, 4, 5, 9].map(rejectBackoffDelayMs)).toEqual([15 * MIN, 60 * MIN, 360 * MIN, 1440 * MIN, 1440 * MIN, 1440 * MIN]);
  });

  it("counts up for the same recording and starts again for another", () => {
    const a = nextRejectBackoff(null, "rec-1", 1000);
    expect(a).toEqual({ key: "rec-1", attempts: 1, nextAt: 1000 + 15 * MIN });
    const b = nextRejectBackoff(a, "rec-1", 2000);
    expect(b.attempts).toBe(2);
    expect(b.nextAt).toBe(2000 + 60 * MIN);
    expect(nextRejectBackoff(b, "rec-2", 3000).attempts).toBe(1);
  });

  it("holds the recording until the time is up, and never holds a different one", () => {
    const s = nextRejectBackoff(null, "rec-1", T0);
    expect(rejectBackoffActive(s, "rec-1", T0 + 14 * MIN)).toBe(true);
    expect(rejectBackoffActive(s, "rec-1", T0 + 15 * MIN)).toBe(false);
    expect(rejectBackoffActive(s, "rec-2", T0 + MIN)).toBe(false);
    expect(rejectBackoffActive(null, "rec-1", T0)).toBe(false);
  });

  it("a clock set far back cannot hold a drive for more than the longest step", () => {
    const s = nextRejectBackoff(null, "rec-1", T0);
    expect(rejectBackoffActive(s, "rec-1", T0 - 30 * 24 * 60 * MIN)).toBe(false);
  });

  it("reads the stored strings, and refuses nonsense", () => {
    expect(parseRejectBackoff("k", "2", "123")).toEqual({ key: "k", attempts: 2, nextAt: 123 });
    expect(parseRejectBackoff(null, "2", "123")).toBeNull();
    expect(parseRejectBackoff("k", "x", "123")).toBeNull();
    expect(parseRejectBackoff("k", "0", "123")).toBeNull();
  });
});

describe("a clock-ahead 400 keeps the buffer and backs off (the wiring decision)", () => {
  const clockAhead = new ApiError({ code: "VALIDATION", message: "Start date cannot be in the future", statusCode: 400, retryable: false });
  const flight = new ApiError({ code: "VALIDATION", message: "Distance exceeds reasonable limit", statusCode: 400, retryable: false });

  it("is not known garbage, so it is never consumed", () => {
    expect(isKnownGarbageRejection(clockAhead)).toBe(false);
    expect(isKeepAndBackOffRejection(clockAhead)).toBe(true);
  });
  it("the distance verdict is the one that is consumed", () => {
    expect(isKnownGarbageRejection(flight)).toBe(true);
    expect(isKeepAndBackOffRejection(flight)).toBe(false);
  });
  it("finalize then waits through the schedule", () => {
    let st = nextRejectBackoff(null, "rec", T0);
    expect(rejectBackoffActive(st, "rec", T0 + MIN)).toBe(true); // next minute: returns early, keeps everything
    st = nextRejectBackoff(st, "rec", T0 + 15 * MIN);
    expect(rejectBackoffActive(st, "rec", T0 + 16 * MIN)).toBe(true);
    expect(rejectBackoffActive(st, "rec", T0 + 15 * MIN + 61 * MIN)).toBe(false);
  });
});

describe("normaliseRecordedAt", () => {
  it("passes an ISO string through untouched, so the stored started_at still matches", () => {
    expect(normaliseRecordedAt("2026-10-12T10:00:00.000Z")).toBe("2026-10-12T10:00:00.000Z");
    expect(normaliseRecordedAt("2026-10-12T10:00:00+01:00")).toBe("2026-10-12T10:00:00+01:00");
  });
  it("converts a raw native epoch, in milliseconds or seconds", () => {
    expect(normaliseRecordedAt(String(T0))).toBe(iso(T0));
    expect(normaliseRecordedAt(String(T0 / 1000))).toBe(iso(T0));
    expect(normaliseRecordedAt(T0)).toBe(iso(T0));
  });
  it("converts a parseable non-ISO string", () => {
    expect(normaliseRecordedAt("Mon, 12 Oct 2026 10:00:00 GMT")).toBe("2026-10-12T10:00:00.000Z");
  });
  it("refuses what cannot be parsed", () => {
    for (const v of ["garbage", "", "  ", null, undefined, {}, "2026-13-45T99:00:00Z"]) expect(normaliseRecordedAt(v)).toBeNull();
  });
});

/** A long drive: `n` fixes 1 s apart heading north, then east (one turn). */
function bigDrive(n: number): WireFix[] {
  const out: WireFix[] = [];
  const half = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    const lat = 52 + Math.min(i, half) * 0.00009; // ~10 m per fix, 70 mph
    const lng = -1 + Math.max(0, i - half) * 0.00015;
    out.push({ lat, lng, recorded_at: iso(T0 + i * 1000) });
  }
  return out;
}

describe("downsampleCoordinates / prepareCoordinatesForServer", () => {
  it("leaves a normal recording alone", () => {
    const d = bigDrive(3000);
    expect(downsampleCoordinates(d)).toEqual(d);
    expect(prepareCoordinatesForServer(d).coords).toEqual(d);
  });

  it("brings 50,000 fixes under the server cap, keeping the ends and the turn", () => {
    const d = bigDrive(50_000);
    const out = downsampleCoordinates(d);
    expect(out.length).toBeLessThanOrEqual(COORDINATE_TARGET);
    expect(out.length).toBeLessThan(SERVER_MAX_COORDINATES);
    expect(out[0]).toBe(d[0]);
    expect(out[out.length - 1]).toBe(d[d.length - 1]);
    // In time order, no repeats.
    for (let i = 1; i < out.length; i++) expect(out[i].recorded_at > out[i - 1].recorded_at).toBe(true);
    // The corner (the turn from north to east) is still on the line: some kept
    // fix lies within 150 m of it.
    const corner = d[25_000];
    const near = out.some((f) => Math.hypot((f.lat - corner.lat) * 111_000, (f.lng - corner.lng) * 68_000) < 150);
    expect(near).toBe(true);
  });

  it("falls back to every Nth fix when the fixes are all far apart", () => {
    const far: WireFix[] = [];
    for (let i = 0; i < 25_000; i++) far.push({ lat: 40 + i * 0.05, lng: 0, recorded_at: iso(T0 + i * 1000) });
    const out = downsampleCoordinates(far);
    expect(out.length).toBeLessThanOrEqual(COORDINATE_TARGET);
    expect(out[0]).toBe(far[0]);
    expect(out[out.length - 1]).toBe(far[far.length - 1]);
  });

  it("a 20,001-fix recording is sendable (it was a 400 before)", () => {
    const out = prepareCoordinatesForServer(bigDrive(20_001)).coords;
    expect(out.length).toBeLessThanOrEqual(SERVER_MAX_COORDINATES);
  });

  it("drops a fix whose timestamp cannot be parsed, not the whole drive", () => {
    const d = bigDrive(10);
    d[4] = { ...d[4], recorded_at: "not a time" };
    d[7] = { ...d[7], recorded_at: String(T0 + 7000) };
    const r = prepareCoordinatesForServer(d);
    expect(r.droppedBadTime).toBe(1);
    expect(r.coords).toHaveLength(9);
    expect(r.coords.map((c) => c.recorded_at)).toContain(iso(T0 + 7000));
  });

  it("does not compute distance: the caller's sum over the full set is what is sent", () => {
    // Thinning never changes how far the drive went as the caller measured it;
    // this only pins that the function takes fixes, not a distance.
    expect(prepareCoordinatesForServer(bigDrive(50_000)).beforeThinning).toBe(50_000);
  });
});

// ── The flight cut across a mid-finalize kill ─────────────────────────────

describe("planFlightCut", () => {
  const EDI = { lat: 55.95, lng: -3.37 };
  const LHR = { lat: 51.47, lng: -0.45 };

  /** A short hop: drive to the airport, 50 min flight (dense, 30 s fixes),
   *  drive away from the far airport. Both drives are 20 minutes. */
  function shortHop() {
    const fixes: Array<WireFix & { speed: number | null }> = [];
    let t = T0;
    const push = (lat: number, lng: number) => fixes.push({ lat, lng, speed: null, recorded_at: iso(t) });
    for (let i = 0; i < 40; i++) { push(EDI.lat - 0.05 + i * 0.00125, EDI.lng); t += 30_000; } // to the airport
    const flightStart = t;
    const steps = 100; // 50 minutes at 30 s
    for (let i = 1; i <= steps; i++) {
      push(EDI.lat + (LHR.lat - EDI.lat) * (i / steps), EDI.lng + (LHR.lng - EDI.lng) * (i / steps));
      t = flightStart + i * 30_000;
    }
    t += 30_000;
    for (let i = 0; i < 40; i++) { push(LHR.lat + i * 0.00125, LHR.lng); t += 30_000; } // away
    return fixes;
  }

  const planFor = (coords: ReturnType<typeof shortHop>, stored = parseFlightCutState(null)) => {
    const spans = findFlights(coords);
    return { spans, plan: planFlightCut(coords, spans, stored, (c) => cutFlights(c, spans)) };
  };

  it("cuts the flight, marks the leg start, and reports it", () => {
    const coords = shortHop();
    const { spans, plan } = planFor(coords);
    expect(spans).toHaveLength(1);
    expect(plan.kept.length).toBeLessThan(coords.length - 80);
    expect(plan.legStartIdx.size).toBe(1);
    const [i] = [...plan.legStartIdx];
    expect(plan.state.after).toEqual([plan.kept[i].recorded_at]);
    expect(plan.toReport).toEqual([0]);
    expect(plan.deleteRanges).toHaveLength(1);
  });

  it("a re-run after the airborne fixes were deleted still splits the legs and does not report twice", () => {
    const coords = shortHop();
    const first = planFor(coords);
    // What the buffer holds after run 1 deleted the airborne fixes and the
    // process was killed before saving anything.
    const rerunCoords = first.plan.kept;
    const second = planFor(rerunCoords as typeof coords, first.plan.state);
    expect(second.plan.legStartIdx.size).toBe(1);
    const [i] = [...second.plan.legStartIdx];
    expect(second.plan.kept[i].recorded_at).toBe(first.plan.kept[[...first.plan.legStartIdx][0]].recorded_at);
    expect(second.plan.toReport).toEqual([]); // reported already
  });

  it("the marker alone is enough when the rule no longer sees a flight", () => {
    const coords = shortHop();
    const first = planFor(coords);
    const withoutRule = planFlightCut(first.plan.kept, [], first.plan.state, (c) => ({ kept: c.slice(), legStarts: [] }));
    expect(withoutRule.legStartIdx.size).toBe(1);
  });

  it("a buffer with no flight and no marker is untouched", () => {
    const d = bigDrive(100).map((f) => ({ ...f, speed: null }));
    const p = planFlightCut(d, [], parseFlightCutState(null), (c) => ({ kept: c.slice(), legStarts: [] }));
    expect(p.kept).toEqual(d);
    expect(p.legStartIdx.size).toBe(0);
    expect(p.deleteRanges).toEqual([]);
  });

  it("deferred legs survive the consume path: only markers behind the processed leg are dropped", () => {
    const coords = shortHop();
    const { plan } = planFor(coords);
    const afterAt = plan.state.after[0];
    // Leg 1 (drive to the airport) is processed and consumed: its last fix is
    // the boundary BEFORE the flight. The marker for leg 2 must stay.
    const legOneLast = plan.kept[[...plan.legStartIdx][0] - 1].recorded_at;
    const left = pruneFlightCutState(plan.state, legOneLast);
    expect(left.after).toEqual([afterAt]);
    expect(left.reported).toHaveLength(1);
    // Then leg 2 is processed up to its last fix: nothing is left to remember.
    const legTwoLast = plan.kept[plan.kept.length - 1].recorded_at;
    expect(pruneFlightCutState(left, legTwoLast)).toEqual({ after: [], reported: [] });
    // A full consume clears everything.
    expect(pruneFlightCutState(plan.state, null)).toEqual({ after: [], reported: [] });
  });

  it("reads a damaged stored state as empty", () => {
    expect(parseFlightCutState("{not json")).toEqual({ after: [], reported: [] });
    expect(parseFlightCutState('{"after":[1,"a"],"reported":"x"}')).toEqual({ after: ["a"], reported: [] });
  });
});
