/**
 * Tests for reconcileTrips — the fix for trip drift (Anthony, 13 Jun 2026).
 * Trips hydrate append-only, so a trip classified server-side / on web / on
 * another device never updated locally and stayed "unclassified" forever. The
 * reconcile must: update server-authoritative fields on existing synced rows,
 * insert trips it hasn't seen, and NEVER clobber a row with a pending local
 * edit (offline classification waiting to sync).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    runAsync: vi.fn(),
    getFirstAsync: vi.fn(),
    getAllAsync: vi.fn(),
  },
  fetchTrips: vi.fn(),
}));

// Mock every module hydrate.ts imports so none of the real api/* or native
// geofencing files load (they pull in TS syntax / native deps vitest can't parse).
vi.mock("../../db/index", () => ({
  getDatabase: () => Promise.resolve(mocks.db),
}));
vi.mock("../../api/trips", () => ({ fetchTrips: mocks.fetchTrips }));
vi.mock("../../api/vehicles", () => ({ fetchVehicles: vi.fn() }));
vi.mock("../../api/shifts", () => ({ fetchShifts: vi.fn() }));
vi.mock("../../api/earnings", () => ({ fetchEarnings: vi.fn() }));
vi.mock("../../api/fuel", () => ({ fetchFuelLogs: vi.fn() }));
vi.mock("../../api/savedLocations", () => ({ fetchSavedLocations: vi.fn() }));
vi.mock("../../geofencing/index", () => ({ registerGeofences: vi.fn() }));

import { reconcileTrips } from "../hydrate";

const serverTrip = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  shiftId: null,
  vehicleId: "v1",
  startLat: 1,
  startLng: 2,
  endLat: 3,
  endLng: 4,
  startAddress: "A",
  endAddress: "B",
  distanceMiles: 5,
  startedAt: "2026-06-16T08:00:00.000Z",
  endedAt: "2026-06-16T08:30:00.000Z",
  isManualEntry: false,
  classification: "business",
  platformTag: null,
  category: null,
  businessPurpose: null,
  notes: null,
  ...over,
});

const page = (trips: unknown[]) => ({
  data: trips,
  total: trips.length,
  page: 1,
  pageSize: 100,
  totalPages: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.runAsync.mockResolvedValue(undefined);
  mocks.db.getFirstAsync.mockResolvedValue(null);
  mocks.db.getAllAsync.mockResolvedValue([]); // no pending sync_queue rows
});

describe("reconcileTrips", () => {
  it("UPDATEs an existing local trip with the server's classification (drift fix)", async () => {
    mocks.fetchTrips.mockResolvedValueOnce(page([serverTrip({ classification: "business" })]));
    mocks.db.getFirstAsync.mockResolvedValueOnce({ id: "t1" }); // already local

    await reconcileTrips();

    const upd = mocks.db.runAsync.mock.calls.find((c: unknown[]) =>
      /UPDATE trips SET/.test(String(c[0]))
    );
    expect(upd).toBeDefined();
    expect(upd![1]).toContain("business"); // classification carried into the UPDATE
    // It must NOT insert when the row already exists.
    expect(
      mocks.db.runAsync.mock.calls.find((c: unknown[]) => /INSERT/.test(String(c[0])))
    ).toBeUndefined();
  });

  it("SKIPs a trip with a pending local op so an offline edit isn't clobbered", async () => {
    mocks.fetchTrips.mockResolvedValueOnce(page([serverTrip()]));
    mocks.db.getAllAsync.mockResolvedValueOnce([{ entity_id: "t1" }]); // pending update for t1

    await reconcileTrips();

    expect(
      mocks.db.runAsync.mock.calls.find((c: unknown[]) =>
        /UPDATE trips SET|INSERT/.test(String(c[0]))
      )
    ).toBeUndefined();
  });

  it("INSERTs a server trip that doesn't exist locally (created on another device)", async () => {
    mocks.fetchTrips.mockResolvedValueOnce(page([serverTrip({ id: "new1" })]));
    mocks.db.getFirstAsync.mockResolvedValueOnce(null); // not present locally

    await reconcileTrips();

    expect(
      mocks.db.runAsync.mock.calls.find((c: unknown[]) =>
        /INSERT OR IGNORE INTO trips/.test(String(c[0]))
      )
    ).toBeDefined();
  });

  it("no-ops on a network failure (keeps stale data rather than wiping)", async () => {
    mocks.fetchTrips.mockRejectedValueOnce(new Error("Network error"));

    await reconcileTrips();

    expect(mocks.db.runAsync).not.toHaveBeenCalled();
  });
});
