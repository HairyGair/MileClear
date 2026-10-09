import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../lib/theme";
import { MILESTONES, type Milestone } from "../../lib/insights/milestones";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

interface MilestoneTrackerProps {
  totalMiles: number;
}

export function MilestoneTracker({ totalMiles }: MilestoneTrackerProps) {
  if (totalMiles < 5) return null;

  // Find the last achieved milestone and the next one
  let lastAchieved: Milestone | null = null;
  let nextMilestone: Milestone | null = null;

  for (let i = 0; i < MILESTONES.length; i++) {
    if (totalMiles >= MILESTONES[i].miles) {
      lastAchieved = MILESTONES[i];
    } else {
      nextMilestone = MILESTONES[i];
      break;
    }
  }

  if (!nextMilestone) return null;

  const progressStart = lastAchieved ? lastAchieved.miles : 0;
  const progressRange = nextMilestone.miles - progressStart;
  const progressCurrent = totalMiles - progressStart;
  const progressPct = Math.min(progressCurrent / progressRange, 1);

  const milesRemaining = nextMilestone.miles - totalMiles;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="flag" size={16} color={AMBER} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Next: {nextMilestone.label}</Text>
          <Text style={styles.subtitle}>{nextMilestone.funFact}</Text>
        </View>
        <Text style={styles.target}>
          {nextMilestone.miles.toLocaleString("en-GB")} mi
        </Text>
      </View>

      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
      </View>

      <Text style={styles.remaining}>
        {milesRemaining < 1
          ? "Less than a mile to go!"
          : `${milesRemaining.toFixed(milesRemaining < 10 ? 1 : 0)} miles to go`}
      </Text>

      {lastAchieved && (
        <View style={styles.achievedRow}>
          <Ionicons name="checkmark-circle" size={14} color="rgba(16, 185, 129, 0.6)" />
          <Text style={styles.achievedText}>
            {lastAchieved.label}: {lastAchieved.funFact}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 1,
  },
  target: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  progressBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: AMBER,
  },
  remaining: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: TEXT_2,
    marginBottom: 4,
  },
  achievedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  achievedText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
});
