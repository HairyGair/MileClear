// POST /navigation/route and POST /navigation/search
// (docs/navigation-build-oct2026.md). Our own GraphHopper and Photon on
// OpenStreetMap, Great Britain, no live traffic.
//
// Both send places and positions in a JSON body, never in the URL, so they
// never reach Apache's or our request logs (19 Oct 2026). An older server
// without the POST forms (404 "Not Found" / 405) counts as "not available":
// we never retry with GET, which would put the places back in a URL.
//
// `heading` (the car's course, degrees) goes on every route request made
// while moving, reroutes included. No route answer in 10 s counts as "not
// working right now".

import type { NavigationRoute, NavigationRouteResponse } from "@mileclear/shared";
import { apiRequest } from "./index";
import { isApiError } from "./apiError";
import {
  isMissingEndpoint,
  ROUTE_TIMEOUT,
  ROUTE_TIMEOUT_MS,
  routeBody,
  searchBody,
  toNavigationError,
  type LatLngInput,
} from "./navigationRules";
import { SearchFailure, type PhotonPlace } from "../navigation/photonSearch";

export { NavigationError, toNavigationError, routeBody, searchBody } from "./navigationRules";
export type { NavigationErrorKind } from "./navigationRules";

/**
 * Rejects with a SearchFailure: "bad_input" for 400; "unavailable" for 503,
 * 403, an older server without the POST form, or any other answer;
 * "offline" when unreachable. The query is never logged.
 */
export async function fetchNavigationSearch(
  q: string,
  near: { lat: number; lng: number } | null,
  signal: AbortSignal
): Promise<PhotonPlace[]> {
  try {
    const res = await apiRequest<{ data: { places: PhotonPlace[] } }>("/navigation/search", {
      method: "POST",
      body: JSON.stringify(searchBody(q, near)),
      signal,
    });
    return (res.data?.places ?? []).filter(
      (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && typeof p.name === "string"
    );
  } catch (err) {
    if (signal.aborted) throw new SearchFailure("aborted");
    if (isApiError(err)) {
      const missing = isMissingEndpoint({ statusCode: err.statusCode, message: err.message });
      throw new SearchFailure(err.statusCode === 400 && !missing ? "bad_input" : "unavailable");
    }
    throw new SearchFailure("offline");
  }
}

export async function fetchNavigationRoute(args: {
  from: LatLngInput;
  to: LatLngInput;
  headingDeg?: number | null;
}): Promise<NavigationRoute> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(ROUTE_TIMEOUT)), ROUTE_TIMEOUT_MS);
    });
    const res = await Promise.race([
      apiRequest<NavigationRouteResponse>("/navigation/route", {
        method: "POST",
        body: JSON.stringify(routeBody(args)),
      }),
      timeout,
    ]);
    return res.data;
  } catch (err) {
    throw toNavigationError(
      err,
      isApiError(err) ? { statusCode: err.statusCode, code: err.code, message: err.message } : null
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
