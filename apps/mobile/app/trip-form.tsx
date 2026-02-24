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
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { fetchTrip, CreateTripData } from "../lib/api/trips";
import { getLocalTrip } from "../lib/db/queries";
import {
  syncCreateTrip,
  syncUpdateTrip,
  syncDeleteTrip,
} from "../lib/sync/actions";
import { fetchVehicles } from "../lib/api/vehicles";
import { GIG_PLATFORMS, haversineDistance } from "@mileclear/shared";
import type { TripClassification, PlatformTag, Vehicle } from "@mileclear/shared";
import { LocationPickerField } from "../components/LocationPickerField";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { Button } from "../components/Button";

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

  // Location state — typed values instead of raw strings
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [startAddress, setStartAddress] = useState<string | null>(null);
  const [endLat, setEndLat] = useState<number | null>(null);
  const [endLng, setEndLng] = useState<number | null>(null);
  const [endAddress, setEndAddress] = useState<string | null>(null);

  // Date/time state — Date objects instead of ISO strings
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [endedAt, setEndedAt] = useState<Date | null>(null);

  // Auto-calculated distance
  const [distanceMiles, setDistanceMiles] = useState<number | null>(null);

  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [showDetails, setShowDetails] = useState(false);

  // Auto-calculate distance when both locations set
  useEffect(() => {
    if (startLat != null && startLng != null && endLat != null && endLng != null) {
      setDistanceMiles(
        Math.round(haversineDistance(startLat, startLng, endLat, endLng) * 100) / 100
      );
    } else {
      setDistanceMiles(null);
    }
  }, [startLat, startLng, endLat, endLng]);

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
    if (!id) return;

    const populateTrip = (t: {
      classification: string; platformTag?: string | null; vehicleId?: string | null;
      startAddress?: string | null; endAddress?: string | null;
      startLat: number; startLng: number; endLat?: number | null; endLng?: number | null;
      distanceMiles: number; startedAt: string; endedAt?: string | null; notes?: string | null;
    }) => {
      setClassification(t.classification as TripClassification);
      setPlatformTag((t.platformTag ?? undefined) as PlatformTag | undefined);
      setVehicleId(t.vehicleId ?? undefined);
      setStartAddress(t.startAddress ?? null);
      setEndAddress(t.endAddress ?? null);
      setStartLat(t.startLat);
      setStartLng(t.startLng);
      setEndLat(t.endLat ?? null);
      setEndLng(t.endLng ?? null);
      setDistanceMiles(t.distanceMiles);
      setStartedAt(new Date(t.startedAt));
      setEndedAt(t.endedAt ? new Date(t.endedAt) : null);
      setNotes(t.notes ?? "");
    };

    fetchTrip(id)
      .then((res) => populateTrip(res.data))
      .catch(async () => {
        const local = await getLocalTrip(id);
        if (local) populateTrip(local);
      })
      .finally(() => setLoadingExisting(false));
  }, [id]);

  const handleSave = useCallback(async () => {
    if (startLat == null || startLng == null) {
      Alert.alert("Missing location", "Set a start location using GPS, map, or address search.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await syncUpdateTrip(id, {
          classification,
          platformTag: platformTag ?? null,
          notes: notes.trim() || null,
          endAddress: endAddress ?? null,
          endLat: endLat ?? null,
          endLng: endLng ?? null,
          endedAt: endedAt ? endedAt.toISOString() : null,
        });
      } else {
        const data: CreateTripData = {
          startLat,
          startLng,
          startedAt: startedAt.toISOString(),
          classification,
          ...(endLat != null && endLng != null && {
            endLat,
            endLng,
          }),
          ...(distanceMiles != null && { distanceMiles }),
          ...(startAddress && { startAddress }),
          ...(endAddress && { endAddress }),
          ...(endedAt && { endedAt: endedAt.toISOString() }),
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
        <ActivityIndicator size="large" color="#f5a623" />
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
        {/* Start Location */}
        <LocationPickerField
          label="Start Location"
          lat={startLat}
          lng={startLng}
          address={startAddress}
          onLocationChange={(lat, lng, addr) => {
            setStartLat(lat);
            setStartLng(lng);
            setStartAddress(addr);
          }}
          onClear={() => {
            setStartLat(null);
            setStartLng(null);
            setStartAddress(null);
          }}
          disabled={isEditing}
        />

        {/* Distance card */}
        <View style={styles.distanceCard}>
          <Text style={styles.distanceLabel}>Distance</Text>
          <Text style={styles.distanceValue}>
            {distanceMiles != null ? `${distanceMiles} mi` : "--"}
          </Text>
          {distanceMiles == null && (
            <Text style={styles.distanceHint}>
              Set both locations to auto-calculate
            </Text>
          )}
        </View>

        {/* End Location */}
        <LocationPickerField
          label="End Location"
          lat={endLat}
          lng={endLng}
          address={endAddress}
          onLocationChange={(lat, lng, addr) => {
            setEndLat(lat);
            setEndLng(lng);
            setEndAddress(addr);
          }}
          onClear={() => {
            setEndLat(null);
            setEndLng(null);
            setEndAddress(null);
          }}
        />

        {/* Start Time */}
        <DateTimePickerField
          label="Start Time"
          value={startedAt}
          onChange={setStartedAt}
          disabled={isEditing}
          maximumDate={new Date()}
        />

        {/* End Time */}
        <DateTimePickerField
          label="End Time"
          value={endedAt}
          onChange={setEndedAt}
          onClear={() => setEndedAt(null)}
          maximumDate={new Date()}
        />

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

        {/* Collapsible Details */}
        <TouchableOpacity
          style={styles.detailsToggle}
          onPress={() => setShowDetails(!showDetails)}
          activeOpacity={0.7}
        >
          <Text style={styles.detailsToggleText}>Details</Text>
          <Text style={styles.detailsChevron}>
            {showDetails ? "\u2303" : "\u2304"}
          </Text>
        </TouchableOpacity>

        {showDetails && (
          <View>
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
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>

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
          </View>
        )}

        {/* Save */}
        <Button
          title={isEditing ? "Save Changes" : "Add Trip"}
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
            title="Delete Trip"
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
  notesInput: {
    minHeight: 80,
  },
  // Distance card
  distanceCard: {
    backgroundColor: "#0a1120",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  distanceLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  distanceValue: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_300Light",
    color: "#f5a623",
    letterSpacing: -0.5,
  },
  distanceHint: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#4a5568",
    marginTop: 4,
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
  // Details toggle
  detailsToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  detailsToggleText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  detailsChevron: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
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
    backgroundColor: "#f5a623",
    borderColor: "#f5a623",
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
});
