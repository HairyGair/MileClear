import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
  RefreshControl,
} from "react-native";
import { AppModal } from "../../components/AppModal";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { formatPence } from "@mileclear/shared";
import type {
  GamificationStats,
  AchievementWithMeta,
  PeriodRecap,
} from "@mileclear/shared";
import { fetchGamificationStats, fetchAchievements, fetchRecap } from "../../lib/api/gamification";
import { useMode } from "../../lib/mode/context";
import { usePersonalStats } from "../../hooks/usePersonalStats";
import { useRecentTripsWithCoords } from "../../hooks/useRecentTripsWithCoords";
import { BusinessInsightsCard } from "../../components/business/BusinessInsightsCard";
import { BusinessRecapCard } from "../../components/business/BusinessRecapCard";
import { PlatformPnLCard } from "../../components/business/PlatformPnLCard";
import { useUser } from "../../lib/user/context";
import { PremiumGate } from "../../components/PremiumGate";
import AppHeader from "../../components/AppHeader";
import { ErrorState } from "../../components/ErrorState";
import { TrendsView } from "../../components/insights/TrendsView";
import { isOnline } from "../../lib/network";
import { MilestoneTracker } from "../../components/personal/MilestoneTracker";
import { WeeklyActivity, buildWeekDays } from "../../components/personal/WeeklyActivity";
import { DrivingGoals } from "../../components/personal/DrivingGoals";
import { FuelSummaryCard } from "../../components/personal/FuelSummaryCard";
import { ChargingSummaryCard } from "../../components/personal/ChargingSummaryCard";
import { PersonalRecapCard } from "../../components/personal/PersonalRecapCard";
import { JourneyTimeline } from "../../components/personal/JourneyTimeline";
import { Button } from "../../components/Button";
import { colors, fonts } from "../../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;

export default function InsightsScreen() {
  const router = useRouter();
  const { isWork, isPersonal } = useMode();
  // Company drivers cannot log earnings, so earnings-based cards are only noise.
  const { isCompanyDriver } = useUser();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const [segment, setSegment] = useState<"overview" | "trends">(
    view === "trends" ? "trends" : "overview"
  );
  // A link to /insights?view=trends while this tab is already mounted.
  useEffect(() => {
    if (view === "trends") setSegment("trends");
  }, [view]);
  const [trendsToken, setTrendsToken] = useState(0);

  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [achievements, setAchievements] = useState<AchievementWithMeta[]>([]);
  const [dailyRecap, setDailyRecap] = useState<PeriodRecap | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

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
      setLoadFailed(!statsRes && !achievementsRes && !dailyRes);
      setLoaded(true);
      if (statsRes) setStats(statsRes.data);
      if (achievementsRes) setAchievements(achievementsRes.data);
      if (dailyRes) setDailyRecap(dailyRes.data);
    } catch {
      setLoadFailed(true);
      setLoaded(true);
    }
    setRefreshing(false);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (segment === "trends") {
      setTrendsToken((n) => n + 1);
      // TrendsView never reports back behind the Pro gate, so don't wait for it.
      setTimeout(() => setRefreshing(false), 1500);
    } else {
      loadData();
    }
  }, [segment, loadData]);

  const handleTrendsRefreshed = useCallback(() => setRefreshing(false), []);

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

  // Today's stats derived from weekTrips (reliable client-side dates)
  const todayStr = new Date().toDateString();
  const todayTripsArr = weekTrips.filter((t) => new Date(t.startedAt).toDateString() === todayStr);
  const todayMiles = todayTripsArr.reduce((sum, t) => sum + t.distanceMiles, 0);
  const todayTripsCount = todayTripsArr.length;
  const todayDeductionPence = dailyRecap?.deductionPence ?? 0;

  return (
    <View style={styles.container}>
      {/* Work mode reaches Insights from More or Home, so it gets a back
          arrow; in Personal mode it is a tab. */}
      <AppHeader title="Insights" showBack={isWork} />

      {/* Recap Modal */}
      <AppModal
        visible={showRecap}
        animationType="slide"
        onRequestClose={() => setShowRecap(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet} accessibilityViewIsModal={true}>
            <View style={styles.modalHandle} accessible={false} />
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
      </AppModal>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={AMBER} />}
      >
        {/* Overview | Trends */}
        <View style={styles.segmented} accessibilityRole="tablist">
          {(["overview", "trends"] as const).map((key) => {
            const active = segment === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => setSegment(key)}
                activeOpacity={0.7}
                hitSlop={{ top: 2, bottom: 2 }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={key === "overview" ? "Overview" : "Trends"}
              >
                <Text
                  style={[styles.segmentLabel, active && styles.segmentLabelActive]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.3}
                >
                  {key === "overview" ? "Overview" : "Trends"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {segment === "trends" ? (
          <TrendsView refreshToken={trendsToken} onRefreshed={handleTrendsRefreshed} />
        ) : loadFailed ? (
          <ErrorState
            title="Couldn't load your insights"
            description={
              isOnline()
                ? "Check your connection and pull down to try again."
                : "You're offline. Pull down to try again when you're back online."
            }
            onRetry={loadData}
          />
        ) : (
          <>
        {/* Recaps */}
        <View style={styles.recapRow}>
          <TouchableOpacity style={styles.recapBtn} onPress={() => handleRecap("daily")} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="View today's recap">
            <Ionicons name="today-outline" size={16} color={AMBER} />
            <Text style={styles.recapBtnLabel}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.recapBtn}
            onPress={() => handleRecap("weekly")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="View this week's recap"
          >
            <Ionicons name="calendar-outline" size={16} color={AMBER} />
            <Text style={styles.recapBtnLabel}>Week</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.recapBtn}
            onPress={() => handleRecap("monthly")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="View this month's recap"
          >
            <Ionicons name="calendar-outline" size={16} color={AMBER} />
            <Text style={styles.recapBtnLabel}>Month</Text>
          </TouchableOpacity>
        </View>

        {/* Business Insights (work mode) — premium */}
        {isWork && !isCompanyDriver && (
          <PremiumGate feature="Business Insights">
            <BusinessInsightsCard />
            <PlatformPnLCard days={30} />
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
          <ChargingSummaryCard
            monthMiles={monthMiles}
            milesPerKwh={(primaryVehicle as { milesPerKwh?: number | null })?.milesPerKwh ?? null}
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
            todayMiles={todayMiles}
            todayTrips={todayTripsCount}
            todayDeductionPence={todayDeductionPence}
            region={stats?.region}
          />
        )}
        {isPersonal && trips.length > 0 && (
          <PremiumGate feature="Journey Timeline">
            <JourneyTimeline trips={trips} />
          </PremiumGate>
        )}

        {/* Achievements (both modes) */}
        {(achievements.length > 0 || loaded) && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Achievements</Text>
              <TouchableOpacity onPress={() => router.push("/achievements")} accessibilityRole="button" accessibilityLabel="See all achievements">
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {achievements.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>
                  No badges yet. Your first one comes with your first trip.
                </Text>
              </View>
            ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeScroll}>
              {achievements.slice(0, 8).map((a) => (
                <View key={a.id} style={styles.badge}>
                  <Text style={styles.badgeEmoji}>{a.emoji}</Text>
                  <Text style={styles.badgeLabel} numberOfLines={1}>{a.label}</Text>
                </View>
              ))}
            </ScrollView>
            )}
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
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: 16 },
  // Recap row
  recapRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  recapBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  recapBtnLabel: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: "#c9d1d9",
  },
  recapBtnLocked: {
    opacity: 0.45,
    borderColor: "rgba(255,255,255,0.03)",
  },
  recapBtnLabelLocked: {
    color: TEXT_3,
  },
  // Overview | Trends control
  segmented: {
    flexDirection: "row",
    backgroundColor: CARD_BG,
    borderRadius: 999,
    padding: 3,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: AMBER },
  segmentLabel: { fontSize: 14, fontFamily: fonts.semibold, color: TEXT_2 },
  segmentLabelActive: { color: BG },
  emptyCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  emptyCardText: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_2, lineHeight: 20 },
  // Sections
  section: { marginBottom: 16 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontFamily: fonts.bold, color: TEXT_1 },
  seeAll: { fontSize: 13, fontFamily: fonts.semibold, color: AMBER },
  // Badges
  badgeScroll: { gap: 10 },
  badge: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    minWidth: 72,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  badgeEmoji: { fontSize: 22, marginBottom: 4 },
  badgeLabel: { fontSize: 11, fontFamily: fonts.medium, color: TEXT_2, textAlign: "center" },
  // Records
  recordGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  recordCell: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  recordValue: { fontSize: 18, fontFamily: fonts.bold, color: AMBER, marginBottom: 2 },
  recordLabel: { fontSize: 11, fontFamily: fonts.medium, color: TEXT_3 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: CARD_BG, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 36, height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontFamily: fonts.bold, color: TEXT_1, textAlign: "center", marginBottom: 8 },
  recapSubtitle: { fontSize: 14, fontFamily: fonts.medium, color: TEXT_2, textAlign: "center", marginBottom: 16 },
  recapGrid: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  recapCell: { alignItems: "center" },
  recapNum: { fontSize: 22, fontFamily: fonts.bold, color: AMBER },
  recapUnit: { fontSize: 11, fontFamily: fonts.medium, color: TEXT_3, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 },
  recapDetail: { fontSize: 13, fontFamily: fonts.medium, color: TEXT_2, textAlign: "center", marginBottom: 16 },
  recapBtnRow: { flexDirection: "row", gap: 10 },
});
