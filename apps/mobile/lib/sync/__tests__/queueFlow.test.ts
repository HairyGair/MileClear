/**
 * The queue engine's handling of the stuck uploads found on 28 Sep 2026:
 *  - a saved place refused on the free plan (403) used to stop the whole
 *    queue, holding back every trip queued after it;
 *  - an edit queued behind its trip's create was sent with the dead local id
 *    in the same pass the create landed, 404'd, and was turned into a broken
 *    create that parked for ever;
 *  - a 404 on an edit of a trip the server had removed re-created it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  db: {
    runAsync: vi.fn(),
    getFirstAsync: vi.fn(),
    getAllAsync: vi.fn(),
    execAsync: vi.fn(),
  },
  apiRequest: vi.fn(),
  getPendingCount: vi.fn(),
  enqueueSync: vi.fn(),
}));

vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
vi.mock("../../db/index", () => ({ getDatabase: () => Promise.resolve(mocks.db) }));
vi.mock("../../api/index", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../../network", () => ({ isOnline: () => true, onConnectivityChange: () => () => undefined }));
vi.mock("../queue", () => ({
  MAX_RETRIES: 5,
  getPendingCount: mocks.getPendingCount,
  enqueueSync: mocks.enqueueSync,
}));

import { processSyncQueue } from "../index";
import { ApiError } from "../../api/apiError";

const item = (o: Row): Row => ({
  id: "q",
  entity_type: "trip",
  entity_id: "local-1",
  action: "create",
  payload: JSON.stringify({ startedAt: "2026-09-27T13:00:00.000Z", startLat: 51.5, startLng: -0.1 }),
  status: "pending",
  retry_count: 0,
  created_at: "2026-09-27T13:00:00.000Z",
  ...o,
});

/** SQL-aware SQLite double: the queue batch, unfinished creates, local rows. */
function setup(opts: { items: Row[]; unfinishedCreates?: string[]; localRows?: Record<string, Row | null> }) {
  mocks.db.getAllAsync.mockImplementation(async (sql: string) => {
    if (/FROM sync_queue\s+WHERE status IN/.test(sql)) return opts.items;
    if (/SELECT entity_id FROM sync_queue WHERE action = 'create'/.test(sql)) {
      return (opts.unfinishedCreates ?? []).map((entity_id) => ({ entity_id }));
    }
    return [];
  });
  mocks.db.getFirstAsync.mockImplementation(async (sql: string, args: unknown[] = []) => {
    const m = /FROM (\w+) WHERE id = \?/.exec(sql);
    if (m && m[1] !== "sync_queue") {
      const r = opts.localRows?.[String(args[0])];
      return r === undefined ? null : r;
    }
    return null;
  });
}

const sqlCalls = (re: RegExp) =>
  mocks.db.runAsync.mock.calls.filter((c: unknown[]) => re.test(String(c[0])));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.runAsync.mockResolvedValue(undefined);
  mocks.db.execAsync.mockResolvedValue(undefined);
  mocks.getPendingCount.mockResolvedValue(0);
});

describe("a saved place refused on the free plan", () => {
  it("is held, and the trips queued after it still upload", async () => {
    setup({
      items: [
        item({ id: "place", entity_type: "saved_location", entity_id: "place-1", payload: "{}" }),
        item({ id: "trip", entity_id: "local-trip" }),
      ],
      unfinishedCreates: ["place-1", "local-trip"],
    });
    mocks.apiRequest
      .mockRejectedValueOnce(
        new ApiError({
          code: "FORBIDDEN",
          message: "Free accounts are limited to 2 saved locations. Upgrade to Pro for unlimited.",
          statusCode: 403,
          retryable: false,
        })
      )
      .mockResolvedValueOnce({ data: { id: "server-trip" } });

    await processSyncQueue();

    expect(mocks.apiRequest).toHaveBeenCalledTimes(2);
    expect(mocks.apiRequest.mock.calls[1][0]).toBe("/trips");
    const held = sqlCalls(/UPDATE sync_queue SET status = \?, last_error = \?/);
    expect(held[0][1][0]).toBe("held");
    expect(held[0][1][3]).toBe("place");
    // The trip reconciled to its server id.
    expect(mocks.db.execAsync.mock.calls.some((c: unknown[]) => /server-trip/.test(String(c[0])))).toBe(true);
  });

  it("a 401 still stops the batch: the token is shared by every item", async () => {
    setup({ items: [item({ id: "a" }), item({ id: "b", entity_id: "local-2" })] });
    mocks.apiRequest.mockRejectedValueOnce(
      new ApiError({ code: "UNAUTHORIZED", message: "expired", statusCode: 401, retryable: false })
    );
    await processSyncQueue();
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);
  });
});

describe("an edit queued behind its trip's create", () => {
  it("is sent to the server id when the create lands earlier in the same pass", async () => {
    setup({
      items: [
        item({ id: "create" }),
        item({
          id: "edit",
          action: "update",
          payload: JSON.stringify({ id: "local-1", classification: "business" }),
          created_at: "2026-09-27T13:05:00.000Z",
        }),
      ],
      unfinishedCreates: ["local-1"],
    });
    mocks.apiRequest.mockResolvedValueOnce({ data: { id: "server-1" } }).mockResolvedValueOnce({ data: {} });

    await processSyncQueue();

    expect(mocks.apiRequest.mock.calls[1][0]).toBe("/trips/server-1");
    expect(JSON.parse(mocks.apiRequest.mock.calls[1][1].body)).toEqual({ id: "server-1", classification: "business" });
  });

  it("waits, unsent, while its create has not landed", async () => {
    setup({
      items: [item({ id: "edit", action: "update", payload: JSON.stringify({ id: "local-1" }) })],
      unfinishedCreates: ["local-1"],
    });
    await processSyncQueue();
    expect(mocks.apiRequest).not.toHaveBeenCalled();
    expect(sqlCalls(/permanently_failed/)).toHaveLength(0);
  });
});

describe("an edit the server answers 404", () => {
  const notFound = () =>
    new ApiError({ code: "NOT_FOUND", message: "Trip not found", statusCode: 404, retryable: false });

  it("of a trip the server removed after it synced: drops the edit and the stale copy, never re-creates", async () => {
    setup({
      items: [item({ id: "edit", action: "update", entity_id: "srv-gone", payload: JSON.stringify({ id: "srv-gone" }) })],
      localRows: { "srv-gone": { id: "srv-gone", synced_at: "2026-09-20T10:00:00.000Z" } },
    });
    mocks.apiRequest.mockRejectedValueOnce(notFound());
    await processSyncQueue();
    expect(sqlCalls(/DELETE FROM sync_queue WHERE id = \?/)).toHaveLength(1);
    expect(sqlCalls(/DELETE FROM trips WHERE id = \?/)[0][1]).toEqual(["srv-gone"]);
    expect(sqlCalls(/SET action = 'create'/)).toHaveLength(0);
    expect(mocks.enqueueSync).not.toHaveBeenCalled();
  });

  it("of a trip that never reached the server: queues a real create from the phone's row and keeps the edit", async () => {
    setup({
      items: [item({ id: "edit", action: "update", entity_id: "local-9", payload: JSON.stringify({ id: "local-9" }) })],
      localRows: {
        "local-9": {
          id: "local-9",
          synced_at: null,
          shift_id: "__quick_trip__",
          vehicle_id: null,
          start_lat: 51.5,
          start_lng: -0.1,
          end_lat: 51.6,
          end_lng: -0.2,
          start_address: null,
          end_address: null,
          distance_miles: 4.2,
          started_at: "2026-09-27T13:00:00.000Z",
          ended_at: "2026-09-27T13:20:00.000Z",
          classification: "unclassified",
          platform_tag: null,
          category: null,
          business_purpose: null,
          notes: null,
        },
      },
    });
    mocks.apiRequest.mockRejectedValueOnce(notFound());
    await processSyncQueue();
    expect(mocks.enqueueSync).toHaveBeenCalledTimes(1);
    const [entity, id, action, body] = mocks.enqueueSync.mock.calls[0];
    expect([entity, id, action]).toEqual(["trip", "local-9", "create"]);
    expect(body.startedAt).toBe("2026-09-27T13:00:00.000Z");
    expect(body.shiftId).toBeUndefined();
    expect(sqlCalls(/DELETE FROM sync_queue/)).toHaveLength(0);
    expect(sqlCalls(/permanently_failed/)).toHaveLength(0);
  });

  it("of a shift: never becomes POST /shifts, which would start a new shift", async () => {
    setup({
      items: [
        item({ id: "end", entity_type: "shift", action: "update", entity_id: "shift-1", payload: JSON.stringify({ status: "completed" }) }),
      ],
      localRows: { "shift-1": { id: "shift-1", synced_at: null } },
    });
    mocks.apiRequest.mockRejectedValueOnce(notFound());
    await processSyncQueue();
    expect(mocks.enqueueSync).not.toHaveBeenCalled();
    expect(sqlCalls(/SET action = 'create'/)).toHaveLength(0);
    expect(sqlCalls(/DELETE FROM sync_queue WHERE id = \?/)).toHaveLength(1);
  });
});

describe("ending a shift the server already ended", () => {
  it("is recorded as done, not parked", async () => {
    setup({
      items: [item({ id: "end", entity_type: "shift", action: "update", entity_id: "shift-1", payload: "{}" })],
    });
    mocks.apiRequest.mockRejectedValueOnce(
      new ApiError({ code: "BAD", message: "Shift is already completed", statusCode: 400, retryable: false })
    );
    await processSyncQueue();
    expect(sqlCalls(/SET status = 'synced'/)).toHaveLength(1);
    expect(sqlCalls(/permanently_failed/)).toHaveLength(0);
  });
});
