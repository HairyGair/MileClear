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
