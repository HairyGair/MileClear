import { useEffect, useRef, useState } from "react";
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
  forwardGeocodeMultiple,
  placesAutocomplete,
  placeDetails,
  newSessionToken,
  type GeocodeSuggestion,
  type PlacePrediction,
} from "../lib/location/geocoding";
import { MapPickerModal } from "./MapPickerModal";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;

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
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [typing, setTyping] = useState(false);
  const [noResults, setNoResults] = useState(false);

  const sessionRef = useRef<string>(newSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  const hasValue = lat != null && lng != null;

  // Clean up any pending debounce on unmount.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

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

  // Type-ahead: query Google Places as the user types (debounced). The user
  // picks a real, disambiguated place, so we never guess which place a
  // free-text string meant — the root of the wrong-pin bug.
  const handleTextChange = (t: string) => {
    setSearchText(t);
    setSuggestions([]);
    setNoResults(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = t.trim();
    if (q.length < 3) {
      setPredictions([]);
      setTyping(false);
      return;
    }
    setTyping(true);
    debounceRef.current = setTimeout(() => runAutocomplete(q), 300);
  };

  const runAutocomplete = async (q: string) => {
    const seq = ++seqRef.current;
    const near = lat != null && lng != null ? { lat, lng } : null;
    const preds = await placesAutocomplete(q, sessionRef.current, near);
    if (seq !== seqRef.current) return; // a newer keystroke superseded this
    setPredictions(preds);
    setTyping(false);
  };

  const handlePickPrediction = async (p: PlacePrediction) => {
    setLoading(true);
    try {
      const details = await placeDetails(p.placeId, sessionRef.current);
      if (details) {
        onLocationChange(details.lat, details.lng, details.address || `${p.primary}, ${p.secondary}`);
        setShowSearch(false);
        setSearchText("");
        setPredictions([]);
        sessionRef.current = newSessionToken(); // start a fresh billing session
      } else {
        setNoResults(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fallback for when autocomplete returns nothing (no Google key / offline):
  // full-string search via the server geocoder → Apple.
  const handleSearchFallback = async () => {
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
        // Use the RESOLVED address, not the raw query, so a wrong match shows.
        onLocationChange(results[0].lat, results[0].lng, results[0].address ?? query);
        setShowSearch(false);
        setSearchText("");
        setSuggestions([]);
      } else {
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
            <Ionicons name="close-circle" size={18} color={TEXT_3} accessible={false} />
          </TouchableOpacity>
        )}
      </View>

      {/* Address display */}
      <View style={styles.addressBox}>
        {loading ? (
          <ActivityIndicator size="small" color={AMBER} accessibilityLabel="Loading location" />
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
            <Ionicons name="locate-outline" size={16} color={AMBER} accessible={false} />
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
            <Ionicons name="map-outline" size={16} color={AMBER} accessible={false} />
            <Text style={styles.actionLabel}>Map</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, showSearch && styles.actionBtnActive]}
            onPress={() => {
              const opening = !showSearch;
              setShowSearch(opening);
              setSuggestions([]);
              setPredictions([]);
              setNoResults(false);
              setSearchText("");
              if (opening) sessionRef.current = newSessionToken();
            }}
            disabled={loading}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={showSearch ? `Hide address search for ${label}` : `Search address for ${label}`}
            accessibilityState={{ expanded: showSearch }}
          >
            <Ionicons name="search-outline" size={16} color={AMBER} accessible={false} />
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
              onChangeText={handleTextChange}
              placeholder="Start typing a place, address or postcode"
              placeholderTextColor={TEXT_3}
              returnKeyType="search"
              onSubmitEditing={handleSearchFallback}
              autoFocus
              accessibilityLabel={`Search address for ${label}`}
            />
            {typing && <ActivityIndicator size="small" color={AMBER} style={{ paddingHorizontal: 6 }} />}
          </View>

          {/* Google Places predictions (tap to pick a real place) */}
          {predictions.length > 0 && (
            <View style={styles.suggestionList}>
              {predictions.map((p) => (
                <TouchableOpacity
                  key={p.placeId}
                  style={styles.suggestionRow}
                  onPress={() => handlePickPrediction(p)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.primary}${p.secondary ? ", " + p.secondary : ""}`}
                >
                  <Ionicons name="location-outline" size={15} color={AMBER} accessible={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.predictionPrimary} numberOfLines={1}>{p.primary}</Text>
                    {!!p.secondary && <Text style={styles.predictionSecondary} numberOfLines={1}>{p.secondary}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Fallback: no predictions from autocomplete — offer a full search */}
          {!typing && predictions.length === 0 && suggestions.length === 0 && !noResults && searchText.trim().length >= 3 && (
            <TouchableOpacity
              style={styles.fallbackRow}
              onPress={handleSearchFallback}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Search for ${searchText.trim()}`}
            >
              <Ionicons name="search-outline" size={15} color={AMBER} accessible={false} />
              <Text style={styles.fallbackText} numberOfLines={1}>Search for &quot;{searchText.trim()}&quot;</Text>
            </TouchableOpacity>
          )}

          {/* No results message */}
          {noResults && (
            <View style={styles.noResults}>
              <Ionicons name="alert-circle-outline" size={15} color={TEXT_3} accessible={false} />
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
                  <Ionicons name="location-outline" size={15} color={AMBER} accessible={false} />
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
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  // Address display
  addressBox: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    minHeight: 52,
    justifyContent: "center",
  },
  addressText: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: "#fff",
  },
  coordSubtext: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 4,
  },
  placeholder: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: TEXT_3,
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
    backgroundColor: CARD_BG,
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
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  actionLabelActive: {
    color: AMBER,
  },
  // Search
  searchRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  searchBtn: {
    backgroundColor: AMBER,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  searchBtnText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: BG,
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
    fontFamily: fonts.regular,
    color: TEXT_3,
    flex: 1,
  },
  // Suggestions
  suggestionList: {
    marginTop: 8,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  suggestionHint: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: TEXT_3,
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
    fontFamily: fonts.medium,
    color: TEXT_1,
    flex: 1,
  },
  predictionPrimary: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  predictionSecondary: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 1,
  },
  fallbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  fallbackText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: AMBER,
    flex: 1,
  },
});
