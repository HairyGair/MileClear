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
  reverseGeocode,
  forwardGeocodeMultiple,
  type GeocodeSuggestion,
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
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [noResults, setNoResults] = useState(false);

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
    setSuggestions([]);
    setNoResults(false);
    try {
      const query = searchText.trim();
      const results = await forwardGeocodeMultiple(query);

      if (results.length === 0) {
        setNoResults(true);
      } else if (results.length === 1) {
        // Single result — use it directly, keep user's query as the display name
        onLocationChange(results[0].lat, results[0].lng, query);
        setShowSearch(false);
        setSearchText("");
        setSuggestions([]);
      } else {
        // Multiple results — show suggestions for the user to pick
        setSuggestions(results);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePickSuggestion = (s: GeocodeSuggestion) => {
    onLocationChange(s.lat, s.lng, s.address);
    setShowSearch(false);
    setSearchText("");
    setSuggestions([]);
    setNoResults(false);
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
          <TouchableOpacity
            onPress={onClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
          >
            <Ionicons name="close-circle" size={18} color="#6b7280" accessible={false} />
          </TouchableOpacity>
        )}
      </View>

      {/* Address display */}
      <View style={styles.addressBox}>
        {loading ? (
          <ActivityIndicator size="small" color="#f5a623" accessibilityLabel="Loading location" />
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
            accessibilityRole="button"
            accessibilityLabel={`Use current location for ${label}`}
          >
            <Ionicons name="locate-outline" size={16} color="#f5a623" accessible={false} />
            <Text style={styles.actionLabel}>Current</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowMap(true)}
            disabled={loading}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Pick ${label} on map`}
          >
            <Ionicons name="map-outline" size={16} color="#f5a623" accessible={false} />
            <Text style={styles.actionLabel}>Map</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, showSearch && styles.actionBtnActive]}
            onPress={() => {
              setShowSearch(!showSearch);
              if (showSearch) {
                setSuggestions([]);
                setNoResults(false);
              }
            }}
            disabled={loading}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={showSearch ? `Hide address search for ${label}` : `Search address for ${label}`}
            accessibilityState={{ expanded: showSearch }}
          >
            <Ionicons name="search-outline" size={16} color="#f5a623" accessible={false} />
            <Text style={[styles.actionLabel, showSearch && styles.actionLabelActive]}>Search</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search input */}
      {showSearch && !disabled && (
        <>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={(t) => {
                setSearchText(t);
                setSuggestions([]);
                setNoResults(false);
              }}
              placeholder="e.g. PureGym Sunderland or SR3 1AA"
              placeholderTextColor="#6b7280"
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              autoFocus
              accessibilityLabel={`Search address for ${label}`}
            />
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={handleSearch}
              disabled={loading || !searchText.trim()}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Text style={styles.searchBtnText}>Go</Text>
            </TouchableOpacity>
          </View>

          {/* No results message */}
          {noResults && (
            <View style={styles.noResults}>
              <Ionicons name="alert-circle-outline" size={15} color="#6b7280" accessible={false} />
              <Text style={styles.noResultsText}>
                No results found. Try a postcode, street name, or place name.
              </Text>
            </View>
          )}

          {/* Suggestion list */}
          {suggestions.length > 1 && (
            <View style={styles.suggestionList}>
              <Text style={styles.suggestionHint}>Multiple matches — pick one:</Text>
              {suggestions.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.suggestionRow}
                  onPress={() => handlePickSuggestion(s)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={s.address}
                >
                  <Ionicons name="location-outline" size={15} color="#f5a623" accessible={false} />
                  <Text style={styles.suggestionText} numberOfLines={2}>{s.address}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
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
    backgroundColor: "#0a1120",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
    backgroundColor: "#0a1120",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
  // No results
  noResults: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  noResultsText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    flex: 1,
  },
  // Suggestions
  suggestionList: {
    marginTop: 8,
    backgroundColor: "#0a1120",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  suggestionHint: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#6b7280",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  suggestionText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#f0f2f5",
    flex: 1,
  },
});
