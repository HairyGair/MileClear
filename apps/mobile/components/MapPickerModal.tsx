import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { reverseGeocode, forwardGeocode } from "../lib/location/geocoding";

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
  const DEFAULT_LAT = 51.5074;
  const DEFAULT_LNG = -0.1278;

  const [region, setRegion] = useState({
    latitude: initialLat ?? DEFAULT_LAT,
    longitude: initialLng ?? DEFAULT_LNG,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [address, setAddress] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<any>(null);

  // Reset region when modal opens with new coordinates
  useEffect(() => {
    if (!visible) return;

    setSearchQuery("");
    setAddress(null);

    if (initialLat != null && initialLng != null) {
      // Use provided coordinates
      const r = {
        latitude: initialLat,
        longitude: initialLng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(r);
      reverseGeocode(initialLat, initialLng).then(setAddress);
    } else {
      // No initial coords — try user's current location
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            const r = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            };
            setRegion(r);
            mapRef.current?.animateToRegion(r, 300);
            reverseGeocode(r.latitude, r.longitude).then(setAddress);
            return;
          }
        } catch {
          // Fall through to default
        }
        // Fallback to London
        const r = {
          latitude: DEFAULT_LAT,
          longitude: DEFAULT_LNG,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        setRegion(r);
        reverseGeocode(DEFAULT_LAT, DEFAULT_LNG).then(setAddress);
      })();
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

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    Keyboard.dismiss();
    setSearching(true);
    try {
      const result = await forwardGeocode(q);
      if (result) {
        const r = {
          latitude: result.lat,
          longitude: result.lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        setRegion(r);
        mapRef.current?.animateToRegion(r, 500);
        const addr = await reverseGeocode(result.lat, result.lng);
        setAddress(addr);
      }
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

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
          ref={mapRef}
          style={styles.map}
          region={region}
          onRegionChangeComplete={handleRegionChange}
          userInterfaceStyle="dark"
          showsUserLocation
          showsMyLocationButton={false}
        />

        {/* Search bar at top */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
            <Ionicons name="search" size={18} color="#6b7280" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search address or postcode..."
              placeholderTextColor="#6b7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searching ? (
              <ActivityIndicator size="small" color="#f5a623" />
            ) : searchQuery.length > 0 ? (
              <TouchableOpacity onPress={handleSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="arrow-forward-circle" size={24} color="#f5a623" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

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
  // Search bar
  searchContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(3, 7, 18, 0.92)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 4,
    borderWidth: 1,
    borderColor: "rgba(107, 114, 128, 0.3)",
  },
  searchBarFocused: {
    borderColor: "#f5a623",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#f0f2f5",
    paddingVertical: 4,
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
