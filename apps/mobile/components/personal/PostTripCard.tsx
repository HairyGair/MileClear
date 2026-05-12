import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { LastSavedTrip } from "../../lib/events/lastTrip";
import { colors, fonts } from "../../lib/theme";
import { useReducedMotion } from "../../lib/accessibility";

// Local theme aliases — same pattern as the (tabs) screens.
const CARD_BG = colors.surface;

interface PostTripCardProps {
  trip: LastSavedTrip;
  /** Optional insight line, e.g. "Your longest trip this week!" */
  insight?: string | null;
  onDismiss: () => void;
}

const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;

export function PostTripCard({ trip, insight, onDismiss }: PostTripCardProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reducedMotion ? 0 : -20)).current;

  useEffect(() => {
    if (!reducedMotion) {
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
    }

    // Auto-dismiss after 15 seconds. Skips the fade for Reduce Motion
    // users — they get an instant dismiss instead of a 300ms cross-fade.
    const timer = setTimeout(() => {
      if (reducedMotion) {
        onDismiss();
        return;
      }
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onDismiss());
    }, 15000);

    return () => clearTimeout(timer);
  }, [opacity, translateY, onDismiss, reducedMotion]);

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
    backgroundColor: CARD_BG,
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
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  distance: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: AMBER,
  },
  route: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 2,
  },
  insight: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: AMBER,
    marginTop: 4,
  },
});
