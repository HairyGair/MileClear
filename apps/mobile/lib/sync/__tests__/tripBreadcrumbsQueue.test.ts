/**
 * Unsent breadcrumbs survive a later trip update (22 Oct 2026, narrow fix).
 *
 * A successful trip update still marks every pending update for that trip
 * as sent, exactly as before, EXCEPT that an unsent update carrying
 * coordinates (a phone merge that failed offline) is cut down to
 * { id, coordinates } and kept pending, so the queue sends the breadcrumbs.
 * Every other entity, and every refusal path, is unchanged: the SQL below is
 * main's, word for word.
 *
 * Runs the real enqueueSync, sync actions and processSyncQueue against a
 * small in-memory sync_queue (array order is rowid order).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type QRow = { id: string; entity_type: string; entity_id: string; action: string; payload: string | null; status: string; retry_count: number; created_at: string; updated_at: string };

const MAIN_TRIP_BLANKET =
  "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'trip' AND action = 'update' AND status = 'pending'";

const h = vi.hoisted(() => {
  const queue: QRow[] = [];
  let n = 0;
  const blanket = /^UPDATE sync_queue SET status = 'synced', updated_at = \? WHERE entity_id = \? AND entity_type = '(\w+)' AND action = 'update' AND status = 'pending'( AND id NOT IN \(([?, ]+)\))?$/;
  const db = {
    runAsync: vi.fn(async (sql: string, args: unknown[] = []) => {
      if (sql.startsWith("INSERT INTO sync_queue")) {
        const [id, entity_type, entity_id, action, payload, created_at, updated_at] = args as string[];
        queue.push({ id, entity_type, entity_id, action, payload, status: "pending", retry_count: 0, created_at, updated_at });
        return;
      }
      const b = blanket.exec(sql);
      if (b) {
        const keep = new Set((args as string[]).slice(2));
        for (const q of queue) {
          if (q.entity_id === args[1] && q.entity_type === b[1] && q.action === "update" && q.status === "pending" && !keep.has(q.id)) q.status = "synced";
        }
        return;
      }
      if (sql === "UPDATE sync_queue SET payload = ?, status = 'pending', updated_at = ? WHERE id = ?") {
        const r = queue.find((q) => q.id === args[2]);
        if (r) {
          r.payload = args[0] as string;
          r.status = "pending";
        }
        return;
      }
      const del = /^DELETE FROM sync_queue WHERE entity_id = \? AND entity_type = '(\w+)' AND action = 'update' AND status = 'pending'$/.exec(sql);
      if (del) {
        for (let i = queue.length - 1; i >= 0; i--) {
          const q = queue[i];
          if (q.entity_id === args[0] && q.entity_type === del[1] && q.action === "update" && q.status === "pending") queue.splice(i, 1);
        }
      }
    }),
    getFirstAsync: vi.fn(async (sql: string) => {
      if (sql.includes("FROM trips WHERE id")) return { synced_at: "2026-10-22T09:00:00.000Z", classification: "unclassified", classification_source: null };
      if (sql.includes("COUNT(*)")) return { count: queue.filter((q) => q.status !== "synced").length };
      return null;
    }),
    getAllAsync: vi.fn(async (sql: string, args: unknown[] = []) => {
      if (sql.includes("SELECT id, payload FROM sync_queue")) {
        expect(sql).toContain("ORDER BY rowid");
        expect(sql).not.toContain("created_at");
        const [entity, self] = args as string[];
        return queue
          .filter((q) => q.entity_type === "trip" && q.entity_id === entity && q.action === "update" && (q.status === "pending" || q.status === "failed") && q.id !== self)
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

import { syncUpdateTrip, syncUpdateEarning, syncUpdateFuelLog, syncEndShift, syncUpdateSavedLocation } from "../actions";
import { processSyncQueue } from "../index";
import { ApiError } from "../../api/apiError";

const crumbs = [{ lat: 51.5, lng: -0.1, speed: 10, accuracy: 5, recordedAt: "2026-10-22T09:59:00.000Z" }];
const offline = () => new Error("Network request failed");
const refused = () => new ApiError({ code: "BAD_REQUEST", message: "nope", statusCode: 400, retryable: false });
const runSql = () => h.db.runAsync.mock.calls.map((c) => [String(c[0]), c[1]]);

beforeEach(() => {
  h.queue.length = 0;
  vi.clearAllMocks();
});

describe("trips: unsent breadcrumbs are kept when a later update gets through", () => {
  it("(1, 4) the merge row is cut to { id, coordinates }, stays pending, and the queue sends exactly that", async () => {
    h.apiRequest.mockRejectedValueOnce(offline());
    await syncUpdateTrip("trip-1", { coordinates: crumbs, distanceMiles: 12.4, endedAt: "2026-10-22T09:59:00.000Z", endAddress: "Depot" });
    h.apiRequest.mockResolvedValueOnce({ data: { id: "trip-1" } });
    await syncUpdateTrip("trip-1", { classification: "business" });

    expect(h.queue.map((q) => q.status)).toEqual(["pending", "synced"]);
    expect(JSON.parse(h.queue[0].payload!)).toEqual({ id: "trip-1", coordinates: crumbs });

    h.apiRequest.mockResolvedValueOnce({ data: { id: "trip-1" } });
    await processSyncQueue();
    const [path, init] = h.apiRequest.mock.calls.at(-1)!;
    expect(path).toBe("/trips/trip-1");
    expect(init.method).toBe("PATCH");
    // Breadcrumbs only: the server appends them and skips any it already
    // holds, and nothing else on the trip is touched by the replay.
    expect(JSON.parse(init.body)).toEqual({ id: "trip-1", coordinates: crumbs });
    expect(h.queue[0].status).toBe("synced");
  });

  it("a failed merge row comes back to pending with only its breadcrumbs", async () => {
    h.apiRequest.mockRejectedValueOnce(offline());
    await syncUpdateTrip("trip-1", { coordinates: crumbs, distanceMiles: 12.4 });
    h.queue[0].status = "failed";
    h.queue[0].retry_count = 2;
    h.apiRequest.mockResolvedValueOnce({ data: { id: "trip-1" } });
    await syncUpdateTrip("trip-1", { notes: "x" });
    expect(h.queue[0]).toMatchObject({ status: "pending", retry_count: 2 });
    expect(JSON.parse(h.queue[0].payload!)).toEqual({ id: "trip-1", coordinates: crumbs });
  });

  it("(2) an older update without breadcrumbs is marked sent exactly as before", async () => {
    h.apiRequest.mockRejectedValueOnce(offline());
    await syncUpdateTrip("trip-1", { classification: "personal", notes: "school run" });
    h.apiRequest.mockResolvedValueOnce({ data: { id: "trip-1" } });
    await syncUpdateTrip("trip-1", { classification: "business" });
    expect(h.queue.map((q) => q.status)).toEqual(["synced", "synced"]);
    // With nothing to keep, the mark is main's statement, unchanged.
    const marks = runSql().filter(([q]) => q.startsWith("UPDATE sync_queue SET status = 'synced'"));
    expect(marks).toHaveLength(1);
    expect(marks[0][0]).toBe(MAIN_TRIP_BLANKET);
    expect((marks[0][1] as unknown[]).slice(1)).toEqual(["trip-1"]);
  });

  it("another trip's breadcrumbs are not this update's business", async () => {
    h.apiRequest.mockRejectedValueOnce(offline());
    await syncUpdateTrip("trip-2", { coordinates: crumbs, distanceMiles: 3 });
    h.apiRequest.mockResolvedValueOnce({ data: { id: "trip-1" } });
    await syncUpdateTrip("trip-1", { classification: "business" });
    expect(JSON.parse(h.queue[0].payload!)).toEqual({ id: "trip-2", coordinates: crumbs, distanceMiles: 3 });
  });

  it("a refused trip update is unchanged: nothing deleted, the error is thrown", async () => {
    h.apiRequest.mockRejectedValueOnce(refused());
    await expect(syncUpdateTrip("trip-1", { classification: "business" })).rejects.toBeInstanceOf(ApiError);
    expect(h.queue.map((q) => q.status)).toEqual(["pending"]);
  });
});

describe("(3) every other entity behaves exactly as main", () => {
  const cases = [
    { type: "earning", call: () => syncUpdateEarning("e-1", { amountPence: 1200 }), id: "e-1" },
    { type: "fuel_log", call: () => syncUpdateFuelLog("f-1", { litres: 30 }), id: "f-1" },
    { type: "shift", call: () => syncEndShift("s-1"), id: "s-1" },
    { type: "saved_location", call: () => syncUpdateSavedLocation("p-1", { name: "Depot" }), id: "p-1" },
  ] as const;

  for (const c of cases) {
    it(`${c.type}: success marks every pending update with main's statement`, async () => {
      h.queue.push({ id: "old", entity_type: c.type, entity_id: c.id, action: "update", payload: JSON.stringify({ id: c.id, coordinates: crumbs }), status: "pending", retry_count: 0, created_at: "x", updated_at: "x" });
      h.apiRequest.mockResolvedValueOnce({ data: { id: c.id } });
      await c.call();
      const mark = runSql().find(([q]) => q.startsWith("UPDATE sync_queue SET status = 'synced'"))!;
      expect(mark[0]).toBe(`UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = '${c.type}' AND action = 'update' AND status = 'pending'`);
      expect((mark[1] as unknown[]).slice(1)).toEqual([c.id]);
      expect(h.queue.map((q) => q.status)).toEqual(["synced", "synced"]);
      expect(h.db.getAllAsync).not.toHaveBeenCalled();
    });

    it(`${c.type}: a refusal deletes every pending update with main's statement`, async () => {
      h.queue.push({ id: "old", entity_type: c.type, entity_id: c.id, action: "update", payload: "{}", status: "pending", retry_count: 0, created_at: "x", updated_at: "x" });
      h.apiRequest.mockRejectedValueOnce(refused());
      await expect(c.call()).rejects.toBeInstanceOf(ApiError);
      const del = runSql().find(([q]) => q.startsWith("DELETE FROM sync_queue"))!;
      expect(del[0]).toBe(`DELETE FROM sync_queue WHERE entity_id = ? AND entity_type = '${c.type}' AND action = 'update' AND status = 'pending'`);
      expect(del[1]).toEqual([c.id]);
      expect(h.queue).toEqual([]);
    });
  }
});
