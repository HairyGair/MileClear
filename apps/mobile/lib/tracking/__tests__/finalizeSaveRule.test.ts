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
  normaliseRecordedAt,
  parseFlightCutState,
  planFlightCut,
  prepareCoordinatesForServer,
  pruneFlightCutState,
  trimBadEndpoints,
  type WireFix,
} from "../finalizeSaveRule";
import { cutFlights, findFlights } from "../flightRule";
import { ApiError } from "../../api/apiError";
import { isKeepAndBackOffRejection, isKnownGarbageRejection } from "../../sync/errors";

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

describe("which refusals clear the drive and which hand it to the queue", () => {
  const clockAhead = new ApiError({ code: "VALIDATION", message: "Start date cannot be in the future", statusCode: 400, retryable: false });
  const flight = new ApiError({ code: "VALIDATION", message: "Distance exceeds reasonable limit", statusCode: 400, retryable: false });

  it("a clock-ahead 400 is not known garbage: it is queued, never cleared", () => {
    expect(isKnownGarbageRejection(clockAhead)).toBe(false);
    expect(isKeepAndBackOffRejection(clockAhead)).toBe(true);
  });
  it("only the distance verdict clears", () => {
    expect(isKnownGarbageRejection(flight)).toBe(true);
    expect(isKeepAndBackOffRejection(flight)).toBe(false);
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

describe("trimBadEndpoints (one bad end fix must not make a short drive look like thousands of miles)", () => {
  const drive = (n: number): WireFix[] =>
    Array.from({ length: n }, (_, i) => ({ lat: 52 + i * 0.0009, lng: -1, recorded_at: iso(T0 + i * 10_000) })); // ~35 mph

  it("leaves a normal drive alone", () => {
    const d = drive(30);
    const r = trimBadEndpoints(d);
    expect(r.dropped).toBe(0);
    expect(r.coords).toEqual(d);
  });

  it("drops a cold-start 0,0 first fix", () => {
    const d = drive(30);
    d[0] = { lat: 0, lng: 0, recorded_at: d[0].recorded_at };
    const r = trimBadEndpoints(d);
    expect(r.dropped).toBe(1);
    expect(r.coords[0]).toBe(d[1]);
  });

  it("drops a stale far-away first fix and a far-away last fix", () => {
    const d = drive(30);
    d[0] = { lat: 40, lng: 10, recorded_at: d[0].recorded_at };
    d[29] = { lat: 60, lng: -8, recorded_at: d[29].recorded_at };
    const r = trimBadEndpoints(d);
    expect(r.dropped).toBe(2);
    expect(r.coords[0]).toBe(d[1]);
    expect(r.coords[r.coords.length - 1]).toBe(d[28]);
  });

  it("the trimmed drive is a few hundred metres, not thousands of miles", () => {
    const d = drive(30);
    d[0] = { lat: 0, lng: 0, recorded_at: d[0].recorded_at };
    const km = (a: WireFix, b: WireFix) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 68);
    const sum = (c: WireFix[]) => c.slice(1).reduce((t, f, i) => t + km(c[i], f), 0);
    expect(sum(d) / 1.609).toBeGreaterThan(2000); // as it would be sent
    expect(sum(trimBadEndpoints(d).coords) / 1.609).toBeLessThan(5);
  });

  it("keeps a late-wake departure anchor planted up to 5 km before the first real fix, 30 s earlier", () => {
    for (const km of [2.7, 3, 5]) {
      const d = drive(30);
      // Anchor: km kilometres south of the first real fix, 30 s before it.
      const anchor = { lat: d[0].lat - km / 111.2, lng: -1, recorded_at: iso(T0 - 30_000) };
      expect(trimBadEndpoints([anchor, ...d]).dropped).toBe(0);
    }
  });

  it("keeps a last fix that settles a few hundred metres away seconds later", () => {
    const d = drive(30);
    d.push({ lat: d[29].lat + 0.25 / 111.2, lng: -1, recorded_at: iso(T0 + 29 * 10_000 + 2_000) });
    expect(trimBadEndpoints(d).dropped).toBe(0);
  });

  it("keeps a real drive whose start is a long gap away (slow, not fast)", () => {
    const d = drive(30);
    d[0] = { lat: 52 - 0.1, lng: -1, recorded_at: iso(T0 - 30 * 60_000) }; // 7 miles in 30 min
    expect(trimBadEndpoints(d).dropped).toBe(0);
  });

  it("does not strip a trace that is genuinely too long (the cap check still clears it)", () => {
    const flightLike = [0, 1, 2, 3].map((i) => ({ lat: 40 + i * 2, lng: 0, recorded_at: iso(T0 + i * 3_600_000) }));
    expect(trimBadEndpoints(flightLike).dropped).toBe(0);
  });
});
