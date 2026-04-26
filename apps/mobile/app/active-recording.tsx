// Active Recording Screen
//
// The canonical destination for any UI surface that signals "a trip is being
// recorded right now": the persistent in-progress notification, the Live
// Activity tap, the Dynamic Island, and the in-app dashboard banner all
// route here.
//
// Shows live distance + duration sourced from the buffered detection
// coordinates, a route polyline on the map (when react-native-maps is
// available - falls back to a simple status card in Expo Go / no-map
// builds), and a single primary "End trip" button that calls
// finalizeAutoTrip() and navigates to the trips list.

import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  UIManager,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getDatabase } from "../lib/db/index";
import { finalizeAutoTrip } from "../lib/tracking/detection";
import { Button } from "../components/Button";
import { WaitTimer } from "../components/business/WaitTimer";
import { haversineDistance, formatMiles } from "@mileclear/shared";

// ── Lazy native map import (Expo Go safe) ──────────────────────────
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
  } catch {}
}

interface CoordRow {
  lat: number;
  lng: number;
  recorded_at: string;
}

interface RecordingSnapshot {
  active: boolean;
  startedAt: number | null;
  coords: CoordRow[];
  distanceMiles: number;
}

const EMPTY: RecordingSnapshot = {
  active: false,
  startedAt: null,
  coords: [],
  distanceMiles: 0,
};

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

export default function ActiveRecordingScreen() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<RecordingSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [endingTrip, setEndingTrip] = useState(false);
  const [now, setNow] = useState(Date.now());
  const navigatedAwayRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const stateRow = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
      );
      const active = stateRow?.value === "1";

      if (!active) {
        setSnapshot(EMPTY);
        setLoading(false);
        return;
      }

      const coords = await db.getAllAsync<CoordRow>(
        "SELECT lat, lng, recorded_at FROM detection_coordinates ORDER BY recorded_at ASC"
      );

      let distance = 0;
      for (let i = 1; i < coords.length; i++) {
        distance += haversineDistance(
          coords[i - 1].lat,
          coords[i - 1].lng,
          coords[i].lat,
          coords[i].lng
        );
      }

      const startedAt =
        coords.length > 0 ? new Date(coords[0].recorded_at).getTime() : null;

      setSnapshot({ active: true, startedAt, coords, distanceMiles: distance });
      setLoading(false);
    } catch (err) {
      console.warn("Refresh active recording failed:", err);
      setLoading(false);
    }
  }, []);

  // Poll the local DB every 2s while screen is focused. Not a perf concern -
  // detection_coordinates is tiny and indexed.
  useFocusEffect(
    useCallback(() => {
      navigatedAwayRef.current = false;
      refresh();
      const interval = setInterval(refresh, 2000);
      return () => {
        clearInterval(interval);
        navigatedAwayRef.current = true;
      };
    }, [refresh])
  );

  // Tick "now" once per second so the duration counter updates smoothly
  // without requiring a full DB refresh.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // If the recording finalises while we're on this screen (e.g. via stop
  // detection or another surface), bounce back to the trips list so the
  // user can find the saved trip.
  useEffect(() => {
    if (!loading && !snapshot.active && !endingTrip && !navigatedAwayRef.current) {
      navigatedAwayRef.current = true;
      router.replace("/(tabs)/trips");
    }
  }, [loading, snapshot.active, endingTrip, router]);

  const handleEndTrip = useCallback(() => {
    Alert.alert(
      "End trip?",
      "Save what's been recorded so far. You can classify it as business or personal afterwards.",
      [
        { text: "Keep recording", style: "cancel" },
        {
          text: "End trip",
          style: "default",
          onPress: async () => {
            setEndingTrip(true);
            try {
              await finalizeAutoTrip();
              navigatedAwayRef.current = true;
              router.replace("/(tabs)/trips");
            } catch (err) {
              setEndingTrip(false);
              Alert.alert(
                "Couldn't end trip",
                err instanceof Error
                  ? err.message
                  : "Something went wrong. Try again."
              );
            }
          },
        },
      ]
    );
  }, [router]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: "Recording trip" }} />
        <ActivityIndicator size="large" color="#f5a623" />
      </View>
    );
  }

  if (!snapshot.active) {
    // Brief flash before the auto-redirect effect kicks in
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: "Recording trip" }} />
        <Text style={styles.placeholderText}>No active recording.</Text>
      </View>
    );
  }

  const elapsedMs =
    snapshot.startedAt != null ? now - snapshot.startedAt : 0;

  // Map region — fit to coords with a touch of padding
  const mapRegion = computeRegion(snapshot.coords);
  const polylineCoords = snapshot.coords.map((c) => ({
    latitude: c.lat,
    longitude: c.lng,
  }));
  const startCoord = polylineCoords[0] ?? null;
  const currentCoord =
    polylineCoords.length > 0
      ? polylineCoords[polylineCoords.length - 1]
      : null;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Recording trip",
          headerStyle: { backgroundColor: "#030712" },
          headerTintColor: "#f9fafb",
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero stats */}
        <View style={styles.heroCard}>
          <View style={styles.recordingDot} />
          <Text style={styles.heroLabel}>RECORDING</Text>

          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>
                {formatMiles(snapshot.distanceMiles)}
              </Text>
              <Text style={styles.statLabel}>distance</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>{formatDuration(elapsedMs)}</Text>
              <Text style={styles.statLabel}>duration</Text>
            </View>
          </View>

          <Text style={styles.heroHint}>
            {snapshot.coords.length} GPS point
            {snapshot.coords.length === 1 ? "" : "s"} captured
          </Text>
        </View>

        {/* Map */}
        {hasNativeMap && MapViewComponent && mapRegion ? (
          <View style={styles.mapWrap}>
            <MapViewComponent
              style={styles.map}
              initialRegion={mapRegion}
              region={mapRegion}
              showsUserLocation
              followsUserLocation={false}
              userInterfaceStyle="dark"
              pointerEvents="none"
            >
              {polylineCoords.length >= 2 && PolylineComponent && (
                <PolylineComponent
                  coordinates={polylineCoords}
                  strokeColor="#f5a623"
                  strokeWidth={4}
                  lineCap="round"
                  lineJoin="round"
                />
              )}
              {startCoord && MarkerComponent && (
                <MarkerComponent
                  coordinate={startCoord}
                  pinColor="#10b981"
                  title="Start"
                />
              )}
              {currentCoord && MarkerComponent && polylineCoords.length > 1 && (
                <MarkerComponent
                  coordinate={currentCoord}
                  pinColor="#f5a623"
                  title="Now"
                />
              )}
            </MapViewComponent>
          </View>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="navigate" size={28} color="#94a3b8" />
            <Text style={styles.mapPlaceholderText}>
              Map preview is unavailable in this build. The trip is still
              being recorded.
            </Text>
          </View>
        )}

        {/* Info row */}
        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color="#94a3b8"
            style={{ marginRight: 8, marginTop: 2 }}
          />
          <Text style={styles.infoText}>
            MileClear is tracking this trip in the background. It will save
            automatically a few minutes after you stop, or you can end it now.
          </Text>
        </View>

        {/* Pickup wait timer - couriers tap when waiting at a restaurant/depot */}
        <WaitTimer />

        {/* Actions */}
        <Button
          title="End trip and save"
          icon="stop-circle"
          variant="primary"
          onPress={handleEndTrip}
          loading={endingTrip}
          style={{ marginTop: 12 }}
        />
        <Button
          title="Keep recording"
          variant="secondary"
          onPress={() => router.back()}
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </View>
  );
}

function computeRegion(coords: CoordRow[]) {
  if (coords.length === 0) return null;
  if (coords.length === 1) {
    return {
      latitude: coords[0].lat,
      longitude: coords[0].lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }
  let minLat = coords[0].lat;
  let maxLat = coords[0].lat;
  let minLng = coords[0].lng;
  let maxLng = coords[0].lng;
  for (const c of coords) {
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
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#030712",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#94a3b8",
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 15,
    marginTop: 12,
  },
  heroCard: {
    backgroundColor: "rgba(245,166,35,0.08)",
    borderColor: "rgba(245,166,35,0.3)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#f5a623",
    marginBottom: 6,
  },
  heroLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
    letterSpacing: 1.6,
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
  },
  statBlock: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f9fafb",
    fontSize: 32,
    lineHeight: 36,
  },
  statLabel: {
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
    fontSize: 12,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroHint: {
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
    fontSize: 12,
    marginTop: 14,
  },
  mapWrap: {
    marginTop: 16,
    height: 280,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#0a1120",
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    marginTop: 16,
    minHeight: 120,
    borderRadius: 14,
    backgroundColor: "#0a1120",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPlaceholderText: {
    color: "#94a3b8",
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
  },
  infoCard: {
    marginTop: 16,
    flexDirection: "row",
    backgroundColor: "#0a1120",
    borderColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  infoText: {
    flex: 1,
    color: "#94a3b8",
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    lineHeight: 18,
  },
});
