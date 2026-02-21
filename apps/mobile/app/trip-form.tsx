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
import { fetchTrip, CreateTripData } from "../lib/api/trips";
import {
  syncCreateTrip,
  syncUpdateTrip,
  syncDeleteTrip,
} from "../lib/sync/actions";
import { fetchVehicles } from "../lib/api/vehicles";
import { GIG_PLATFORMS } from "@mileclear/shared";
import type { TripClassification, PlatformTag, Vehicle } from "@mileclear/shared";

const CLASSIFICATIONS: { value: TripClassification; label: string }[] = [
  { value: "business", label: "Business" },
  { value: "personal", label: "Personal" },
];

export default function TripFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [classification, setClassification] = useState<TripClassification>("business");
  const [platformTag, setPlatformTag] = useState<PlatformTag | undefined>(undefined);
  const [vehicleId, setVehicleId] = useState<string | undefined>(undefined);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [startAddress, setStartAddress] = useState("");
  const [endAddress, setEndAddress] = useState("");
  const [startLat, setStartLat] = useState("");
  const [startLng, setStartLng] = useState("");
  const [endLat, setEndLat] = useState("");
  const [endLng, setEndLng] = useState("");
  const [distanceMiles, setDistanceMiles] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);

  useEffect(() => {
    fetchVehicles()
      .then((res) => {
        setVehicles(res.data);
        if (!id) {
          const primary = res.data.find((v) => v.isPrimary);
          if (primary) setVehicleId(primary.id);
        }
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) {
      // Pre-fill dates for new trip
      const now = new Date().toISOString().slice(0, 16);
      setStartedAt(now);
      return;
    }
    fetchTrip(id)
      .then((res) => {
        const t = res.data;
        setClassification(t.classification);
        setPlatformTag(t.platformTag ?? undefined);
        setVehicleId(t.vehicleId ?? undefined);
        setStartAddress(t.startAddress ?? "");
        setEndAddress(t.endAddress ?? "");
        setStartLat(String(t.startLat));
        setStartLng(String(t.startLng));
        setEndLat(t.endLat != null ? String(t.endLat) : "");
        setEndLng(t.endLng != null ? String(t.endLng) : "");
        setDistanceMiles(String(t.distanceMiles));
        setStartedAt(t.startedAt.slice(0, 16));
        setEndedAt(t.endedAt ? t.endedAt.slice(0, 16) : "");
        setNotes(t.notes ?? "");
      })
      .finally(() => setLoadingExisting(false));
  }, [id]);

  const handleSave = useCallback(async () => {
    if (!startLat.trim() || !startLng.trim()) {
      Alert.alert("Missing fields", "Start coordinates are required.");
      return;
    }
    if (!startedAt.trim()) {
      Alert.alert("Missing fields", "Start date/time is required.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await syncUpdateTrip(id, {
          classification,
          platformTag: platformTag ?? null,
          notes: notes.trim() || null,
          endAddress: endAddress.trim() || null,
          endLat: endLat.trim() ? parseFloat(endLat) : null,
          endLng: endLng.trim() ? parseFloat(endLng) : null,
          endedAt: endedAt.trim() ? new Date(endedAt).toISOString() : null,
        });
      } else {
        const data: CreateTripData = {
          startLat: parseFloat(startLat),
          startLng: parseFloat(startLng),
          startedAt: new Date(startedAt).toISOString(),
          classification,
          ...(endLat.trim() && endLng.trim() && {
            endLat: parseFloat(endLat),
            endLng: parseFloat(endLng),
          }),
          ...(distanceMiles.trim() && { distanceMiles: parseFloat(distanceMiles) }),
          ...(startAddress.trim() && { startAddress: startAddress.trim() }),
          ...(endAddress.trim() && { endAddress: endAddress.trim() }),
          ...(endedAt.trim() && { endedAt: new Date(endedAt).toISOString() }),
          ...(platformTag && { platformTag }),
          ...(notes.trim() && { notes: notes.trim() }),
          ...(vehicleId && { vehicleId }),
        };

        await syncCreateTrip(data);
      }
      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save trip");
    } finally {
      setSaving(false);
    }
  }, [
    isEditing, id, classification, platformTag, vehicleId,
    startAddress, endAddress, startLat, startLng, endLat, endLng,
    distanceMiles, startedAt, endedAt, notes, router,
  ]);

  const handleDelete = useCallback(() => {
    Alert.alert("Delete trip", "Remove this trip? This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await syncDeleteTrip(id!);
            router.back();
          } catch (err: unknown) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete");
            setDeleting(false);
          }
        },
      },
    ]);
  }, [id, router]);

  const handleSelectVehicle = useCallback(() => {
    const options = vehicles.map((v) => ({
      text: `${v.make} ${v.model}${v.isPrimary ? " (Primary)" : ""}`,
      onPress: () => setVehicleId(v.id),
    }));
    options.push({ text: "None", onPress: () => setVehicleId(undefined) });

    Alert.alert("Select Vehicle", "Choose a vehicle for this trip", [
      ...options,
      { text: "Cancel", onPress: () => {} },
    ]);
  }, [vehicles]);

  if (loadingExisting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{ title: isEditing ? "Edit Trip" : "Add Trip" }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Classification */}
        <Text style={styles.label}>Classification</Text>
        <View style={styles.segmentRow}>
          {CLASSIFICATIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.segment,
                classification === opt.value && styles.segmentActive,
              ]}
              onPress={() => setClassification(opt.value)}
            >
              <Text
                style={[
                  styles.segmentText,
                  classification === opt.value && styles.segmentTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Platform */}
        <Text style={styles.label}>Platform</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.platformRow}
        >
          <TouchableOpacity
            style={[styles.platformChip, !platformTag && styles.platformChipActive]}
            onPress={() => setPlatformTag(undefined)}
          >
            <Text style={[styles.platformChipText, !platformTag && styles.platformChipTextActive]}>
              None
            </Text>
          </TouchableOpacity>
          {GIG_PLATFORMS.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[
                styles.platformChip,
                platformTag === p.value && styles.platformChipActive,
              ]}
              onPress={() => setPlatformTag(p.value as PlatformTag)}
            >
              <Text
                style={[
                  styles.platformChipText,
                  platformTag === p.value && styles.platformChipTextActive,
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Vehicle */}
        <Text style={styles.label}>Vehicle</Text>
        <TouchableOpacity
          style={styles.vehiclePicker}
          onPress={handleSelectVehicle}
          activeOpacity={0.7}
        >
          <Text style={styles.vehiclePickerText}>
            {selectedVehicle
              ? `${selectedVehicle.make} ${selectedVehicle.model}`
              : "None selected"}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        {/* Start Address */}
        <Text style={styles.label}>Start Address</Text>
        <TextInput
          style={styles.input}
          value={startAddress}
          onChangeText={setStartAddress}
          placeholder="e.g. 10 Downing Street"
          placeholderTextColor="#6b7280"
        />

        {/* End Address */}
        <Text style={styles.label}>End Address</Text>
        <TextInput
          style={styles.input}
          value={endAddress}
          onChangeText={setEndAddress}
          placeholder="e.g. Buckingham Palace"
          placeholderTextColor="#6b7280"
        />

        {/* Coordinates */}
        <View style={styles.coordRow}>
          <View style={styles.coordField}>
            <Text style={styles.label}>Start Lat *</Text>
            <TextInput
              style={styles.input}
              value={startLat}
              onChangeText={setStartLat}
              placeholder="51.5074"
              placeholderTextColor="#6b7280"
              keyboardType="decimal-pad"
              editable={!isEditing}
            />
          </View>
          <View style={styles.coordField}>
            <Text style={styles.label}>Start Lng *</Text>
            <TextInput
              style={styles.input}
              value={startLng}
              onChangeText={setStartLng}
              placeholder="-0.1278"
              placeholderTextColor="#6b7280"
              keyboardType="decimal-pad"
              editable={!isEditing}
            />
          </View>
        </View>

        <View style={styles.coordRow}>
          <View style={styles.coordField}>
            <Text style={styles.label}>End Lat</Text>
            <TextInput
              style={styles.input}
              value={endLat}
              onChangeText={setEndLat}
              placeholder="51.5014"
              placeholderTextColor="#6b7280"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.coordField}>
            <Text style={styles.label}>End Lng</Text>
            <TextInput
              style={styles.input}
              value={endLng}
              onChangeText={setEndLng}
              placeholder="-0.1419"
              placeholderTextColor="#6b7280"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Distance */}
        {!isEditing && (
          <>
            <Text style={styles.label}>Distance (miles)</Text>
            <TextInput
              style={styles.input}
              value={distanceMiles}
              onChangeText={setDistanceMiles}
              placeholder="Auto-calculated from coords if empty"
              placeholderTextColor="#6b7280"
              keyboardType="decimal-pad"
            />
          </>
        )}

        {/* Date/time */}
        <Text style={styles.label}>Start Date/Time *</Text>
        <TextInput
          style={[styles.input, isEditing && styles.inputDisabled]}
          value={startedAt}
          onChangeText={setStartedAt}
          placeholder="2025-01-15T09:00"
          placeholderTextColor="#6b7280"
          editable={!isEditing}
        />

        <Text style={styles.label}>End Date/Time</Text>
        <TextInput
          style={styles.input}
          value={endedAt}
          onChangeText={setEndedAt}
          placeholder="2025-01-15T09:30"
          placeholderTextColor="#6b7280"
        />

        {/* Notes */}
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional notes about this trip"
          placeholderTextColor="#6b7280"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
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
              {isEditing ? "Save Changes" : "Add Trip"}
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
              <Text style={styles.deleteText}>Delete Trip</Text>
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
  inputDisabled: {
    opacity: 0.5,
  },
  notesInput: {
    minHeight: 80,
  },
  // Segment control
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  segmentTextActive: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
  },
  // Platform chips
  platformRow: {
    gap: 8,
    paddingVertical: 2,
  },
  platformChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  platformChipActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  platformChipText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  platformChipTextActive: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
  },
  // Vehicle picker
  vehiclePicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  vehiclePickerText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
  },
  chevron: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  // Coordinate rows
  coordRow: {
    flexDirection: "row",
    gap: 12,
  },
  coordField: {
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
