import { useEffect, useState, useCallback } from "react";
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
import { fetchFuelLog } from "../lib/api/fuel";
import { getLocalFuelLog } from "../lib/db/queries";
import {
  syncCreateFuelLog,
  syncUpdateFuelLog,
  syncDeleteFuelLog,
} from "../lib/sync/actions";
import { fetchVehicles } from "../lib/api/vehicles";
import { FUEL_BRANDS } from "@mileclear/shared";
import type { Vehicle } from "@mileclear/shared";

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
  const [loggedAt, setLoggedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);

  useEffect(() => {
    // Load vehicles for picker
    fetchVehicles()
      .then((res) => setVehicles(res.data))
      .catch(() => {});
  }, []);

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
      setLoggedAt(log.loggedAt.slice(0, 10));
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
      if (isEditing) {
        await syncUpdateFuelLog(id, {
          vehicleId: vehicleId,
          litres: parsedLitres,
          costPence,
          stationName: stationName.trim() || null,
          odometerReading: parsedOdometer ?? null,
          loggedAt: loggedAt ? new Date(loggedAt).toISOString() : undefined,
        });
      } else {
        await syncCreateFuelLog({
          vehicleId: vehicleId ?? undefined,
          litres: parsedLitres,
          costPence,
          stationName: stationName.trim() || undefined,
          odometerReading: parsedOdometer,
          loggedAt: loggedAt ? new Date(loggedAt).toISOString() : undefined,
        });
      }
      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save fuel log");
    } finally {
      setSaving(false);
    }
  }, [isEditing, id, vehicleId, litres, cost, stationName, odometer, loggedAt, router]);

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

  if (loadingExisting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
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
          onChangeText={setStationName}
          placeholder="Station name (optional)"
          placeholderTextColor="#6b7280"
        />
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
              onPress={() => setStationName(brand)}
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
        <Text style={styles.label}>Litres *</Text>
        <TextInput
          style={styles.input}
          value={litres}
          onChangeText={setLitres}
          placeholder="0.0"
          placeholderTextColor="#6b7280"
          keyboardType="decimal-pad"
        />

        {/* Cost */}
        <Text style={styles.label}>Cost *</Text>
        <View style={styles.amountRow}>
          <Text style={styles.currencyPrefix}>£</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={cost}
            onChangeText={setCost}
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
        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          value={loggedAt}
          onChangeText={setLoggedAt}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#6b7280"
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
  // Brand chips
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
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
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
    backgroundColor: "#f59e0b",
    borderRadius: 10,
    paddingVertical: 14,
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
