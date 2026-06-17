/**
 * Tests for the sync engine cascade fix shipped 30 April 2026.
 *
 * When a queued create succeeded, the engine only updated the entity_id on
 * the create's own queue row. Subsequent updates / deletes for the same
 * trip kept the dead local UUID and 404'd against the server forever.
 *
 * Fix: when a create syncs, rewrite entity_id on ALL pending queue rows for
 * the same entity, AND rewrite payload.id on queued updates so the PATCH
 * body carries the new server id.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    runAsync: vi.fn(),
    getFirstAsync: vi.fn(),
    getAllAsync: vi.fn(),
    execAsync: vi.fn(),
  },
  apiRequest: vi.fn(),
  getPendingCount: vi.fn(),
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

vi.mock("../../db/index", () => ({
  getDatabase: () => Promise.resolve(mocks.db),
}));

vi.mock("../../api/index", () => ({
  apiRequest: mocks.apiRequest,
}));

vi.mock("../../network", () => ({
  isOnline: () => true,
  onConnectivityChange: () => () => undefined,
}));

vi.mock("../queue", () => ({
  MAX_RETRIES: 5,
  getPendingCount: mocks.getPendingCount,
}));

import { processSyncQueue } from "../index";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.runAsync.mockResolvedValue(undefined);
  mocks.db.getFirstAsync.mockResolvedValue(null);
  mocks.db.execAsync.mockResolvedValue(undefined);
  mocks.getPendingCount.mockResolvedValue(0);
});

describe("processSyncQueue cascade after a create syncs", () => {
  it("rewrites entity_id on other pending queue rows for the same trip", async () => {
    const localId = "local-uuid-bug-repro";
    const serverId = "server-uuid-from-api";

    // First getAllAsync call: the queue items that processSyncQueue selects.
    // Second getAllAsync call: the queued-updates lookup for payload rewrite.
    mocks.db.getAllAsync
      .mockResolvedValueOnce([
        {
          id: "queue-row-1",
          entity_type: "trip",
          entity_id: localId,
          action: "create",
          payload: JSON.stringify({
            startLat: 1,
            startLng: 2,
            distanceMiles: 3,
          }),
          status: "pending",
          retry_count: 0,
          created_at: "2026-04-30T17:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "queue-row-2",
          payload: JSON.stringify({ id: localId, classification: "business" }),
        },
      ]);

    // Create POST returns the new server ID.
    mocks.apiRequest.mockResolvedValueOnce({ data: { id: serverId } });

    // No collision with an existing server-ID row in the trips table.
    mocks.db.getFirstAsync.mockResolvedValue(null);

    await processSyncQueue();

    // ── Assertion 1: cascade UPDATE rewrote entity_id on the OTHER row.
    const cascadeCall = mocks.db.runAsync.mock.calls.find((call: unknown[]) => {
      const sql = String(call[0]);
      return (
        /UPDATE sync_queue SET entity_id = \?/.test(sql) &&
        /entity_id = \? AND entity_type = \? AND id != \?/.test(sql)
      );
    });
    expect(cascadeCall).toBeDefined();
    expect(cascadeCall![1]).toEqual([serverId, localId, "trip", "queue-row-1"]);

    // ── Assertion 2: payload.id rewritten on the queued update so the PATCH
    //    body carries the server id, not the dead local UUID.
    const payloadRewriteCall = mocks.db.runAsync.mock.calls.find((call: unknown[]) => {
      const sql = String(call[0]);
      const args = call[1] as unknown[];
      if (!/UPDATE sync_queue SET payload = \?/.test(sql)) return false;
      try {
        const newPayload = JSON.parse(args[0] as string);
        return newPayload?.id === serverId;
      } catch {
        return false;
      }
    });
    expect(payloadRewriteCall).toBeDefined();
  });
});

describe("processSyncQueue error classification (preserve vs park)", () => {
  const queueItem = (over: Record<string, unknown> = {}) => ({
    id: "q1",
    entity_type: "trip",
    entity_id: "local-1",
    action: "create",
    payload: JSON.stringify({ startLat: 1, startLng: 2, distanceMiles: 3 }),
    status: "pending",
    retry_count: 0,
    created_at: "2026-05-30T07:00:00.000Z",
    ...over,
  });

  // The load-bearing regression: a network failure (incl. apiRequest's own
  // "Network error" from a 401-refresh-network-fail) must NOT increment
  // retry_count. The old engine burned retries on every offline pass, parking
  // real trips as permanently_failed - the weeks-stuck / never-appears bug.
  it("does NOT touch retry_count on a network error", async () => {
    mocks.db.getAllAsync.mockResolvedValueOnce([queueItem()]);
    mocks.apiRequest.mockRejectedValueOnce(new Error("Network error"));

    await processSyncQueue();

    const mutated = mocks.db.runAsync.mock.calls.find((c: unknown[]) =>
      /UPDATE sync_queue SET status/.test(String(c[0]))
    );
    expect(mutated).toBeUndefined(); // broke out, item preserved as-is
  });

  // The data-loss fix (16 Jun 2026): a 401 that reaches the engine (a 401 that
  // survived a successful token refresh) must be preserved like a network error
  // - break the batch, never touch retry_count, never park. The token is shared
  // across the batch, so burning a retry per item would re-create the
  // weeks-stuck / never-appears bug it was meant to kill.
  it("does NOT park or retry a 401 (recoverable auth) — preserves the trip", async () => {
    const { ApiError } = await import("../../api/apiError");
    mocks.db.getAllAsync.mockResolvedValueOnce([queueItem()]);
    mocks.apiRequest.mockRejectedValueOnce(
      new ApiError({ code: "UNAUTHORIZED", message: "Invalid or expired token", statusCode: 401, retryable: false })
    );

    await processSyncQueue();

    const mutated = mocks.db.runAsync.mock.calls.find((c: unknown[]) =>
      /UPDATE sync_queue SET status/.test(String(c[0]))
    );
    expect(mutated).toBeUndefined(); // broke out, item preserved untouched
  });

  it("parks a real 4xx as permanently_failed", async () => {
    const { ApiError } = await import("../../api/apiError");
    mocks.db.getAllAsync.mockResolvedValueOnce([queueItem()]);
    mocks.apiRequest.mockRejectedValueOnce(
      new ApiError({ code: "BAD", message: "bad", statusCode: 400, retryable: false })
    );

    await processSyncQueue();

    const parked = mocks.db.runAsync.mock.calls.find(
      (c: unknown[]) =>
        /UPDATE sync_queue SET status = 'permanently_failed'/.test(String(c[0]))
    );
    expect(parked).toBeDefined();
  });

  it("increments retry_count on a 5xx transient error", async () => {
    const { ApiError } = await import("../../api/apiError");
    mocks.db.getAllAsync.mockResolvedValueOnce([queueItem()]);
    mocks.apiRequest.mockRejectedValueOnce(
      new ApiError({ code: "INTERNAL", message: "boom", statusCode: 500, retryable: true })
    );

    await processSyncQueue();

    const retried = mocks.db.runAsync.mock.calls.find((c: unknown[]) => {
      const sql = String(c[0]);
      const args = c[1] as unknown[];
      return /UPDATE sync_queue SET status = \?, retry_count = \?/.test(sql) && args[1] === 1;
    });
    expect(retried).toBeDefined();
  });
});
