import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openDirections } from "../../lib/location/directions";
import type { FuelStation } from "@mileclear/shared";

// Lazy require — resolved at render time with try/catch for Expo Go safety
function getMapComponents() {
  try {
    const RNMaps = require("react-native-maps");
    return {
      MapView: RNMaps.default,
      Marker: RNMaps.Marker,
      Callout: RNMaps.Callout,
    };
  } catch {
    return null;
  }
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const LONDON = { lat: 51.5074, lng: -0.1278 };

function formatPpl(pence: number): string {
  return `${pence.toFixed(1)}p`;
}

function formatDistance(miles: number): string {
  return miles < 0.1 ? "<0.1 mi" : `${miles.toFixed(1)} mi`;
}

function getPriceColor(pricePence: number, nationalAvg: number | null): string {
  if (nationalAvg === null) return "#f5a623";
  const diff = pricePence - nationalAvg;
  if (diff < -3) return "#10b981";
  if (diff > 3) return "#ef4444";
  return "#f5a623";
}

interface FuelMapModalProps {
  visible: boolean;
  onClose: () => void;
  stations: FuelStation[];
  nationalAvgPetrol: number | null;
  nationalAvgDiesel: number | null;
  userLat: number | null;
  userLng: number | null;
}

export default function FuelMapModal({
  visible,
  onClose,
  stations,
  nationalAvgPetrol,
  nationalAvgDiesel,
  userLat,
  userLng,
}: FuelMapModalProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<any>(null);
  const [selected, setSelected] = useState<FuelStation | null>(null);

  const maps = getMapComponents();

  // Determine map center: user → first station → London
  const centerLat = userLat ?? stations[0]?.latitude ?? LONDON.lat;
  const centerLng = userLng ?? stations[0]?.longitude ?? LONDON.lng;

  const initialRegion = {
    latitude: centerLat,
    longitude: centerLng,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  const handleRecenter = () => {
    mapRef.current?.animateToRegion(initialRegion, 400);
  };

  const handleDirections = () => {
    if (!selected) return;
    openDirections(selected.latitude, selected.longitude, selected.brand);
  };

  // Expo Go / missing native module fallback
  if (!maps) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackText}>
            Map view requires a development build.
          </Text>
          <TouchableOpacity style={styles.fallbackClose} onPress={onClose}>
            <Text style={styles.fallbackCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const { MapView: MapViewNative, Marker: MarkerNative, Callout: CalloutNative } = maps;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <MapViewNative
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation
          userInterfaceStyle="dark"
          onPress={() => setSelected(null)}
        >
          {stations.map((s, i) => {
            const e10 = s.prices.E10;
            const color = e10 != null ? getPriceColor(e10, nationalAvgPetrol) : "#f5a623";
            return (
              <MarkerNative
                key={`${s.siteId}-${i}`}
                coordinate={{ latitude: s.latitude, longitude: s.longitude }}
                pinColor={color}
                onPress={() => setSelected(s)}
              >
                <CalloutNative tooltip={false}>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle} numberOfLines={1}>
                      {s.brand}
                    </Text>
                    {e10 != null && (
                      <Text style={[styles.calloutPrice, { color }]}>
                        Unleaded {formatPpl(e10)}
                      </Text>
                    )}
                  </View>
                </CalloutNative>
              </MarkerNative>
            );
          })}
        </MapViewNative>

        {/* Close button */}
        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        {/* Re-center button */}
        <TouchableOpacity
          style={[styles.recenterBtn, { bottom: selected ? 200 : 120 }]}
          onPress={handleRecenter}
          activeOpacity={0.8}
        >
          <Text style={styles.recenterIcon}>◎</Text>
        </TouchableOpacity>

        {/* Bottom panel */}
        <View style={styles.bottomPanel}>
          {selected ? (
            <View>
              <View style={styles.panelHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.panelBrand}>{selected.brand}</Text>
                  <Text style={styles.panelAddress} numberOfLines={1}>
                    {selected.address || selected.postcode}
                  </Text>
                  <View style={styles.panelPrices}>
                    {selected.prices.E10 != null && (
                      <View style={styles.panelPriceItem}>
                        <Text style={styles.panelFuelLabel}>Unleaded</Text>
                        <Text
                          style={[
                            styles.panelPrice,
                            {
                              color: getPriceColor(
                                selected.prices.E10,
                                nationalAvgPetrol
                              ),
                            },
                          ]}
                        >
                          {formatPpl(selected.prices.E10)}
                        </Text>
                      </View>
                    )}
                    {selected.prices.B7 != null && (
                      <View style={styles.panelPriceItem}>
                        <Text style={styles.panelFuelLabel}>Diesel</Text>
                        <Text
                          style={[
                            styles.panelPrice,
                            {
                              color: getPriceColor(
                                selected.prices.B7,
                                nationalAvgDiesel
                              ),
                            },
                          ]}
                        >
                          {formatPpl(selected.prices.B7)}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.panelDistance}>
                      {formatDistance(selected.distanceMiles)}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={styles.directionsBtn}
                onPress={handleDirections}
                activeOpacity={0.8}
              >
                <Text style={styles.directionsBtnText}>Get Directions</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.panelHint}>Tap a station marker for details</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  map: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  // Callouts
  callout: {
    padding: 6,
    minWidth: 100,
  },
  calloutTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
  },
  calloutPrice: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  // Close button
  closeBtn: {
    position: "absolute",
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(3,7,18,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
  },
  // Re-center button
  recenterBtn: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(3,7,18,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  recenterIcon: {
    fontSize: 20,
    color: "#f5a623",
  },
  // Bottom panel
  bottomPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(3,7,18,0.95)",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  panelBrand: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    marginBottom: 2,
  },
  panelAddress: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    marginBottom: 8,
  },
  panelPrices: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  panelPriceItem: {
    alignItems: "center",
  },
  panelFuelLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#6b7280",
    marginBottom: 2,
  },
  panelPrice: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  panelDistance: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
  },
  // Directions button
  directionsBtn: {
    backgroundColor: "#f5a623",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  directionsBtnText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  // Hint text
  panelHint: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    textAlign: "center",
    paddingVertical: 8,
  },
  // Fallback
  fallbackContainer: {
    flex: 1,
    backgroundColor: "#030712",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  fallbackText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  fallbackClose: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#1f2937",
    borderRadius: 10,
  },
  fallbackCloseText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },
});
