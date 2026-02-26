// LiveMapTracker — follows the user's current location with optional breadcrumb trail.
// Works in both active shift (reads shift_coordinates from SQLite) and personal mode.

import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  UIManager,
  Platform,
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { getDatabase } from "../../lib/db/index";
import { AvatarIcon } from "../avatars/AvatarRegistry";

// ── Lazy native map import (Expo Go safe) ──────────────────────────
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

// ── Types ───────────────────────────────────────────────────────────

interface LatLng {
  latitude: number;
  longitude: number;
}

interface LiveMapTrackerProps {
  /** Active shift ID — if set, reads trail from shift_coordinates table */
  shiftId?: string | null;
  /** Map height */
  height?: number;
  /** Whether to default the trail on */
  trailDefault?: boolean;
  /** User's selected avatar ID — shown as map marker */
  avatarId?: string | null;
}

// ── Constants ───────────────────────────────────────────────────────

const AMBER = "#f5a623";
const BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const TEXT_2 = "#8494a7";
const TRAIL_POLL_MS = 3000; // Poll shift_coordinates every 3s
const LOCATION_INTERVAL_MS = 2000; // Foreground location watch interval

// ── Component ───────────────────────────────────────────────────────

export function LiveMapTracker({
  shiftId,
  height = 260,
  trailDefault = true,
  avatarId,
}: LiveMapTrackerProps) {
  const mapRef = useRef<any>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [trail, setTrail] = useState<LatLng[]>([]);
  const [showTrail, setShowTrail] = useState(trailDefault);
  const [followUser, setFollowUser] = useState(true);
  const personalTrailRef = useRef<LatLng[]>([]);

  // ── Foreground location watcher ────────────────────────────────
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: LOCATION_INTERVAL_MS,
          distanceInterval: 5, // meters
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

          // In personal mode (no shiftId), build trail in memory
          if (!shiftId && showTrail) {
            personalTrailRef.current = [...personalTrailRef.current, pos];
            setTrail([...personalTrailRef.current]);
          }

          // Auto-center map on user
          if (followUser && mapRef.current) {
            mapRef.current.animateToRegion(
              {
                ...pos,
                latitudeDelta: 0.008,
                longitudeDelta: 0.008,
              },
              500
            );
          }
        }
      );
    })();

    return () => {
      sub?.remove();
    };
  }, [shiftId, followUser, showTrail]);

  // ── Shift trail: poll shift_coordinates from SQLite ─────────────
  useEffect(() => {
    if (!shiftId) return;

    let mounted = true;
    const poll = async () => {
      try {
        const db = await getDatabase();
        const rows = await db.getAllAsync<{ lat: number; lng: number }>(
          "SELECT lat, lng FROM shift_coordinates WHERE shift_id = ? ORDER BY recorded_at ASC",
          [shiftId]
        );
        if (mounted) {
          setTrail(
            rows.map((r) => ({ latitude: r.lat, longitude: r.lng }))
          );
        }
      } catch {
        // DB not ready yet
      }
    };

    poll(); // Initial read
    const interval = setInterval(poll, TRAIL_POLL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [shiftId]);

  // ── Reset personal trail when toggled off ─────────────────────
  const handleToggleTrail = useCallback(() => {
    setShowTrail((prev) => {
      if (prev) {
        // Turning off — clear personal trail
        if (!shiftId) {
          personalTrailRef.current = [];
          setTrail([]);
        }
      }
      return !prev;
    });
  }, [shiftId]);

  // ── Re-center button ─────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    setFollowUser(true);
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          ...userLocation,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        },
        400
      );
    }
  }, [userLocation]);

  // ── Render ────────────────────────────────────────────────────

  if (!MapViewComponent) {
    // Expo Go fallback — show a placeholder
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.fallback}>
          <Ionicons name="map-outline" size={32} color={TEXT_2} />
          <Text style={styles.fallbackText}>
            Live map requires a development build
          </Text>
        </View>
      </View>
    );
  }

  const initialRegion = userLocation
    ? {
        ...userLocation,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }
    : {
        latitude: 51.5074, // London fallback
        longitude: -0.1278,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  return (
    <View style={[styles.container, { height }]}>
      <MapViewComponent
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        userInterfaceStyle="dark"
        showsUserLocation={false}
        showsCompass={false}
        showsScale={false}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        onPanDrag={() => setFollowUser(false)}
      >
        {/* Trail polyline */}
        {showTrail && trail.length >= 2 && PolylineComponent && (
          <PolylineComponent
            coordinates={trail}
            strokeColor={AMBER}
            strokeWidth={3}
            lineDashPattern={undefined}
          />
        )}

        {/* Trail start marker */}
        {showTrail && trail.length >= 2 && MarkerComponent && (
          <MarkerComponent
            coordinate={trail[0]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.startDot} />
          </MarkerComponent>
        )}

        {/* User location marker */}
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
        {userLocation && CircleComponent && (
          <CircleComponent
            center={userLocation}
            radius={30}
            fillColor="rgba(245, 166, 35, 0.08)"
            strokeColor="rgba(245, 166, 35, 0.2)"
            strokeWidth={1}
          />
        )}
      </MapViewComponent>

      {/* Controls overlay */}
      <View style={styles.controls}>
        {/* Trail toggle */}
        <TouchableOpacity
          style={[styles.controlBtn, showTrail && styles.controlBtnActive]}
          onPress={handleToggleTrail}
          activeOpacity={0.7}
        >
          <Ionicons
            name={showTrail ? "trail-sign" : "trail-sign-outline"}
            size={18}
            color={showTrail ? "#030712" : TEXT_2}
          />
        </TouchableOpacity>

        {/* Re-center */}
        {!followUser && (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={handleRecenter}
            activeOpacity={0.7}
          >
            <Ionicons name="locate-outline" size={18} color={TEXT_2} />
          </TouchableOpacity>
        )}
      </View>

      {/* Trail distance badge */}
      {showTrail && trail.length >= 2 && (
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceText}>
            {trailDistance(trail).toFixed(1)} mi
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Trail distance calculator ───────────────────────────────────────

function trailDistance(coords: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const R = 3958.8;
    const dLat = ((coords[i].latitude - coords[i - 1].latitude) * Math.PI) / 180;
    const dLng = ((coords[i].longitude - coords[i - 1].longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((coords[i - 1].latitude * Math.PI) / 180) *
        Math.cos((coords[i].latitude * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

// ── Styles ──────────────────────────────────────────────────────────

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
  controlBtnActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  distanceBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "rgba(10, 17, 32, 0.85)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  distanceText: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 12,
    color: AMBER,
  },
  // User location dot
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
  // Start dot (green)
  startDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#34c759",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
