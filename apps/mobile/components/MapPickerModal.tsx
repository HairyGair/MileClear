import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { reverseGeocode } from "../lib/location/geocoding";

// Lazy import for Expo Go compatibility
let MapView: any = null;
try {
  MapView = require("react-native-maps").default;
} catch {
  // Not available in Expo Go
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface MapPickerModalProps {
  visible: boolean;
  initialLat?: number | null;
  initialLng?: number | null;
  onConfirm: (lat: number, lng: number, address: string | null) => void;
  onCancel: () => void;
}

export function MapPickerModal({
  visible,
  initialLat,
  initialLng,
  onConfirm,
  onCancel,
}: MapPickerModalProps) {
  const [region, setRegion] = useState({
    latitude: initialLat ?? 51.5074,
    longitude: initialLng ?? -0.1278,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [address, setAddress] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset region when modal opens with new coordinates
  useEffect(() => {
    if (visible) {
      setRegion({
        latitude: initialLat ?? 51.5074,
        longitude: initialLng ?? -0.1278,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      setAddress(null);
      // Geocode initial position
      const lat = initialLat ?? 51.5074;
      const lng = initialLng ?? -0.1278;
      reverseGeocode(lat, lng).then(setAddress);
    }
  }, [visible, initialLat, initialLng]);

  const handleRegionChange = useCallback((newRegion: typeof region) => {
    setRegion(newRegion);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setGeocoding(true);
    debounceRef.current = setTimeout(async () => {
      const result = await reverseGeocode(newRegion.latitude, newRegion.longitude);
      setAddress(result);
      setGeocoding(false);
    }, 500);
  }, []);

  if (!MapView) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackText}>
            Map view requires a development build.{"\n"}
            Use GPS or address search instead.
          </Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <MapView
          style={styles.map}
          region={region}
          onRegionChangeComplete={handleRegionChange}
          userInterfaceStyle="dark"
          showsUserLocation
          showsMyLocationButton={false}
        />

        {/* Crosshair pin fixed at center */}
        <View style={styles.crosshairContainer} pointerEvents="none">
          <View style={styles.crosshairPin}>
            <View style={styles.pinHead} />
            <View style={styles.pinPoint} />
          </View>
          <View style={styles.pinShadow} />
        </View>

        {/* Address bar at bottom */}
        <View style={styles.bottomBar}>
          <View style={styles.addressContainer}>
            {geocoding ? (
              <ActivityIndicator size="small" color="#f5a623" />
            ) : (
              <Text style={styles.addressText} numberOfLines={2}>
                {address ?? "Move map to select location"}
              </Text>
            )}
            <Text style={styles.coordText}>
              {region.latitude.toFixed(5)}, {region.longitude.toFixed(5)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => onConfirm(region.latitude, region.longitude, address)}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnText}>Confirm Location</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
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
  // Crosshair pin
  crosshairContainer: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -16,
    marginTop: -42,
    alignItems: "center",
  },
  crosshairPin: {
    alignItems: "center",
  },
  pinHead: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f5a623",
    borderWidth: 3,
    borderColor: "#fff",
  },
  pinPoint: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#f5a623",
    marginTop: -2,
  },
  pinShadow: {
    width: 12,
    height: 4,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.3)",
    marginTop: 2,
  },
  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(3, 7, 18, 0.95)",
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  addressContainer: {
    marginBottom: 16,
    minHeight: 48,
    justifyContent: "center",
  },
  addressText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#f0f2f5",
    marginBottom: 4,
  },
  coordText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  confirmBtn: {
    backgroundColor: "#f5a623",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  confirmBtnText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#6b7280",
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
});
