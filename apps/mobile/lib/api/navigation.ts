// GET /navigation/route (docs/navigation-build-oct2026.md). Our own
// GraphHopper: OpenStreetMap roads in Great Britain, no live traffic.
// `heading` (the car's course, degrees) goes on every request made while
// moving, reroutes included, so the server can prefer a start in the
// direction of travel. No answer in 10 seconds counts as "not working".

import type { NavigationRoute, NavigationRouteResponse } from "@mileclear/shared";
import { apiRequest } from "./index";
import { isApiError } from "./apiError";
import { ROUTE_TIMEOUT, ROUTE_TIMEOUT_MS, routeQuery, toNavigationError, type LatLngInput } from "./navigationRules";

export { NavigationError, toNavigationError, routeQuery } from "./navigationRules";
export type { NavigationErrorKind } from "./navigationRules";

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
