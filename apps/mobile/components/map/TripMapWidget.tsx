import { View, StyleSheet, UIManager, Platform } from "react-native";
import { useMemo } from "react";
import { colors } from "../../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;

// Lazy import for Expo Go compatibility
let MapViewComponent: any = null;
let PolylineComponent: any = null;
let MarkerComponent: any = null;
const hasNativeMap =
  Platform.OS !== "web" &&
  UIManager.getViewManagerConfig?.("AIRMap") != null;
if (hasNativeMap) {
  try {
    const RNMaps = require("react-native-maps");
    MapViewComponent = RNMaps.default;
    PolylineComponent = RNMaps.Polyline;
    MarkerComponent = RNMaps.Marker;
  } catch {
    // Not available
  }
}

interface Coordinate {
  lat: number;
  lng: number;
}

interface TripMapWidgetProps {
  /** Raw GPS breadcrumbs from the trip — used as a fallback. */
  coordinates: Coordinate[];
  /** Server-provided road-snapped polyline (GraphHopper /match output).
   *  When present, takes priority over `coordinates` because it's a
   *  cleaner visual route — no GPS jitter, follows actual roads. */
  matchedCoordinates?: Coordinate[] | null;
  height?: number;
  interactive?: boolean;
}

export function TripMapWidget({
  coordinates,
  matchedCoordinates,
  height = 200,
  interactive = false,
}: TripMapWidgetProps) {
  // Use the matched polyline when the server has computed one — it's
  // road-snapped and looks materially cleaner than raw breadcrumbs.
  // Fall back to breadcrumbs when no match is available (older trips,
  // map-matching fail, or coords below the matching threshold).
  const renderCoords = matchedCoordinates && matchedCoordinates.length >= 2
    ? matchedCoordinates
    : coordinates;

  const region = useMemo(() => {
    if (renderCoords.length === 0) return undefined;

    let minLat = renderCoords[0].lat;
    let maxLat = renderCoords[0].lat;
    let minLng = renderCoords[0].lng;
    let maxLng = renderCoords[0].lng;

    for (const c of renderCoords) {
      if (c.lat < minLat) minLat = c.lat;
      if (c.lat > maxLat) maxLat = c.lat;
      if (c.lng < minLng) minLng = c.lng;
      if (c.lng > maxLng) maxLng = c.lng;
    }

    const latDelta = Math.max((maxLat - minLat) * 1.4, 0.005);
    const lngDelta = Math.max((maxLng - minLng) * 1.4, 0.005);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [renderCoords]);

  const polylineCoords = useMemo(
    () => renderCoords.map((c) => ({ latitude: c.lat, longitude: c.lng })),
    [renderCoords]
  );

  if (!region || renderCoords.length < 2) return null;

  if (!MapViewComponent || !PolylineComponent || !MarkerComponent) {
    return null; // Silently hide map widget in Expo Go
  }

  // Always anchor markers to the original GPS breadcrumbs (the user's
  // actual start and end), not the snapped endpoints — keeps the pins
  // honest even when the matched route diverges slightly.
  const markerSource = coordinates.length >= 2 ? coordinates : renderCoords;
  const start = markerSource[0];
  const end = markerSource[markerSource.length - 1];

  return (
    <View style={[styles.container, { height }]}>
      <MapViewComponent
        style={StyleSheet.absoluteFillObject}
        region={region}
        userInterfaceStyle="dark"
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        showsCompass={false}
        showsScale={false}
        showsPointsOfInterest={false}
      >
        <PolylineComponent
          coordinates={polylineCoords}
          strokeColor={AMBER}
          strokeWidth={3}
        />
        <MarkerComponent
          coordinate={{ latitude: start.lat, longitude: start.lng }}
          pinColor="#34c759"
        />
        <MarkerComponent
          coordinate={{ latitude: end.lat, longitude: end.lng }}
          pinColor="#dc2626"
        />
      </MapViewComponent>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
  },
});
