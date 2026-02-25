import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, UIManager, Platform } from "react-native";
import type { TripDetail } from "../../lib/api/trips";

// Lazy import for Expo Go compatibility — check native module exists before requiring
let MapViewComponent: any = null;
let PolylineComponent: any = null;
const hasNativeMap =
  Platform.OS !== "web" &&
  UIManager.getViewManagerConfig?.("AIRMap") != null;
if (hasNativeMap) {
  try {
    const RNMaps = require("react-native-maps");
    MapViewComponent = RNMaps.default;
    PolylineComponent = RNMaps.Polyline;
  } catch {
    // Not available
  }
}

interface MapOverviewProps {
  trips: TripDetail[];
}

export function MapOverview({ trips }: MapOverviewProps) {
  const [fullscreen, setFullscreen] = useState(false);

  const tripsWithCoords = trips.filter((t) => t.coordinates.length >= 2);

  if (tripsWithCoords.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyIcon}>M</Text>
        <Text style={styles.emptyTitle}>No routes yet</Text>
        <Text style={styles.emptyText}>
          Your recent journeys will appear here as a map overlay
        </Text>
      </View>
    );
  }

  // Compute region from all coordinates
  const allCoords = tripsWithCoords.flatMap((t) => t.coordinates);
  let minLat = allCoords[0].lat;
  let maxLat = allCoords[0].lat;
  let minLng = allCoords[0].lng;
  let maxLng = allCoords[0].lng;
  for (const c of allCoords) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }
  const region = {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.01),
  };

  if (!MapViewComponent || !PolylineComponent) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyIcon}>M</Text>
        <Text style={styles.emptyTitle}>Map requires a development build</Text>
        <Text style={styles.emptyText}>
          Route overlay is not available in Expo Go
        </Text>
      </View>
    );
  }

  const mapContent = (interactive: boolean, height: number | string) => (
    <MapViewComponent
      style={typeof height === "number" ? { height } : StyleSheet.absoluteFillObject}
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
      {tripsWithCoords.map((trip) => (
        <PolylineComponent
          key={trip.id}
          coordinates={trip.coordinates.map((c) => ({
            latitude: c.lat,
            longitude: c.lng,
          }))}
          strokeColor="#f5a623"
          strokeWidth={3}
        />
      ))}
    </MapViewComponent>
  );

  return (
    <>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => setFullscreen(true)}
      >
        <View style={styles.mapContainer}>
          {mapContent(false, 280)}
          <View style={styles.tapHint}>
            <Text style={styles.tapHintText}>Tap to expand</Text>
          </View>
        </View>
      </TouchableOpacity>

      <Modal
        visible={fullscreen}
        animationType="slide"
        onRequestClose={() => setFullscreen(false)}
      >
        <View style={styles.fullscreenContainer}>
          {mapContent(true, "full")}
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
  card: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  mapContainer: {
    height: 280,
    position: "relative",
  },
  tapHint: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(3, 7, 18, 0.75)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tapHintText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
  },
  emptyCard: {
    backgroundColor: "#0a1120",
    borderRadius: 16,
    padding: 32,
    marginBottom: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  emptyIcon: {
    fontSize: 32,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "rgba(245, 166, 35, 0.3)",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#4a5568",
    textAlign: "center",
    lineHeight: 18,
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
