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
import {
  createVehicle,
  updateVehicle,
  deleteVehicle,
  fetchVehicles,
} from "../lib/api/vehicles";
import type { FuelType, VehicleType } from "@mileclear/shared";

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: "car", label: "Car" },
  { value: "motorbike", label: "Motorbike" },
  { value: "van", label: "Van" },
];

const FUEL_TYPE_OPTIONS: { value: FuelType; label: string }[] = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "electric", label: "Electric" },
  { value: "hybrid", label: "Hybrid" },
];

export default function VehicleFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("car");
  const [fuelType, setFuelType] = useState<FuelType>("petrol");
  const [estimatedMpg, setEstimatedMpg] = useState("");
  const [isPrimary, setIsPrimary] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);

  useEffect(() => {
    if (!id) return;
    fetchVehicles()
      .then((res) => {
        const vehicle = res.data.find((v) => v.id === id);
        if (vehicle) {
          setMake(vehicle.make);
          setModel(vehicle.model);
          setYear(vehicle.year ? String(vehicle.year) : "");
          setVehicleType(vehicle.vehicleType as VehicleType);
          setFuelType(vehicle.fuelType as FuelType);
          setEstimatedMpg(vehicle.estimatedMpg ? String(vehicle.estimatedMpg) : "");
          setIsPrimary(vehicle.isPrimary);
        }
      })
      .finally(() => setLoadingExisting(false));
  }, [id]);

  const handleSave = useCallback(async () => {
    if (!make.trim() || !model.trim()) {
      Alert.alert("Missing fields", "Make and model are required.");
      return;
    }

    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        make: make.trim(),
        model: model.trim(),
        vehicleType,
        fuelType,
        isPrimary,
      };
      if (year.trim()) data.year = parseInt(year, 10);
      if (estimatedMpg.trim() && fuelType !== "electric") {
        data.estimatedMpg = parseFloat(estimatedMpg);
      }

      if (isEditing) {
        await updateVehicle(id, data);
      } else {
        await createVehicle(data as Parameters<typeof createVehicle>[0]);
      }
      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save vehicle");
    } finally {
      setSaving(false);
    }
  }, [make, model, year, vehicleType, fuelType, estimatedMpg, isPrimary, isEditing, id, router]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete vehicle",
      `Remove ${make} ${model}? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteVehicle(id!);
              router.back();
            } catch (err: unknown) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete");
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [id, make, model, router]);

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
        options={{ title: isEditing ? "Edit Vehicle" : "Add Vehicle" }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Make */}
        <Text style={styles.label}>Make *</Text>
        <TextInput
          style={styles.input}
          value={make}
          onChangeText={setMake}
          placeholder="e.g. Toyota"
          placeholderTextColor="#6b7280"
          autoCapitalize="words"
        />

        {/* Model */}
        <Text style={styles.label}>Model *</Text>
        <TextInput
          style={styles.input}
          value={model}
          onChangeText={setModel}
          placeholder="e.g. Prius"
          placeholderTextColor="#6b7280"
          autoCapitalize="words"
        />

        {/* Year */}
        <Text style={styles.label}>Year</Text>
        <TextInput
          style={styles.input}
          value={year}
          onChangeText={setYear}
          placeholder="e.g. 2020"
          placeholderTextColor="#6b7280"
          keyboardType="number-pad"
          maxLength={4}
        />

        {/* Vehicle Type */}
        <Text style={styles.label}>Vehicle Type</Text>
        <View style={styles.segmentRow}>
          {VEHICLE_TYPES.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.segment,
                vehicleType === opt.value && styles.segmentActive,
              ]}
              onPress={() => setVehicleType(opt.value)}
            >
              <Text
                style={[
                  styles.segmentText,
                  vehicleType === opt.value && styles.segmentTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Fuel Type */}
        <Text style={styles.label}>Fuel Type</Text>
        <View style={styles.segmentRow}>
          {FUEL_TYPE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.segment,
                fuelType === opt.value && styles.segmentActive,
              ]}
              onPress={() => setFuelType(opt.value)}
            >
              <Text
                style={[
                  styles.segmentText,
                  fuelType === opt.value && styles.segmentTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Estimated MPG — hidden for electric */}
        {fuelType !== "electric" && (
          <>
            <Text style={styles.label}>Estimated MPG</Text>
            <TextInput
              style={styles.input}
              value={estimatedMpg}
              onChangeText={setEstimatedMpg}
              placeholder="e.g. 45"
              placeholderTextColor="#6b7280"
              keyboardType="decimal-pad"
            />
          </>
        )}

        {/* Primary toggle */}
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => setIsPrimary(!isPrimary)}
          activeOpacity={0.7}
        >
          <Text style={styles.toggleLabel}>Set as primary vehicle</Text>
          <View style={[styles.toggle, isPrimary && styles.toggleActive]}>
            <View
              style={[styles.toggleThumb, isPrimary && styles.toggleThumbActive]}
            />
          </View>
        </TouchableOpacity>

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
              {isEditing ? "Save Changes" : "Add Vehicle"}
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
              <Text style={styles.deleteText}>Delete Vehicle</Text>
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
    fontWeight: "600",
    color: "#d1d5db",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#111827",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  segmentActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9ca3af",
  },
  segmentTextActive: {
    color: "#030712",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 4,
  },
  toggleLabel: {
    fontSize: 15,
    color: "#d1d5db",
    fontWeight: "500",
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#374151",
    justifyContent: "center",
    padding: 2,
  },
  toggleActive: {
    backgroundColor: "#f59e0b",
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
  },
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
    fontWeight: "700",
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
    fontWeight: "600",
  },
});
