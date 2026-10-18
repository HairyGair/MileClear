// Pure parts of the navigation client (no fetch, no SecureStore), so they
// can be tested under vitest.

import type { NavigationErrorCode } from "@mileclear/shared";

export type NavigationErrorKind = NavigationErrorCode | "OFFLINE" | "UNKNOWN";

export class NavigationError extends Error {
  readonly kind: NavigationErrorKind;
  constructor(kind: NavigationErrorKind, message: string) {
    super(message);
    this.name = "NavigationError";
    this.kind = kind;
  }
}

/** What the driver is told for each failure. Plain words, no codes. */
export const NAVIGATION_ERROR_TEXT: Record<NavigationErrorKind, string> = {
  NAVIGATION_NOT_ENABLED: "Navigation isn't switched on for your account yet.",
  NO_ROUTE: "We couldn't find a route there. Pick a place on a road in Great Britain.",
  ROUTING_UNAVAILABLE: "Routes aren't available right now. Please try again in a minute.",
  BAD_INPUT: "Something was wrong with those places. Please pick them again.",
  OFFLINE: "You're offline, so we can't get a route. Check your signal and try again.",
  UNKNOWN: "Something went wrong getting the route. Please try again.",
};

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
 * ApiError's status and code when it was one.
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
    else if (api.statusCode >= 500 || api.statusCode === 429) kind = "ROUTING_UNAVAILABLE";
  } else if (err instanceof Error && /^Network error|REFRESH_NETWORK_ERROR|Network request failed/.test(err.message)) {
    kind = "OFFLINE";
  }
  return new NavigationError(kind, NAVIGATION_ERROR_TEXT[kind]);
}
