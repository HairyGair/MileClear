// GET /navigation/route (docs/navigation-build-oct2026.md). Our own
// GraphHopper: OpenStreetMap roads in Great Britain, no live traffic.
// `heading` (the car's course, degrees) goes on every request made while
// moving, reroutes included, so the server can prefer a start in the
// direction of travel. No answer in 10 seconds counts as "not working".

import type { NavigationRoute, NavigationRouteResponse } from "@mileclear/shared";
import { apiRequest } from "./index";
import { isApiError } from "./apiError";
import { ROUTE_TIMEOUT, ROUTE_TIMEOUT_MS, routeQuery, toNavigationError, type LatLngInput } from "./navigationRules";
import { SearchFailure, type PhotonPlace } from "../navigation/photonSearch";

export { NavigationError, toNavigationError, routeQuery } from "./navigationRules";
export type { NavigationErrorKind } from "./navigationRules";

/**
 * GET /navigation/search (our own Photon). Rejects with a SearchFailure:
 * "bad_input" for 400, "unavailable" for 503 / 403 / other answers,
 * "offline" when unreachable. The query is never logged.
 */
export async function fetchNavigationSearch(
  q: string,
  near: { lat: number; lng: number } | null,
  signal: AbortSignal
): Promise<PhotonPlace[]> {
  const params = [`q=${encodeURIComponent(q)}`];
  if (near) params.push(`near=${encodeURIComponent(`${near.lat.toFixed(5)},${near.lng.toFixed(5)}`)}`);
  try {
    const res = await apiRequest<{ data: { places: PhotonPlace[] } }>(`/navigation/search?${params.join("&")}`, { signal });
    return (res.data?.places ?? []).filter(
      (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && typeof p.name === "string"
    );
  } catch (err) {
    if (signal.aborted) throw new SearchFailure("aborted");
    if (isApiError(err)) throw new SearchFailure(err.statusCode === 400 ? "bad_input" : "unavailable");
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
      apiRequest<NavigationRouteResponse>(`/navigation/route?${routeQuery(args)}`),
      timeout,
    ]);
    return res.data;
  } catch (err) {
    throw toNavigationError(err, isApiError(err) ? { statusCode: err.statusCode, code: err.code } : null);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
