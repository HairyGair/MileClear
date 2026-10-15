// HoldToConfirm — destructive-action button that requires a hold gesture.
//
// Replaces the "tap-then-Alert.alert-confirmation" pattern for actions where
// accidental taps are dangerous. The active-recording End-trip is the
// canonical use case: drivers tap their phone in a car cradle and an
// accidental bounce can fire End trip in a heartbeat. Holding for ~1.5s
// while a ring fills around the icon is much harder to do by accident.
//
// On press-in: animation starts, light warning haptic.
// On press-out before complete: animation cancels, ring resets, and the line
// under the button says to keep holding.
// On animation complete: success haptic, onConfirm fires.
//
// The label is amber at rest and navy only where the amber fill sits behind
// it: two copies of the label, the navy one clipped to the fill's width. Until
// 15 Oct 2026 it was navy throughout, about 1.2:1 on the resting button, so
// "Hold to end trip" could only be read while it was being held (Tom, 14 Oct:
// "doesn't give me the ability to end it"). See lib/ui/holdToConfirmRule.ts.

import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  type LayoutRectangle,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii, spacing } from "../lib/theme";
import { haptic } from "../lib/haptics";
import { useScreenReader } from "../lib/accessibility";
import { EARLY_RELEASE_HINT_MS, holdHintText, isEarlyRelease } from "../lib/ui/holdToConfirmRule";

interface HoldToConfirmProps {
  /** Resting label, e.g. "End trip and save". */
  label: string;
  /** Label shown while holding, e.g. "Hold to end". */
  holdingLabel?: string;
  /** Line under the button at rest, e.g. "Press and hold to end the trip". */
  hint?: string;
  /** Line under the button after a press let go too soon. */
  earlyReleaseHint?: string;
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
  hint,
  earlyReleaseHint,
  icon = "stop-circle",
  durationMs = 1500,
  onConfirm,
  loading = false,
  style,
}: HoldToConfirmProps) {
  const fill = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const [releasedEarly, setReleasedEarly] = useState(false);
  const [rowLayout, setRowLayout] = useState<LayoutRectangle | null>(null);
  const completedRef = useRef(false);
  const earlyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenReaderOn = useScreenReader();

  useEffect(
    () => () => {
      if (earlyTimerRef.current) clearTimeout(earlyTimerRef.current);
    },
    []
  );

  // Shorten the hold when a screen reader is on — a sustained 1.5s
  // press is a real motor-accessibility barrier (Switch Control,
  // tremor, Parkinson's). 400ms is still long enough that an
  // accidental tap won't fire, but reachable by users for whom a
  // long hold is genuinely painful. The safety-delay property is
  // preserved (still > a casual tap); the visual fill animation
  // continues to convey progress, which is allowed under WCAG
  // because it's a continuous progress indicator, not a flash.
  const effectiveDuration = screenReaderOn ? 400 : durationMs;

  const handlePressIn = () => {
    if (loading) return;
    completedRef.current = false;
    if (earlyTimerRef.current) clearTimeout(earlyTimerRef.current);
    setReleasedEarly(false);
    setHolding(true);
    haptic("warning");
    Animated.timing(fill, {
      toValue: 1,
      duration: effectiveDuration,
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
    // Say why nothing happened, for a moment, instead of silently resetting.
    if (isEarlyRelease(completedRef.current, loading)) {
      setReleasedEarly(true);
      if (earlyTimerRef.current) clearTimeout(earlyTimerRef.current);
      earlyTimerRef.current = setTimeout(() => setReleasedEarly(false), EARLY_RELEASE_HINT_MS);
    }
  };

  // VoiceOver / TalkBack activation (double-tap) is a deliberate act, not a
  // bump in a cradle, and a screen reader's double-tap is an instant press
  // that can never complete the hold. Confirm on it directly.
  const handleAccessibilityAction = (event: { nativeEvent: { actionName: string } }) => {
    if (event.nativeEvent.actionName !== "activate" || loading) return;
    haptic("success");
    onConfirm();
  };

  const widthPct = fill.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const text = loading ? "Saving…" : holding ? holdingLabel : label;
  const hintText = holdHintText({ loading, holding, releasedEarly, hint, earlyReleaseHint });

  const renderContent = (colour: string) => (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={colour} />
      ) : (
        <Ionicons name={icon} size={20} color={colour} />
      )}
      <Text style={[styles.label, { color: colour }]} numberOfLines={1}>
        {text}
      </Text>
    </>
  );

  return (
    <View style={style}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Double-tap to confirm."
        accessibilityActions={[{ name: "activate", label }]}
        onAccessibilityAction={handleAccessibilityAction}
        accessibilityState={{ disabled: loading, busy: holding || loading }}
        style={styles.button}
      >
        {/* Resting layer: amber words on the faint amber button. */}
        <View
          style={styles.contentRow}
          onLayout={(e) => setRowLayout(e.nativeEvent.layout)}
        >
          {renderContent(colors.amber)}
        </View>
        {/* The fill grows left to right over the resting layer and carries
            a navy copy of the words, clipped to its width, so each letter
            turns navy exactly as the amber reaches it. */}
        <Animated.View
          style={[styles.fill, { width: widthPct }]}
          pointerEvents="none"
        >
          {rowLayout ? (
            <View
              style={[
                styles.contentRow,
                styles.fillContent,
                {
                  left: rowLayout.x,
                  top: rowLayout.y,
                  width: rowLayout.width,
                  height: rowLayout.height,
                },
              ]}
            >
              {renderContent(colors.bg)}
            </View>
          ) : null}
        </Animated.View>
      </Pressable>
      {hintText ? (
        <Text
          style={[styles.hint, releasedEarly && styles.hintEarly]}
          accessibilityLiveRegion="polite"
        >
          {hintText}
        </Text>
      ) : (
        // Keeps the space so the page does not jump while holding.
        <Text style={styles.hint}> </Text>
      )}
    </View>
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
    overflow: "hidden",
    backgroundColor: colors.amber,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  fillContent: {
    position: "absolute",
  },
  label: {
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  hint: {
    marginTop: spacing.xs,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.text3,
    textAlign: "center",
  },
  hintEarly: {
    color: colors.amber,
  },
});
