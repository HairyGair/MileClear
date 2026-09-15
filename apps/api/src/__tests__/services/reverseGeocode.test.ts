/**
 * Reverse geocoding: turning a bare coordinate into a name a driver recognises.
 *
 * Addresses normally come from the device. When its lookup fails it sends null,
 * and a trip with BOTH addresses null draws no route line in the trips list at
 * all — a captured drive that reads as a missing one. In the week to 15 Aug 2026
 * that was 96 trips across 33 users, six of whom filed missing-trip reports.
 *
 * The rules that matter here: never turn the no-coordinates sentinel into a
 * place in the Atlantic, never let a slow or broken geocoder throw into a caller
 * that is finishing a trip save, and cache hard because drivers return to the
 * same handful of places for weeks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cache = new Map<string, string>();
vi.mock("../../lib/redis.js", () => ({
  cacheGet: vi.fn(async (k: string) => (cache.has(k) ? cache.get(k)! : null)),
  cacheSet: vi.fn(async (k: string, v: string) => { cache.set(k, v); }),
}));

import { reverseGeocode, reverseGeocodeDetailed } from "../../services/geocoding.js";

const nominatim = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: async () => body } as never);

const HOUSE = {
  name: "", lat: "53.70250", lon: "-2.26571",
  display_name: "22, Johnny Barn Close, Rossendale, England, BB4 7TB, United Kingdom",
  address: { road: "Johnny Barn Close", town: "Rossendale", postcode: "BB4 7TB" },
};

describe("reverseGeocode", () => {
  beforeEach(() => {
    cache.clear();
    vi.restoreAllMocks();
  });

  it("returns a concise UK address rather than the full display name", async () => {
    vi.stubGlobal("fetch", nominatim(HOUSE));
    const out = await reverseGeocode(53.7025, -2.26571);
    // No ", England" and no ", United Kingdom" — this string goes straight
    // into the trips list, where it is truncated to one line.
    expect(out).toBe("Johnny Barn Close, Rossendale, BB4 7TB");
  });

  it("refuses the 0,0 no-coordinates sentinel instead of naming the Atlantic", async () => {
    const f = nominatim(HOUSE);
    vi.stubGlobal("fetch", f);
    expect(await reverseGeocode(0, 0)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses coordinates that are not real numbers", async () => {
    const f = nominatim(HOUSE);
    vi.stubGlobal("fetch", f);
    expect(await reverseGeocode(NaN, -2.2)).toBeNull();
    expect(await reverseGeocode(53.7, Infinity)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("serves a second nearby lookup from cache, since drivers revisit places", async () => {
    const f = nominatim(HOUSE);
    vi.stubGlobal("fetch", f);
    await reverseGeocode(53.70250, -2.26571);
    // Within ~11 m, so it rounds to the same key.
    const again = await reverseGeocode(53.702503, -2.265714);
    expect(again).toBe("Johnny Barn Close, Rossendale, BB4 7TB");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("returns null rather than throwing when the geocoder fails", async () => {
    // The caller is finishing a trip save. It must never see an exception.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(reverseGeocode(53.7, -2.26)).resolves.toBeNull();
  });

  it("returns null on a non-200 without caching it as an answer", async () => {
    vi.stubGlobal("fetch", nominatim({}, false));
    expect(await reverseGeocode(53.71, -2.27)).toBeNull();
    // A 503 is transient; the next call should try again rather than serve null.
    vi.stubGlobal("fetch", nominatim(HOUSE));
    expect(await reverseGeocode(53.71, -2.27)).toBe("Johnny Barn Close, Rossendale, BB4 7TB");
  });

  it("remembers a point the geocoder cannot name, so it is not retried forever", async () => {
    vi.stubGlobal("fetch", nominatim({ error: "Unable to geocode" }));
    expect(await reverseGeocode(56.1, -3.9)).toBeNull();

    const f = nominatim(HOUSE);
    vi.stubGlobal("fetch", f);
    expect(await reverseGeocode(56.1, -3.9)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

// The backfill job needs to know WHY there is no address. "nowhere" is
// Nominatim saying the point has no name (the Channel, mid-Atlantic) and will
// never change; "unavailable" is a timeout, 429 or 5xx that a retry fixes.
// Confusing the two kept the job at "filled 0, aborted" for ten days.
describe("reverseGeocodeDetailed", () => {
  beforeEach(() => {
    cache.clear();
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("reports a real address as found, and a repeat as cached so callers need not pace", async () => {
    vi.stubGlobal("fetch", nominatim(HOUSE));
    expect(await reverseGeocodeDetailed(53.7025, -2.26571)).toEqual({
      address: "Johnny Barn Close, Rossendale, BB4 7TB", outcome: "found", cached: false,
    });
    expect(await reverseGeocodeDetailed(53.7025, -2.26571)).toEqual({
      address: "Johnny Barn Close, Rossendale, BB4 7TB", outcome: "found", cached: true,
    });
  });

  it("calls a point Nominatim has no name for 'nowhere', not a provider failure", async () => {
    vi.stubGlobal("fetch", nominatim({ error: "Unable to geocode" }));
    expect(await reverseGeocodeDetailed(45.25, -13.78)).toEqual({
      address: null, outcome: "nowhere", cached: false,
    });
    // and the miss is remembered, without another request
    const f = nominatim(HOUSE);
    vi.stubGlobal("fetch", f);
    expect(await reverseGeocodeDetailed(45.25, -13.78)).toEqual({
      address: null, outcome: "nowhere", cached: true,
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("treats the sentinel and non-numbers as nowhere without a request", async () => {
    const f = nominatim(HOUSE);
    vi.stubGlobal("fetch", f);
    expect((await reverseGeocodeDetailed(0, 0)).outcome).toBe("nowhere");
    expect((await reverseGeocodeDetailed(NaN, 1)).outcome).toBe("nowhere");
    expect(f).not.toHaveBeenCalled();
  });

  it("calls a 429 / 5xx 'unavailable', does not cache it, and says so in the log", async () => {
    // The log line is throttled to one a minute across the whole process, and
    // earlier tests in this file already tripped it: step the clock past it.
    vi.useFakeTimers({ now: Date.now() + 10 * 60_000 });
    try {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as never));
      expect(await reverseGeocodeDetailed(53.71, -2.27)).toEqual({
        address: null, outcome: "unavailable", cached: false,
      });
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("HTTP 429"));
      // next call tries again
      vi.stubGlobal("fetch", nominatim(HOUSE));
      expect((await reverseGeocodeDetailed(53.71, -2.27)).outcome).toBe("found");
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls a network failure 'unavailable' and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(reverseGeocodeDetailed(53.7, -2.26)).resolves.toEqual({
      address: null, outcome: "unavailable", cached: false,
    });
  });
});
