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

import { reverseGeocode } from "../../services/geocoding.js";

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
