// SmartMap — unified map that shows current location by default,
// or the last trip route after a journey. Combines LiveMapTracker + MapOverview.

import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  UIManager,
  Platform,
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { AvatarIcon } from "../avatars/AvatarRegistry";
import type { TripDetail } from "../../lib/api/trips";

// Lazy native map import (Expo Go safe)
let MapViewComponent: any = null;
let PolylineComponent: any = null;
let MarkerComponent: any = null;
let CircleComponent: any = null;
const hasNativeMap =
  Platform.OS !== "web" &&
  UIManager.getViewManagerConfig?.("AIRMap") != null;
if (hasNativeMap) {
  try {
    const RNMaps = require("react-native-maps");
    MapViewComponent = RNMaps.default;
    PolylineComponent = RNMaps.Polyline;
    MarkerComponent = RNMaps.Marker;
    CircleComponent = RNMaps.Circle;
  } catch {
    // Not available
  }
}

interface LatLng {
  latitude: number;
  longitude: number;
}

interface SmartMapProps {
  avatarId?: string | null;
  /** Most recent trip — if it has coordinates, we show the route */
  lastTrip?: TripDetail | null;
  height?: number;
}

const AMBER = "#f5a623";
const BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const TEXT_2 = "#8494a7";

export function SmartMap({ avatarId, lastTrip, height = 240 }: SmartMapProps) {
  const mapRef = useRef<any>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [followUser, setFollowUser] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const hasRoute = lastTrip && lastTrip.coordinates.length >= 2;

  // Foreground location watcher
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 10,
        },
        (loc) => {
          const pos: LatLng = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setUserLocation(pos);
          if (loc.coords.heading != null && loc.coords.heading >= 0) {
            setHeading(loc.coords.heading);
          }

          // Auto-center on user only when no route is shown
          if (followUser && !hasRoute && mapRef.current) {
            mapRef.current.animateToRegion(
              { ...pos, latitudeDelta: 0.008, longitudeDelta: 0.008 },
              500
            );
          }
        }
      );
    })();

    return () => { sub?.remove(); };
  }, [followUser, hasRoute]);

  // When a route appears, fit map to its bounds
  useEffect(() => {
    if (!hasRoute || !mapRef.current) return;
    const coords = lastTrip!.coordinates;
    const points: LatLng[] = coords.map((c) => ({
      latitude: c.lat,
      longitude: c.lng,
    }));
    if (userLocation) points.push(userLocation);

    // Small delay to ensure map is mounted
    setTimeout(() => {
      mapRef.current?.fitToCoordinates?.(points, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }, 300);
  }, [hasRoute, lastTrip?.id]);

  const handleRecenter = useCallback(() => {
    setFollowUser(true);
    if (hasRoute && mapRef.current && lastTrip) {
      const points = lastTrip.coordinates.map((c) => ({
        latitude: c.lat,
        longitude: c.lng,
      }));
      if (userLocation) points.push(userLocation);
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    } else if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion(
        { ...userLocation, latitudeDelta: 0.008, longitudeDelta: 0.008 },
        400
      );
    }
  }, [userLocation, hasRoute, lastTrip]);

  // Fallback for Expo Go
  if (!MapViewComponent) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.fallback}>
          <Ionicons name="map-outline" size={32} color={TEXT_2} />
          <Text style={styles.fallbackText}>
            Map requires a development build
          </Text>
        </View>
      </View>
    );
  }

  const initialRegion = userLocation
    ? { ...userLocation, latitudeDelta: 0.008, longitudeDelta: 0.008 }
    : { latitude: 51.5074, longitude: -0.1278, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  const routeCoords = hasRoute
    ? lastTrip!.coordinates.map((c) => ({ latitude: c.lat, longitude: c.lng }))
    : [];

  const routeDistance = hasRoute
    ? (() => {
        let total = 0;
        const coords = lastTrip!.coordinates;
        for (let i = 1; i < coords.length; i++) {
          const R = 3958.8;
          const dLat = ((coords[i].lat - coords[i - 1].lat) * Math.PI) / 180;
          const dLng = ((coords[i].lng - coords[i - 1].lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((coords[i - 1].lat * Math.PI) / 180) *
              Math.cos((coords[i].lat * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        return total;
      })()
    : 0;

  const renderMap = (interactive: boolean, mapHeight: number | "full") => (
    <MapViewComponent
      ref={interactive ? undefined : mapRef}
      style={mapHeight === "full" ? StyleSheet.absoluteFillObject : { height: mapHeight }}
      initialRegion={initialRegion}
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
      onPanDrag={() => setFollowUser(false)}
    >
      {/* Route polyline */}
      {hasRoute && PolylineComponent && (
        <PolylineComponent
          coordinates={routeCoords}
          strokeColor={AMBER}
          strokeWidth={3}
        />
      )}

      {/* Route start marker */}
      {hasRoute && MarkerComponent && (
        <MarkerComponent
          coordinate={routeCoords[0]}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.startDot} />
        </MarkerComponent>
      )}

      {/* Route end marker */}
      {hasRoute && MarkerComponent && routeCoords.length >= 2 && (
        <MarkerComponent
          coordinate={routeCoords[routeCoords.length - 1]}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.endDot} />
        </MarkerComponent>
      )}

      {/* Current location */}
      {userLocation && MarkerComponent && (
        <MarkerComponent
          coordinate={userLocation}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          rotation={heading}
        >
          {avatarId ? (
            <AvatarIcon avatarId={avatarId} size={34} />
          ) : (
            <View style={styles.userDot}>
              <View style={styles.userDotInner} />
              {heading > 0 && <View style={styles.userArrow} />}
            </View>
          )}
        </MarkerComponent>
      )}

      {/* Accuracy circle */}
      {userLocation && !hasRoute && CircleComponent && (
        <CircleComponent
          center={userLocation}
          radius={30}
          fillColor="rgba(245, 166, 35, 0.08)"
          strokeColor="rgba(245, 166, 35, 0.2)"
          strokeWidth={1}
        />
      )}
    </MapViewComponent>
  );

  return (
    <>
      <TouchableOpacity
        style={[styles.container, { height }]}
        activeOpacity={0.9}
        onPress={() => setFullscreen(true)}
      >
        {renderMap(false, height)}

        {/* Controls */}
        <View style={styles.controls}>
          {!followUser && (
            <TouchableOpacity
              style={styles.controlBtn}
              onPress={handleRecenter}
              activeOpacity={0.7}
            >
              <Ionicons name="locate-outline" size={18} color={TEXT_2} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => setFullscreen(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="expand-outline" size={16} color={TEXT_2} />
          </TouchableOpacity>
        </View>

        {/* Route badge */}
        {hasRoute && (
          <View style={styles.routeBadge}>
            <Text style={styles.routeBadgeText}>Last trip</Text>
            <Text style={styles.routeBadgeDistance}>
              {routeDistance < 10 ? routeDistance.toFixed(1) : Math.round(routeDistance)} mi
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Fullscreen modal */}
      <Modal
        visible={fullscreen}
        animationType="slide"
        onRequestClose={() => setFullscreen(false)}
      >
        <View style={styles.fullscreenContainer}>
          {renderMap(true, "full")}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setFullscreen(false)}
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 16,
  },
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  fallbackText: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 13,
    color: TEXT_2,
    textAlign: "center",
  },
  controls: {
    position: "absolute",
    top: 12,
    right: 12,
    gap: 8,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(10, 17, 32, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  routeBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "rgba(10, 17, 32, 0.9)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeBadgeText: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 11,
    color: TEXT_2,
  },
  routeBadgeDistance: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 13,
    color: AMBER,
  },
  // Markers
  userDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(245, 166, 35, 0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  userDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: AMBER,
    borderWidth: 2,
    borderColor: "#fff",
  },
  userArrow: {
    position: "absolute",
    top: -4,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: AMBER,
  },
  startDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#34c759",
    borderWidth: 2,
    borderColor: "#fff",
  },
  endDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ef4444",
    borderWidth: 2,
    borderColor: "#fff",
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: "#030712",
  },
  closeBtn: {
    position: "absolute",
    top: 56,
    right: 20,
    backgroundColor: "rgba(3, 7, 18, 0.85)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  closeBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
});
