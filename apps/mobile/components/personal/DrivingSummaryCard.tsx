import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface DrivingSummaryCardProps {
  monthMiles: number;
  monthTrips: number;
  estimatedCostPence: number | null;
  monthLabel: string;
  streakDays?: number;
  todayMiles?: number;
  weekMiles?: number;
}

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";

function formatMilesHero(miles: number): string {
  if (miles < 100) return miles.toFixed(1);
  return Math.round(miles).toLocaleString("en-GB");
}

function formatMilesCompact(miles: number): string {
  if (miles < 1000) return miles.toFixed(1);
  return `${(miles / 1000).toFixed(1)}k`;
}

export function DrivingSummaryCard({
  monthMiles,
  monthTrips,
  estimatedCostPence,
  monthLabel,
  streakDays = 0,
  todayMiles = 0,
  weekMiles = 0,
}: DrivingSummaryCardProps) {
  return (
    <View style={styles.card}>
      {/* Header row: label + streak badge */}
      <View style={styles.headerRow}>
        <Text style={styles.label}>
          YOUR DRIVING {"\u00B7"} {monthLabel.toUpperCase()}
        </Text>
        {streakDays > 0 && (
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={12} color={AMBER} />
            <Text style={styles.streakText}>{streakDays}d</Text>
          </View>
        )}
      </View>

      {/* Big month miles */}
      <View style={styles.heroRow}>
        <Text style={styles.heroValue}>{formatMilesHero(monthMiles)}</Text>
        <Text style={styles.heroUnit}>miles</Text>
      </View>

      {/* Quick stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{formatMilesCompact(todayMiles)}</Text>
          <Text style={styles.statLabel}>today</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{formatMilesCompact(weekMiles)}</Text>
          <Text style={styles.statLabel}>this week</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{monthTrips}</Text>
          <Text style={styles.statLabel}>{monthTrips === 1 ? "trip" : "trips"}</Text>
        </View>
        {estimatedCostPence != null && estimatedCostPence > 0 && (
          <>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {"\u00A3"}{(estimatedCostPence / 100).toFixed(0)}
              </Text>
              <Text style={styles.statLabel}>fuel est</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0a1120",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.12)",
    ...Platform.select({
      ios: {
        shadowColor: "#f5a623",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
    }),
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    letterSpacing: 0.8,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
  },
  streakText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_700Bold",
    color: AMBER,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginBottom: 16,
  },
  heroValue: {
    fontSize: 38,
    fontFamily: "PlusJakartaSans_300Light",
    color: AMBER,
    letterSpacing: -1,
  },
  heroUnit: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    letterSpacing: 0.2,
  },
  statDivider: {
    width: 1,
    height: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
