// Postcode for a point (24 Sep 2026). An accountant-facing export wants the
// start and end postcode of every trip (Andrew Butterworth: "Could I
// specifically get just the postcodes when I download to excel"), but the
// stored address is sometimes a saved-place name ("Home") and often has no
// postcode in it. Postcodes.io, which the trips route already uses for the
// forward lookup, answers the reverse question for up to 100 points a call.
//
// Best-effort by design: any failure gives null for that point and the export
// carries on. A point is cached for 30 days at 4 decimal places (about 11 m).

import { cacheGet, cacheSet } from "../lib/redis.js";

const BULK_URL = "https://api.postcodes.io/postcodes";
const BATCH = 100;
const TIMEOUT_MS = 8000;
const CACHE_TTL_S = 30 * 24 * 60 * 60;
/** Metres. A point further than this from any postcode centroid gets none. */
const RADIUS_M = 500;
const NONE = "-";

export interface LatLng {
  lat: number | null | undefined;
  lng: number | null | undefined;
}

/** Cache key for a point, or null when the point is unusable. */
export function postcodeKey(p: LatLng): string | null {
  if (p.lat == null || p.lng == null) return null;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  if (p.lat === 0 && p.lng === 0) return null; // "no position", seen on failed geocodes
  return `pc:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
}

/** Postcodes.io bulk reverse response -> one postcode (or null) per query, in order. */
export function parseBulkReverse(body: unknown, count: number): (string | null)[] {
  const out: (string | null)[] = new Array(count).fill(null);
  const results = (body as { result?: unknown })?.result;
  if (!Array.isArray(results)) return out;
  results.forEach((r, i) => {
    if (i >= count) return;
    const first = (r as { result?: Array<{ postcode?: unknown }> | null })?.result?.[0];
    out[i] = typeof first?.postcode === "string" ? first.postcode : null;
  });
  return out;
}

/** Postcodes for the given points, in order. Never throws. */
export async function postcodesFor(points: LatLng[]): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(points.length).fill(null);
  const pending = new Map<string, { lat: number; lng: number; idx: number[] }>();

  for (let i = 0; i < points.length; i++) {
    const key = postcodeKey(points[i]);
    if (!key) continue;
    const cached = await cacheGet(key);
    if (cached !== null) {
      out[i] = cached === NONE ? null : cached;
      continue;
    }
    const entry = pending.get(key);
    if (entry) entry.idx.push(i);
    else pending.set(key, { lat: points[i].lat as number, lng: points[i].lng as number, idx: [i] });
  }

  const queue = [...pending.entries()];
  for (let b = 0; b < queue.length; b += BATCH) {
    const chunk = queue.slice(b, b + BATCH);
    try {
      const res = await fetch(BULK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geolocations: chunk.map(([, v]) => ({ latitude: v.lat, longitude: v.lng, limit: 1, radius: RADIUS_M })),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const found = parseBulkReverse(await res.json(), chunk.length);
      for (let j = 0; j < chunk.length; j++) {
        const [key, v] = chunk[j];
        await cacheSet(key, found[j] ?? NONE, CACHE_TTL_S);
        for (const i of v.idx) out[i] = found[j];
      }
    } catch {
      // Leave this batch blank; the export still goes out.
    }
  }
  return out;
}
