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
  Platform,
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
import {
  requestLocationPermissions,
  startShiftTracking,
  stopShiftTracking,
  processShiftTrips,
  isTrackingActive,
} from "../../lib/tracking/index";
import type {
  Vehicle,
  GamificationStats,
  AchievementWithMeta,
  ShiftScorecard,
  PeriodRecap,
} from "@mileclear/shared";
import { formatPence, formatMiles } from "@mileclear/shared";
import { useMode } from "../../lib/mode/context";
import { ModeToggle } from "../../components/ModeToggle";
import { PersonalDashboard } from "../../components/personal/PersonalDashboard";
import { Ionicons } from "@expo/vector-icons";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatMilesShort(miles: number): string {
  return miles < 1000
    ? `${miles.toFixed(1)}`
    : `${(miles / 1000).toFixed(1)}k`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { isPersonal, isWork } = useMode();
  const [activeShift, setActiveShift] = useState<ShiftWithVehicle | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

      if (active) {
        // Resume GPS tracking if app was killed/backgrounded during a shift
        const tracking = await isTrackingActive();
        if (!tracking) {
          const hasPermission = await requestLocationPermissions();
          if (hasPermission) {
            await startShiftTracking(active.id);
          }
        }
      } else {
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

      // Start GPS tracking
      const hasPermission = await requestLocationPermissions();
      if (hasPermission) {
        await startShiftTracking(res.data.id);
      } else {
        Alert.alert(
          "Location Access",
          "GPS tracking is disabled. Trips won't be recorded automatically, but you can still add them manually.",
          [{ text: "OK" }]
        );
      }
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
            // 1. Stop GPS tracking
            await stopShiftTracking();

            // 2. Process GPS coordinates into trips (before ending shift so scorecard counts them)
            await processShiftTrips(
              activeShift.id,
              activeShift.vehicleId ?? undefined
            );

            // 3. End shift on API (scorecard includes GPS-tracked trips)
            const res = await endShift(activeShift.id);
            setActiveShift(null);
            const resAny = res as any;
            if (resAny.scorecard) {
              setScorecard(resAny.scorecard);
              setShowScorecard(true);
            }
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

  const handleRecap = useCallback(async (period: "weekly" | "monthly") => {
    try {
      const res = await fetchRecap(period);
      setRecapData(res.data);
      setShowRecap(true);
    } catch {
      Alert.alert("Error", "Failed to load recap");
    }
  }, []);

  const handleShareRecap = useCallback(async () => {
    if (!recapData) return;
    try {
      await Share.share({ message: recapData.shareText });
    } catch {}
  }, [recapData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color="#f5a623" />
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
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Shift Complete</Text>

          {scorecard && (
            <>
              <View style={s.scorecardGrid}>
                <View style={s.scorecardCell}>
                  <Text style={s.scorecardNum}>
                    {scorecard.tripsCompleted}
                  </Text>
                  <Text style={s.scorecardUnit}>trips</Text>
                </View>
                <View style={[s.scorecardCell, s.scorecardCellCenter]}>
                  <Text style={s.scorecardNumLarge}>
                    {scorecard.totalMiles.toFixed(1)}
                  </Text>
                  <Text style={s.scorecardUnit}>miles</Text>
                </View>
                <View style={s.scorecardCell}>
                  <Text style={s.scorecardNum}>
                    {formatPence(scorecard.deductionPence)}
                  </Text>
                  <Text style={s.scorecardUnit}>deduction</Text>
                </View>
              </View>

              <Text style={s.scorecardDuration}>
                {formatElapsed(scorecard.durationSeconds)}
              </Text>

              {(scorecard.isPersonalBestMiles || scorecard.isPersonalBestTrips) && (
                <View style={s.pbBadge}>
                  <Text style={s.pbText}>
                    {scorecard.isPersonalBestMiles && scorecard.isPersonalBestTrips
                      ? "New record \u2014 Miles & Trips"
                      : scorecard.isPersonalBestMiles
                        ? "New record \u2014 Most Miles"
                        : "New record \u2014 Most Trips"}
                  </Text>
                </View>
              )}

              {scorecard.newAchievements.length > 0 && (
                <View style={s.unlockSection}>
                  <Text style={s.unlockTitle}>Unlocked</Text>
                  {scorecard.newAchievements.map((a) => (
                    <View key={a.id} style={s.unlockRow}>
                      <Text style={s.unlockEmoji}>{a.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.unlockLabel}>{a.label}</Text>
                        <Text style={s.unlockDesc}>{a.description}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          <TouchableOpacity
            style={s.modalPrimaryBtn}
            onPress={() => setShowScorecard(false)}
          >
            <Text style={s.modalPrimaryBtnText}>Done</Text>
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
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>
            {recapData?.period === "weekly" ? "Weekly" : "Monthly"} Recap
          </Text>
          {recapData && (
            <>
              <Text style={s.recapSubtitle}>{recapData.label}</Text>

              <View style={s.scorecardGrid}>
                <View style={s.scorecardCell}>
                  <Text style={s.scorecardNum}>
                    {recapData.totalMiles.toFixed(1)}
                  </Text>
                  <Text style={s.scorecardUnit}>miles</Text>
                </View>
                <View style={s.scorecardCell}>
                  <Text style={s.scorecardNum}>{recapData.totalTrips}</Text>
                  <Text style={s.scorecardUnit}>trips</Text>
                </View>
                <View style={s.scorecardCell}>
                  <Text style={s.scorecardNum}>
                    {formatPence(recapData.deductionPence)}
                  </Text>
                  <Text style={s.scorecardUnit}>deduction</Text>
                </View>
              </View>

              {recapData.busiestDayLabel && (
                <Text style={s.recapDetail}>
                  Busiest day: {recapData.busiestDayLabel} ({recapData.busiestDayMiles.toFixed(1)} mi)
                </Text>
              )}

              <View style={s.recapBtnRow}>
                <TouchableOpacity style={s.shareBtn} onPress={handleShareRecap}>
                  <Text style={s.shareBtnText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.modalPrimaryBtn}
                  onPress={() => setShowRecap(false)}
                >
                  <Text style={s.modalPrimaryBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  // ── Active Shift ──────────────────────────────────────────────
  if (activeShift) {
    return (
      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, { paddingTop: 16 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f5a623" />
        }
      >
        {scorecardModal}
        <Text style={s.greeting}>Shift Active</Text>

        <View style={s.timerWrap}>
          <View style={s.liveIndicator}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>TRACKING</Text>
          </View>
          <Text style={s.timer}>{formatElapsed(elapsed)}</Text>
          {activeShift.vehicle && (
            <Text style={s.timerSub}>
              {activeShift.vehicle.make} {activeShift.vehicle.model}
            </Text>
          )}
        </View>

        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>
              {stats ? formatMilesShort(stats.todayMiles) : "0"}
            </Text>
            <Text style={s.statUnit}>mi today</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>
              {stats ? formatMilesShort(stats.weekMiles) : "0"}
            </Text>
            <Text style={s.statUnit}>mi this week</Text>
          </View>
        </View>

        <TouchableOpacity
          style={s.endBtn}
          onPress={handleEndShift}
          activeOpacity={0.8}
          disabled={ending}
        >
          {ending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.endBtnText}>End Shift</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Idle Dashboard ────────────────────────────────────────────
  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={[s.content, { paddingTop: 16 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f5a623" />
      }
    >
      {scorecardModal}
      {recapModal}

      {/* Mode Toggle */}
      <ModeToggle />

      {/* Streak indicator */}
      {stats && stats.currentStreakDays > 0 && (
        <View style={s.streakRow}>
          <View style={s.streakBadge}>
            <Text style={s.streakNum}>{stats.currentStreakDays}</Text>
          </View>
          <Text style={s.greeting}>{stats.currentStreakDays}-day streak</Text>
        </View>
      )}

      {/* Tax Savings — hero card (work mode only) */}
      {isWork && stats && (
        <View style={s.heroCard}>
          <Text style={s.heroLabel}>Tax Deduction {"\u00B7"} {stats.taxYear}</Text>
          <Text style={s.heroValue}>
            {formatPence(stats.deductionPence)}
          </Text>
          <View style={s.heroMeta}>
            <Text style={s.heroMetaText}>
              {formatMiles(stats.businessMiles)} business
            </Text>
            <View style={s.heroDivider} />
            <Text style={s.heroMetaText}>
              {formatMiles(stats.totalMiles)} total
            </Text>
          </View>
        </View>
      )}

      {/* Quick Actions */}
      <View style={s.quickActions}>
        <TouchableOpacity
          style={s.quickAction}
          onPress={() => router.push("/quick-trip")}
          activeOpacity={0.7}
        >
          <Ionicons name="navigate-outline" size={22} color="#f5a623" style={{ marginBottom: 4 }} />
          <Text style={s.quickActionLabel}>Quick Trip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.quickAction}
          onPress={() => router.push("/(tabs)/trips" as any)}
          activeOpacity={0.7}
        >
          <Ionicons name="list-outline" size={22} color="#f5a623" style={{ marginBottom: 4 }} />
          <Text style={s.quickActionLabel}>All Trips</Text>
        </TouchableOpacity>
        {isWork ? (
          <TouchableOpacity
            style={s.quickAction}
            onPress={() => router.push("/exports")}
            activeOpacity={0.7}
          >
            <Ionicons name="download-outline" size={22} color="#f5a623" style={{ marginBottom: 4 }} />
            <Text style={s.quickActionLabel}>Exports</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.quickAction}
            onPress={() => router.push("/(tabs)/fuel" as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="water-outline" size={22} color="#f5a623" style={{ marginBottom: 4 }} />
            <Text style={s.quickActionLabel}>Fuel</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={s.quickAction}
          onPress={() => router.push("/achievements")}
          activeOpacity={0.7}
        >
          <Ionicons name="trophy-outline" size={22} color="#f5a623" style={{ marginBottom: 4 }} />
          <Text style={s.quickActionLabel}>Badges</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Stats */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statNum}>
            {stats ? formatMilesShort(stats.todayMiles) : "0"}
          </Text>
          <Text style={s.statUnit}>mi today</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNum}>
            {stats ? formatMilesShort(stats.weekMiles) : "0"}
          </Text>
          <Text style={s.statUnit}>mi this week</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNum}>{stats?.totalTrips ?? 0}</Text>
          <Text style={s.statUnit}>trips</Text>
        </View>
      </View>

      {/* Personal Dashboard (personal mode only) */}
      {isPersonal && <PersonalDashboard />}

      {/* Achievements */}
      {achievements.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Achievements</Text>
            <TouchableOpacity onPress={() => router.push("/achievements")}>
              <Text style={s.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.badgeScroll}
          >
            {achievements.slice(0, 8).map((a) => (
              <View key={a.id} style={s.badge}>
                <Text style={s.badgeEmoji}>{a.emoji}</Text>
                <Text style={s.badgeLabel} numberOfLines={1}>{a.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Recaps */}
      <View style={s.recapRow}>
        <TouchableOpacity
          style={s.recapBtn}
          onPress={() => handleRecap("weekly")}
          activeOpacity={0.7}
        >
          <Text style={s.recapBtnLabel}>This Week</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.recapBtn}
          onPress={() => handleRecap("monthly")}
          activeOpacity={0.7}
        >
          <Text style={s.recapBtnLabel}>This Month</Text>
        </TouchableOpacity>
      </View>

      {/* Personal Records */}
      {stats && stats.personalRecords.mostMilesInDay > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Personal Records</Text>
          <View style={s.recordGrid}>
            {[
              { v: `${stats.personalRecords.mostMilesInDay.toFixed(1)} mi`, l: "Best day" },
              { v: `${stats.personalRecords.mostTripsInShift}`, l: "Trips / shift" },
              { v: `${stats.personalRecords.longestSingleTrip.toFixed(1)} mi`, l: "Longest trip" },
              { v: `${stats.personalRecords.longestStreakDays}d`, l: "Best streak" },
            ].map((r) => (
              <View key={r.l} style={s.recordCell}>
                <Text style={s.recordValue}>{r.v}</Text>
                <Text style={s.recordLabel}>{r.l}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Vehicle Picker (work mode only) */}
      {isWork && (
        <TouchableOpacity
          style={s.vehiclePicker}
          onPress={handleSelectVehicle}
          activeOpacity={0.7}
        >
          <View>
            <Text style={s.vehiclePickerLabel}>Vehicle</Text>
            <Text style={s.vehiclePickerVal}>
              {selectedVehicle
                ? `${selectedVehicle.make} ${selectedVehicle.model}`
                : "None selected"}
            </Text>
          </View>
          <Text style={s.chevron}>{"\u203A"}</Text>
        </TouchableOpacity>
      )}

      {/* Start Shift (work mode only) */}
      {isWork && (
        <TouchableOpacity
          style={s.startBtn}
          onPress={handleStartShift}
          activeOpacity={0.8}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color="#030712" />
          ) : (
            <Text style={s.startBtnText}>Start Shift</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  centered: { justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, paddingBottom: 20 },

  // Streak
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  greeting: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  streakBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(245, 166, 35, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  streakNum: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: AMBER,
  },

  // Hero card
  heroCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.12)",
    ...Platform.select({
      ios: {
        shadowColor: AMBER,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
    }),
  },
  heroLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 38,
    fontFamily: "PlusJakartaSans_300Light",
    color: AMBER,
    letterSpacing: -1,
    marginBottom: 10,
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroMetaText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  heroDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TEXT_3,
    marginHorizontal: 10,
  },

  // Quick actions
  quickActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  quickAction: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  quickActionLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    letterSpacing: 0.2,
  },

  // Stats row
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  statNum: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    letterSpacing: -0.5,
  },
  statUnit: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
    letterSpacing: 0.2,
  },

  // Sections
  section: { marginBottom: 20 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    letterSpacing: -0.2,
  },
  seeAll: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: AMBER,
  },

  // Badges
  badgeScroll: { gap: 8 },
  badge: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    width: 74,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  badgeEmoji: { fontSize: 26, marginBottom: 4 },
  badgeLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    textAlign: "center",
  },

  // Recap buttons
  recapRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  recapBtn: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  recapBtnLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
    letterSpacing: -0.2,
  },

  // Records
  recordGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  recordCell: {
    width: "47%" as any,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  recordValue: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 2,
  },
  recordLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    letterSpacing: 0.2,
  },

  // Vehicle picker
  vehiclePicker: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  vehiclePickerLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  vehiclePickerVal: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
  },
  chevron: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_3,
  },

  // Start button
  startBtn: {
    backgroundColor: AMBER,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: AMBER,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  startBtnText: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
    letterSpacing: 0.3,
  },

  // Active shift
  timerWrap: {
    alignItems: "center",
    marginBottom: 28,
    paddingVertical: 24,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#34c759",
  },
  liveText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#34c759",
    letterSpacing: 1.5,
  },
  timer: {
    fontSize: 60,
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_1,
    fontVariant: ["tabular-nums"],
    letterSpacing: 4,
  },
  timerSub: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 8,
  },
  endBtn: {
    backgroundColor: "#dc2626",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  endBtnText: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    letterSpacing: 0.3,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#0c1425",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderBottomWidth: 0,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  modalPrimaryBtn: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  modalPrimaryBtnText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },

  // Scorecard
  scorecardGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  scorecardCell: { alignItems: "center" },
  scorecardCellCenter: {},
  scorecardNum: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  scorecardNumLarge: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_300Light",
    color: AMBER,
  },
  scorecardUnit: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  scorecardDuration: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    textAlign: "center",
    marginBottom: 14,
  },
  pbBadge: {
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
  },
  pbText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: AMBER },
  unlockSection: { marginTop: 8, marginBottom: 16 },
  unlockTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  unlockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  unlockEmoji: { fontSize: 24 },
  unlockLabel: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: TEXT_1 },
  unlockDesc: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", color: TEXT_2 },

  // Recap modal
  recapSubtitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    textAlign: "center",
    marginBottom: 20,
  },
  recapDetail: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    textAlign: "center",
    marginBottom: 6,
  },
  recapBtnRow: { gap: 10, marginTop: 8 },
  shareBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  shareBtnText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
});
