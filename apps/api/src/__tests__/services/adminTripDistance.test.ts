/**
 * Distance for an admin-created trip (POST /admin/users/:userId/trips).
 *
 * On 26 Sep 2026 a Fleetwood to Liverpool restore would have been stored as
 * ~30.5 mi crow-flies against a real 54.7 mi road distance. These tests pin
 * that a typed distance is kept, an omitted one is routed (with geometry),
 * and a routing outage gives null (the route's 503) rather than a straight
 * line.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));

import { resolveAdminTripDistance } from "../../services/adminTripDistance.js";
import type { RouteResult } from "../../services/routing.js";

const USER_ID = "00000000-0000-0000-0000-000000000042";
// Fleetwood to Liverpool.
const COORDS = { startLat: 53.9166, startLng: -3.0357, endLat: 53.4084, endLng: -2.9916 };

function routed(overrides: Partial<RouteResult> = {}): RouteResult {
  return {
    distanceMiles: 54.7,
    durationSecs: 4200,
    source: "graphhopper",
    routeToHaversineRatio: 1.79,
    encodedPolyline: "abc123",
    ...overrides,
  };
}

describe("resolveAdminTripDistance", () => {
  it("keeps a distance the admin typed and does not route", async () => {
    const resolve = vi.fn();
    const result = await resolveAdminTripDistance(
      { ...COORDS, distanceMiles: 12.3, userId: USER_ID },
      resolve,
    );
    expect(result).toEqual({ distanceMiles: 12.3, distanceSource: "admin", routePolyline: null });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("uses the road distance and geometry when no distance is typed", async () => {
    const resolve = vi.fn().mockResolvedValue(routed());
    const result = await resolveAdminTripDistance({ ...COORDS, userId: USER_ID }, resolve);
    expect(result).toEqual({ distanceMiles: 54.7, distanceSource: "graphhopper", routePolyline: "abc123" });
    expect(resolve).toHaveBeenCalledWith({ ...COORDS, userId: USER_ID });
  });

  it("reports the routing source and tolerates a route with no geometry", async () => {
    const resolve = vi.fn().mockResolvedValue(routed({ source: "cache", encodedPolyline: null }));
    const result = await resolveAdminTripDistance({ ...COORDS, userId: USER_ID }, resolve);
    expect(result).toEqual({ distanceMiles: 54.7, distanceSource: "cache", routePolyline: null });
  });

  it("returns null instead of a crow-flies figure when routing is unavailable", async () => {
    const resolve = vi.fn().mockResolvedValue(null);
    const result = await resolveAdminTripDistance({ ...COORDS, userId: USER_ID }, resolve);
    expect(result).toBeNull();
  });
});
