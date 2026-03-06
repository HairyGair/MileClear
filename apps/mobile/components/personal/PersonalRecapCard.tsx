import { useRef, useState } from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RecapShareCard, captureAndShareRecap } from "./ShareableRecap";
import type { RecapShareCardProps } from "./ShareableRecap";

interface PersonalRecapCardProps {
  monthMiles: number;
  monthTrips: number;
  prevMonthMiles: number | null;
  prevMonthTrips: number | null;
  busiestDay: string | null;
  avgTripMiles: number;
  monthLabel: string;
  totalMiles: number;
  deductionPence: number;
  // Yearly (tax year) data
  yearMiles: number;
  yearTrips: number;
  yearDeductionPence: number;
  yearBusinessMiles: number;
  taxYear: string;
  yearBusiestMonth: string | null;
  // Daily data
  todayMiles?: number;
  todayTrips?: number;
  todayDeductionPence?: number;
}

function formatMilesCompact(miles: number): string {
  if (miles < 100) return miles.toFixed(1);
  return Math.round(miles).toLocaleString("en-GB");
}

function getMilesChangeLabel(
  current: number,
  prev: number,
  prevMonthLabel: string
): { text: string; direction: "up" | "down" | "same" } {
  if (prev === 0) return { text: "", direction: "same" };
  const diff = current - prev;
  const pct = Math.round(Math.abs(diff / prev) * 100);
  if (pct < 1) return { text: `Same as ${prevMonthLabel}`, direction: "same" };
  if (diff < 0) {
    return {
      text: `${pct}% fewer miles than ${prevMonthLabel}`,
      direction: "down",
    };
  }
  return {
    text: `${pct}% more miles than ${prevMonthLabel}`,
    direction: "up",
  };
}

function getTripsChangeLabel(
  current: number,
  prev: number,
  prevMonthLabel: string
): string {
  const diff = current - prev;
  if (diff === 0) return `Same trips as ${prevMonthLabel}`;
  const abs = Math.abs(diff);
  if (diff > 0)
    return `${abs} more ${abs === 1 ? "trip" : "trips"} than ${prevMonthLabel}`;
  return `${abs} fewer ${abs === 1 ? "trip" : "trips"} than ${prevMonthLabel}`;
}

function getMonthlyDistanceEquivalent(miles: number): { text: string; icon: string } | null {
  if (miles < 1) return null;
  // Fun UK-centric comparisons, ascending
  if (miles >= 2000) return { text: `That's like driving Land's End to John o' Groats ${Math.round(miles / 874)} times`, icon: "globe-outline" };
  if (miles >= 874) return { text: "You drove the length of Britain — Land's End to John o' Groats!", icon: "globe-outline" };
  if (miles >= 500) return { text: `That's like ${Math.round(miles / 210)} trips to Paris from London`, icon: "airplane-outline" };
  if (miles >= 250) return { text: `Equivalent to driving London to Edinburgh`, icon: "map-outline" };
  if (miles >= 100) return { text: `That's about ${Math.round(miles / 60)} trips from London to Brighton`, icon: "car-outline" };
  if (miles >= 50) return { text: `You could've driven across London ${Math.round(miles / 15)} times`, icon: "business-outline" };
  if (miles >= 20) return { text: `About ${Math.round(miles * 20)} laps of a running track`, icon: "footsteps-outline" };
  if (miles >= 5) return { text: `That's about ${Math.round(miles * 100)} football pitches end-to-end`, icon: "football-outline" };
  return { text: `${Math.round(miles * 1760)} yards — every mile counts`, icon: "walk-outline" };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function prevMonthName(current: string): string {
  const idx = MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === current.toLowerCase()
  );
  if (idx === -1) return "last month";
  return MONTH_NAMES[(idx + 11) % 12];
}

export function PersonalRecapCard({
  monthMiles,
  monthTrips,
  prevMonthMiles,
  prevMonthTrips,
  busiestDay,
  avgTripMiles,
  monthLabel,
  totalMiles,
  deductionPence,
  yearMiles,
  yearTrips,
  yearDeductionPence,
  yearBusinessMiles,
  taxYear,
  yearBusiestMonth,
  todayMiles = 0,
  todayTrips = 0,
  todayDeductionPence = 0,
}: PersonalRecapCardProps) {
  const shareCardRef = useRef<View>(null);
  const [view, setView] = useState<"today" | "month" | "year">("today");
  const isToday = view === "today";
  const isYear = view === "year";

  // Monthly insights
  const hasPrev = prevMonthMiles !== null && prevMonthTrips !== null;
  const prevLabel = prevMonthName(monthLabel);
  const milesChange = hasPrev
    ? getMilesChangeLabel(monthMiles, prevMonthMiles!, prevLabel)
    : null;
  const tripsChange =
    hasPrev && prevMonthTrips !== null
      ? getTripsChangeLabel(monthTrips, prevMonthTrips, prevLabel)
      : null;

  // Current view values
  const todayDateLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const displayMiles = isToday ? todayMiles : isYear ? yearMiles : monthMiles;
  const displayTrips = isToday ? todayTrips : isYear ? yearTrips : monthTrips;
  const displayAvg = displayTrips > 0 ? displayMiles / displayTrips : 0;
  const displayDeduction = isToday ? todayDeductionPence : isYear ? yearDeductionPence : deductionPence;
  const displayLabel = isToday ? "Today" : isYear ? `Tax Year ${taxYear}` : `${monthLabel} Recap`;

  const shareData: RecapShareCardProps = {
    period: isToday ? "daily" : isYear ? "yearly" : "monthly",
    monthLabel: isToday ? todayDateLabel : isYear ? `Tax Year ${taxYear}` : monthLabel,
    monthMiles: displayMiles,
    monthTrips: displayTrips,
    avgTripMiles: displayAvg,
    totalMiles,
    busiestDay: isToday || isYear ? null : busiestDay,
    prevMonthMiles: isToday || isYear ? null : prevMonthMiles,
    deductionPence: displayDeduction,
  };

  const handleShare = () => {
    captureAndShareRecap(shareCardRef, shareData);
  };

  return (
    <View>
      {/* Off-screen shareable certificate card — captured as image on share */}
      <View style={styles.offScreen} pointerEvents="none">
        <View ref={shareCardRef} collapsable={false}>
          <RecapShareCard {...shareData} />
        </View>
      </View>

      {/* Visible dashboard card */}
      <View style={styles.card}>
        <View style={styles.topBorder} />

        {/* Header with toggle */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconWrap}>
              <Ionicons name="calendar" size={16} color="#f5a623" />
            </View>
            <Text style={styles.heading}>{displayLabel}</Text>
          </View>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, isToday && styles.toggleBtnActive]}
              onPress={() => setView("today")}
            >
              <Text style={[styles.toggleText, isToday && styles.toggleTextActive]}>Today</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, view === "month" && styles.toggleBtnActive]}
              onPress={() => setView("month")}
            >
              <Text style={[styles.toggleText, view === "month" && styles.toggleTextActive]}>Month</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, isYear && styles.toggleBtnActive]}
              onPress={() => setView("year")}
            >
              <Text style={[styles.toggleText, isYear && styles.toggleTextActive]}>Year</Text>
            </Pressable>
          </View>
        </View>

        {/* Primary stat row */}
        <View style={styles.heroRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroValue}>
              {formatMilesCompact(displayMiles)}
            </Text>
            <Text style={styles.heroUnit}>miles</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroValue}>{displayTrips}</Text>
            <Text style={styles.heroUnit}>
              {displayTrips === 1 ? "trip" : "trips"}
            </Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroValue}>
              {displayAvg < 10
                ? displayAvg.toFixed(1)
                : Math.round(displayAvg)}
            </Text>
            <Text style={styles.heroUnit}>avg mi</Text>
          </View>
        </View>

        {/* Insights */}
        <View style={styles.insightList}>
          {!isToday && !isYear && milesChange && milesChange.text !== "" && (
            <View style={styles.insightRow}>
              <View
                style={[
                  styles.insightIcon,
                  milesChange.direction === "down" && styles.insightIconGreen,
                  milesChange.direction === "up" && styles.insightIconAmber,
                  milesChange.direction === "same" && styles.insightIconNeutral,
                ]}
              >
                <Ionicons
                  name={
                    milesChange.direction === "down"
                      ? "arrow-down"
                      : milesChange.direction === "up"
                        ? "arrow-up"
                        : "remove"
                  }
                  size={12}
                  color={
                    milesChange.direction === "down"
                      ? "#10b981"
                      : milesChange.direction === "up"
                        ? "#f5a623"
                        : "#8494a7"
                  }
                />
              </View>
              <Text style={styles.insightText}>{milesChange.text}</Text>
            </View>
          )}

          {!isToday && !isYear && tripsChange && (
            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconNeutral]}>
                <Ionicons name="navigate" size={12} color="#8494a7" />
              </View>
              <Text style={styles.insightText}>{tripsChange}</Text>
            </View>
          )}

          {!isToday && !isYear && busiestDay && (
            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconAmber]}>
                <Ionicons name="star" size={12} color="#f5a623" />
              </View>
              <Text style={styles.insightText}>
                Your busiest day was{" "}
                <Text style={styles.insightHighlight}>{busiestDay}</Text>
              </Text>
            </View>
          )}

          {/* Yearly insights */}
          {isYear && yearBusinessMiles > 0 && (
            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconGreen]}>
                <Ionicons name="briefcase" size={12} color="#10b981" />
              </View>
              <Text style={styles.insightText}>
                {formatMilesCompact(yearBusinessMiles)} business miles claimed
              </Text>
            </View>
          )}

          {isYear && yearDeductionPence > 0 && (
            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconGreen]}>
                <Ionicons name="cash" size={12} color="#10b981" />
              </View>
              <Text style={styles.insightText}>
                £{(yearDeductionPence / 100).toFixed(2)} HMRC deduction so far
              </Text>
            </View>
          )}

          {isYear && yearBusiestMonth && (
            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconAmber]}>
                <Ionicons name="star" size={12} color="#f5a623" />
              </View>
              <Text style={styles.insightText}>
                Your busiest month was{" "}
                <Text style={styles.insightHighlight}>{yearBusiestMonth}</Text>
              </Text>
            </View>
          )}

          {/* Distance equivalent (both views) */}
          {(() => {
            const equiv = getMonthlyDistanceEquivalent(displayMiles);
            if (!equiv) return null;
            return (
              <View style={styles.insightRow}>
                <View style={[styles.insightIcon, styles.insightIconAmber]}>
                  <Ionicons name={equiv.icon as any} size={12} color="#f5a623" />
                </View>
                <Text style={styles.insightText}>{equiv.text}</Text>
              </View>
            );
          })()}
        </View>

        <View style={styles.separator} />

        {/* Share button */}
        <Pressable
          style={({ pressed }) => [
            styles.shareButton,
            pressed && styles.shareButtonPressed,
          ]}
          onPress={handleShare}
        >
          <Ionicons name="share-outline" size={16} color="#f5a623" />
          <Text style={styles.shareText}>Share Recap</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offScreen: {
    position: "absolute",
    left: -10000,
    top: 0,
  },
  card: {
    backgroundColor: "#0a1120",
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#f5a623",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  topBorder: {
    height: 2,
    backgroundColor: "#f5a623",
    opacity: 0.7,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
  },
  toggleText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#4a5568",
  },
  toggleTextActive: {
    color: "#f5a623",
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  heading: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
    letterSpacing: -0.3,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    paddingVertical: 14,
  },
  heroStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  heroValue: {
    fontSize: 26,
    fontFamily: "PlusJakartaSans_300Light",
    color: "#f5a623",
    letterSpacing: -0.8,
  },
  heroUnit: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
    letterSpacing: 0.2,
  },
  heroDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  insightList: {
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  insightIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  insightIconGreen: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  insightIconAmber: {
    backgroundColor: "rgba(245, 166, 35, 0.1)",
  },
  insightIconNeutral: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  insightText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#8494a7",
    flex: 1,
  },
  insightHighlight: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  shareButtonPressed: {
    opacity: 0.6,
  },
  shareText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
    letterSpacing: 0.1,
  },
});
