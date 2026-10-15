import { describe, it, expect } from "vitest";
import type { CreateTripData } from "../../api/trips";
import type { DropInput } from "../recordingDropRule";
import { isLostReason } from "../recordingDropRule";
import { arrivalEndIndex, cleanTraceForSave, tripWireTimes } from "../finalizeSaveRule";
import {
  planRescueHandoff,
  rescueBufferBeforeOpen,
  splitLegs,
  type BufferedFix,
  type RescueDeps,
} from "../rescueHandoff";

const SPLIT_MS = 30 * 60 * 1000;
const T0 = Date.parse("2026-10-14T07:00:00.000Z");

/** A drive heading north at ~30 mph, one fix every 10 s. */
function drive(startMs: number, minutes: number, startLat = 51.5): BufferedFix[] {
  const out: BufferedFix[] = [];
  const n = Math.round((minutes * 60) / 10);
  for (let i = 0; i <= n; i++) {
    out.push({
      lat: startLat + i * 0.0012, // ~133 m per 10 s, about 30 mph
      lng: -0.12,
      speed: 13.4,
      accuracy: 8,
      recorded_at: new Date(startMs + i * 10_000).toISOString(),
    });
  }
  return out;
}

/** A parked phone: a few fixes within metres of each other. */
function parked(startMs: number, count: number, stepSec = 20): BufferedFix[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: 51.5 + (i % 2) * 0.00001,
    lng: -0.12,
    speed: 0,
    accuracy: 10,
    recorded_at: new Date(startMs + i * stepSec * 1000).toISOString(),
  }));
}

function harness(buffer: BufferedFix[], opts: { finalizeThrows?: Error; queueThrows?: Error; saved?: { id: string; startedMs: number; endedMs: number }[] } = {}) {
  const queued: CreateTripData[] = [];
  const drops: DropInput[] = [];
  const events: string[] = [];
  let finalized = 0;
  const deps: RescueDeps = {
    finalize: async () => {
      finalized++;
      if (opts.finalizeThrows) throw opts.finalizeThrows;
    },
    readBuffer: async () => buffer,
    readLegStarts: async () => [],
    readSavedTrips: async () => opts.saved ?? [],
    queueCreate: async (body) => {
      if (opts.queueThrows) throw opts.queueThrows;
      queued.push(body);
    },
    noteDrop: async (d) => {
      drops.push(d);
    },
    isFinalizeInFlight: () => false,
    waitForFinalize: () => Promise.resolve(),
    log: (e) => events.push(e),
    splitMs: SPLIT_MS,
  };
  return { deps, queued, drops, events, finalizedCount: () => finalized };
}

/** A walk at 3 mph with the coprocessor saying "walking": 30 minutes, 1.5 mi. */
function walk(startMs: number): BufferedFix[] {
  return Array.from({ length: 121 }, (_, i) => ({
    lat: 51.5 + i * 0.00018, // ~20 m per 15 s
    lng: -0.12,
    speed: 1.34,
    accuracy: 8,
    activity: "walking",
    activity_confidence: 100,
    recorded_at: new Date(startMs + i * 15_000).toISOString(),
  }));
}

describe("rescueBufferBeforeOpen", () => {
  it("a failed rescue keeps the drive: it is queued for upload, not cleared", async () => {
    const buffer = drive(T0, 20);
    const h = harness(buffer, { finalizeThrows: new Error("database is locked") });
    const outcome = await rescueBufferBeforeOpen(h.deps);
    expect(h.finalizedCount()).toBe(1);
    expect(outcome).toEqual({ kind: "handed_off", queued: 1, cleared: 0, readIds: [] });
    expect(h.queued).toHaveLength(1);
    const body = h.queued[0];
    expect(body.startedAt).toBe(buffer[0].recorded_at);
    expect(body.endedAt).toBe(buffer[buffer.length - 1].recorded_at);
    expect(body.distanceMiles).toBeGreaterThan(9);
    expect(body.recordedBy).toBe("automatic");
    expect(body.classification).toBe("unclassified");
    expect(body.coordinates?.length).toBe(buffer.length);
    // Reported honestly: kept, not lost.
    expect(h.drops.map((d) => d.reason)).toEqual(["rescued_to_queue"]);
    expect(h.drops[0].detail).toMatch(/database is locked/);
    expect(isLostReason("rescued_to_queue")).toBe(false);
  });

  it("also hands off when finalize returned quietly but left the recording behind", async () => {
    const h = harness(drive(T0, 12));
    const outcome = await rescueBufferBeforeOpen(h.deps);
    expect(outcome.kind).toBe("handed_off");
    expect(h.queued).toHaveLength(1);
  });

  it("does nothing more when finalize emptied the buffer", async () => {
    const h = harness([]);
    expect(await rescueBufferBeforeOpen(h.deps)).toEqual({ kind: "saved" });
    expect(h.queued).toEqual([]);
    expect(h.drops).toEqual([]);
  });

  it("keeps the buffer (no clear) when the drive cannot be queued either", async () => {
    const h = harness(drive(T0, 20), { finalizeThrows: new Error("disk I/O error"), queueThrows: new Error("disk I/O error") });
    expect(await rescueBufferBeforeOpen(h.deps)).toEqual({ kind: "keep" });
    expect(h.drops).toEqual([]);
    expect(h.events).toContain("rescue_handoff_queue_failed");
  });

  it("keeps the buffer when it cannot even be read", async () => {
    const h = harness([]);
    h.deps.readBuffer = async () => {
      throw new Error("db closed");
    };
    expect(await rescueBufferBeforeOpen(h.deps)).toEqual({ kind: "keep" });
  });

  it("clears parked leftovers as before instead of queueing junk", async () => {
    const h = harness(parked(T0, 6), { finalizeThrows: new Error("boom") });
    expect(await rescueBufferBeforeOpen(h.deps)).toEqual({ kind: "handed_off", queued: 0, cleared: 1, readIds: [] });
    expect(h.queued).toEqual([]);
    expect(h.drops.map((d) => d.reason)).toEqual(["stale_buffer_cleared"]);
  });

  it("does not queue a drive the trip list already has (no duplicate)", async () => {
    const buffer = drive(T0, 20);
    const h = harness(buffer, {
      finalizeThrows: new Error("threw after the save"),
      saved: [{ id: "t1", startedMs: T0, endedMs: T0 + 20 * 60_000 }],
    });
    expect(await rescueBufferBeforeOpen(h.deps)).toEqual({ kind: "handed_off", queued: 0, cleared: 1, readIds: [] });
    expect(h.queued).toEqual([]);
    expect(h.drops.map((d) => d.reason)).toEqual(["deduped"]);
  });

  it("queues each leg of a buffer holding two drives as its own trip", async () => {
    const morning = drive(T0, 15);
    const later = drive(T0 + 3 * 60 * 60_000, 10, 51.7);
    const h = harness([...morning, ...later], { finalizeThrows: new Error("boom") });
    expect(await rescueBufferBeforeOpen(h.deps)).toEqual({ kind: "handed_off", queued: 2, cleared: 0, readIds: [] });
    expect(h.queued.map((b) => b.startedAt)).toEqual([morning[0].recorded_at, later[0].recorded_at]);
  });
});

describe("planRescueHandoff", () => {
  it("starts the queued trip on the first buffered fix, as finalize does, so the start-time dedup matches", () => {
    const d = drive(T0, 10);
    const plan = planRescueHandoff(d, { splitMs: SPLIT_MS });
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0].startedAt).toBe(d[0].recorded_at);
  });

  it("clears a leftover over the server's distance cap, as finalize does", () => {
    // 2,500 miles at a steady 100 mph: not a flight (too slow), not a drive
    // the server will take.
    const long: BufferedFix[] = Array.from({ length: 301 }, (_, i) => ({
      lat: 10 + i * 0.12,
      lng: 20,
      speed: 44,
      accuracy: 8,
      recorded_at: new Date(T0 + i * 5 * 60_000).toISOString(),
    }));
    const plan = planRescueHandoff(long, { splitMs: SPLIT_MS });
    expect(plan.legs).toEqual([]);
    expect(plan.skipped[0].why).toBe("implausible_distance");
  });

  it("ends the queued trip at the arrival, not at a fix after a long parked gap", () => {
    const d = drive(T0, 10);
    const lateFix: BufferedFix = { ...d[d.length - 1], recorded_at: new Date(T0 + 25 * 60_000).toISOString() };
    const plan = planRescueHandoff([...d, lateFix], { splitMs: SPLIT_MS });
    expect(plan.legs[0].endedAt).toBe(d[d.length - 1].recorded_at);
  });

  it("clears what finalize would never save", () => {
    // Momentary: a few seconds, a few metres.
    expect(planRescueHandoff(parked(T0, 3, 5), { splitMs: SPLIT_MS }).skipped[0].why).toBe("phantom");
    // Under the shortest trip we save: about 0.2 miles.
    const short = drive(T0, 0.2 * 6); // ~1.2 min at 30 mph
    expect(planRescueHandoff(short.slice(0, 4), { splitMs: SPLIT_MS }).skipped[0].why).toBe("too_short");
    // A lone fix.
    expect(planRescueHandoff(parked(T0, 1), { splitMs: SPLIT_MS }).skipped[0].why).toBe("no_coords");
  });

  it("splits at a cut flight even without a long gap", () => {
    const a = drive(T0, 5);
    const b = drive(T0 + 6 * 60_000, 5, 52.5);
    const legs = splitLegs([...a, ...b], SPLIT_MS, new Set([b[0].recorded_at]));
    expect(legs).toHaveLength(2);
  });

  it("cuts a flight out: never queued as a car trip, and the car legs either side are kept", () => {
    // Drive to the airport, a 450-mile hop, drive away. The journey boundary
    // is long enough here that only the flight cut can split them.
    const toAirport = drive(T0, 10);
    const lastGround = Date.parse(toAirport[toAirport.length - 1].recorded_at);
    const fromAirport = drive(lastGround + 90 * 60_000, 10, 58.0);
    const plan = planRescueHandoff([...toAirport, ...fromAirport], { splitMs: 3 * 60 * 60_000 });
    expect(plan.skipped.map((s) => s.why)).toContain("flight");
    expect(plan.legs).toHaveLength(2);
    expect(plan.legs[0].startedAt).toBe(toAirport[0].recorded_at);
    // The flight rule's landing shoulder may take the first fix or two.
    const secondStart = Date.parse(plan.legs[1].startedAt);
    expect(secondStart).toBeGreaterThanOrEqual(Date.parse(fromAirport[0].recorded_at));
    expect(secondStart).toBeLessThan(Date.parse(fromAirport[0].recorded_at) + 60_000);
    expect(plan.legs.every((l) => l.distanceMiles < 20)).toBe(true);
  });

  it("does not queue a walk over a mile as a trip", () => {
    const plan = planRescueHandoff(walk(T0), { splitMs: SPLIT_MS });
    expect(plan.legs).toEqual([]);
    expect(plan.skipped[0].why).toBe("walk");
    expect(plan.skipped[0].distanceMiles).toBeGreaterThan(1);
  });

  it("gives the queued trip the startedAt finalize computes for the same buffer (shared helpers)", () => {
    // Raw native epoch-ms timestamps and a parked tail: both shape the ends.
    const d = drive(T0, 12).map((f) => ({ ...f, recorded_at: String(Date.parse(f.recorded_at)) }));
    const tail = { ...d[d.length - 1], speed: 0, recorded_at: String(T0 + 40 * 60_000) };
    const raw = [...d, tail];
    const plan = planRescueHandoff(raw, { splitMs: 60 * 60_000 });
    // What _finalizeAutoTripInner does with the same leg.
    const trimmed = raw.slice(0, arrivalEndIndex(raw) + 1);
    const expected = tripWireTimes(cleanTraceForSave(trimmed).coords);
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0].startedAt).toBe(expected?.startedAt);
    expect(plan.legs[0].endedAt).toBe(expected?.endedAt);
    expect(plan.legs[0].startedAt).toBe(new Date(T0).toISOString());
    expect(plan.legs[0].endedAt).toBe(new Date(Date.parse(drive(T0, 12).slice(-1)[0].recorded_at)).toISOString());
  });
});

describe("rescueBufferBeforeOpen, racing another save", () => {
  it("waits for a save already running when finalize returns as a no-op, then hands off only what is left", async () => {
    const buffer = drive(T0, 20);
    const h = harness(buffer);
    let running = true;
    let finish: () => void = () => {};
    const done = new Promise<void>((res) => {
      finish = () => {
        running = false;
        // The running pass saved the drive and emptied the buffer.
        buffer.length = 0;
        res();
      };
    });
    h.deps.isFinalizeInFlight = () => running;
    h.deps.waitForFinalize = () => (running ? done : Promise.resolve());
    // finalize() returns at once: the guard is held by the other pass.
    const pending = rescueBufferBeforeOpen(h.deps);
    await new Promise((r) => setTimeout(r, 5));
    expect(h.queued).toEqual([]);
    finish();
    expect(await pending).toEqual({ kind: "saved" });
    expect(h.queued).toEqual([]);
  });

  it("keeps the buffer (no clear) when a save is still running after the wait", async () => {
    const h = harness(drive(T0, 20));
    h.deps.isFinalizeInFlight = () => true;
    expect(await rescueBufferBeforeOpen(h.deps)).toEqual({ kind: "keep" });
    expect(h.queued).toEqual([]);
    expect(h.events).toContain("rescue_handoff_finalize_busy");
  });

  it("finalize catching the error itself and returning with the fixes still buffered: the drive is queued", async () => {
    // The real finalize logs finalize_save_failed, keeps the fixes and
    // returns normally; it does not throw.
    const buffer = drive(T0, 25);
    const h = harness(buffer);
    let calls = 0;
    h.deps.finalize = async () => {
      calls++;
    };
    const outcome = await rescueBufferBeforeOpen(h.deps);
    expect(calls).toBe(1);
    expect(outcome).toEqual({ kind: "handed_off", queued: 1, cleared: 0, readIds: [] });
    expect(h.queued[0].startedAt).toBe(buffer[0].recorded_at);
    expect(h.drops.map((d) => d.reason)).toEqual(["rescued_to_queue"]);
  });

  it("returns exactly the row ids it read, so a fix added afterwards is not deleted", async () => {
    const buffer = drive(T0, 10).map((f, i) => ({ ...f, id: 100 + i }));
    const h = harness(buffer, { finalizeThrows: new Error("boom") });
    const outcome = await rescueBufferBeforeOpen(h.deps);
    expect(outcome.kind).toBe("handed_off");
    if (outcome.kind === "handed_off") {
      expect(outcome.readIds).toEqual(buffer.map((f) => f.id));
    }
  });

  it("hands off without a save when End asks it to (finalize null)", async () => {
    const h = harness(drive(T0, 10));
    h.deps.finalize = null;
    expect((await rescueBufferBeforeOpen(h.deps)).kind).toBe("handed_off");
    expect(h.finalizedCount()).toBe(0);
    expect(h.queued).toHaveLength(1);
  });

  it("reports a walk with finalize's own drop reason", async () => {
    const h = harness(walk(T0), { finalizeThrows: new Error("boom") });
    await rescueBufferBeforeOpen(h.deps);
    expect(h.drops.map((d) => d.reason)).toEqual(["walk"]);
  });
});
