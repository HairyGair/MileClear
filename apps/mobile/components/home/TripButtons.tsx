// Start Trip (the one amber button on Home) and, for gig and Both drivers in
// Work mode, Start Shift beside it as a dark button with an amber icon
// (SPEC-VISUAL 5.4). At large text or on a narrow phone they stack.

import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

interface Props {
  showShift: boolean;
  starting: boolean;
  onStartTrip: () => void;
  onStartShift: () => void;
}

export function TripButtons({ showShift, starting, onStartTrip, onStartShift }: Props) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = showShift && (fontScale > 1.3 || width < 380);

  const trip = (
    <Pressable
      onPress={onStartTrip}
      style={({ pressed }) => [s.btn, s.trip, !stacked && showShift && { flex: 3 }, pressed && s.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Start Trip"
    >
      <Ionicons name="navigate" size={20} color={colors.bg} accessible={false} />
      <Text style={s.tripText} maxFontSizeMultiplier={fontScaleCap.heading} numberOfLines={1}>Start Trip</Text>
    </Pressable>
  );

  if (!showShift) return <View>{trip}</View>;

  const shift = (
    <Pressable
      onPress={onStartShift}
      disabled={starting}
      style={({ pressed }) => [s.btn, s.shift, !stacked && { flex: 2 }, pressed && s.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Start Shift"
      accessibilityState={{ disabled: starting, busy: starting }}
    >
      {starting ? (
        <ActivityIndicator size="small" color={colors.amber} />
      ) : (
        <Ionicons name="play" size={18} color={colors.amber} accessible={false} />
      )}
      <Text style={s.shiftText} maxFontSizeMultiplier={fontScaleCap.heading} numberOfLines={1}>Start Shift</Text>
    </Pressable>
  );

  return <View style={stacked ? s.stack : s.row}>{trip}{shift}</View>;
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  stack: { gap: 8 },
  btn: {
    minHeight: 56,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  trip: { backgroundColor: colors.amber },
  tripText: { fontSize: 16, fontFamily: fonts.bold, color: colors.bg },
  shift: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  shiftText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
});
