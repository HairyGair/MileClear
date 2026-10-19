// Directions search, our own first (GET /navigation/search: Photon on UK
// OpenStreetMap, docs/navigation-build-oct2026.md), the app's existing search
// as the silent fallback. Pure apart from what is passed in, so tested.
//
//   1. A full UK postcode is looked up first (postcodes.io).
//   2. Our search, with a 3 s timeout. A new keystroke aborts the request
//      still in flight, so a slow answer never overwrites a newer one.
//   3. It is down (503 SEARCH_UNAVAILABLE), unreachable, too slow, or not
//      switched on: the existing search answers instead, and the driver is
//      told nothing (it simply works as before).
//
// The search text is never logged, here or by the server.

import type { PlaceResult, PlaceSearchProvider } from "./placeSearch";

/** A full UK postcode ("SR1 3AB", "sr13ab"). */
export function looksLikePostcode(q: string): boolean {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(q.trim());
}

export interface PhotonPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
  kind: string;
}

/** Why our search did not answer: anything but "bad input" falls back. */
export class SearchFailure extends Error {
  constructor(readonly kind: "unavailable" | "bad_input" | "offline" | "timeout" | "aborted") {
    super(kind);
  }
}

export const SEARCH_TIMEOUT_MS = 3_000;
export const SEARCH_MIN_CHARS = 2;

export function photonFirstProvider(deps: {
  /** GET /navigation/search; rejects with SearchFailure (or anything). */
  fetchPlaces: (q: string, near: { lat: number; lng: number } | null, signal: AbortSignal) => Promise<PhotonPlace[]>;
  fallback: PlaceSearchProvider;
  lookupPostcode: (q: string) => Promise<PlaceResult | null>;
  timeoutMs?: number;
}): PlaceSearchProvider & { cancel: () => void } {
  const timeoutMs = deps.timeoutMs ?? SEARCH_TIMEOUT_MS;
  let inFlight: AbortController | null = null;

  const cancel = () => {
    inFlight?.abort();
    inFlight = null;
  };

  async function ours(q: string, near: { lat: number; lng: number } | null, ctrl: AbortController): Promise<PhotonPlace[]> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new SearchFailure("timeout"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([deps.fetchPlaces(q, near, ctrl.signal), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    cancel,
    async search(query, near) {
      const q = query.trim();
      cancel();
      if (q.length < SEARCH_MIN_CHARS) return [];
      const ctrl = new AbortController();
      inFlight = ctrl;

      if (looksLikePostcode(q)) {
        const pc = await deps.lookupPostcode(q).catch(() => null);
        if (ctrl.signal.aborted) throw new SearchFailure("aborted");
        if (pc) return [pc];
      }

      try {
        const places = await ours(q, near, ctrl);
        if (ctrl.signal.aborted && inFlight !== ctrl) throw new SearchFailure("aborted");
        return places.map((p, i) => ({
          id: `ph:${i}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`,
          title: p.name,
          subtitle: p.address || null,
          lat: p.lat,
          lng: p.lng,
        }));
      } catch (err) {
        // A newer search replaced this one: say nothing, change nothing.
        if (inFlight !== ctrl) throw new SearchFailure("aborted");
        if (err instanceof SearchFailure && err.kind === "bad_input") return [];
        // Down, unreachable, slow or not switched on: the existing search.
        return deps.fallback.search(q, near);
      } finally {
        if (inFlight === ctrl) inFlight = null;
      }
    },
    async resolve(r) {
      if (r.lat != null && r.lng != null) return { lat: r.lat, lng: r.lng, label: r.title };
      return deps.fallback.resolve(r);
    },
  };
}
