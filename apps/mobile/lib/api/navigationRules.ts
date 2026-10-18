// Pure parts of the navigation client (no fetch, no SecureStore), so they
// can be tested under vitest.

import type { NavigationErrorCode } from "@mileclear/shared";

export type NavigationErrorKind = NavigationErrorCode | "OFFLINE" | "TOO_MANY_REQUESTS" | "UNKNOWN";

export class NavigationError extends Error {
  readonly kind: NavigationErrorKind;
  constructor(kind: NavigationErrorKind, message: string) {
    super(message);
    this.name = "NavigationError";
    this.kind = kind;
  }
}

/** Short fallbacks; the Directions screens show DESIGN 2.8's titles and bodies. */
export const NAVIGATION_ERROR_TEXT: Record<NavigationErrorKind, string> = {
  NAVIGATION_NOT_ENABLED: "Directions aren't switched on for your account",
  NO_ROUTE: "Can't find a route to there",
  ROUTING_UNAVAILABLE: "Directions aren't working right now",
  BAD_INPUT: "Can't find a route to there",
  OFFLINE: "No internet connection",
  TOO_MANY_REQUESTS: "Too many routes in a minute",
  UNKNOWN: "Directions aren't working right now",
};

/** No answer in this long counts as "not working right now" (DESIGN 2.8). */
export const ROUTE_TIMEOUT_MS = 10_000;
export const ROUTE_TIMEOUT = "ROUTE_TIMEOUT";

export interface LatLngInput {
  lat: number;
  lng: number;
}

function coord(p: LatLngInput): string {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

export function routeQuery(args: { from: LatLngInput; to: LatLngInput; headingDeg?: number | null }): string {
  const parts = [`from=${encodeURIComponent(coord(args.from))}`, `to=${encodeURIComponent(coord(args.to))}`];
  const h = args.headingDeg;
  if (h != null && Number.isFinite(h)) {
    const deg = ((Math.round(h) % 360) + 360) % 360;
    parts.push(`heading=${deg}`);
  }
  return parts.join("&");
}

const CODES: readonly NavigationErrorCode[] = ["NAVIGATION_NOT_ENABLED", "NO_ROUTE", "ROUTING_UNAVAILABLE", "BAD_INPUT"];

/**
 * Turn whatever apiRequest threw into a NavigationError. `api` is the
 * ApiError's status and code when it was one. The server sends the contract's
 * codes in the older { error, code } shape, which parseApiError turns into a
 * status-based code, so the status decides.
 */
export function toNavigationError(
  err: unknown,
  api: { statusCode: number; code: string } | null
): NavigationError {
  if (err instanceof NavigationError) return err;
  let kind: NavigationErrorKind = "UNKNOWN";
  if (api) {
    if ((CODES as readonly string[]).includes(api.code)) kind = api.code as NavigationErrorCode;
    else if (api.statusCode === 403) kind = "NAVIGATION_NOT_ENABLED";
    else if (api.statusCode === 404) kind = "NO_ROUTE";
    else if (api.statusCode === 400) kind = "BAD_INPUT";
    else if (api.statusCode === 429) kind = "TOO_MANY_REQUESTS";
    else if (api.statusCode >= 500) kind = "ROUTING_UNAVAILABLE";
  } else if (err instanceof Error && /^Network error|REFRESH_NETWORK_ERROR|Network request failed/.test(err.message)) {
    kind = "OFFLINE";
  } else if (err instanceof Error && err.message === ROUTE_TIMEOUT) {
    kind = "ROUTING_UNAVAILABLE";
  }
  return new NavigationError(kind, NAVIGATION_ERROR_TEXT[kind]);
}
