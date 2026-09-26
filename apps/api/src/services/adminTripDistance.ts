// Distance for a trip an admin creates on a user's behalf
// (POST /admin/users/:userId/trips, used by support to restore missing trips).
//
// Mileage is claimed for tax, so this never invents a crow-flies figure.
// Until 26 Sep 2026 an omitted distance was stored as haversine: a Fleetwood
// to Liverpool restore would have gone in as ~30.5 mi against a real 54.7 mi
// road distance. Now:
//   - a distance the admin typed is kept exactly as given;
//   - otherwise we use the same road routing as GET /trips/route-distance
//     (cache, GraphHopper, Google), adopting its geometry so the map draws
//     the road path, as the manual-trip backfill does;
//   - if every engine is down we return null and the route answers 503,
//     asking the admin to type the miles in.

import { resolveRouteDistance, type RouteResult } from "./routing.js";

export type AdminTripDistanceSource = "admin" | RouteResult["source"];

export interface AdminTripDistance {
  distanceMiles: number;
  distanceSource: AdminTripDistanceSource;
  /** Road geometry for the trip's routePolyline, or null. Only ever set
   *  for a routed distance: a typed distance may not match any A to B
   *  route we would draw. */
  routePolyline: string | null;
}

export async function resolveAdminTripDistance(
  args: {
    distanceMiles?: number;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    userId: string;
  },
  resolve: typeof resolveRouteDistance = resolveRouteDistance,
): Promise<AdminTripDistance | null> {
  if (args.distanceMiles != null) {
    return { distanceMiles: args.distanceMiles, distanceSource: "admin", routePolyline: null };
  }

  const route = await resolve({
    startLat: args.startLat,
    startLng: args.startLng,
    endLat: args.endLat,
    endLng: args.endLng,
    userId: args.userId,
  });
  if (!route) return null;

  return {
    distanceMiles: route.distanceMiles,
    distanceSource: route.source,
    routePolyline: route.encodedPolyline ?? null,
  };
}
