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
  Modal,
  Share,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { fetchVehicles } from "../../lib/api/vehicles";
import {
  fetchActiveShift,
  startShift,
  endShift,
  ShiftWithVehicle,
} from "../../lib/api/shifts";
import {
  fetchGamificationStats,
  fetchAchievements,
  fetchRecap,
} from "../../lib/api/gamification";
import type {
  Vehicle,
  GamificationStats,
  AchievementWithMeta,
  ShiftScorecard,
  PeriodRecap,
} from "@mileclear/shared";
import { formatPence, formatMiles } from "@mileclear/shared";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export default function DashboardScreen() {
  const router = useRouter();
  const [activeShift, setActiveShift] = useState<ShiftWithVehicle | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Gamification state
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [achievements, setAchievements] = useState<AchievementWithMeta[]>([]);
  const [scorecard, setScorecard] = useState<ShiftScorecard | null>(null);
  const [showScorecard, setShowScorecard] = useState(false);
  const [recapData, setRecapData] = useState<PeriodRecap | null>(null);
  const [showRecap, setShowRecap] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [shiftRes, vehicleRes, statsRes, achievementsRes] = await Promise.all([
        fetchActiveShift(),
        fetchVehicles(),
        fetchGamificationStats().catch(() => null),
        fetchAchievements().catch(() => null),
      ]);

      const active = shiftRes.data.length > 0 ? shiftRes.data[0] : null;
      setActiveShift(active);
      setVehicles(vehicleRes.data);
      if (statsRes) setStats(statsRes.data);
      if (achievementsRes) setAchievements(achievementsRes.data);

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
            const res = await endShift(activeShift.id);
            setActiveShift(null);

            // Check for embedded scorecard in response
            const resAny = res as any;
            if (resAny.scorecard) {
              setScorecard(resAny.scorecard);
              setShowScorecard(true);
            }

            // Refresh stats
            loadData();
          } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to end shift");
          } finally {
            setEnding(false);
          }
        },
      },
    ]);
  }, [activeShift, loadData]);

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

  const handleRecap = useCallback(
    async (period: "weekly" | "monthly") => {
      try {
        const res = await fetchRecap(period);
        setRecapData(res.data);
        setShowRecap(true);
      } catch {
        Alert.alert("Error", "Failed to load recap");
      }
    },
    []
  );

  const handleShareRecap = useCallback(async () => {
    if (!recapData) return;
    try {
      await Share.share({ message: recapData.shareText });
    } catch {
      // User cancelled
    }
  }, [recapData]);

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

  // ── Scorecard Modal ───────────────────────────────────────────
  const scorecardModal = (
    <Modal
      visible={showScorecard}
      animationType="slide"
      transparent
      onRequestClose={() => setShowScorecard(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Shift Complete!</Text>

          {scorecard && (
            <>
              <View style={styles.scorecardRow}>
                <View style={styles.scorecardStat}>
                  <Text style={styles.scorecardValue}>
                    {scorecard.tripsCompleted}
                  </Text>
                  <Text style={styles.scorecardLabel}>Trips</Text>
                </View>
                <View style={styles.scorecardStat}>
                  <Text style={styles.scorecardValue}>
                    {scorecard.totalMiles.toFixed(1)} mi
                  </Text>
                  <Text style={styles.scorecardLabel}>Total</Text>
                </View>
                <View style={styles.scorecardStat}>
                  <Text style={styles.scorecardValue}>
                    {formatPence(scorecard.deductionPence)}
                  </Text>
                  <Text style={styles.scorecardLabel}>Deduction</Text>
                </View>
              </View>

              <Text style={styles.scorecardDuration}>
                {formatElapsed(scorecard.durationSeconds)}
              </Text>

              {(scorecard.isPersonalBestMiles ||
                scorecard.isPersonalBestTrips) && (
                <View style={styles.personalBestBadge}>
                  <Text style={styles.personalBestText}>
                    {scorecard.isPersonalBestMiles && scorecard.isPersonalBestTrips
                      ? "New PB: Miles & Trips!"
                      : scorecard.isPersonalBestMiles
                        ? "New PB: Most Miles!"
                        : "New PB: Most Trips!"}
                  </Text>
                </View>
              )}

              {scorecard.newAchievements.length > 0 && (
                <View style={styles.newAchievements}>
                  <Text style={styles.newAchievementsTitle}>
                    Achievements Unlocked
                  </Text>
                  {scorecard.newAchievements.map((a) => (
                    <View key={a.id} style={styles.achievementUnlock}>
                      <Text style={styles.achievementEmoji}>{a.emoji}</Text>
                      <View>
                        <Text style={styles.achievementLabel}>{a.label}</Text>
                        <Text style={styles.achievementDesc}>
                          {a.description}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          <TouchableOpacity
            style={styles.modalButton}
            onPress={() => setShowScorecard(false)}
          >
            <Text style={styles.modalButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ── Recap Modal ───────────────────────────────────────────────
  const recapModal = (
    <Modal
      visible={showRecap}
      animationType="slide"
      transparent
      onRequestClose={() => setShowRecap(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {recapData?.period === "weekly" ? "Weekly" : "Monthly"} Recap
          </Text>
          {recapData && (
            <>
              <Text style={styles.recapLabel}>{recapData.label}</Text>

              <View style={styles.scorecardRow}>
                <View style={styles.scorecardStat}>
                  <Text style={styles.scorecardValue}>
                    {recapData.totalMiles.toFixed(1)} mi
                  </Text>
                  <Text style={styles.scorecardLabel}>Total</Text>
                </View>
                <View style={styles.scorecardStat}>
                  <Text style={styles.scorecardValue}>
                    {recapData.totalTrips}
                  </Text>
                  <Text style={styles.scorecardLabel}>Trips</Text>
                </View>
                <View style={styles.scorecardStat}>
                  <Text style={styles.scorecardValue}>
                    {formatPence(recapData.deductionPence)}
                  </Text>
                  <Text style={styles.scorecardLabel}>Deduction</Text>
                </View>
              </View>

              {recapData.busiestDayLabel && (
                <Text style={styles.recapDetail}>
                  Busiest: {recapData.busiestDayLabel} ({recapData.busiestDayMiles.toFixed(1)} mi)
                </Text>
              )}
              {recapData.longestTripMiles > 0 && (
                <Text style={styles.recapDetail}>
                  Longest trip: {recapData.longestTripMiles.toFixed(1)} mi
                </Text>
              )}

              <View style={styles.recapButtons}>
                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={handleShareRecap}
                >
                  <Text style={styles.shareButtonText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => setShowRecap(false)}
                >
                  <Text style={styles.modalButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  // ── Active shift view ─────────────────────────────────────────
  if (activeShift) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.activeContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />
        }
      >
        {scorecardModal}
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
            <Text style={styles.statValue}>
              {stats ? `${stats.todayMiles.toFixed(1)} mi` : "0.0 mi"}
            </Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats ? `${stats.weekMiles.toFixed(1)} mi` : "0.0 mi"}
            </Text>
            <Text style={styles.statLabel}>This Week</Text>
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

  // ── Idle view ─────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.idleContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />
      }
    >
      {scorecardModal}
      {recapModal}
      <Text style={styles.title}>Dashboard</Text>

      {/* Tax Savings Card */}
      {stats && stats.deductionPence > 0 && (
        <View style={styles.taxSavingsCard}>
          <Text style={styles.taxSavingsLabel}>
            Tax Deduction ({stats.taxYear})
          </Text>
          <Text style={styles.taxSavingsValue}>
            {formatPence(stats.deductionPence)}
          </Text>
          <Text style={styles.taxSavingsDetail}>
            {formatMiles(stats.businessMiles)} business miles
          </Text>
        </View>
      )}

      {/* Streak Chip */}
      {stats && stats.currentStreakDays > 0 && (
        <View style={styles.streakChip}>
          <Text style={styles.streakText}>
            {stats.currentStreakDays} day streak
          </Text>
        </View>
      )}

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {stats ? `${stats.todayMiles.toFixed(1)} mi` : "0.0 mi"}
          </Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {stats ? `${stats.weekMiles.toFixed(1)} mi` : "0.0 mi"}
          </Text>
          <Text style={styles.statLabel}>This Week</Text>
        </View>
      </View>

      {/* Achievements Row */}
      {achievements.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Achievements</Text>
            <TouchableOpacity onPress={() => router.push("/achievements")}>
              <Text style={styles.seeAllLink}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.achievementsScroll}
          >
            {achievements.slice(0, 8).map((a) => (
              <View key={a.id} style={styles.badgeCard}>
                <Text style={styles.badgeEmoji}>{a.emoji}</Text>
                <Text style={styles.badgeLabel} numberOfLines={1}>
                  {a.label}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Recap Buttons */}
      <View style={styles.recapRow}>
        <TouchableOpacity
          style={styles.recapButton}
          onPress={() => handleRecap("weekly")}
        >
          <Text style={styles.recapButtonText}>This Week</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.recapButton}
          onPress={() => handleRecap("monthly")}
        >
          <Text style={styles.recapButtonText}>This Month</Text>
        </TouchableOpacity>
      </View>

      {/* Personal Records */}
      {stats && stats.personalRecords.mostMilesInDay > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Records</Text>
          <View style={styles.recordsGrid}>
            <View style={styles.recordCard}>
              <Text style={styles.recordValue}>
                {stats.personalRecords.mostMilesInDay.toFixed(1)} mi
              </Text>
              <Text style={styles.recordLabel}>Best Day</Text>
            </View>
            <View style={styles.recordCard}>
              <Text style={styles.recordValue}>
                {stats.personalRecords.mostTripsInShift}
              </Text>
              <Text style={styles.recordLabel}>Most Trips/Shift</Text>
            </View>
            <View style={styles.recordCard}>
              <Text style={styles.recordValue}>
                {stats.personalRecords.longestSingleTrip.toFixed(1)} mi
              </Text>
              <Text style={styles.recordLabel}>Longest Trip</Text>
            </View>
            <View style={styles.recordCard}>
              <Text style={styles.recordValue}>
                {stats.personalRecords.longestStreakDays}d
              </Text>
              <Text style={styles.recordLabel}>Best Streak</Text>
            </View>
          </View>
        </View>
      )}

      {/* Vehicle Picker */}
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

      {/* Start Shift Button */}
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
    paddingBottom: 32,
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
  // Tax savings
  taxSavingsCard: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  taxSavingsLabel: {
    fontSize: 12,
    color: "#f59e0b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  taxSavingsValue: {
    fontSize: 32,
    fontWeight: "700",
    color: "#f59e0b",
    marginBottom: 2,
  },
  taxSavingsDetail: {
    fontSize: 13,
    color: "#9ca3af",
  },
  // Streak
  streakChip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  streakText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ef4444",
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
  // Section
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 10,
  },
  seeAllLink: {
    fontSize: 14,
    color: "#f59e0b",
    marginBottom: 10,
  },
  // Achievements
  achievementsScroll: {
    gap: 10,
  },
  badgeCard: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    width: 80,
  },
  badgeEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  badgeLabel: {
    fontSize: 11,
    color: "#9ca3af",
    textAlign: "center",
  },
  // Recap
  recapRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  recapButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  recapButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#f59e0b",
  },
  // Personal records
  recordsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  recordCard: {
    width: "47%",
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  recordValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  recordLabel: {
    fontSize: 12,
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
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: "#f59e0b",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#030712",
  },
  // Scorecard
  scorecardRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  scorecardStat: {
    alignItems: "center",
  },
  scorecardValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  scorecardLabel: {
    fontSize: 12,
    color: "#9ca3af",
  },
  scorecardDuration: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 12,
  },
  personalBestBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "center",
    marginBottom: 12,
  },
  personalBestText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f59e0b",
  },
  newAchievements: {
    marginTop: 8,
    marginBottom: 4,
  },
  newAchievementsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  achievementUnlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  achievementEmoji: {
    fontSize: 24,
  },
  achievementLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  achievementDesc: {
    fontSize: 12,
    color: "#9ca3af",
  },
  // Recap modal
  recapLabel: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 16,
  },
  recapDetail: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 4,
  },
  recapButtons: {
    gap: 8,
  },
  shareButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
