// Insights: one scrolling screen with a Week | Month | Tax year switch.
// This file is only the frame; each card is its own component under
// components/insights/. Spec: docs/insights-oct2026/SPEC-UX.md and
// DECISIONS.md. Reached from the Personal tab bar and from More > Insights
// in Work mode.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AppHeader from "../../components/AppHeader";
import { ErrorState } from "../../components/ErrorState";
import { usePaywall } from "../../components/paywall";
import { FuelSummaryCard } from "../../components/personal/FuelSummaryCard";
import { ChargingSummaryCard } from "../../components/personal/ChargingSummaryCard";
import { BadgesRow } from "../../components/insights/BadgesRow";
import { ComingUpCard } from "../../components/insights/ComingUpCard";
import { PeriodSummaryCard } from "../../components/insights/PeriodSummaryCard";
import { PeriodSwitch } from "../../components/insights/PeriodSwitch";
import { RecordsCard } from "../../components/insights/RecordsCard";
import { PersonalSection, WorkSection } from "../../components/insights/WorkSection";
import {
  useInsightsProfile,
  usePeriodSummary,
  usePeriodTrips,
  useRecentTripDates,
  useRunningCostInputs,
} from "../../hooks/useInsightsData";
import { useInsightsCelebration } from "../../hooks/useInsightsCelebration";
import { useMode } from "../../lib/mode/context";
import { useUser } from "../../lib/user/context";
import { isOnline } from "../../lib/network";
import { useReducedMotion } from "../../lib/accessibility";
import { colors, fonts, fontScaleCap } from "../../lib/theme";
import { getPeriodRange, isInsightsPeriod, PERIOD_KEY, type InsightsPeriod } from "../../lib/insights/period";
import { getMilestoneRoadOrStart } from "../../lib/insights/milestones";
import { getInsightsValue, setInsightsValue, WEEKLY_GOAL_KEY } from "../../lib/insights/store";

export default function InsightsScreen() {
  const router = useRouter();
  const { isWork, isPersonal } = useMode();
  const { user, isCompanyDriver } = useUser();
  const { showPaywall } = usePaywall();
  const reducedMotion = useReducedMotion();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const mode: "work" | "personal" = isWork ? "work" : "personal";
  const isPro = !!user?.isPremium;

  // Period: remembered on this phone only.
  const [period, setPeriod] = useState<InsightsPeriod>("week");
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    getInsightsValue(PERIOD_KEY).then((v) => {
      if (isInsightsPeriod(v)) setPeriod(v);
    });
  }, []);
  const changePeriod = useCallback((p: InsightsPeriod) => {
    setPeriod(p);
    setOffset(0);
    setInsightsValue(PERIOD_KEY, p);
  }, []);

  // Reload on focus (not on the first focus: the hooks already load on mount).
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setRefreshKey((k) => k + 1);
    }, [])
  );

  const range = useMemo(() => getPeriodRange(period, offset), [period, offset]);
  const summary = usePeriodSummary(period, offset, isPro, refreshKey);
  const bars = usePeriodTrips(period, offset, refreshKey);
  const profile = useInsightsProfile(refreshKey);
  const weekDates = useRecentTripDates(isPersonal && !isCompanyDriver, refreshKey);
  const running = useRunningCostInputs(isPersonal, refreshKey);

  const [goal, setGoal] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      getInsightsValue(WEEKLY_GOAL_KEY).then((v) => {
        const n = v ? parseFloat(v) : NaN;
        setGoal(isFinite(n) && n > 0 ? n : null);
      });
    }, [])
  );

  const stats = profile.stats;
  const records = stats ? stats.personalRecords : null;
  const celebration = useInsightsCelebration(
    profile.lifetimeMiles,
    records ? { bestDay: records.mostMilesInDay, longestTrip: records.longestSingleTrip } : null
  );

  // Pull to refresh: stop the spinner once the summary has come back.
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
  }, []);
  useEffect(() => {
    if (refreshing && summary.status !== "loading" && profile.status !== "loading") setRefreshing(false);
  }, [refreshing, summary.status, profile.status]);
  useEffect(() => {
    if (!refreshing) return;
    const t = setTimeout(() => setRefreshing(false), 6000);
    return () => clearTimeout(t);
  }, [refreshing]);

  // Old links to /insights?view=trends land on Go deeper at the bottom.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (view !== "trends" || summary.status === "loading") return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 400);
    return () => clearTimeout(t);
  }, [view, summary.status]);

  const everythingFailed = summary.status === "error" && profile.status === "error";

  // The dial: this week's goal if one is set, else the road to the next milestone.
  const road = profile.lifetimeMiles !== null ? getMilestoneRoadOrStart(profile.lifetimeMiles) : null;
  let dialProgress = road ? road.progress : 0;
  let dialLabel: string | null = road ? `${Math.max(1, Math.round(road.milesToGo)).toLocaleString("en-GB")} miles to ${road.next.label}` : null;
  if (goal && period === "week" && offset === 0 && summary.current) {
    dialProgress = summary.current.miles / goal;
    dialLabel =
      dialProgress >= 1
        ? "Goal reached"
        : `${Math.round(dialProgress * 100)}% of ${Math.round(goal).toLocaleString("en-GB")} mi goal`;
  }

  const earnedTypes = useMemo(() => new Set(profile.achievements.map((a) => a.type)), [profile.achievements]);
  const tripsEver = profile.lifetimeTrips ?? stats?.totalTrips ?? null;
  const firstWeek = tripsEver !== null && tripsEver < 10;

  const summaryCard = (
    <PeriodSummaryCard
      mode={mode}
      period={period}
      offset={offset}
      range={range}
      summary={summary}
      bars={bars}
      tripsEver={tripsEver}
      isPro={isPro}
      avatarId={user?.avatarId}
      region={stats?.region}
      dialProgress={dialProgress}
      dialLabel={dialLabel}
      celebration={celebration}
      reducedMotion={reducedMotion}
      onUpsell={() => showPaywall("insights_compare")}
      onHelp={() => router.push("/help" as never)}
    />
  );

  const comingUp = (
    <ComingUpCard
      mode={mode}
      loading={profile.status === "loading"}
      lifetimeMiles={profile.lifetimeMiles}
      lifetimeTrips={profile.lifetimeTrips}
      stats={stats}
      earnedTypes={earnedTypes}
      tripDates={weekDates.status === "ready" ? weekDates.dates : null}
      hideStreak={isCompanyDriver}
      hasWeeklyGoal={goal !== null}
      avatarId={user?.avatarId}
      reducedMotion={reducedMotion}
      onOpenAchievements={() => router.push("/achievements")}
      onSetGoal={() => router.push("/settings/work-tax" as never)}
    />
  );

  // Records and badges wait for 10 trips (first-week rule); badges show sooner.
  const recordsAndBadges = (
    <>
      {!firstWeek && (
        <RecordsCard mode={mode} records={records} loading={profile.status === "loading"} range={range} />
      )}
      <BadgesRow
        achievements={profile.achievements}
        stats={
          stats
            ? {
                totalMiles: profile.lifetimeMiles ?? stats.totalMiles,
                totalTrips: profile.lifetimeTrips ?? stats.totalTrips,
                totalShifts: stats.totalShifts,
                longestStreakDays: stats.longestStreakDays,
              }
            : null
        }
        mode={mode}
        loading={profile.status === "loading"}
        onSeeAll={() => router.push("/achievements")}
      />
    </>
  );

  const toSort = isWork && isCompanyDriver && stats && (stats.unclassifiedTrips ?? 0) > 0 ? stats.unclassifiedTrips ?? 0 : 0;

  return (
    <View style={styles.container}>
      {/* Work mode reaches Insights from More or Home, so it gets a back
          arrow; in Personal mode it is a tab. */}
      <AppHeader title="Insights" showBack={isWork} />

      <ScrollView
        ref={scrollRef}
        stickyHeaderIndices={[0]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.amber} />}
        showsVerticalScrollIndicator={false}
      >
        <PeriodSwitch
          period={period}
          onPeriodChange={changePeriod}
          offset={offset}
          onOffsetChange={setOffset}
          range={range}
        />

        <View style={styles.content}>
          {everythingFailed ? (
            <ErrorState
              title="Couldn't load your insights"
              description={
                isOnline()
                  ? "Check your connection and pull down to try again."
                  : "You're offline. Pull down to try again when you're back online."
              }
              onRetry={handleRefresh}
            />
          ) : (
            <>
              {summaryCard}

              {toSort > 0 && (
                <TouchableOpacity
                  style={styles.toSort}
                  onPress={() => router.push("/(tabs)/trips")}
                  accessibilityRole="button"
                  accessibilityLabel={`${toSort} ${toSort === 1 ? "trip" : "trips"} to sort. Opens trips`}
                >
                  <Ionicons name="funnel-outline" size={16} color={colors.text2} />
                  <Text style={styles.toSortText} maxFontSizeMultiplier={fontScaleCap.body}>
                    {toSort} {toSort === 1 ? "trip" : "trips"} to sort
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.text3} />
                </TouchableOpacity>
              )}

              {isWork ? (
                <WorkSection
                  period={period}
                  offset={offset}
                  mode={mode}
                  isPro={isPro}
                  refreshToken={refreshKey}
                  isCompanyDriver={isCompanyDriver}
                  comingUp={comingUp}
                  recordsAndBadges={recordsAndBadges}
                />
              ) : (
                <PersonalSection
                  period={period}
                  offset={offset}
                  mode={mode}
                  isPro={isPro}
                  refreshToken={refreshKey}
                  comingUp={comingUp}
                  runningCosts={
                    <>
                      <FuelSummaryCard
                        monthMiles={running.monthMiles}
                        estimatedMpg={running.vehicle?.estimatedMpg ?? running.vehicle?.actualMpg ?? null}
                        fuelType={running.vehicle?.fuelType ?? null}
                      />
                      <ChargingSummaryCard
                        monthMiles={running.monthMiles}
                        milesPerKwh={(running.vehicle as { milesPerKwh?: number | null } | null)?.milesPerKwh ?? null}
                        fuelType={running.vehicle?.fuelType ?? null}
                      />
                    </>
                  }
                  recordsAndBadges={recordsAndBadges}
                />
              )}
            </>
          )}
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  toSort: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  toSortText: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
});
