import { View, Text, StyleSheet, UIManager, Platform } from "react-native";
import { useMemo } from "react";

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
  coordinates: Coordinate[];
  height?: number;
  interactive?: boolean;
}

export function TripMapWidget({
  coordinates,
  height = 200,
  interactive = false,
}: TripMapWidgetProps) {
  const region = useMemo(() => {
    if (coordinates.length === 0) return undefined;

    let minLat = coordinates[0].lat;
    let maxLat = coordinates[0].lat;
    let minLng = coordinates[0].lng;
    let maxLng = coordinates[0].lng;

    for (const c of coordinates) {
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
  }, [coordinates]);

  const polylineCoords = useMemo(
    () => coordinates.map((c) => ({ latitude: c.lat, longitude: c.lng })),
    [coordinates]
  );

  if (!region || coordinates.length < 2) return null;

  if (!MapViewComponent || !PolylineComponent || !MarkerComponent) {
    return null; // Silently hide map widget in Expo Go
  }

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];

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
          strokeColor="#f5a623"
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
