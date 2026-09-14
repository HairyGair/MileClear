import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const CARD_BG = colors.surface;

// Leads on TODAY, not the month. Until 13 Sep this card printed the month's
// miles as its hero and the month's trip count as a stat, and MileageMonthCard
// directly below printed both again — the same two numbers twice on one
// screen, which is what Akbar's UI video complained about. The month total now
// lives only in MileageMonthCard, which owns the prev/next month navigation.
interface DrivingSummaryCardProps {
  estimatedCostPence: number | null;
  streakDays?: number;
  todayMiles?: number;
  todayTrips?: number;
  weekMiles?: number;
}

const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

function formatMilesHero(miles: number): string {
  if (miles < 100) return miles.toFixed(1);
  return Math.round(miles).toLocaleString("en-GB");
}

function formatMilesCompact(miles: number): string {
  if (miles < 1000) return miles.toFixed(1);
  return `${(miles / 1000).toFixed(1)}k`;
}

export function DrivingSummaryCard({
  estimatedCostPence,
  streakDays = 0,
  todayMiles = 0,
  todayTrips = 0,
  weekMiles = 0,
}: DrivingSummaryCardProps) {
  return (
    <View style={styles.card}>
      {/* Header row: label + streak badge */}
      <View style={styles.headerRow}>
        <Text style={styles.label}>YOUR DRIVING TODAY</Text>
        {streakDays > 0 && (
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={12} color={AMBER} />
            <Text style={styles.streakText}>{streakDays}d</Text>
          </View>
        )}
      </View>

      {/* Today's miles. The month's total is MileageMonthCard's job. */}
      <View style={styles.heroRow}>
        <Text style={styles.heroValue}>{formatMilesHero(todayMiles)}</Text>
        <Text style={styles.heroUnit}>miles</Text>
      </View>

      {/* Quick stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{todayTrips}</Text>
          {/* "trips today", not just "trips": MileageMonthCard directly below
              shows the month's trip count, and two bare "trips" labels with
              different numbers on one screen is the confusion this card was
              just cleaned up to avoid. */}
          <Text style={styles.statLabel}>{todayTrips === 1 ? "trip today" : "trips today"}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{formatMilesCompact(weekMiles)}</Text>
          <Text style={styles.statLabel}>this week</Text>
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.semibold,
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
    fontFamily: fonts.bold,
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
    fontFamily: fonts.light,
    color: AMBER,
    letterSpacing: -1,
  },
  heroUnit: {
    fontSize: 16,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.semibold,
    color: TEXT_1,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: TEXT_3,
    letterSpacing: 0.2,
  },
  statDivider: {
    width: 1,
    height: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
