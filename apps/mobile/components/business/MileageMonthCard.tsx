import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchTrips } from "../../lib/api/trips";
import type { TripClassification } from "@mileclear/shared";

interface MileageMonthCardProps {
  /**
   * Classification to filter on. Defaults to "business" so this card lives
   * happily on the work dashboard. Pass "personal" or omit (undefined) for
   * other surfaces.
   */
  classification?: TripClassification;
  /** Optional override for the card title. Default derives from classification. */
  title?: string;
}

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function formatMilesHero(miles: number): string {
  if (miles < 100) return miles.toFixed(1);
  return Math.round(miles).toLocaleString("en-GB");
}

export function MileageMonthCard({
  classification = "business",
  title,
}: MileageMonthCardProps) {
  // 0 = current month, -1 = last month, etc.
  const [offset, setOffset] = useState(0);
  const [miles, setMiles] = useState(0);
  const [trips, setTrips] = useState(0);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + offset + 1,
    0,
    23,
    59,
    59
  );
  const monthLabel = formatMonthLabel(monthStart);
  const isCurrent = offset === 0;
  const canGoForward = offset < 0;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTrips({
      classification,
      from: monthStart.toISOString(),
      to: monthEnd.toISOString(),
      pageSize: 200,
    })
      .then((res) => {
        if (cancelled) return;
        const totalMiles = res.data.reduce(
          (sum, t) => sum + t.distanceMiles,
          0
        );
        setMiles(totalMiles);
        setTrips(res.total);
      })
      .catch(() => {
        if (!cancelled) {
          setMiles(0);
          setTrips(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offset, classification]);

  const goPrev = useCallback(() => setOffset((o) => o - 1), []);
  const goNext = useCallback(() => {
    setOffset((o) => (o < 0 ? o + 1 : o));
  }, []);

  const headerLabel =
    title ??
    (classification === "business"
      ? "BUSINESS MILEAGE"
      : classification === "personal"
        ? "PERSONAL MILEAGE"
        : "MILEAGE");

  const avgPerTrip = trips > 0 ? miles / trips : 0;

  return (
    <View style={styles.card}>
      {/* Header with title + nav arrows */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={goPrev}
          hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={styles.navBtn}
        >
          <Ionicons name="chevron-back" size={20} color={TEXT_2} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.label}>{headerLabel}</Text>
          <Text style={styles.monthLabel}>{monthLabel.toUpperCase()}</Text>
        </View>
        <TouchableOpacity
          onPress={goNext}
          disabled={!canGoForward}
          hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canGoForward }}
          style={styles.navBtn}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={canGoForward ? TEXT_2 : "rgba(132,148,167,0.25)"}
          />
        </TouchableOpacity>
      </View>

      {/* Hero number */}
      <View style={styles.heroRow}>
        {loading ? (
          <View style={styles.heroLoading}>
            <ActivityIndicator color={AMBER} size="small" />
          </View>
        ) : (
          <>
            <Text style={styles.heroValue}>{formatMilesHero(miles)}</Text>
            <Text style={styles.heroUnit}>miles</Text>
          </>
        )}
      </View>

      {/* Sub-stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{trips}</Text>
          <Text style={styles.statLabel}>{trips === 1 ? "trip" : "trips"}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{avgPerTrip.toFixed(1)}</Text>
          <Text style={styles.statLabel}>mi / trip</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, !isCurrent && styles.completeText]}>
            {isCurrent ? "in progress" : "complete"}
          </Text>
          <Text style={styles.statLabel}>
            {isCurrent ? "this month" : "month"}
          </Text>
        </View>
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
  navBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  label: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    letterSpacing: 0.8,
  },
  monthLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: AMBER,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 6,
    marginBottom: 16,
    minHeight: 46,
  },
  heroLoading: {
    height: 46,
    justifyContent: "center",
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
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    letterSpacing: -0.3,
  },
  completeText: {
    color: "#10b981",
    fontSize: 12,
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
