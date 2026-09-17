/**
 * Naming a split's new boundaries inline.
 *
 * A split used to leave the stop unnamed unless it was a saved place, and the
 * hourly backfill job filled it later. Drivers opened the app in that gap, saw
 * a trip reading "(blank) -> Home" and deleted it (Luis De Abreu, 17 Sep 2026;
 * Terry Lamb, 15 Sep 2026). The helper asks the geocoder at split time, capped,
 * and never lets a slow provider fail or overwrite anything.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/appEvents.js", () => ({
  logEvent: vi.fn(),
}));

import {
  nameSplitBoundaries,
  nameInteriorBoundaries,
  logSplitAddressFill,
} from "../../services/splitBoundaryNames.js";
import type { ReverseGeocodeResult } from "../../services/geocoding.js";
import { logEvent } from "../../services/appEvents.js";

const found = (address: string, cached = false): ReverseGeocodeResult => ({ address, outcome: "found", cached });
const unavailable: ReverseGeocodeResult = { address: null, outcome: "unavailable", cached: false };

const HOME = { name: "Home", latitude: 50.7684, longitude: 0.2787, radiusMeters: 100 };
const STREET = { lat: 50.7702, lng: 0.2771 }; // ~220 m from Home, outside its radius

describe("nameSplitBoundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fills a null boundary from the geocoder", async () => {
    const geocode = vi.fn().mockResolvedValue(found("20 Gildredge Road, BN21 4RU"));
    const names = await nameSplitBoundaries([STREET], { saved: [], geocode, paceMs: 0 });
    expect(names).toEqual([{ address: "20 Gildredge Road, BN21 4RU", source: "geocoder" }]);
    expect(geocode).toHaveBeenCalledWith(STREET.lat, STREET.lng);
  });

  it("uses the saved-location name and makes no geocode call", async () => {
    const geocode = vi.fn().mockResolvedValue(found("Some Street"));
    const names = await nameSplitBoundaries([{ lat: 50.7685, lng: 0.2788 }], { saved: [HOME], geocode });
    expect(names).toEqual([{ address: "Home", source: "saved" }]);
    expect(geocode).not.toHaveBeenCalled();
  });

  it("leaves the boundary null and does not throw when the geocoder hangs", async () => {
    const geocode = vi.fn().mockReturnValue(new Promise<ReverseGeocodeResult>(() => {}));
    const t0 = Date.now();
    const names = await nameSplitBoundaries([STREET, { lat: 50.78, lng: 0.29 }], {
      saved: [],
      geocode,
      timeoutMs: 30,
      paceMs: 0,
    });
    expect(names).toEqual([
      { address: null, source: null },
      { address: null, source: null },
    ]);
    // A dead provider is asked once, not once per boundary.
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("leaves the boundary null when the geocoder rejects or reports unavailable", async () => {
    const rejecting = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(nameSplitBoundaries([STREET], { saved: [], geocode: rejecting })).resolves.toEqual([
      { address: null, source: null },
    ]);
    const down = vi.fn().mockResolvedValue(unavailable);
    await expect(nameSplitBoundaries([STREET], { saved: [], geocode: down })).resolves.toEqual([
      { address: null, source: null },
    ]);
  });

  it("never overwrites an address that already exists", async () => {
    const geocode = vi.fn().mockResolvedValue(found("Somewhere Else"));
    const names = await nameSplitBoundaries(
      [{ lat: 50.7685, lng: 0.2788, existing: "Mum's" }, { ...STREET, existing: "The Depot" }],
      { saved: [HOME], geocode }
    );
    expect(names).toEqual([
      { address: "Mum's", source: "existing" },
      { address: "The Depot", source: "existing" },
    ]);
    expect(geocode).not.toHaveBeenCalled();
  });

  it("stops geocoding once the shared budget is spent", async () => {
    const geocode = vi.fn().mockResolvedValue(found("A Street"));
    const names = await nameSplitBoundaries([STREET, { lat: 50.78, lng: 0.29 }], {
      saved: [],
      geocode,
      budgetMs: 50,
      paceMs: 100,
    });
    expect(names[0].address).toBe("A Street");
    expect(names[1]).toEqual({ address: null, source: null });
    expect(geocode).toHaveBeenCalledTimes(1);
  });
});

describe("nameInteriorBoundaries", () => {
  it("names only the stops between legs, never the outer ends", async () => {
    const geocode = vi.fn().mockImplementation(async (lat: number) => found(`Stop ${lat}`, true));
    const legs = [
      [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }],
      [{ lat: 3, lng: 3 }, { lat: 4, lng: 4 }],
    ];
    const { starts, ends } = await nameInteriorBoundaries(legs, { saved: [], geocode });
    expect(starts[0]).toBeNull();
    expect(ends[1]).toBeNull();
    expect(ends[0]?.address).toBe("Stop 2");
    expect(starts[1]?.address).toBe("Stop 3");
    expect(geocode).toHaveBeenCalledTimes(2);
  });
});

describe("logSplitAddressFill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs the job's event shape with source split, for geocoder fills only", () => {
    logSplitAddressFill("u1", "t1", { address: "Home", source: "saved" }, { address: "A Road", source: "geocoder" });
    expect(logEvent).toHaveBeenCalledWith("trip.address_backfilled", "u1", {
      tripId: "t1",
      filledStart: false,
      filledEnd: true,
      source: "split",
    });
    vi.mocked(logEvent).mockClear();
    logSplitAddressFill("u1", "t2", { address: "Home", source: "saved" }, null);
    expect(logEvent).not.toHaveBeenCalled();
  });
});
