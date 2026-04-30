/**
 * Tests for the sync-action layer bug fixes shipped 30 April 2026.
 *
 * Three bugs caused "Trip not found" 404s and silent loss of user
 * classifications when a trip's create POST was still queued:
 *   1. syncUpdateTrip called PATCH /trips/{localUUID} immediately and 404'd.
 *   2. syncDeleteTrip called DELETE /trips/{localUUID} immediately and 404'd.
 *   3. The catch handler then DELETED the queued update/delete row, so
 *      even after the create eventually flushed, the user's intent was lost.
 *
 * These tests assert the new behaviour: when synced_at is null, the action
 * enqueues but does NOT call the API. When synced_at is set, the API is
 * called normally.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted() returns a value that is available when vi.mock factories run
// (which Vitest hoists to the top of the module). Without hoisted(), the
// mocks reference top-level let/const that haven't initialized yet.
const mocks = vi.hoisted(() => ({
  db: {
    runAsync: vi.fn(),
    getFirstAsync: vi.fn(),
    getAllAsync: vi.fn(),
    execAsync: vi.fn(),
  },
  enqueueSync: vi.fn(),
  apiCreateTrip: vi.fn(),
  apiUpdateTrip: vi.fn(),
  apiDeleteTrip: vi.fn(),
}));

vi.mock("expo-crypto", () => ({
  randomUUID: () => "test-uuid-" + Math.random().toString(36).slice(2, 10),
}));

vi.mock("../../db/index", () => ({
  getDatabase: () => Promise.resolve(mocks.db),
}));

vi.mock("../queue", () => ({
  enqueueSync: mocks.enqueueSync,
  MAX_RETRIES: 5,
}));

vi.mock("../../api/trips", () => ({
  createTrip: mocks.apiCreateTrip,
  updateTrip: mocks.apiUpdateTrip,
  deleteTrip: mocks.apiDeleteTrip,
}));

vi.mock("../../api/earnings", () => ({
  createEarning: vi.fn(),
  updateEarning: vi.fn(),
  deleteEarning: vi.fn(),
}));
vi.mock("../../api/fuel", () => ({
  createFuelLog: vi.fn(),
  updateFuelLog: vi.fn(),
  deleteFuelLog: vi.fn(),
}));
vi.mock("../../api/shifts", () => ({
  startShift: vi.fn(),
  endShift: vi.fn(),
}));
vi.mock("../../api/savedLocations", () => ({
  createSavedLocation: vi.fn(),
  updateSavedLocation: vi.fn(),
  deleteSavedLocation: vi.fn(),
}));
vi.mock("../../classification", () => ({
  learnFromClassification: vi.fn(),
}));

import { syncUpdateTrip, syncDeleteTrip } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.getFirstAsync.mockResolvedValue(null);
  mocks.db.runAsync.mockResolvedValue(undefined);
  mocks.db.getAllAsync.mockResolvedValue([]);
  mocks.db.execAsync.mockResolvedValue(undefined);
});

// ── BUG 1 SCENARIO: classifying a trip whose create is still queued ──────
describe("syncUpdateTrip on un-synced trip", () => {
  it("enqueues the update but does NOT call the API", async () => {
    mocks.db.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes("classification_source")) {
        return {
          classification: "unclassified",
          classification_source: null,
          classification_auto_accepted_sent: 0,
        };
      }
      if (sql.includes("synced_at")) {
        return { synced_at: null };
      }
      return null;
    });

    const result = await syncUpdateTrip("local-uuid-123", {
      classification: "business",
    });

    expect(mocks.apiUpdateTrip).not.toHaveBeenCalled();
    expect(mocks.enqueueSync).toHaveBeenCalledWith(
      "trip",
      "local-uuid-123",
      "update",
      expect.objectContaining({ classification: "business" })
    );
    expect(result).toBeNull();
  });
});

describe("syncUpdateTrip on synced trip", () => {
  it("calls the API normally when the trip has been synced", async () => {
    mocks.db.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes("classification_source")) {
        return {
          classification: "unclassified",
          classification_source: null,
          classification_auto_accepted_sent: 0,
        };
      }
      if (sql.includes("synced_at")) {
        return { synced_at: "2026-04-30T10:00:00.000Z" };
      }
      return null;
    });
    mocks.apiUpdateTrip.mockResolvedValueOnce({
      data: { id: "server-id-abc", classification: "business" },
    });

    await syncUpdateTrip("server-id-abc", { classification: "business" });

    expect(mocks.apiUpdateTrip).toHaveBeenCalledWith(
      "server-id-abc",
      expect.objectContaining({ classification: "business" })
    );
  });
});

// ── BUG 2 SCENARIO: deleting a trip whose create is still queued ──────────
describe("syncDeleteTrip on un-synced trip", () => {
  it("removes the local row + clears the queue, no API call", async () => {
    mocks.db.getFirstAsync.mockResolvedValueOnce({ synced_at: null });

    const result = await syncDeleteTrip("local-uuid-456");

    expect(mocks.apiDeleteTrip).not.toHaveBeenCalled();

    const localDeleteCall = mocks.db.runAsync.mock.calls.find(
      ([sql]: [string]) => /DELETE FROM trips WHERE id = \?/.test(sql)
    );
    expect(localDeleteCall).toBeDefined();
    expect(localDeleteCall![1]).toEqual(["local-uuid-456"]);

    const queueCleanupCall = mocks.db.runAsync.mock.calls.find(
      ([sql]: [string]) =>
        /DELETE FROM sync_queue/.test(sql) && /entity_type = 'trip'/.test(sql)
    );
    expect(queueCleanupCall).toBeDefined();
    expect(queueCleanupCall![1]).toEqual(["local-uuid-456"]);

    expect(result).toBeNull();
  });
});

describe("syncDeleteTrip on synced trip", () => {
  it("calls DELETE on the API when the trip has been synced", async () => {
    mocks.db.getFirstAsync.mockResolvedValueOnce({
      synced_at: "2026-04-30T10:00:00.000Z",
    });
    mocks.apiDeleteTrip.mockResolvedValueOnce({ message: "Trip deleted" });

    await syncDeleteTrip("server-id-xyz");

    expect(mocks.apiDeleteTrip).toHaveBeenCalledWith("server-id-xyz");
  });

  it("converges silently when DELETE returns 4xx (server already lost the trip)", async () => {
    mocks.db.getFirstAsync.mockResolvedValueOnce({
      synced_at: "2026-04-30T10:00:00.000Z",
    });
    mocks.apiDeleteTrip.mockRejectedValueOnce(
      new Error("HTTP 404: Trip not found")
    );

    const result = await syncDeleteTrip("server-id-xyz");

    expect(result).toBeNull();
    const markSyncedCall = mocks.db.runAsync.mock.calls.find(
      ([sql]: [string]) => /UPDATE sync_queue SET status = 'synced'/.test(sql)
    );
    expect(markSyncedCall).toBeDefined();
  });
});
