import { useState, useMemo, useCallback } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { usePersonalStats } from "../../hooks/usePersonalStats";
import { consumeLastSavedTrip, type LastSavedTrip } from "../../lib/events/lastTrip";
import { DrivingSummaryCard } from "./DrivingSummaryCard";
import { MileageMonthCard } from "../business/MileageMonthCard";
import { PostTripCard } from "./PostTripCard";
import { PersonalRecapCard } from "./PersonalRecapCard";
import { MapOverview } from "./MapOverview";
import { CommunityInsightsCard } from "../community/CommunityInsightsCard";
import { LocalBenchmarkCard } from "../business/LocalBenchmarkCard";
import { CommunityMonthCard } from "../community/CommunityMonthCard";
import RoadAlertsCard from "../roadAlerts/RoadAlertsCard";
import { PremiumGate } from "../PremiumGate";
import { MilestoneTracker } from "./MilestoneTracker";
import { DrivingPatternsCard } from "./DrivingPatternsCard";
import type { GamificationStats, PeriodRecap } from "@mileclear/shared";
import { colors } from "../../lib/theme";
import { Button } from "../Button";
import { QuickActionRow } from "../QuickActionRow";
import { PauseRecordingRow } from "../PauseRecordingRow";
import type { PauseChoice } from "../../lib/tracking/pauseRule";

// Local theme aliases — same pattern as the (tabs) screens.
const GREEN = colors.green;

const EMERALD = GREEN;

interface PersonalDashboardProps {
  avatarId?: string | null;
  stats: GamificationStats | null;
  visibleKeys?: string[];
  recentTrips?: any[];
  dailyRecap?: PeriodRecap | null;
  onShowRecap?: (recap: PeriodRecap) => void;
  /** Pause with an end (16 Sep 2026). Optional so older callers still compile. */
  pausedUntil?: number | null;
  onPause?: (choice: PauseChoice) => void;
  onResume?: () => void;
  /** Rendering the sections under the dashboard's More (4 Oct 2026). The
   *  just-saved trip card belongs on the home screen, not in here. */
  inMore?: boolean;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function PersonalDashboard({ avatarId: _avatarId, stats, visibleKeys, recentTrips, dailyRecap, onShowRecap: _onShowRecap, pausedUntil, onPause, onResume, inMore }: PersonalDashboardProps) {
  const router = useRouter();
  const {
    monthMiles,
    monthTrips,
    weekTrips,
    primaryVehicle,
    prevMonthMiles,
    prevMonthTrips,
    busiestDay,
    avgTripMiles,
    monthLabel,
    yearBusiestMonth,
    loading: statsLoading,
  } = usePersonalStats();

  const [lastSaved, setLastSaved] = useState<LastSavedTrip | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (inMore) return;
      const saved = consumeLastSavedTrip();
      if (saved && Date.now() - saved.savedAt < 5 * 60 * 1000) {
        setLastSaved(saved);
      }
    }, [inMore])
  );

  const dismissPostTrip = useCallback(() => setLastSaved(null), []);

  const postTripInsight = useMemo(() => {
    if (!lastSaved) return null;
    const todayTripsCount = weekTrips.filter((t) => {
      const d = new Date(t.startedAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    if (todayTripsCount > 1) return `Your ${ordinal(todayTripsCount)} trip today`;
    const weekMax = Math.max(...weekTrips.map((t) => t.distanceMiles), 0);
    if (lastSaved.distanceMiles >= weekMax && lastSaved.distanceMiles > 0.5) {
      return "Your longest trip this week!";
    }
    return null;
  }, [lastSaved, weekTrips]);

  if (statsLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={EMERALD} />
      </View>
    );
  }

  const mpg = primaryVehicle?.estimatedMpg ?? primaryVehicle?.actualMpg ?? null;
  const LITRES_PER_GALLON = 4.54609;
  const fuelPpl = primaryVehicle?.fuelType === "diesel" ? 145 : 138;
  let estimatedCostPence: number | null = null;
  if (monthMiles > 0 && mpg) {
    const gallons = monthMiles / mpg;
    const litres = gallons * LITRES_PER_GALLON;
    estimatedCostPence = Math.round(litres * fuelPpl);
  }

  const weekMiles = weekTrips.reduce((sum, t) => sum + t.distanceMiles, 0);
  const todayMiles = stats?.todayMiles ?? 0;
  const streakDays = stats?.currentStreakDays ?? 0;

  const renderSection = (key: string) => {
    switch (key) {
      case "personal_cta":
        return (
          <View key={key}>
            {/* Primary CTA: Start Trip, amber in both modes */}
            <Button
              variant="primary"
              size="lg"
              icon="navigate"
              title="Start Trip"
              onPress={() => router.push("/trip-form")}
              accessibilityLabel="Start a new trip"
              style={{ marginBottom: 10 }}
            />
            {onPause && onResume && (
              <PauseRecordingRow pausedUntil={pausedUntil ?? null} now={Date.now()} onPause={onPause} onResume={onResume} />
            )}

            {/* Quick actions. Trips and Insights are tabs now. */}
            <QuickActionRow
              actions={[
                { key: "vehicles", icon: "car-outline", label: "Vehicles", a11yLabel: "View vehicles", onPress: () => router.push("/vehicles") },
                { key: "fuel", icon: "water-outline", label: "Fuel", a11yLabel: "View fuel", onPress: () => router.push("/(tabs)/fuel" as any) },
                { key: "badges", icon: "trophy-outline", label: "Badges", a11yLabel: "View badges and achievements", onPress: () => router.push("/achievements") },
                // Save the spot the driver is parked at right now, without typing a postcode.
                { key: "spot", icon: "bookmark-outline", label: "Save spot", a11yLabel: "Save this spot as a place", onPress: () => router.push({ pathname: "/saved-location-form", params: { useCurrent: "1" } }) },
              ]}
            />
          </View>
        );
      case "personal_summary": {
        // Same derivation the daily recap uses: weekTrips is already loaded,
        // so today's count needs no extra request.
        const summaryTodayStr = new Date().toDateString();
        const summaryTodayTrips = weekTrips.filter(
          (t) => new Date(t.startedAt).toDateString() === summaryTodayStr
        ).length;
        return (
          <DrivingSummaryCard
            key={key}
            estimatedCostPence={estimatedCostPence}
            streakDays={streakDays}
            todayMiles={todayMiles}
            todayTrips={summaryTodayTrips}
            weekMiles={weekMiles}
          />
        );
      }
      case "monthly_history":
        // Reuses the work-side MileageMonthCard with no classification
        // filter, so personal-mode users get an "all driving by month"
        // navigator with prev/next chevrons. Title falls back to
        // "MILEAGE" since classification is undefined.
        return <MileageMonthCard key={key} title="MONTHLY MILEAGE" />;
      case "daily_recap": {
        const todayStr = new Date().toDateString();
        const todayTripsArr = weekTrips.filter((t) => new Date(t.startedAt).toDateString() === todayStr);
        const todayMilesVal = todayTripsArr.reduce((sum, t) => sum + t.distanceMiles, 0);
        const todayTripsCount = todayTripsArr.length;
        const todayDeductionPence = dailyRecap?.deductionPence ?? 0;
        return (
          <View key={key}>
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
              todayMiles={todayMilesVal}
              todayTrips={todayTripsCount}
              todayDeductionPence={todayDeductionPence}
              region={stats?.region}
            />
          </View>
        );
      }
      case "milestone":
        return stats && stats.totalMiles >= 5 ? (
          <MilestoneTracker key={key} totalMiles={stats.totalMiles} />
        ) : null;
      case "driving_patterns":
        return stats?.drivingPatterns ? (
          <DrivingPatternsCard key={key} patterns={stats.drivingPatterns} />
        ) : null;
      case "journey_map":
        return (recentTrips && recentTrips.length > 0) ? (
          <View key={key}>
            <PremiumGate feature="Journey Map">
              <MapOverview trips={recentTrips} title="Recent Journeys" />
            </PremiumGate>
          </View>
        ) : null;
      case "local_benchmark":
        return stats && stats.totalTrips > 0 ? (
          <LocalBenchmarkCard key={key} mode="personal" />
        ) : null;
      case "road_alerts":
        return <RoadAlertsCard key={key} />;
      case "community_month":
        return <CommunityMonthCard key={key} />;
      case "community":
        return (
          <View key={key}>
            <PremiumGate feature="Community Insights">
              <CommunityInsightsCard isWork={false} />
            </PremiumGate>
          </View>
        );
      default:
        return null;
    }
  };

  const sectionOrder = visibleKeys || [
    "personal_cta", "road_alerts", "monthly_history", "personal_summary",
    "milestone", "journey_map",
  ];

  return (
    <View>
      {lastSaved && (
        <PostTripCard
          trip={lastSaved}
          insight={postTripInsight}
          onDismiss={dismissPostTrip}
        />
      )}
      {sectionOrder.map((key) => renderSection(key))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 40,
    alignItems: "center",
  },
});
