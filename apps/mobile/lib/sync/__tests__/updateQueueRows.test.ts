/**
 * An immediate update settles only its own queue row (22 Oct 2026).
 *
 * Before: a successful PATCH marked EVERY pending update for the trip as
 * sent, so a coordinate merge that had failed offline was silently lost the
 * moment a later classification tap (or the Directions note) got through.
 * Now the earlier update stays queued and is retried by the queue, losing
 * only the fields the newer update has just set.
 *
 * Runs the real enqueueSync, syncUpdateTrip and processSyncQueue against a
 * small in-memory sync_queue.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type QRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: string | null;
  status: string;
  retry_count: number;
  created_at: string;
  updated_at: string;
};

const h = vi.hoisted(() => {
  const queue: QRow[] = [];
  let n = 0;
  const db = {
    runAsync: vi.fn(async (sql: string, args: unknown[] = []) => {
      if (sql.startsWith("INSERT INTO sync_queue")) {
        const [id, entity_type, entity_id, action, payload, created_at, updated_at] = args as string[];
        queue.push({ id, entity_type, entity_id, action, payload, status: "pending", retry_count: 0, created_at, updated_at });
        return;
      }
      let m = /^UPDATE sync_queue SET status = 'synced', updated_at = \? WHERE id = \?( AND status = 'pending')?$/.exec(sql);
      if (m) {
        const r = queue.find((q) => q.id === args[1] && (!m![1] || q.status === "pending"));
        if (r) r.status = "synced";
        return;
      }
      m = /^UPDATE sync_queue SET payload = \?, updated_at = \? WHERE id = \?$/.exec(sql);
      if (m) {
        const r = queue.find((q) => q.id === args[2]);
        if (r) r.payload = args[0] as string;
        return;
      }
      if (sql.startsWith("UPDATE sync_queue SET status = 'synced'")) throw new Error(`unexpected bulk settle: ${sql}`);
      // Local trip writes and anything else: not this test's business.
    }),
    getFirstAsync: vi.fn(async (sql: string) => {
      if (sql.includes("FROM trips WHERE id")) return { synced_at: "2026-10-22T09:00:00.000Z", classification: "unclassified", classification_source: null };
      if (sql.includes("COUNT(*)")) return { count: queue.filter((q) => q.status !== "synced").length };
      return null;
    }),
    getAllAsync: vi.fn(async (sql: string, args: unknown[] = []) => {
      if (sql.includes("SELECT id, payload FROM sync_queue")) {
        const [type, entity, self] = args as string[];
        const mine = queue.find((q) => q.id === self)!;
        return queue
          .filter(
            (q) =>
              q.entity_type === type &&
              q.entity_id === entity &&
              q.action === "update" &&
              (q.status === "pending" || q.status === "failed") &&
              q.id !== self &&
              q.created_at < mine.created_at
          )
          .map((q) => ({ id: q.id, payload: q.payload }));
      }
      if (/FROM sync_queue\s+WHERE status IN/.test(sql)) return queue.filter((q) => q.status === "pending" || q.status === "failed");
      return [];
    }),
    execAsync: vi.fn(async (sql: string) => {
      for (const m of sql.matchAll(/UPDATE sync_queue SET status = 'synced', updated_at = '[^']*' WHERE id = '([^']+)'/g)) {
        const r = queue.find((q) => q.id === m[1]);
        if (r) r.status = "synced";
      }
    }),
  };
  return { queue, db, apiRequest: vi.fn(), uuid: () => `q${++n}` };
});

vi.mock("expo-crypto", () => ({ randomUUID: () => h.uuid() }));
vi.mock("../../db/index", () => ({ getDatabase: () => Promise.resolve(h.db) }));
vi.mock("../../api/index", () => ({ apiRequest: h.apiRequest }));
vi.mock("react-native", () => ({ AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock("../../network", () => ({ isOnline: () => true, onConnectivityChange: () => () => undefined }));
vi.mock("../../classification", () => ({ learnFromClassification: vi.fn() }));

import { syncUpdateTrip } from "../actions";
import { processSyncQueue } from "../index";

const T = Date.parse("2026-10-22T10:00:00.000Z");
const crumbs = [{ lat: 51.5, lng: -0.1, speed: 10, accuracy: 5, recordedAt: "2026-10-22T09:59:00.000Z" }];

beforeEach(() => {
  h.queue.length = 0;
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T);
});
afterEach(() => vi.useRealTimers());


describe("two updates for one trip, the first fails and the second succeeds", () => {
  it("the first stays pending, keeps its fields, and the queue retries it", async () => {
    // 1. A merge's breadcrumbs and distance, offline.
    h.apiRequest.mockRejectedValueOnce(new Error("Network request failed"));
    await syncUpdateTrip("trip-1", { coordinates: crumbs, distanceMiles: 12.4, endedAt: "2026-10-22T09:59:00.000Z" });
    // 2. A classification tap a minute later, which gets through.
    vi.setSystemTime(T + 60_000);
    h.apiRequest.mockResolvedValueOnce({ data: { id: "trip-1" } });
    await syncUpdateTrip("trip-1", { classification: "business" });

    expect(h.queue.map((q) => q.status)).toEqual([
      "pending",
      "synced",
    ]);
    expect(JSON.parse(h.queue[0].payload!)).toEqual({
      id: "trip-1",
      coordinates: crumbs,
      distanceMiles: 12.4,
      endedAt: "2026-10-22T09:59:00.000Z",
    });

    // The queue sends it again.
    h.apiRequest.mockResolvedValueOnce({ data: { id: "trip-1" } });
    await processSyncQueue();
    const retry = h.apiRequest.mock.calls.at(-1)!;
    expect(retry[0]).toBe("/trips/trip-1");
    expect(JSON.parse(retry[1].body)).toMatchObject({ coordinates: crumbs, distanceMiles: 12.4 });
    expect(h.queue[0].status).toBe("synced");
  });

  it("an older update loses only the fields the newer one set, so it can never undo it", async () => {
    h.apiRequest.mockRejectedValueOnce(new Error("Network request failed"));
    await syncUpdateTrip("trip-1", { classification: "personal", notes: "school run" });
    vi.setSystemTime(T + 60_000);
    h.apiRequest.mockResolvedValueOnce({ data: { id: "trip-1" } });
    await syncUpdateTrip("trip-1", { classification: "business" });
    expect(h.queue[0].status).toBe("pending");
    expect(JSON.parse(h.queue[0].payload!)).toEqual({ id: "trip-1", notes: "school run" });
  });

  it("an older update with nothing left to send is marked sent, as before", async () => {
    h.apiRequest.mockRejectedValueOnce(new Error("Network request failed"));
    await syncUpdateTrip("trip-1", { classification: "personal" });
    vi.setSystemTime(T + 60_000);
    h.apiRequest.mockResolvedValueOnce({ data: { id: "trip-1" } });
    await syncUpdateTrip("trip-1", { classification: "business" });
    expect(h.queue.map((q) => q.status)).toEqual(["synced", "synced"]);
  });

  it("breadcrumbs and gpsQuality are never taken off an older update", async () => {
    h.apiRequest.mockRejectedValueOnce(new Error("Network request failed"));
    await syncUpdateTrip("trip-1", { coordinates: crumbs, gpsQuality: { driverKeptGoing: true } });
    vi.setSystemTime(T + 60_000);
    h.apiRequest.mockResolvedValueOnce({ data: { id: "trip-1" } });
    await syncUpdateTrip("trip-1", { coordinates: crumbs, gpsQuality: { directions: { mode: "log" } } });
    expect(h.queue[0].status).toBe("pending");
    expect(JSON.parse(h.queue[0].payload!)).toEqual({ id: "trip-1", coordinates: crumbs, gpsQuality: { driverKeptGoing: true } });
  });

  it("a newer update queued after the one that succeeds is left alone", async () => {
    h.apiRequest.mockResolvedValueOnce({ data: { id: "trip-1" } });
    const first = syncUpdateTrip("trip-1", { classification: "business" });
    await first;
    vi.setSystemTime(T + 60_000);
    h.apiRequest.mockRejectedValueOnce(new Error("Network request failed"));
    await syncUpdateTrip("trip-1", { classification: "personal" });
    expect(h.queue.map((q) => q.status)).toEqual([
      "synced",
      "pending",
    ]);
    expect(JSON.parse(h.queue[1].payload!)).toEqual({ id: "trip-1", classification: "personal" });
  });
});
