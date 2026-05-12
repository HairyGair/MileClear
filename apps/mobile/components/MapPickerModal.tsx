import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Platform,
} from "react-native";
import { AppModal } from "./AppModal";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { reverseGeocode, forwardGeocode } from "../lib/location/geocoding";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;

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

// London. Used as fallback when no initial coords are provided and the
// device location lookup also fails.
const DEFAULT_LAT = 51.5074;
const DEFAULT_LNG = -0.1278;

export function MapPickerModal({
  visible,
  initialLat,
  initialLng,
  onConfirm,
  onCancel,
}: MapPickerModalProps) {
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
      <AppModal visible={visible} animationType="slide" transparent={false} onRequestClose={onCancel}>
        <View style={styles.fallbackContainer} accessibilityViewIsModal>
          <Text style={styles.fallbackText}>
            Map view requires a development build.{"\n"}
            Use GPS or address search instead.
          </Text>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Close map picker"
          >
            <Text style={styles.cancelBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </AppModal>
    );
  }

  return (
    <AppModal visible={visible} animationType="slide" transparent={false} onRequestClose={onCancel}>
      <View style={styles.container} accessibilityViewIsModal>
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
            <Ionicons name="search" size={18} color={TEXT_3} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search address or postcode..."
              placeholderTextColor={TEXT_3}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search address or postcode"
            />
            {searching ? (
              <ActivityIndicator size="small" color={AMBER} accessibilityLabel="Searching" />
            ) : searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={handleSearch}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Search for this address"
              >
                <Ionicons name="arrow-forward-circle" size={24} color={AMBER} accessible={false} />
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
              <ActivityIndicator size="small" color={AMBER} />
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
            accessibilityRole="button"
            accessibilityLabel={`Confirm location${address ? `: ${address}` : ""}`}
          >
            <Text style={styles.confirmBtnText}>Confirm Location</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Cancel and close map"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
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
    borderColor: AMBER,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: TEXT_1,
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
    backgroundColor: AMBER,
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
    borderTopColor: AMBER,
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
    fontFamily: fonts.medium,
    color: TEXT_1,
    marginBottom: 4,
  },
  coordText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  confirmBtn: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  confirmBtnText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: BG,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_3,
  },
  // Fallback
  fallbackContainer: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  fallbackText: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: TEXT_2,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
});
