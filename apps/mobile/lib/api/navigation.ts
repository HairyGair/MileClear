// GET /navigation/route (docs/navigation-build-oct2026.md). Our own
// GraphHopper: OpenStreetMap roads in Great Britain, no live traffic.
//
// The server answers errors as { error: "message", code: "NO_ROUTE" }, the
// older shape, which parseApiError turns into a status-based code (FORBIDDEN,
// NOT_FOUND, INTERNAL). The navigation codes are recovered here from the
// status so the screen can say the right thing.

import type { NavigationRoute, NavigationRouteResponse } from "@mileclear/shared";
import { apiRequest } from "./index";
import { isApiError } from "./apiError";
import { routeQuery, toNavigationError, type LatLngInput } from "./navigationRules";

export { NavigationError, toNavigationError, routeQuery } from "./navigationRules";
export type { NavigationErrorKind } from "./navigationRules";

export async function fetchNavigationRoute(args: {
  from: LatLngInput;
  to: LatLngInput;
  headingDeg?: number | null;
}): Promise<NavigationRoute> {
  try {
    const res = await apiRequest<NavigationRouteResponse>(`/navigation/route?${routeQuery(args)}`);
    return res.data;
  } catch (err) {
    throw toNavigationError(err, isApiError(err) ? { statusCode: err.statusCode, code: err.code } : null);
  }
}
