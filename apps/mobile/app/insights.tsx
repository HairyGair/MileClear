import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
  Modal,
  RefreshControl,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { formatPence } from "@mileclear/shared";
import type {
  GamificationStats,
  AchievementWithMeta,
  PeriodRecap,
} from "@mileclear/shared";
import { fetchGamificationStats, fetchAchievements, fetchRecap } from "../lib/api/gamification";
import { useMode } from "../lib/mode/context";
import { usePersonalStats } from "../hooks/usePersonalStats";
import { useRecentTripsWithCoords } from "../hooks/useRecentTripsWithCoords";
import { BusinessInsightsCard } from "../components/business/BusinessInsightsCard";
import { BusinessRecapCard } from "../components/business/BusinessRecapCard";
import { PremiumGate, useIsPremium } from "../components/PremiumGate";
import { MilestoneTracker } from "../components/personal/MilestoneTracker";
import { WeeklyActivity, buildWeekDays } from "../components/personal/WeeklyActivity";
import { DrivingGoals } from "../components/personal/DrivingGoals";
import { FuelSummaryCard } from "../components/personal/FuelSummaryCard";
import { PersonalRecapCard } from "../components/personal/PersonalRecapCard";
import { JourneyTimeline } from "../components/personal/JourneyTimeline";
import { Button } from "../components/Button";

export default function InsightsScreen() {
  const router = useRouter();
  const { isWork, isPersonal } = useMode();
  const isPremium = useIsPremium();

  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [achievements, setAchievements] = useState<AchievementWithMeta[]>([]);
  const [dailyRecap, setDailyRecap] = useState<PeriodRecap | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Recap modal
  const [recapData, setRecapData] = useState<PeriodRecap | null>(null);
  const [showRecap, setShowRecap] = useState(false);

  // Personal stats
  const {
    monthMiles,
    monthTrips,
    monthLabel,
    weekTrips,
    primaryVehicle,
    prevMonthMiles,
    prevMonthTrips,
    busiestDay,
    avgTripMiles,
    yearBusiestMonth,
  } = usePersonalStats();
  const { trips } = useRecentTripsWithCoords(5);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, achievementsRes, dailyRes] = await Promise.all([
        fetchGamificationStats().catch(() => null),
        fetchAchievements().catch(() => null),
        fetchRecap("daily").catch(() => null),
      ]);
      if (statsRes) setStats(statsRes.data);
      if (achievementsRes) setAchievements(achievementsRes.data);
      if (dailyRes) setDailyRecap(dailyRes.data);
    } catch {}
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRecap = useCallback(async (period: "daily" | "weekly" | "monthly") => {
    try {
      const res = await fetchRecap(period);
      setRecapData(res.data);
      setShowRecap(true);
    } catch {}
  }, []);

  const handleShareRecap = useCallback(async () => {
    if (!recapData) return;
    try {
      await Share.share({ message: recapData.shareText });
    } catch {}
  }, [recapData]);

  // Personal derived data
  const weekMiles = weekTrips.reduce((sum, t) => sum + t.distanceMiles, 0);
  const weekDays = buildWeekDays(weekTrips);
  const mpg = primaryVehicle?.estimatedMpg ?? primaryVehicle?.actualMpg ?? null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Insights & Analytics" }} />

      {/* Recap Modal */}
      <Modal
        visible={showRecap}
        animationType="slide"
        transparent
        onRequestClose={() => setShowRecap(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {recapData?.period === "daily" ? "Daily" : recapData?.period === "weekly" ? "Weekly" : "Monthly"} Recap
            </Text>
            {recapData && (
              <>
                <Text style={styles.recapSubtitle}>{recapData.label}</Text>
                <View style={styles.recapGrid}>
                  <View style={styles.recapCell}>
                    <Text style={styles.recapNum}>{recapData.totalMiles.toFixed(1)}</Text>
                    <Text style={styles.recapUnit}>miles</Text>
                  </View>
                  <View style={styles.recapCell}>
                    <Text style={styles.recapNum}>{recapData.totalTrips}</Text>
                    <Text style={styles.recapUnit}>trips</Text>
                  </View>
                  <View style={styles.recapCell}>
                    <Text style={styles.recapNum}>{formatPence(recapData.deductionPence)}</Text>
                    <Text style={styles.recapUnit}>deduction</Text>
                  </View>
                </View>
                {recapData.busiestDayLabel && (
                  <Text style={styles.recapDetail}>
                    Busiest day: {recapData.busiestDayLabel} ({recapData.busiestDayMiles.toFixed(1)} mi)
                  </Text>
                )}
                <View style={styles.recapBtnRow}>
                  <Button variant="secondary" title="Share" icon="share-outline" onPress={handleShareRecap} />
                  <Button title="Close" icon="checkmark" onPress={() => setShowRecap(false)} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#f5a623" />}
      >
        {/* Recaps */}
        <View style={styles.recapRow}>
          <TouchableOpacity style={styles.recapBtn} onPress={() => handleRecap("daily")} activeOpacity={0.7}>
            <Ionicons name="today-outline" size={16} color="#f5a623" />
            <Text style={styles.recapBtnLabel}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.recapBtn, !isPremium && styles.recapBtnLocked]}
            onPress={() => isPremium ? handleRecap("weekly") : router.push("/(tabs)/profile" as any)}
            activeOpacity={0.7}
          >
            <Ionicons name={isPremium ? "calendar-outline" : "lock-closed"} size={16} color={isPremium ? "#f5a623" : "#4a5568"} />
            <Text style={[styles.recapBtnLabel, !isPremium && styles.recapBtnLabelLocked]}>Week</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.recapBtn, !isPremium && styles.recapBtnLocked]}
            onPress={() => isPremium ? handleRecap("monthly") : router.push("/(tabs)/profile" as any)}
            activeOpacity={0.7}
          >
            <Ionicons name={isPremium ? "calendar-outline" : "lock-closed"} size={16} color={isPremium ? "#f5a623" : "#4a5568"} />
            <Text style={[styles.recapBtnLabel, !isPremium && styles.recapBtnLabelLocked]}>Month</Text>
          </TouchableOpacity>
        </View>

        {/* Business Insights (work mode) — premium */}
        {isWork && (
          <PremiumGate feature="Business Insights">
            <BusinessInsightsCard />
            <BusinessRecapCard />
          </PremiumGate>
        )}

        {/* Personal Insights (personal mode) */}
        {isPersonal && <WeeklyActivity days={weekDays} />}
        {isPersonal && <DrivingGoals weekMiles={weekMiles} />}
        {isPersonal && (
          <FuelSummaryCard
            monthMiles={monthMiles}
            estimatedMpg={mpg}
            fuelType={primaryVehicle?.fuelType ?? null}
          />
        )}
        {isPersonal && (
          <PersonalRecapCard
            monthMiles={monthMiles}
            monthTrips={monthTrips}
            prevMonthMiles={prevMonthMiles}
            prevMonthTrips={prevMonthTrips}
            busiestDay={busiestDay}
            avgTripMiles={avgTripMiles}
            monthLabel={monthLabel}
            totalMiles={stats?.totalMiles ?? 0}
            deductionPence={stats?.deductionPence ?? 0}
            yearMiles={stats?.totalMiles ?? 0}
            yearTrips={stats?.totalTrips ?? 0}
            yearDeductionPence={stats?.deductionPence ?? 0}
            yearBusinessMiles={stats?.businessMiles ?? 0}
            taxYear={stats?.taxYear ?? ""}
            yearBusiestMonth={yearBusiestMonth}
            todayMiles={dailyRecap?.totalMiles ?? 0}
            todayTrips={dailyRecap?.totalTrips ?? 0}
            todayDeductionPence={dailyRecap?.deductionPence ?? 0}
          />
        )}
        {isPersonal && trips.length > 0 && <JourneyTimeline trips={trips} />}

        {/* Achievements (both modes) */}
        {achievements.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Achievements</Text>
              <TouchableOpacity onPress={() => router.push("/achievements")}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeScroll}>
              {achievements.slice(0, 8).map((a) => (
                <View key={a.id} style={styles.badge}>
                  <Text style={styles.badgeEmoji}>{a.emoji}</Text>
                  <Text style={styles.badgeLabel} numberOfLines={1}>{a.label}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Milestones */}
        {stats && <MilestoneTracker totalMiles={stats.totalMiles} />}

        {/* Personal Records */}
        {stats && stats.personalRecords.mostMilesInDay > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Records</Text>
            <View style={styles.recordGrid}>
              {[
                { v: `${stats.personalRecords.mostMilesInDay.toFixed(1)} mi`, l: "Best day" },
                { v: `${stats.personalRecords.mostTripsInShift}`, l: "Trips / shift" },
                { v: `${stats.personalRecords.longestSingleTrip.toFixed(1)} mi`, l: "Longest trip" },
                { v: `${stats.personalRecords.longestStreakDays}d`, l: "Best streak" },
              ].map((r) => (
                <View key={r.l} style={styles.recordCell}>
                  <Text style={styles.recordValue}>{r.v}</Text>
                  <Text style={styles.recordLabel}>{r.l}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  content: { padding: 16 },
  // Recap row
  recapRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  recapBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#0a1120",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  recapBtnLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#c9d1d9",
  },
  recapBtnLocked: {
    opacity: 0.45,
    borderColor: "rgba(255,255,255,0.03)",
  },
  recapBtnLabelLocked: {
    color: "#4a5568",
  },
  // Sections
  section: { marginBottom: 16 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_700Bold", color: "#f0f2f5" },
  seeAll: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: "#f5a623" },
  // Badges
  badgeScroll: { gap: 10 },
  badge: {
    backgroundColor: "#0a1120",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    minWidth: 72,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  badgeEmoji: { fontSize: 22, marginBottom: 4 },
  badgeLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_500Medium", color: "#8494a7", textAlign: "center" },
  // Records
  recordGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  recordCell: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#0a1120",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  recordValue: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold", color: "#f5a623", marginBottom: 2 },
  recordLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium", color: "#6b7280" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#0f1729", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 36, height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold", color: "#f0f2f5", textAlign: "center", marginBottom: 8 },
  recapSubtitle: { fontSize: 14, fontFamily: "PlusJakartaSans_500Medium", color: "#8494a7", textAlign: "center", marginBottom: 16 },
  recapGrid: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  recapCell: { alignItems: "center" },
  recapNum: { fontSize: 22, fontFamily: "PlusJakartaSans_700Bold", color: "#f5a623" },
  recapUnit: { fontSize: 11, fontFamily: "PlusJakartaSans_500Medium", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 },
  recapDetail: { fontSize: 13, fontFamily: "PlusJakartaSans_500Medium", color: "#8494a7", textAlign: "center", marginBottom: 16 },
  recapBtnRow: { flexDirection: "row", gap: 10 },
});
