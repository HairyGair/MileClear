import { View, StyleSheet, UIManager, Platform, type LayoutChangeEvent } from "react-native";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { colors } from "../../lib/theme";
import { isRealPoint, regionForPoints, zoomForRegion } from "../../lib/tripRegion";

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
  /** Extra amber pins along the route — the Split Trip screen uses these
   *  to show proposed cut points at detected stops. */
  cutMarkers?: Coordinate[];
  height?: number;
  interactive?: boolean;
  /** Draw the route line. Off for a manual trip's two pins, where a straight
   *  line between them would claim a route nobody recorded. */
  showLine?: boolean;
}

export function TripMapWidget({
  coordinates,
  matchedCoordinates,
  cutMarkers,
  height = 200,
  interactive = false,
  showLine = true,
}: TripMapWidgetProps) {
  // Only real points: a NaN or 0,0 placeholder would stretch the region
  // out to the whole world.
  const realCoords = useMemo(() => coordinates.filter(isRealPoint), [coordinates]);
  const realMatched = useMemo(
    () => (matchedCoordinates ?? []).filter(isRealPoint),
    [matchedCoordinates]
  );

  // Use the matched polyline when the server has computed one — it's
  // road-snapped and looks materially cleaner than raw breadcrumbs.
  // Fall back to breadcrumbs when no match is available (older trips,
  // map-matching fail, or coords below the matching threshold).
  const renderCoords = realMatched.length >= 2 ? realMatched : realCoords;

  // Keyed on the points' values, not the array's identity: callers build a
  // fresh array on every render (TripRouteCard's endpoints), and a fresh
  // `region` object makes the map move its camera again each time.
  const pointsKey = renderCoords.map((c) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const region = useMemo(() => regionForPoints(renderCoords), [pointsKey]);

  const polylineCoords = useMemo(
    () => renderCoords.map((c) => ({ latitude: c.lat, longitude: c.lng })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pointsKey]
  );

  // ── Android framing ──
  // Google Maps on Android can be left showing the whole world: the region
  // prop needs the map measured, and a camera move before onMapReady does
  // nothing. So once the map is ready AND laid out, the camera is set
  // directly from a centre and zoom (setCamera needs no measurement), and
  // again whenever the trip's points change.
  const mapRef = useRef<any>(null);
  const mapReadyRef = useRef(false);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);
  const regionRef = useRef(region);
  regionRef.current = region;

  const frameAndroid = useCallback(() => {
    if (Platform.OS !== "android") return;
    const r = regionRef.current;
    const size = sizeRef.current;
    if (!r || !size || !mapReadyRef.current || !mapRef.current?.setCamera) return;
    mapRef.current.setCamera({
      center: { latitude: r.latitude, longitude: r.longitude },
      zoom: zoomForRegion(r, size.width, size.height),
      heading: 0,
      pitch: 0,
    });
  }, []);

  useEffect(() => {
    frameAndroid();
  }, [region, frameAndroid]);

  const onMapReady = useCallback(() => {
    mapReadyRef.current = true;
    frameAndroid();
  }, [frameAndroid]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0) {
        sizeRef.current = { width, height };
        frameAndroid();
      }
    },
    [frameAndroid]
  );

  if (!region || renderCoords.length < 2) return null;

  if (!MapViewComponent || !PolylineComponent || !MarkerComponent) {
    return null; // Silently hide map widget in Expo Go
  }

  // Always anchor markers to the original GPS breadcrumbs (the user's
  // actual start and end), not the snapped endpoints — keeps the pins
  // honest even when the matched route diverges slightly.
  const markerSource = realCoords.length >= 2 ? realCoords : renderCoords;
  const start = markerSource[0];
  const end = markerSource[markerSource.length - 1];

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      <MapViewComponent
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        region={region}
        onMapReady={onMapReady}
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
        // A non-interactive widget is a picture of a route. Ask the SDK to
        // treat it as one: iOS renders once to an image (cacheEnabled),
        // Android uses its lite bitmap mode. That is what makes a list of
        // trip cards with a map each (TripRouteCard, 2 Sep 2026) affordable.
        //
        // Not cacheEnabled on Android: there it is a one-off snapshot laid
        // over the map, taken the moment the map first loads. In lite mode
        // that can be before the camera has reached the trip, and the frozen
        // picture of the whole world then hides the real map for good
        // (Elisa, 3 Oct 2026). Lite mode is already a bitmap, so the list
        // stays cheap without it.
        cacheEnabled={!interactive && Platform.OS === "ios"}
        liteMode={!interactive}
      >
        {showLine && (
          <PolylineComponent
            coordinates={polylineCoords}
            strokeColor={AMBER}
            strokeWidth={3}
          />
        )}
        <MarkerComponent
          coordinate={{ latitude: start.lat, longitude: start.lng }}
          pinColor="#34c759"
        />
        <MarkerComponent
          coordinate={{ latitude: end.lat, longitude: end.lng }}
          pinColor="#dc2626"
        />
        {cutMarkers?.map((c, i) => (
          <MarkerComponent
            key={`cut-${i}`}
            coordinate={{ latitude: c.lat, longitude: c.lng }}
            pinColor={AMBER}
            anchor={{ x: 0.5, y: 0.5 }}
          />
        ))}
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
