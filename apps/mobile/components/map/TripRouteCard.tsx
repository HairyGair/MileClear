// The map that sits inside a trip card: where the drive actually went.
//
// Anthony, 2 Sep 2026: "add a map card to show in the trip, irrespective of
// its classification, or inbox. Just show a map." Business or Personal is a
// question about where you went, and the list was answering it with two
// addresses and a distance.
//
// Cheap by construction:
//  - The trips LIST already carries each trip's map-matched route as an
//    encoded polyline (trips.routePolyline), so most cards draw with no
//    request at all. Decoded once per card and thinned to ~120 points.
//  - A trip with breadcrumbs but no match yet (older trips, matching
//    failed) makes ONE fetch of /trips/:id, cached for the session.
//  - A manual trip has no route, so it shows its two pins and no line.
//  - The widget renders in the map SDK's cached / lite modes here, so a
//    list of them is a list of images, not a list of live maps.
//  - pointerEvents="none": the card's own tap (open the trip) and the swipe
//    gestures keep working straight through the map.

import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { TripMapWidget } from "./TripMapWidget";
import { fetchTrip } from "../../lib/api/trips";
import { safeDecodePolyline, samplePoints, type LatLng } from "../../lib/polyline";

const MAX_POINTS = 120;

/** Session-lifetime cache of fetched routes, keyed by trip id. An empty
 *  array records "asked, nothing there" so a card never re-fetches. */
const fetchedRoutes = new Map<string, LatLng[]>();

interface TripRouteCardProps {
  tripId: string;
  routePolyline?: string | null;
  isManualEntry?: boolean;
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

function isCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

export function TripRouteCard({
  tripId,
  routePolyline,
  isManualEntry = false,
  startLat,
  startLng,
  endLat,
  endLng,
  height = 120,
  style,
}: TripRouteCardProps) {
  const fromPolyline = useMemo(
    () => samplePoints(safeDecodePolyline(routePolyline), MAX_POINTS),
    [routePolyline]
  );
  const [fetched, setFetched] = useState<LatLng[] | null>(() => fetchedRoutes.get(tripId) ?? null);

  const needsFetch = fromPolyline.length < 2 && !isManualEntry && !fetchedRoutes.has(tripId);

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    fetchTrip(tripId)
      .then((res) => {
        const t = res.data as {
          matchedCoordinates?: LatLng[] | null;
          coordinates?: { lat?: unknown; lng?: unknown }[] | null;
        };
        const matched = t.matchedCoordinates ?? [];
        const raw = (t.coordinates ?? [])
          .filter((c): c is { lat: number; lng: number } => isCoord(c?.lat, c?.lng))
          .map((c) => ({ lat: c.lat, lng: c.lng }));
        const route = samplePoints(matched.length >= 2 ? matched : raw, MAX_POINTS);
        fetchedRoutes.set(tripId, route);
        if (!cancelled) setFetched(route);
      })
      .catch(() => {
        // Offline or gone: remember that we asked, show the pins if we have them.
        fetchedRoutes.set(tripId, []);
        if (!cancelled) setFetched([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, needsFetch]);

  const route = fromPolyline.length >= 2 ? fromPolyline : fetched;
  const endpoints: LatLng[] | null =
    isCoord(startLat, startLng) && isCoord(endLat, endLng)
      ? [{ lat: startLat as number, lng: startLng as number }, { lat: endLat as number, lng: endLng as number }]
      : null;

  if (route && route.length >= 2) {
    return (
      <View pointerEvents="none" style={[styles.wrap, style]}>
        <TripMapWidget
          coordinates={endpoints ?? route}
          matchedCoordinates={route}
          height={height}
        />
      </View>
    );
  }

  // Still fetching: hold the space so the card does not jump when it lands.
  if (needsFetch && fetched === null) {
    return <View pointerEvents="none" style={[styles.wrap, styles.placeholder, { height }, style]} />;
  }

  if (endpoints) {
    return (
      <View pointerEvents="none" style={[styles.wrap, style]}>
        <TripMapWidget coordinates={endpoints} height={height} showLine={false} />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    overflow: "hidden",
  },
  placeholder: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
});
