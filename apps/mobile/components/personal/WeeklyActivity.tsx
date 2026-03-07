import { View, Text, StyleSheet } from "react-native";

interface DayData {
  label: string;
  miles: number;
  isToday: boolean;
}

interface WeeklyActivityProps {
  days: DayData[];
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const BAR_MAX_HEIGHT = 48;

export function WeeklyActivity({ days }: WeeklyActivityProps) {
  const maxMiles = Math.max(...days.map((d) => d.miles), 1);
  const totalMiles = days.reduce((sum, d) => sum + d.miles, 0);
  const activeDays = days.filter((d) => d.miles > 0).length;

  if (totalMiles === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>This Week</Text>
        <Text style={styles.subtitle}>
          {activeDays} {activeDays === 1 ? "day" : "days"} active
        </Text>
      </View>

      <View style={styles.barRow}>
        {days.map((day, i) => {
          const height = day.miles > 0
            ? Math.max((day.miles / maxMiles) * BAR_MAX_HEIGHT, 4)
            : 2;
          const isEmpty = day.miles === 0;

          return (
            <View key={i} style={styles.barCol}>
              <View style={styles.barContainer}>
                {!isEmpty && day.miles >= 1 && (
                  <Text style={styles.barValue}>{day.miles.toFixed(0)}</Text>
                )}
                <View
                  style={[
                    styles.bar,
                    {
                      height,
                      backgroundColor: isEmpty
                        ? "rgba(255,255,255,0.04)"
                        : day.isToday
                          ? "#f5a623"
                          : "rgba(245, 166, 35, 0.4)",
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.dayLabel,
                  day.isToday && styles.dayLabelToday,
                ]}
              >
                {DAY_LABELS[i]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function buildWeekDays(trips: Array<{ startedAt: string; distanceMiles: number }>): DayData[] {
  const now = new Date();
  const todayDow = now.getDay(); // 0=Sun
  // Monday-based: Mon=0 .. Sun=6
  const mondayOffset = todayDow === 0 ? 6 : todayDow - 1;

  const monday = new Date(now);
  monday.setDate(monday.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const days: DayData[] = DAY_LABELS.map((label, i) => {
    const dayDate = new Date(monday);
    dayDate.setDate(dayDate.getDate() + i);
    return {
      label,
      miles: 0,
      isToday: i === mondayOffset,
    };
  });

  for (const trip of trips) {
    const tripDate = new Date(trip.startedAt);
    const diffMs = tripDate.getTime() - monday.getTime();
    const dayIndex = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (dayIndex >= 0 && dayIndex < 7) {
      days[dayIndex].miles += trip.distanceMiles;
    }
  }

  return days;
}

const styles = StyleSheet.create({
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
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
  },
  barRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 4,
  },
  barCol: {
    alignItems: "center",
    flex: 1,
  },
  barContainer: {
    alignItems: "center",
    justifyContent: "flex-end",
    height: BAR_MAX_HEIGHT + 16,
  },
  bar: {
    width: 20,
    borderRadius: 6,
    minHeight: 2,
  },
  barValue: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
    marginBottom: 3,
  },
  dayLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#64748b",
    marginTop: 6,
  },
  dayLabelToday: {
    color: "#f5a623",
    fontFamily: "PlusJakartaSans_700Bold",
  },
});
