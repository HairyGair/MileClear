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
import { showSupportAlert } from "../lib/support";
import {
  createVehicle,
  updateVehicle,
  deleteVehicle,
  fetchVehicles,
  lookupVehicle,
} from "../lib/api/vehicles";
import type { FuelType, VehicleType, CazAssessment } from "@mileclear/shared";
import { Button } from "../components/Button";
import { CleanAirZoneCard } from "../components/CleanAirZoneCard";
import { useUser } from "../lib/user/context";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;

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
  const { user } = useUser();
  const isEditing = !!id;

  const [registrationPlate, setRegistrationPlate] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  // Emissions data from the DVLA lookup, sent through on create so Clean Air
  // Zone compliance can be computed for the vehicle without a second lookup.
  const [euroStatus, setEuroStatus] = useState<string | null>(null);
  const [firstRegistration, setFirstRegistration] = useState<string | null>(null);
  // Server-computed Clean Air Zone assessment for an existing vehicle.
  const [cleanAirZones, setCleanAirZones] = useState<CazAssessment | null>(null);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("car");
  const [fuelType, setFuelType] = useState<FuelType>("petrol");
  const [estimatedMpg, setEstimatedMpg] = useState("");
  const [milesPerKwh, setMilesPerKwh] = useState("");
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
          setMilesPerKwh(
            (vehicle as { milesPerKwh?: number | null }).milesPerKwh != null
              ? String((vehicle as { milesPerKwh?: number | null }).milesPerKwh)
              : ""
          );
          setIsPrimary(vehicle.isPrimary);
          setRegistrationPlate(vehicle.registrationPlate || "");
          setCleanAirZones(vehicle.cleanAirZones ?? null);
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
      setEuroStatus(data.euroStatus ?? null);
      setFirstRegistration(data.firstRegistration ?? null);
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

    // Free users limited to 1 vehicle
    if (!isEditing && !user?.isPremium) {
      try {
        const existing = await fetchVehicles();
        if (existing.data.length >= 1) {
          Alert.alert(
            "Vehicle Limit",
            "Free accounts can have 1 vehicle. Upgrade to Pro for unlimited vehicles.",
            [
              { text: "OK", style: "cancel" },
              { text: "Upgrade", onPress: () => router.push("/(tabs)/profile" as any) },
            ]
          );
          return;
        }
      } catch {}
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
      if (milesPerKwh.trim() && fuelType === "electric") {
        payload.milesPerKwh = parseFloat(milesPerKwh);
      }
      if (registrationPlate.trim()) {
        payload.registrationPlate = registrationPlate.trim().toUpperCase().replace(/\s+/g, "");
      }
      if (euroStatus) payload.euroStatus = euroStatus;
      if (firstRegistration) payload.firstRegistration = firstRegistration;

      if (isEditing) {
        await updateVehicle(id, payload);
      } else {
        await createVehicle(payload);
      }
      router.back();
    } catch (err: unknown) {
      showSupportAlert("Save Failed", err instanceof Error ? err.message : "Failed to save vehicle.");
    } finally {
      setSaving(false);
    }
  }, [make, model, year, vehicleType, fuelType, estimatedMpg, milesPerKwh, isPrimary, registrationPlate, euroStatus, firstRegistration, isEditing, id, router, user?.isPremium]);

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
              Alert.alert("Couldn't delete the vehicle", err instanceof Error ? err.message : "Try again in a moment.");
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
        <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading" />
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
            placeholderTextColor={TEXT_3}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
            accessibilityLabel="Registration plate"
          />
          <Button
            title="Look up"
            icon="search"
            size="sm"
            fullWidth={false}
            onPress={handleLookup}
            loading={lookingUp}
            disabled={saving}
            style={{ paddingHorizontal: 20 }}
          />
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
          placeholderTextColor={TEXT_3}
          autoCapitalize="words"
          accessibilityLabel="Vehicle make"
        />

        {/* Model */}
        <Text style={styles.label}>Model *</Text>
        <TextInput
          style={styles.input}
          value={model}
          onChangeText={setModel}
          placeholder="e.g. Prius"
          placeholderTextColor={TEXT_3}
          autoCapitalize="words"
          accessibilityLabel="Vehicle model"
        />

        {/* Year */}
        <Text style={styles.label}>Year</Text>
        <TextInput
          style={styles.input}
          value={year}
          onChangeText={setYear}
          placeholder="e.g. 2020"
          placeholderTextColor={TEXT_3}
          keyboardType="number-pad"
          maxLength={4}
          accessibilityLabel="Year of manufacture"
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
              accessibilityRole="button"
              accessibilityLabel={`${opt.label} vehicle type`}
              accessibilityState={{ selected: vehicleType === opt.value }}
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
              accessibilityRole="button"
              accessibilityLabel={`${opt.label} fuel type`}
              accessibilityState={{ selected: fuelType === opt.value }}
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
              placeholderTextColor={TEXT_3}
              keyboardType="decimal-pad"
              accessibilityLabel="Estimated miles per gallon"
            />
          </>
        )}

        {/* Efficiency (miles/kWh) — electric only, powers cost-per-mile */}
        {fuelType === "electric" && (
          <>
            <Text style={styles.label}>Efficiency (miles per kWh)</Text>
            <TextInput
              style={styles.input}
              value={milesPerKwh}
              onChangeText={setMilesPerKwh}
              placeholder="e.g. 3.5"
              placeholderTextColor={TEXT_3}
              keyboardType="decimal-pad"
              accessibilityLabel="Efficiency in miles per kilowatt hour"
            />
          </>
        )}

        {/* Primary toggle */}
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => setIsPrimary(!isPrimary)}
          activeOpacity={0.7}
          accessibilityRole="switch"
          accessibilityLabel="Set as primary vehicle"
          accessibilityState={{ checked: isPrimary }}
        >
          <Text style={styles.toggleLabel}>Set as primary vehicle</Text>
          <View style={[styles.toggle, isPrimary && styles.toggleActive]} accessible={false}>
            <View
              style={[styles.toggleThumb, isPrimary && styles.toggleThumbActive]}
            />
          </View>
        </TouchableOpacity>

        {/* Clean Air Zone / ULEZ compliance — edit mode, when we have data */}
        {isEditing && cleanAirZones && <CleanAirZoneCard assessment={cleanAirZones} />}

        {/* MOT History — edit mode + has plate */}
        {isEditing && registrationPlate.trim() && (
          <Button
            variant="secondary"
            icon="document-text-outline"
            title="View MOT History"
            onPress={() =>
              router.navigate(`/vehicle-mot-history?id=${id}` as never)
            }
            disabled={saving || deleting}
            style={{ marginTop: 16 }}
          />
        )}

        {/* Save */}
        <Button
          title={isEditing ? "Save Changes" : "Add Vehicle"}
          icon="checkmark"
          onPress={handleSave}
          loading={saving}
          disabled={deleting}
          style={{ marginTop: 28 }}
        />

        {/* Delete — edit mode only */}
        {isEditing && (
          <Button
            variant="ghost"
            danger
            title="Delete Vehicle"
            onPress={handleDelete}
            loading={deleting}
            disabled={saving}
            style={{ marginTop: 12 }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  lookupRow: {
    flexDirection: "row",
    gap: 10,
  },
  plateInput: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    fontFamily: fonts.bold,
    color: "#fff",
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    textTransform: "uppercase",
  },
  lookupHint: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: GREEN,
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
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  segmentActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  segmentText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    color: BG,
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
    color: TEXT_2,
    fontFamily: fonts.medium,
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
    backgroundColor: AMBER,
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
});
