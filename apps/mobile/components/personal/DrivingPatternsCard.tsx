import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DrivingPatterns } from "@mileclear/shared";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_SLOTS = [
  { label: "Night", range: "00–04", icon: "moon-outline" as const },
  { label: "Early", range: "04–08", icon: "sunny-outline" as const },
  { label: "Morning", range: "08–12", icon: "sunny" as const },
  { label: "Afternoon", range: "12–16", icon: "partly-sunny-outline" as const },
  { label: "Evening", range: "16–20", icon: "cloudy-night-outline" as const },
  { label: "Late", range: "20–24", icon: "moon" as const },
];

interface Props {
  patterns: DrivingPatterns;
}

export function DrivingPatternsCard({ patterns }: Props) {
  const maxDay = Math.max(...patterns.dayOfWeek);
  const maxTime = Math.max(...patterns.timeOfDay);

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.iconWrap}>
          <Ionicons name="bar-chart" size={16} color="#f5a623" />
        </View>
        <Text style={s.heading}>Driving Patterns</Text>
      </View>

      {/* Day of week */}
      <Text style={s.sectionTitle}>Busiest Days {"·"} trips</Text>
      <View style={s.daysRow}>
        {DAY_LABELS.map((day, i) => {
          const count = patterns.dayOfWeek[i];
          const pct = maxDay > 0 ? (count / maxDay) * 100 : 0;
          const isPeak = count === maxDay && maxDay > 0;
          return (
            <View key={day} style={s.dayCol}>
              <Text style={[s.dayCount, isPeak && s.dayCountPeak]}>{count}</Text>
              <View style={s.dayBarWrap}>
                <View
                  style={[
                    s.dayBar,
                    { height: `${Math.max(4, pct)}%` },
                    isPeak && s.dayBarPeak,
                  ]}
                />
              </View>
              <Text style={s.dayLabel}>{day}</Text>
            </View>
          );
        })}
      </View>

      {/* Time of day */}
      <Text style={s.sectionTitle}>Peak Hours {"·"} trips</Text>
      <View style={s.timesCol}>
        {TIME_SLOTS.map((slot, i) => {
          const pct = maxTime > 0 ? (patterns.timeOfDay[i] / maxTime) * 100 : 0;
          const isPeak = patterns.timeOfDay[i] === maxTime && maxTime > 0;
          return (
            <View key={slot.label} style={s.timeRow}>
              <Ionicons
                name={slot.icon}
                size={14}
                color={isPeak ? "#f5a623" : "#64748b"}
                style={{ width: 18 }}
              />
              <View style={s.timeLabelWrap}>
                <Text style={[s.timeLabel, isPeak && s.timeLabelPeak]}>
                  {slot.label}
                </Text>
                <Text style={s.timeRange}>{slot.range}</Text>
              </View>
              <View style={s.timeBarWrap}>
                <View
                  style={[
                    s.timeBar,
                    { width: `${Math.max(4, pct)}%` },
                    isPeak && s.timeBarPeak,
                  ]}
                />
              </View>
              <Text style={[s.timeCount, isPeak && s.timeCountPeak]}>
                {patterns.timeOfDay[i]}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Insight callout */}
      {maxDay > 0 && maxTime > 0 && (() => {
        const peakDayIdx = patterns.dayOfWeek.findIndex((c) => c === maxDay);
        const peakTimeIdx = patterns.timeOfDay.findIndex((c) => c === maxTime);
        if (peakDayIdx < 0 || peakTimeIdx < 0) return null;
        const peakDay = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][peakDayIdx];
        const peakSlot = TIME_SLOTS[peakTimeIdx];
        return (
          <View style={s.insight}>
            <Ionicons name="bulb-outline" size={13} color="#f5a623" />
            <Text style={s.insightText}>
              You drive most on {peakDay} during the {peakSlot.label.toLowerCase()} ({peakSlot.range}).
            </Text>
          </View>
        );
      })()}

      {/* Average */}
      <View style={s.avgRow}>
        <Text style={s.avgValue}>{patterns.avgTripsPerWeek}</Text>
        <Text style={s.avgLabel}>trips per week on average</Text>
      </View>

      {/* Top places */}
      {patterns.topPlaces.length > 0 && (
        <View style={s.places}>
          <Text style={s.sectionTitle}>Most Visited</Text>
          {patterns.topPlaces.map((place, i) => (
            <View key={i} style={s.placeRow}>
              <View style={s.placeRank}>
                <Text style={s.placeRankText}>{i + 1}</Text>
              </View>
              <Text style={s.placeName} numberOfLines={1}>{place.name}</Text>
              <Text style={s.placeCount}>{place.count}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#0a1120",
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
    marginBottom: 16,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  heading: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  // Days
  daysRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 90,
    gap: 4,
    marginBottom: 16,
  },
  dayCol: {
    flex: 1,
    alignItems: "center",
    height: "100%",
  },
  dayCount: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#94a3b8",
    marginBottom: 2,
  },
  dayCountPeak: {
    color: "#f5a623",
    fontFamily: "PlusJakartaSans_700Bold",
  },
  dayBarWrap: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
  },
  dayBar: {
    width: "100%",
    backgroundColor: "rgba(245, 166, 35, 0.45)",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    minHeight: 2,
  },
  dayBarPeak: {
    backgroundColor: "#f5a623",
  },
  dayLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#64748b",
    marginTop: 4,
  },
  // Times
  timesCol: {
    gap: 5,
    marginBottom: 14,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeLabelWrap: {
    width: 92,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  timeLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#94a3b8",
  },
  timeLabelPeak: {
    color: "#f5a623",
    fontFamily: "PlusJakartaSans_700Bold",
  },
  timeRange: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
  },
  timeBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 4,
    overflow: "hidden",
  },
  timeBar: {
    height: "100%",
    backgroundColor: "rgba(245, 166, 35, 0.4)",
    borderRadius: 4,
  },
  timeBarPeak: {
    backgroundColor: "#f5a623",
  },
  timeCount: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#64748b",
    width: 22,
    textAlign: "right",
  },
  timeCountPeak: {
    color: "#f5a623",
    fontFamily: "PlusJakartaSans_700Bold",
  },
  insight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245, 166, 35, 0.08)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
  },
  insightText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#e2e8f0",
    lineHeight: 16,
  },
  // Average
  avgRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
    marginBottom: 12,
  },
  avgValue: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
  },
  avgLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
  },
  // Places
  places: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  placeRank: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  placeRankText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
  },
  placeName: {
    flex: 1,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#f0f2f5",
  },
  placeCount: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#64748b",
  },
});
