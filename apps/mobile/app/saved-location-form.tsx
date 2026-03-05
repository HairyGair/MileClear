import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { MapPickerModal } from "../components/MapPickerModal";
import { getCurrentLocation, reverseGeocode } from "../lib/location/geocoding";
import {
  fetchSavedLocation,
  createSavedLocation,
  updateSavedLocation,
  deleteSavedLocation,
} from "../lib/api/savedLocations";
import { useUser } from "../lib/user/context";
import { registerGeofences } from "../lib/geofencing/index";
import { Button } from "../components/Button";
import type { LocationType } from "@mileclear/shared";
import { MAX_FREE_SAVED_LOCATIONS, LOCATION_TYPES } from "@mileclear/shared";

const MIN_RADIUS = 50;
const MAX_RADIUS = 500;
const DEFAULT_RADIUS = 150;

const LOCATION_TYPE_ICONS: Record<LocationType, keyof typeof Ionicons.glyphMap> = {
  home: "home-outline",
  work: "briefcase-outline",
  depot: "storefront-outline",
  custom: "location-outline",
};

const LOCATION_TYPE_COLORS: Record<LocationType, string> = {
  home: "#3b82f6",
  work: "#f5a623",
  depot: "#10b981",
  custom: "#8b5cf6",
};

// Simple track-style slider implemented with pan gesture feedback
// Uses a proportional touch bar rather than a native slider (no extra deps)
function RadiusSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const percent = (value - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS);

  const handlePress = useCallback(
    (e: { nativeEvent: { locationX: number } }, width: number) => {
      const x = Math.max(0, Math.min(e.nativeEvent.locationX, width));
      const ratio = x / width;
      const snapped = Math.round((MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS)) / 50) * 50;
      onChange(Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, snapped)));
    },
    [onChange]
  );

  const steps = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

  return (
    <View style={sliderStyles.wrapper}>
      <View style={sliderStyles.stepRow}>
        {steps.map((step) => (
          <TouchableOpacity
            key={step}
            style={[
              sliderStyles.stepBtn,
              value === step && sliderStyles.stepBtnActive,
            ]}
            onPress={() => onChange(step)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                sliderStyles.stepLabel,
                value === step && sliderStyles.stepLabelActive,
              ]}
            >
              {step}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={sliderStyles.track}>
        <View style={[sliderStyles.fill, { width: `${percent * 100}%` }]} />
        <View style={[sliderStyles.thumb, { left: `${percent * 100}%` as any }]} />
      </View>
      <View style={sliderStyles.labelRow}>
        <Text style={sliderStyles.boundLabel}>{MIN_RADIUS}m</Text>
        <Text style={sliderStyles.currentLabel}>{value}m radius</Text>
        <Text style={sliderStyles.boundLabel}>{MAX_RADIUS}m</Text>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  stepRow: {
    flexDirection: "row",
    gap: 4,
  },
  stepBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: "#111827",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  stepBtnActive: {
    backgroundColor: "#f5a623",
    borderColor: "#f5a623",
  },
  stepLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#6b7280",
  },
  stepLabelActive: {
    color: "#030712",
  },
  track: {
    height: 4,
    backgroundColor: "#1f2937",
    borderRadius: 2,
    position: "relative",
    overflow: "visible",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    height: 4,
    backgroundColor: "#f5a623",
    borderRadius: 2,
  },
  thumb: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#f5a623",
    top: -7,
    marginLeft: -9,
    borderWidth: 2,
    borderColor: "#030712",
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  boundLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#4b5563",
  },
  currentLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },
});

export default function SavedLocationFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useUser();
  const isEditing = !!id;

  const [name, setName] = useState("");
  const [locationType, setLocationType] = useState<LocationType>("home");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS);
  const [geofenceEnabled, setGeofenceEnabled] = useState(true);

  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load existing location when editing
  useEffect(() => {
    if (!id) return;
    fetchSavedLocation(id)
      .then((res) => {
        const loc = res.data.data;
        setName(loc.name);
        setLocationType(loc.locationType);
        setLatitude(loc.latitude);
        setLongitude(loc.longitude);
        setRadiusMeters(loc.radiusMeters);
        setGeofenceEnabled(loc.geofenceEnabled);
        // Reverse geocode to display address
        reverseGeocode(loc.latitude, loc.longitude).then((addr) => {
          if (addr) setAddress(addr);
        });
      })
      .catch(() => {
        Alert.alert("Error", "Could not load location details.");
        router.back();
      })
      .finally(() => setLoadingExisting(false));
  }, [id, router]);

  const handleUseCurrentLocation = useCallback(async () => {
    setLoadingLocation(true);
    try {
      const result = await getCurrentLocation();
      if (!result) {
        Alert.alert(
          "Location unavailable",
          "Could not get your current location. Check location permissions in Settings."
        );
        return;
      }
      setLatitude(result.lat);
      setLongitude(result.lng);
      setAddress(result.address);
    } catch {
      Alert.alert("Error", "Failed to get current location.");
    } finally {
      setLoadingLocation(false);
    }
  }, []);

  const handleMapConfirm = useCallback(
    (lat: number, lng: number, confirmedAddress: string | null) => {
      setLatitude(lat);
      setLongitude(lng);
      setAddress(confirmedAddress);
      setMapPickerVisible(false);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Please give this location a name.");
      return;
    }
    if (latitude === null || longitude === null) {
      Alert.alert("No location set", "Please pick a location on the map or use your current location.");
      return;
    }

    // Free tier limit check (only for new locations)
    if (!isEditing && !user?.isPremium) {
      // The API will reject if over limit, but we can give a friendlier message here
      // if the user already has MAX_FREE_SAVED_LOCATIONS (checked by caller screen).
      // We still attempt the save — the API is the source of truth.
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        locationType,
        latitude,
        longitude,
        radiusMeters,
        geofenceEnabled,
      };

      if (isEditing) {
        await updateSavedLocation(id!, payload);
      } else {
        await createSavedLocation(payload);
      }
      registerGeofences().catch(() => {});
      router.back();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save location";
      // Surface upgrade prompt if free limit hit
      if (message.toLowerCase().includes("limit") || message.toLowerCase().includes("premium")) {
        Alert.alert(
          "Upgrade to Pro",
          `Free accounts can save up to ${MAX_FREE_SAVED_LOCATIONS} locations. Upgrade to Pro for unlimited saved locations.`,
          [
            { text: "Not now", style: "cancel" },
            { text: "Upgrade", onPress: () => router.push("/profile") },
          ]
        );
      } else {
        Alert.alert("Error", message);
      }
    } finally {
      setSaving(false);
    }
  }, [name, locationType, latitude, longitude, radiusMeters, geofenceEnabled, isEditing, id, router, user]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete Location",
      `Remove "${name}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteSavedLocation(id!);
              router.back();
            } catch (err: unknown) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete");
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [id, name, router]);

  if (loadingExisting) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: isEditing ? "Edit Location" : "Add Location" }} />
        <ActivityIndicator size="large" color="#f5a623" />
      </View>
    );
  }

  const hasCoords = latitude !== null && longitude !== null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: isEditing ? "Edit Location" : "Add Location" }} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Location Name */}
        <Text style={styles.label}>Location Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Home, Warehouse, Office"
          placeholderTextColor="#6b7280"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={60}
        />

        {/* Location Type */}
        <Text style={styles.label}>Location Type</Text>
        <View style={styles.typeRow}>
          {LOCATION_TYPES.map((opt) => {
            const isActive = locationType === opt.value;
            const color = LOCATION_TYPE_COLORS[opt.value as LocationType];
            const iconName = LOCATION_TYPE_ICONS[opt.value as LocationType];
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.typeBtn,
                  isActive && { backgroundColor: color, borderColor: color },
                ]}
                onPress={() => setLocationType(opt.value as LocationType)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={iconName}
                  size={18}
                  color={isActive ? "#030712" : "#6b7280"}
                />
                <Text
                  style={[
                    styles.typeBtnText,
                    isActive && styles.typeBtnTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Map Location */}
        <Text style={styles.label}>Location *</Text>

        {/* Address preview */}
        {hasCoords ? (
          <View style={styles.addressCard}>
            <Ionicons name="location" size={16} color="#f5a623" />
            <View style={{ flex: 1 }}>
              <Text style={styles.addressText} numberOfLines={2}>
                {address ?? `${latitude!.toFixed(5)}, ${longitude!.toFixed(5)}`}
              </Text>
              <Text style={styles.coordText}>
                {latitude!.toFixed(5)}, {longitude!.toFixed(5)}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.noLocationCard}>
            <Ionicons name="location-outline" size={20} color="#4b5563" />
            <Text style={styles.noLocationText}>No location selected</Text>
          </View>
        )}

        {/* Location picker buttons */}
        <View style={styles.locationBtns}>
          <TouchableOpacity
            style={styles.locationBtn}
            onPress={() => setMapPickerVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="map-outline" size={16} color="#f5a623" />
            <Text style={styles.locationBtnText}>Pick on Map</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.locationBtn}
            onPress={handleUseCurrentLocation}
            disabled={loadingLocation}
            activeOpacity={0.7}
          >
            {loadingLocation ? (
              <ActivityIndicator size="small" color="#f5a623" />
            ) : (
              <Ionicons name="navigate-outline" size={16} color="#f5a623" />
            )}
            <Text style={styles.locationBtnText}>
              {loadingLocation ? "Locating..." : "Use Current Location"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Geofence Radius */}
        <Text style={[styles.label, { marginTop: 20 }]}>Geofence Radius</Text>
        <Text style={styles.hintText}>
          Trips starting or ending within this radius will be flagged for auto-classification
        </Text>
        <View style={{ marginTop: 12 }}>
          <RadiusSlider value={radiusMeters} onChange={setRadiusMeters} />
        </View>

        {/* Geofence Toggle */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Geofence Active</Text>
            <Text style={styles.toggleHint}>
              Auto-detect trips near this location
            </Text>
          </View>
          <Switch
            value={geofenceEnabled}
            onValueChange={setGeofenceEnabled}
            trackColor={{ false: "#374151", true: "#f5a623" }}
            thumbColor="#fff"
          />
        </View>

        {/* Save */}
        <Button
          title={isEditing ? "Save Changes" : "Add Location"}
          icon="checkmark"
          onPress={handleSave}
          loading={saving}
          disabled={deleting}
          style={{ marginTop: 32 }}
        />

        {/* Delete — edit mode only */}
        {isEditing && (
          <Button
            variant="ghost"
            danger
            title="Delete Location"
            onPress={handleDelete}
            loading={deleting}
            disabled={saving}
            style={{ marginTop: 12 }}
          />
        )}
      </ScrollView>

      <MapPickerModal
        visible={mapPickerVisible}
        initialLat={latitude}
        initialLng={longitude}
        onConfirm={handleMapConfirm}
        onCancel={() => setMapPickerVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#030712",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  label: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#d1d5db",
    marginBottom: 6,
    marginTop: 16,
  },
  hintText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    marginTop: 2,
    lineHeight: 17,
  },
  input: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  // Location type selector
  typeRow: {
    flexDirection: "row",
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#111827",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
    gap: 4,
  },
  typeBtnText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#6b7280",
  },
  typeBtnTextActive: {
    color: "#030712",
  },
  // Address display
  addressCard: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.3)",
  },
  addressText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#f0f2f5",
    marginBottom: 2,
  },
  coordText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  noLocationCard: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    borderStyle: "dashed",
  },
  noLocationText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#4b5563",
  },
  // Location picker buttons
  locationBtns: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  locationBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  locationBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },
  // Toggle row
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#fff",
  },
  toggleHint: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    marginTop: 3,
  },
});
