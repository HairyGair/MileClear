import { useState, useMemo, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePersonalStats } from "../../hooks/usePersonalStats";
import { consumeLastSavedTrip, type LastSavedTrip } from "../../lib/events/lastTrip";
import { DrivingSummaryCard } from "./DrivingSummaryCard";
import { PostTripCard } from "./PostTripCard";
import { PersonalRecapCard } from "./PersonalRecapCard";
import { MapOverview } from "./MapOverview";
import { CommunityInsightsCard } from "../community/CommunityInsightsCard";
import { PremiumGate } from "../PremiumGate";
import { MilestoneTracker } from "./MilestoneTracker";
import { DrivingPatternsCard } from "./DrivingPatternsCard";
import type { GamificationStats, PeriodRecap } from "@mileclear/shared";

interface PersonalDashboardProps {
  avatarId?: string | null;
  stats: GamificationStats | null;
  visibleKeys?: string[];
  recentTrips?: any[];
  dailyRecap?: PeriodRecap | null;
  onShowRecap?: (recap: PeriodRecap) => void;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function PersonalDashboard({ avatarId, stats, visibleKeys, recentTrips, dailyRecap, onShowRecap }: PersonalDashboardProps) {
  const isVisible = (key: string) => !visibleKeys || visibleKeys.includes(key);
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
      const saved = consumeLastSavedTrip();
      if (saved && Date.now() - saved.savedAt < 5 * 60 * 1000) {
        setLastSaved(saved);
      }
    }, [])
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
        <ActivityIndicator color="#10b981" />
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
      case "personal_summary":
        return (
          <DrivingSummaryCard
            key={key}
            monthMiles={monthMiles}
            monthTrips={monthTrips}
            estimatedCostPence={estimatedCostPence}
            monthLabel={monthLabel}
            streakDays={streakDays}
            todayMiles={todayMiles}
            weekMiles={weekMiles}
          />
        );
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
      case "personal_cta":
        return (
          <TouchableOpacity
            key={key}
            style={styles.startTripBtn}
            onPress={() => router.push("/trip-form")}
            activeOpacity={0.7}
          >
            <Ionicons name="navigate" size={20} color="#030712" />
            <Text style={styles.startTripBtnText}>Start Trip</Text>
          </TouchableOpacity>
        );
      case "personal_quicknav":
        return (
          <View key={key} style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push("/insights")}
              activeOpacity={0.7}
            >
              <Ionicons name="analytics-outline" size={22} color="#10b981" style={{ marginBottom: 4 }} />
              <Text style={styles.quickActionLabel}>Insights</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.replace("/(tabs)/trips" as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="list-outline" size={22} color="#10b981" style={{ marginBottom: 4 }} />
              <Text style={styles.quickActionLabel}>Trips</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.replace("/(tabs)/fuel" as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="water-outline" size={22} color="#10b981" style={{ marginBottom: 4 }} />
              <Text style={styles.quickActionLabel}>Fuel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push("/achievements")}
              activeOpacity={0.7}
            >
              <Ionicons name="trophy-outline" size={22} color="#10b981" style={{ marginBottom: 4 }} />
              <Text style={styles.quickActionLabel}>Badges</Text>
            </TouchableOpacity>
          </View>
        );
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
    "personal_summary", "personal_cta", "personal_quicknav",
    "milestone", "driving_patterns",
    "journey_map", "community",
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
  startTripBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  startTripBtnText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  quickActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  quickAction: {
    flex: 1,
    backgroundColor: "#0a1120",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  quickActionLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
    letterSpacing: 0.2,
  },
  loading: {
    paddingVertical: 40,
    alignItems: "center",
  },
});
