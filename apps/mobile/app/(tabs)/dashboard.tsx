import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { fetchVehicles } from "../../lib/api/vehicles";
import {
  fetchActiveShift,
  startShift,
  endShift,
  ShiftWithVehicle,
} from "../../lib/api/shifts";
import type { Vehicle } from "@mileclear/shared";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export default function DashboardScreen() {
  const [activeShift, setActiveShift] = useState<ShiftWithVehicle | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [shiftRes, vehicleRes] = await Promise.all([
        fetchActiveShift(),
        fetchVehicles(),
      ]);

      const active = shiftRes.data.length > 0 ? shiftRes.data[0] : null;
      setActiveShift(active);
      setVehicles(vehicleRes.data);

      // Default to primary vehicle if no selection
      if (!active) {
        const primary = vehicleRes.data.find((v) => v.isPrimary);
        setSelectedVehicleId(primary?.id);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Timer for active shift
  useEffect(() => {
    if (activeShift) {
      const updateElapsed = () => {
        const start = new Date(activeShift.startedAt).getTime();
        setElapsed(Math.floor((Date.now() - start) / 1000));
      };
      updateElapsed();
      timerRef.current = setInterval(updateElapsed, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [activeShift]);

  const handleStartShift = useCallback(async () => {
    setStarting(true);
    try {
      const res = await startShift(
        selectedVehicleId ? { vehicleId: selectedVehicleId } : undefined
      );
      setActiveShift(res.data);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to start shift");
    } finally {
      setStarting(false);
    }
  }, [selectedVehicleId]);

  const handleEndShift = useCallback(() => {
    if (!activeShift) return;
    Alert.alert("End Shift", "Are you sure you want to end this shift?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Shift",
        style: "destructive",
        onPress: async () => {
          setEnding(true);
          try {
            await endShift(activeShift.id);
            setActiveShift(null);
          } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to end shift");
          } finally {
            setEnding(false);
          }
        },
      },
    ]);
  }, [activeShift]);

  const handleSelectVehicle = useCallback(() => {
    if (vehicles.length === 0) {
      Alert.alert("No Vehicles", "Add a vehicle in your profile first.");
      return;
    }

    const options = vehicles.map((v) => ({
      text: `${v.make} ${v.model}${v.isPrimary ? " (Primary)" : ""}`,
      onPress: () => setSelectedVehicleId(v.id),
    }));
    options.push({ text: "No Vehicle", onPress: () => setSelectedVehicleId(undefined) });

    Alert.alert("Select Vehicle", "Choose a vehicle for this shift", [
      ...options,
      { text: "Cancel", onPress: () => {} },
    ]);
  }, [vehicles]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  // Active shift view
  if (activeShift) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.activeContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />
        }
      >
        <Text style={styles.title}>Dashboard</Text>

        <View style={styles.timerContainer}>
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>SHIFT ACTIVE</Text>
          </View>
          <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
          {activeShift.vehicle && (
            <Text style={styles.vehicleLabel}>
              {activeShift.vehicle.make} {activeShift.vehicle.model}
            </Text>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0.0 mi</Text>
            <Text style={styles.statLabel}>This Shift</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0.0 mi</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.endButton}
          onPress={handleEndShift}
          activeOpacity={0.7}
          disabled={ending}
        >
          {ending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.endButtonText}>End Shift</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Idle view
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.idleContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />
      }
    >
      <Text style={styles.title}>Dashboard</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>0.0 mi</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>0.0 mi</Text>
          <Text style={styles.statLabel}>This Week</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.vehiclePicker}
        onPress={handleSelectVehicle}
        activeOpacity={0.7}
      >
        <Text style={styles.vehiclePickerLabel}>Vehicle</Text>
        <View style={styles.vehiclePickerRow}>
          <Text style={styles.vehiclePickerValue}>
            {selectedVehicle
              ? `${selectedVehicle.make} ${selectedVehicle.model}`
              : "None selected"}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.startButton}
        onPress={handleStartShift}
        activeOpacity={0.7}
        disabled={starting}
      >
        {starting ? (
          <ActivityIndicator color="#030712" />
        ) : (
          <Text style={styles.startButtonText}>Start Shift</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  idleContent: {
    padding: 16,
    paddingTop: 60,
  },
  activeContent: {
    padding: 16,
    paddingTop: 60,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 20,
  },
  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: "#9ca3af",
  },
  // Vehicle picker
  vehiclePicker: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  vehiclePickerLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  vehiclePickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  vehiclePickerValue: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  chevron: {
    fontSize: 22,
    color: "#6b7280",
  },
  // Start button
  startButton: {
    backgroundColor: "#f59e0b",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#030712",
  },
  // Active shift
  timerContainer: {
    alignItems: "center",
    marginBottom: 24,
    paddingVertical: 20,
  },
  activeBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 16,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#f59e0b",
    letterSpacing: 1,
  },
  timer: {
    fontSize: 56,
    fontWeight: "200",
    color: "#fff",
    fontVariant: ["tabular-nums"],
    letterSpacing: 2,
  },
  vehicleLabel: {
    fontSize: 15,
    color: "#9ca3af",
    marginTop: 8,
  },
  // End button
  endButton: {
    backgroundColor: "#ef4444",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  endButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
});
