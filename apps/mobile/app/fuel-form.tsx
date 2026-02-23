import { useEffect, useState, useCallback, useRef } from "react";
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
} from "react-native";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { fetchFuelLog, fetchNearbyPrices } from "../lib/api/fuel";
import { getLocalFuelLog } from "../lib/db/queries";
import {
  syncCreateFuelLog,
  syncUpdateFuelLog,
  syncDeleteFuelLog,
} from "../lib/sync/actions";
import { fetchVehicles } from "../lib/api/vehicles";
import { getCurrentLocation } from "../lib/location/geocoding";
import { FUEL_BRANDS } from "@mileclear/shared";
import type { Vehicle, FuelStation } from "@mileclear/shared";
import { DateTimePickerField } from "../components/DateTimePickerField";

export default function FuelFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [stationName, setStationName] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [litres, setLitres] = useState("");
  const [cost, setCost] = useState("");
  const [odometer, setOdometer] = useState("");
  const [loggedAt, setLoggedAt] = useState<Date | null>(new Date());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);

  // Nearby stations
  const [nearbyStations, setNearbyStations] = useState<FuelStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<FuelStation | null>(null);
  const [loadingStations, setLoadingStations] = useState(false);
  // Tracks which field the user last typed in so we calculate the other
  const lastEditedRef = useRef<"litres" | "cost" | null>(null);

  useEffect(() => {
    // Load vehicles for picker
    fetchVehicles()
      .then((res) => setVehicles(res.data))
      .catch(() => {});
  }, []);

  // Fetch nearby stations on mount (new logs only)
  useEffect(() => {
    if (isEditing) return;
    let cancelled = false;
    (async () => {
      setLoadingStations(true);
      try {
        const loc = await getCurrentLocation();
        if (!loc || cancelled) { setLoadingStations(false); return; }
        const res = await fetchNearbyPrices({ lat: loc.lat, lng: loc.lng, radiusMiles: 3 });
        if (!cancelled) setNearbyStations(res.stations ?? []);
      } catch {
        // Silently fail — manual entry still works
      } finally {
        if (!cancelled) setLoadingStations(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEditing]);

  useEffect(() => {
    if (!id) {
      setLoggedAt(new Date().toISOString().slice(0, 10));
      return;
    }
    const populateLog = (log: {
      stationName?: string | null; vehicleId: string | null;
      litres: number; costPence: number;
      odometerReading?: number | null; loggedAt: string;
    }) => {
      setStationName(log.stationName ?? "");
      setVehicleId(log.vehicleId);
      setLitres(log.litres.toString());
      setCost((log.costPence / 100).toFixed(2));
      setOdometer(log.odometerReading?.toString() ?? "");
      setLoggedAt(new Date(log.loggedAt));
    };

    fetchFuelLog(id)
      .then((res) => populateLog(res.data))
      .catch(async () => {
        const local = await getLocalFuelLog(id);
        if (local) populateLog(local);
      })
      .finally(() => setLoadingExisting(false));
  }, [id]);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  // Get the relevant price from a station based on selected vehicle fuel type
  const getStationPrice = useCallback((station: FuelStation): number | undefined => {
    const fuelType = selectedVehicle?.fuelType;
    if (fuelType === "diesel") return station.prices.B7;
    // Default to E10 for petrol, hybrid, or no vehicle selected
    return station.prices.E10;
  }, [selectedVehicle]);

  // Bidirectional auto-calculate: litres→cost or cost→litres
  useEffect(() => {
    if (!selectedStation || !lastEditedRef.current) return;
    const ppl = getStationPrice(selectedStation);
    if (!ppl) return;

    if (lastEditedRef.current === "litres") {
      const parsed = parseFloat(litres);
      if (isNaN(parsed) || parsed <= 0) return;
      setCost(((ppl * parsed) / 100).toFixed(2));
    } else if (lastEditedRef.current === "cost") {
      const parsed = parseFloat(cost);
      if (isNaN(parsed) || parsed <= 0) return;
      // cost is pounds, ppl is pence → litres = (cost * 100) / ppl
      const calc = ((parsed * 100) / ppl).toFixed(1);
      setLitres(calc);
    }
  }, [litres, cost, selectedStation, getStationPrice]);

  const handleSelectStation = useCallback((station: FuelStation) => {
    setSelectedStation(station);
    // Build station name: "Brand - Address"
    const addr = station.address.length > 40
      ? station.address.slice(0, 37) + "..."
      : station.address;
    setStationName(`${station.brand} - ${addr}`);

    const fuelType = selectedVehicle?.fuelType;
    const ppl = fuelType === "diesel" ? station.prices.B7 : station.prices.E10;
    if (!ppl) return;

    // Auto-fill whichever field is empty, or calc cost from litres by default
    const parsedLitres = parseFloat(litres);
    const parsedCost = parseFloat(cost);
    if (!isNaN(parsedLitres) && parsedLitres > 0) {
      setCost(((ppl * parsedLitres) / 100).toFixed(2));
      lastEditedRef.current = "litres";
    } else if (!isNaN(parsedCost) && parsedCost > 0) {
      setLitres(((parsedCost * 100) / ppl).toFixed(1));
      lastEditedRef.current = "cost";
    }
  }, [litres, cost, selectedVehicle]);

  const handleStationNameChange = useCallback((text: string) => {
    setStationName(text);
    // Typing manually deselects any picked station
    if (selectedStation) setSelectedStation(null);
  }, [selectedStation]);

  const handleCostChange = useCallback((text: string) => {
    setCost(text);
    lastEditedRef.current = "cost";
  }, []);

  const showVehiclePicker = useCallback(() => {
    const options = [
      { text: "None", onPress: () => setVehicleId(null) },
      ...vehicles.map((v) => ({
        text: `${v.make} ${v.model}`,
        onPress: () => setVehicleId(v.id),
      })),
    ];
    Alert.alert(
      "Select Vehicle",
      undefined,
      [
        ...options,
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }, [vehicles]);

  const handleSave = useCallback(async () => {
    const parsedLitres = parseFloat(litres);
    if (!litres.trim() || isNaN(parsedLitres) || parsedLitres <= 0) {
      Alert.alert("Invalid litres", "Please enter litres greater than 0.");
      return;
    }
    const parsedCost = parseFloat(cost);
    if (!cost.trim() || isNaN(parsedCost) || parsedCost <= 0) {
      Alert.alert("Invalid cost", "Please enter a cost greater than 0.");
      return;
    }

    const costPence = Math.round(parsedCost * 100);
    const parsedOdometer = odometer.trim() ? parseFloat(odometer) : undefined;
    if (parsedOdometer !== undefined && (isNaN(parsedOdometer) || parsedOdometer <= 0)) {
      Alert.alert("Invalid odometer", "Odometer reading must be a positive number.");
      return;
    }

    setSaving(true);
    try {
      // Use station coordinates if selected, otherwise capture GPS
      let latitude: number | undefined;
      let longitude: number | undefined;
      if (selectedStation) {
        latitude = selectedStation.latitude;
        longitude = selectedStation.longitude;
      } else if (!isEditing) {
        try {
          const loc = await getCurrentLocation();
          if (loc) {
            latitude = loc.lat;
            longitude = loc.lng;
          }
        } catch {
          // GPS capture is best-effort — don't block save
        }
      }

      if (isEditing) {
        await syncUpdateFuelLog(id, {
          vehicleId: vehicleId,
          litres: parsedLitres,
          costPence,
          stationName: stationName.trim() || null,
          odometerReading: parsedOdometer ?? null,
          loggedAt: loggedAt ? loggedAt.toISOString() : undefined,
        });
      } else {
        await syncCreateFuelLog({
          vehicleId: vehicleId ?? undefined,
          litres: parsedLitres,
          costPence,
          stationName: stationName.trim() || undefined,
          odometerReading: parsedOdometer,
          latitude,
          longitude,
          loggedAt: loggedAt ? loggedAt.toISOString() : undefined,
        });
      }
      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save fuel log");
    } finally {
      setSaving(false);
    }
  }, [isEditing, id, vehicleId, litres, cost, stationName, odometer, loggedAt, router, selectedStation]);

  const handleDelete = useCallback(() => {
    Alert.alert("Delete fuel log", "Remove this fuel log? This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await syncDeleteFuelLog(id!);
            router.back();
          } catch (err: unknown) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete");
            setDeleting(false);
          }
        },
      },
    ]);
  }, [id, router]);

  // Price colour: green if cheap, amber if mid, red if expensive
  const priceColour = (pence: number): string => {
    if (pence < 130) return "#22c55e";
    if (pence < 145) return "#f5a623";
    return "#ef4444";
  };

  if (loadingExisting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f5a623" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{ title: isEditing ? "Edit Fuel Log" : "Add Fuel Log" }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Station Name */}
        <Text style={styles.label}>Station</Text>
        <TextInput
          style={styles.input}
          value={stationName}
          onChangeText={handleStationNameChange}
          placeholder="Station name (optional)"
          placeholderTextColor="#6b7280"
        />

        {/* Nearby station picker */}
        {loadingStations && (
          <View style={styles.stationsLoading}>
            <ActivityIndicator size="small" color="#f5a623" />
            <Text style={styles.stationsLoadingText}>Finding nearby stations...</Text>
          </View>
        )}
        {nearbyStations.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stationRow}
          >
            {nearbyStations.map((station) => {
              const isSelected = selectedStation?.siteId === station.siteId;
              const price = getStationPrice(station);
              return (
                <TouchableOpacity
                  key={station.siteId}
                  style={[styles.stationCard, isSelected && styles.stationCardSelected]}
                  onPress={() => handleSelectStation(station)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.stationBrand} numberOfLines={1}>
                    {station.brand}
                  </Text>
                  <Text style={styles.stationAddress} numberOfLines={1}>
                    {station.address}
                  </Text>
                  <View style={styles.stationMeta}>
                    {price != null && (
                      <Text style={[styles.stationPrice, { color: priceColour(price) }]}>
                        {price.toFixed(1)}p
                      </Text>
                    )}
                    <Text style={styles.stationDistance}>
                      {station.distanceMiles.toFixed(1)} mi
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
        {/* Fallback brand chips when no nearby stations */}
        {nearbyStations.length === 0 && !loadingStations && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {FUEL_BRANDS.map((brand) => (
              <TouchableOpacity
                key={brand}
                style={[
                  styles.chip,
                  stationName === brand && styles.chipActive,
                ]}
                onPress={() => {
                  setStationName(brand);
                  setSelectedStation(null);
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    stationName === brand && styles.chipTextActive,
                  ]}
                >
                  {brand}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Vehicle */}
        <Text style={styles.label}>Vehicle</Text>
        <TouchableOpacity style={styles.input} onPress={showVehiclePicker}>
          <Text style={selectedVehicle ? styles.inputValue : styles.inputPlaceholder}>
            {selectedVehicle
              ? `${selectedVehicle.make} ${selectedVehicle.model}`
              : "Select vehicle (optional)"}
          </Text>
        </TouchableOpacity>

        {/* Litres */}
        <Text style={styles.label}>
          Litres *{selectedStation && lastEditedRef.current === "cost" ? "  (estimated)" : ""}
        </Text>
        <TextInput
          style={styles.input}
          value={litres}
          onChangeText={(text) => {
            setLitres(text);
            lastEditedRef.current = "litres";
          }}
          placeholder="0.0"
          placeholderTextColor="#6b7280"
          keyboardType="decimal-pad"
        />

        {/* Cost */}
        <Text style={styles.label}>
          Cost *{selectedStation && lastEditedRef.current === "litres" ? "  (estimated)" : ""}
        </Text>
        <View style={styles.amountRow}>
          <Text style={styles.currencyPrefix}>£</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={cost}
            onChangeText={handleCostChange}
            placeholder="0.00"
            placeholderTextColor="#6b7280"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Odometer */}
        <Text style={styles.label}>Odometer</Text>
        <TextInput
          style={styles.input}
          value={odometer}
          onChangeText={setOdometer}
          placeholder="Miles (optional)"
          placeholderTextColor="#6b7280"
          keyboardType="decimal-pad"
        />

        {/* Date */}
        <DateTimePickerField
          label="Date"
          value={loggedAt}
          onChange={setLoggedAt}
          maximumDate={new Date()}
        />

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving || deleting}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator color="#030712" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isEditing ? "Save Changes" : "Add Fuel Log"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Delete — edit mode only */}
        {isEditing && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={saving || deleting}
            activeOpacity={0.7}
          >
            {deleting ? (
              <ActivityIndicator color="#ef4444" />
            ) : (
              <Text style={styles.deleteText}>Delete Fuel Log</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
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
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#d1d5db",
    marginBottom: 6,
    marginTop: 16,
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
  inputValue: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
  },
  inputPlaceholder: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  // Brand chips (fallback)
  chipRow: {
    gap: 8,
    paddingVertical: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  chipActive: {
    backgroundColor: "#f5a623",
    borderColor: "#f5a623",
  },
  chipText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  chipTextActive: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
  },
  // Nearby stations
  stationsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  stationsLoadingText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  stationRow: {
    gap: 10,
    paddingVertical: 10,
  },
  stationCard: {
    width: 160,
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#1f2937",
  },
  stationCardSelected: {
    borderColor: "#f5a623",
    backgroundColor: "#1a1708",
  },
  stationBrand: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    marginBottom: 3,
  },
  stationAddress: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    marginBottom: 8,
  },
  stationMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stationPrice: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  stationDistance: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#6b7280",
  },
  // Amount row
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencyPrefix: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
  },
  // Buttons
  saveButton: {
    backgroundColor: "#f5a623",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 28,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  deleteButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  deleteText: {
    fontSize: 15,
    color: "#ef4444",
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
});
