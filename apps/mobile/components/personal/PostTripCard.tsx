import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { LastSavedTrip } from "../../lib/events/lastTrip";

interface PostTripCardProps {
  trip: LastSavedTrip;
  /** Optional insight line, e.g. "Your longest trip this week!" */
  insight?: string | null;
  onDismiss: () => void;
}

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";

export function PostTripCard({ trip, insight, onDismiss }: PostTripCardProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss after 15 seconds
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onDismiss());
    }, 15000);

    return () => clearTimeout(timer);
  }, []);

  const milesStr =
    trip.distanceMiles < 10
      ? trip.distanceMiles.toFixed(1)
      : Math.round(trip.distanceMiles).toString();

  const locationLine = [trip.startAddress, trip.endAddress]
    .filter(Boolean)
    .join(" \u2192 ");

  return (
    <Animated.View
      style={[styles.card, { opacity, transform: [{ translateY }] }]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-circle" size={20} color="#34c759" />
      </View>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.title}>Trip saved</Text>
          <Text style={styles.distance}>{milesStr} mi</Text>
        </View>
        {locationLine ? (
          <Text style={styles.route} numberOfLines={1}>
            {locationLine}
          </Text>
        ) : null}
        {insight ? (
          <Text style={styles.insight}>{insight}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0a1120",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(52, 199, 89, 0.2)",
    ...Platform.select({
      ios: {
        shadowColor: "#34c759",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
    }),
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(52, 199, 89, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  distance: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: AMBER,
  },
  route: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginBottom: 2,
  },
  insight: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: AMBER,
    marginTop: 4,
  },
});
