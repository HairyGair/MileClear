import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getCurrentLocation,
  forwardGeocode,
  reverseGeocode,
} from "../lib/location/geocoding";
import { MapPickerModal } from "./MapPickerModal";

interface LocationPickerFieldProps {
  label: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  onLocationChange: (lat: number, lng: number, address: string | null) => void;
  onClear?: () => void;
  disabled?: boolean;
}

export function LocationPickerField({
  label,
  lat,
  lng,
  address,
  onLocationChange,
  onClear,
  disabled,
}: LocationPickerFieldProps) {
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [showMap, setShowMap] = useState(false);

  const hasValue = lat != null && lng != null;

  const handleCurrentLocation = async () => {
    setLoading(true);
    try {
      const loc = await getCurrentLocation();
      if (loc) {
        onLocationChange(loc.lat, loc.lng, loc.address);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchText.trim()) return;
    setLoading(true);
    try {
      const coords = await forwardGeocode(searchText.trim());
      if (coords) {
        const addr = await reverseGeocode(coords.lat, coords.lng);
        onLocationChange(coords.lat, coords.lng, addr);
        setShowSearch(false);
        setSearchText("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMapConfirm = (mapLat: number, mapLng: number, mapAddress: string | null) => {
    onLocationChange(mapLat, mapLng, mapAddress);
    setShowMap(false);
  };

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        {onClear && hasValue && !disabled && (
          <TouchableOpacity onPress={onClear} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Address display */}
      <View style={styles.addressBox}>
        {loading ? (
          <ActivityIndicator size="small" color="#f5a623" />
        ) : hasValue ? (
          <>
            <Text style={styles.addressText} numberOfLines={2}>
              {address ?? "Location set"}
            </Text>
            <Text style={styles.coordSubtext}>
              {lat!.toFixed(5)}, {lng!.toFixed(5)}
            </Text>
          </>
        ) : (
          <Text style={styles.placeholder}>No location set</Text>
        )}
      </View>

      {/* Action buttons */}
      {!disabled && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleCurrentLocation}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Ionicons name="locate-outline" size={16} color="#f5a623" />
            <Text style={styles.actionLabel}>Current</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowMap(true)}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Ionicons name="map-outline" size={16} color="#f5a623" />
            <Text style={styles.actionLabel}>Map</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, showSearch && styles.actionBtnActive]}
            onPress={() => setShowSearch(!showSearch)}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Ionicons name="search-outline" size={16} color={showSearch ? "#f5a623" : "#f5a623"} />
            <Text style={[styles.actionLabel, showSearch && styles.actionLabelActive]}>Search</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search input */}
      {showSearch && !disabled && (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="e.g. SW1A 1AA or 10 Downing Street"
            placeholderTextColor="#6b7280"
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            autoFocus
          />
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={handleSearch}
            disabled={loading || !searchText.trim()}
          >
            <Text style={styles.searchBtnText}>Go</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Map picker modal */}
      <MapPickerModal
        visible={showMap}
        initialLat={lat}
        initialLng={lng}
        onConfirm={handleMapConfirm}
        onCancel={() => setShowMap(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  disabled: {
    opacity: 0.6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#d1d5db",
  },
  // Address display
  addressBox: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2937",
    minHeight: 52,
    justifyContent: "center",
  },
  addressText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#fff",
  },
  coordSubtext: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    marginTop: 4,
  },
  placeholder: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  // Action buttons
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#0a1120",
    borderRadius: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  actionBtnActive: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  actionLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
  },
  actionLabelActive: {
    color: "#f5a623",
  },
  // Search
  searchRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  searchBtn: {
    backgroundColor: "#f5a623",
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  searchBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
});
