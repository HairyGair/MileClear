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
  lookupVehicle,
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

  const [registrationPlate, setRegistrationPlate] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
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
          setRegistrationPlate(vehicle.registrationPlate || "");
        }
      })
      .finally(() => setLoadingExisting(false));
  }, [id]);

  const handleLookup = useCallback(async () => {
    const plate = registrationPlate.trim();
    if (plate.length < 2) {
      Alert.alert("Enter a registration", "Type a UK registration plate to look up.");
      return;
    }

    setLookingUp(true);
    try {
      const res = await lookupVehicle(plate);
      const data = res.data;

      setMake(data.make);
      if (data.yearOfManufacture) setYear(String(data.yearOfManufacture));
      setFuelType(data.fuelType);
      setLookupDone(true);

      const colourText = data.colour ? `, ${data.colour}` : "";
      const yearText = data.yearOfManufacture ? ` (${data.yearOfManufacture})` : "";
      Alert.alert(
        "Vehicle found",
        `${data.make}${yearText}${colourText}.\n\nPlease enter the model and check the details.`
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Lookup failed. Please enter details manually.";
      Alert.alert("Lookup failed", message);
    } finally {
      setLookingUp(false);
    }
  }, [registrationPlate]);

  const handleSave = useCallback(async () => {
    if (!make.trim() || !model.trim()) {
      Alert.alert("Missing fields", "Make and model are required.");
      return;
    }

    setSaving(true);
    try {
      const payload: Parameters<typeof createVehicle>[0] = {
        make: make.trim(),
        model: model.trim(),
        vehicleType,
        fuelType,
        isPrimary,
      };
      if (year.trim()) payload.year = parseInt(year, 10);
      if (estimatedMpg.trim() && fuelType !== "electric") {
        payload.estimatedMpg = parseFloat(estimatedMpg);
      }
      if (registrationPlate.trim()) {
        payload.registrationPlate = registrationPlate.trim().toUpperCase().replace(/\s+/g, "");
      }

      if (isEditing) {
        await updateVehicle(id, payload);
      } else {
        await createVehicle(payload);
      }
      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save vehicle");
    } finally {
      setSaving(false);
    }
  }, [make, model, year, vehicleType, fuelType, estimatedMpg, isPrimary, registrationPlate, isEditing, id, router]);

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
        options={{ title: isEditing ? "Edit Vehicle" : "Add Vehicle" }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Registration Plate Lookup */}
        <Text style={styles.label}>Registration Plate</Text>
        <View style={styles.lookupRow}>
          <TextInput
            style={styles.plateInput}
            value={registrationPlate}
            onChangeText={(text) => {
              setRegistrationPlate(text.toUpperCase());
              setLookupDone(false);
            }}
            placeholder="e.g. BD63 OJT"
            placeholderTextColor="#6b7280"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
          />
          <TouchableOpacity
            style={[styles.lookupButton, lookingUp && styles.buttonDisabled]}
            onPress={handleLookup}
            disabled={lookingUp || saving}
            activeOpacity={0.7}
          >
            {lookingUp ? (
              <ActivityIndicator color="#030712" size="small" />
            ) : (
              <Text style={styles.lookupButtonText}>Look up</Text>
            )}
          </TouchableOpacity>
        </View>
        {lookupDone && (
          <Text style={styles.lookupHint}>
            Details filled from DVLA. Please add the model and verify.
          </Text>
        )}

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
  lookupRow: {
    flexDirection: "row",
    gap: 10,
  },
  plateInput: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: "#1f2937",
    textTransform: "uppercase",
  },
  lookupButton: {
    backgroundColor: "#f5a623",
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  lookupButtonText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  lookupHint: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#22c55e",
    marginTop: 6,
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
    backgroundColor: "#f5a623",
    borderColor: "#f5a623",
  },
  segmentText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  segmentTextActive: {
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_500Medium",
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
    backgroundColor: "#f5a623",
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
