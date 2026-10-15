import { describe, it, expect } from "vitest";
import type { CreateTripData } from "../../api/trips";
import type { DropInput } from "../recordingDropRule";
import { isLostReason } from "../recordingDropRule";
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
    log: (e) => events.push(e),
    splitMs: SPLIT_MS,
  };
  return { deps, queued, drops, events, finalizedCount: () => finalized };
}

describe("rescueBufferBeforeOpen", () => {
  it("a failed rescue keeps the drive: it is queued for upload, not cleared", async () => {
    const buffer = drive(T0, 20);
    const h = harness(buffer, { finalizeThrows: new Error("database is locked") });
    const outcome = await rescueBufferBeforeOpen(h.deps);
    expect(h.finalizedCount()).toBe(1);
    expect(outcome).toEqual({ kind: "handed_off", queued: 1, cleared: 0 });
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
    expect(await rescueBufferBeforeOpen(h.deps)).toEqual({ kind: "handed_off", queued: 0, cleared: 1 });
    expect(h.queued).toEqual([]);
    expect(h.drops.map((d) => d.reason)).toEqual(["stale_buffer_cleared"]);
  });

  it("does not queue a drive the trip list already has (no duplicate)", async () => {
    const buffer = drive(T0, 20);
    const h = harness(buffer, {
      finalizeThrows: new Error("threw after the save"),
      saved: [{ id: "t1", startedMs: T0, endedMs: T0 + 20 * 60_000 }],
    });
    expect(await rescueBufferBeforeOpen(h.deps)).toEqual({ kind: "handed_off", queued: 0, cleared: 1 });
    expect(h.queued).toEqual([]);
    expect(h.drops.map((d) => d.reason)).toEqual(["deduped"]);
  });

  it("queues each leg of a buffer holding two drives as its own trip", async () => {
    const morning = drive(T0, 15);
    const later = drive(T0 + 3 * 60 * 60_000, 10, 51.7);
    const h = harness([...morning, ...later], { finalizeThrows: new Error("boom") });
    expect(await rescueBufferBeforeOpen(h.deps)).toEqual({ kind: "handed_off", queued: 2, cleared: 0 });
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
    const a: BufferedFix = { lat: 51.5, lng: -0.12, speed: 20, accuracy: 8, recorded_at: new Date(T0).toISOString() };
    const b: BufferedFix = { lat: 10, lng: 60, speed: 20, accuracy: 8, recorded_at: new Date(T0 + 20 * 60_000).toISOString() };
    const plan = planRescueHandoff([a, b], { splitMs: SPLIT_MS });
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
});
