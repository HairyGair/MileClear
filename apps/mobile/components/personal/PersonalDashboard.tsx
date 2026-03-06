import { useState, useMemo, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRecentTripsWithCoords } from "../../hooks/useRecentTripsWithCoords";
import { usePersonalStats } from "../../hooks/usePersonalStats";
import { consumeLastSavedTrip, type LastSavedTrip } from "../../lib/events/lastTrip";
import { DrivingSummaryCard } from "./DrivingSummaryCard";
import { SmartMap } from "./SmartMap";
import { MapOverview } from "./MapOverview";
import { PostTripCard } from "./PostTripCard";
import { WeeklyActivity, buildWeekDays } from "./WeeklyActivity";
import { CostEstimate } from "./CostEstimate";
import { FuelSummaryCard } from "./FuelSummaryCard";
import { JourneyTimeline } from "./JourneyTimeline";
import { DrivingGoals } from "./DrivingGoals";
import { PersonalRecapCard } from "./PersonalRecapCard";
import type { GamificationStats } from "@mileclear/shared";

interface PersonalDashboardProps {
  avatarId?: string | null;
  stats: GamificationStats | null;
}

type DashboardContext = "post_trip" | "morning" | "end_of_week" | "default";

export function PersonalDashboard({ avatarId, stats }: PersonalDashboardProps) {
  const router = useRouter();
  const { trips, loading: tripsLoading } = useRecentTripsWithCoords(5);
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
    loading: statsLoading,
  } = usePersonalStats();

  const [lastSaved, setLastSaved] = useState<LastSavedTrip | null>(null);

  // Check for a just-saved trip when dashboard comes into focus
  useFocusEffect(
    useCallback(() => {
      const saved = consumeLastSavedTrip();
      if (saved && Date.now() - saved.savedAt < 5 * 60 * 1000) {
        setLastSaved(saved);
      }
    }, [])
  );

  const dismissPostTrip = useCallback(() => setLastSaved(null), []);

  // Determine dashboard context
  const dashboardContext: DashboardContext = useMemo(() => {
    if (lastSaved) return "post_trip";
    const hour = new Date().getHours();
    const todayTrips = weekTrips.filter((t) => {
      const d = new Date(t.startedAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    if (hour < 10 && todayTrips === 0) return "morning";
    const day = new Date().getDay();
    if (day === 0 || day === 5 || day === 6) return "end_of_week";
    return "default";
  }, [lastSaved, weekTrips]);

  // Post-trip insight (must be above early return — hooks must always run)
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

  if (tripsLoading && statsLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#f5a623" />
      </View>
    );
  }

  // Fuel cost estimate
  const mpg = primaryVehicle?.estimatedMpg ?? primaryVehicle?.actualMpg ?? null;
  const LITRES_PER_GALLON = 4.54609;
  const fuelPpl = primaryVehicle?.fuelType === "diesel" ? 145 : 138;
  let estimatedCostPence: number | null = null;
  if (monthMiles > 0 && mpg) {
    const gallons = monthMiles / mpg;
    const litres = gallons * LITRES_PER_GALLON;
    estimatedCostPence = Math.round(litres * fuelPpl);
  }

  const weekDays = buildWeekDays(weekTrips);
  const weekMiles = weekTrips.reduce((sum, t) => sum + t.distanceMiles, 0);
  const totalMiles = stats?.totalMiles ?? 0;
  const todayMiles = stats?.todayMiles ?? 0;
  const streakDays = stats?.currentStreakDays ?? 0;

  // Last trip with coordinates for SmartMap
  const lastTripWithCoords = trips.find((t) => t.coordinates.length >= 2) ?? null;

  // ── Shared components ───────────────────────────────────────────

  const heroCard = (
    <DrivingSummaryCard
      monthMiles={monthMiles}
      monthTrips={monthTrips}
      estimatedCostPence={estimatedCostPence}
      monthLabel={monthLabel}
      streakDays={streakDays}
      todayMiles={todayMiles}
      weekMiles={weekMiles}
    />
  );

  const tripsWithCoords = trips.filter((t) => t.coordinates.length >= 2);
  const smartMap = tripsWithCoords.length >= 2 ? (
    <MapOverview trips={trips} title="Recent Journeys" />
  ) : (
    <SmartMap
      avatarId={avatarId}
      lastTrip={lastTripWithCoords}
      height={220}
    />
  );

  const weeklyActivity = <WeeklyActivity days={weekDays} />;
  const drivingGoals = <DrivingGoals weekMiles={weekMiles} />;
  const costEstimate = (
    <FuelSummaryCard
      monthMiles={monthMiles}
      estimatedMpg={mpg}
      fuelType={primaryVehicle?.fuelType ?? null}
    />
  );
  const recapCard = (
    <PersonalRecapCard
      monthMiles={monthMiles}
      monthTrips={monthTrips}
      prevMonthMiles={prevMonthMiles}
      prevMonthTrips={prevMonthTrips}
      busiestDay={busiestDay}
      avgTripMiles={avgTripMiles}
      monthLabel={monthLabel}
      totalMiles={totalMiles}
      deductionPence={stats?.deductionPence ?? 0}
      yearMiles={stats?.totalMiles ?? 0}
      yearTrips={stats?.totalTrips ?? 0}
      yearDeductionPence={stats?.deductionPence ?? 0}
      yearBusinessMiles={stats?.businessMiles ?? 0}
      taxYear={stats?.taxYear ?? ""}
      yearBusiestMonth={yearBusiestMonth}
    />
  );
  const timeline = <JourneyTimeline trips={trips} />;

  const startTripButton = (
    <TouchableOpacity
      style={styles.startTripBtn}
      onPress={() => router.push("/trip-form")}
      activeOpacity={0.7}
    >
      <Ionicons name="navigate" size={20} color="#030712" />
      <Text style={styles.startTripBtnText}>Start Trip</Text>
    </TouchableOpacity>
  );

  // ── Contextual rendering ────────────────────────────────────────

  if (dashboardContext === "post_trip") {
    return (
      <View>
        <PostTripCard
          trip={lastSaved!}
          insight={postTripInsight}
          onDismiss={dismissPostTrip}
        />
        {heroCard}
        {startTripButton}
        {smartMap}

        {weeklyActivity}
        {drivingGoals}
        {recapCard}
        {costEstimate}
        {timeline}
      </View>
    );
  }

  if (dashboardContext === "morning") {
    return (
      <View>
        {heroCard}
        {startTripButton}
        {smartMap}
        {drivingGoals}
        {weeklyActivity}

        {costEstimate}
        {recapCard}
        {timeline}
      </View>
    );
  }

  if (dashboardContext === "end_of_week") {
    return (
      <View>
        {heroCard}
        {startTripButton}
        {recapCard}
        {smartMap}

        {weeklyActivity}
        {drivingGoals}
        {costEstimate}
        {timeline}
      </View>
    );
  }

  // Default
  return (
    <View>
      {heroCard}
      {startTripButton}
      {smartMap}
      {weeklyActivity}
      {drivingGoals}
      {costEstimate}
      {recapCard}
      {timeline}
    </View>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
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
  loading: {
    paddingVertical: 40,
    alignItems: "center",
  },
});
