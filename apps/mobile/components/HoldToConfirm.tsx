// HoldToConfirm — destructive-action button that requires a hold gesture.
//
// Replaces the "tap-then-Alert.alert-confirmation" pattern for actions where
// accidental taps are dangerous. The active-recording End-trip is the
// canonical use case: drivers tap their phone in a car cradle and an
// accidental bounce can fire End trip in a heartbeat. Holding for ~1.5s
// while a ring fills around the icon is much harder to do by accident.
//
// On press-in: animation starts, light warning haptic.
// On press-out before complete: animation cancels, ring resets.
// On animation complete: success haptic, onConfirm fires.

import { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii, spacing } from "../lib/theme";
import { haptic } from "../lib/haptics";

interface HoldToConfirmProps {
  /** Resting label, e.g. "End trip and save". */
  label: string;
  /** Label shown while holding, e.g. "Hold to end". */
  holdingLabel?: string;
  /** Ionicons glyph to render alongside the label. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Hold duration in milliseconds. Defaults to 1500ms. */
  durationMs?: number;
  /** Fired when the hold completes. */
  onConfirm: () => void;
  /** Loading spinner replaces the icon when true. Disables interaction. */
  loading?: boolean;
  style?: ViewStyle;
}

export function HoldToConfirm({
  label,
  holdingLabel = "Hold to confirm",
  icon = "stop-circle",
  durationMs = 1500,
  onConfirm,
  loading = false,
  style,
}: HoldToConfirmProps) {
  const fill = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const completedRef = useRef(false);

  const handlePressIn = () => {
    if (loading) return;
    completedRef.current = false;
    setHolding(true);
    haptic("warning");
    Animated.timing(fill, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !completedRef.current) {
        completedRef.current = true;
        haptic("success");
        onConfirm();
      }
      setHolding(false);
      fill.setValue(0);
    });
  };

  const handlePressOut = () => {
    if (completedRef.current) return;
    fill.stopAnimation();
    Animated.timing(fill, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start(() => setHolding(false));
  };

  const widthPct = fill.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Press and hold to confirm.`}
      accessibilityState={{ disabled: loading, busy: holding }}
      style={[styles.button, style]}
    >
      {/* Animated fill bar that grows left-to-right. Sits behind the label. */}
      <Animated.View style={[styles.fill, { width: widthPct }]} />
      <View style={styles.contentRow}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.bg} />
        ) : (
          <Ionicons name={icon} size={20} color={colors.bg} />
        )}
        <Text style={styles.label}>
          {loading ? "Saving…" : holding ? holdingLabel : label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.amberDim,
    borderWidth: 1,
    borderColor: colors.amberGlow,
    overflow: "hidden",
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.amber,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  label: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.bg,
  },
});
