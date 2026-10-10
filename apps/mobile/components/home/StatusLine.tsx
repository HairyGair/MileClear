// Home's status line (SPEC-VISUAL 5.2): one row, one message. Fine, live and
// neutral are quiet rows on the screen background; a warning is an amber strip;
// a problem is a red strip with the fix on the right. Every look has its own
// icon or dot shape and plain words, so it reads in greyscale.

import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useReducedMotion } from "../../lib/accessibility";
import type { StatusLine as StatusLineModel } from "../../lib/home/statusLine";
import { colors, fonts, fontScaleCap, motion } from "../../lib/theme";

interface Props {
  model: StatusLineModel;
  /** The row itself was tapped. */
  onPress: () => void;
  /** The verb on the right (Resume). Only the Paused look has its own button. */
  onAction: () => void;
}

const HINTS: Record<StatusLineModel["tap"], string> = {
  live_trip: "Opens the trip being recorded",
  fix: "Shows how to turn recording back on",
  sync_status: "Opens sync status to retry",
  recording_sheet: "Opens recording options",
  low_power_sheet: "Explains what to do",
  setup_sheet: "Opens the setup list",
  trips: "Opens Trips",
};

function LiveDot({ breathe }: { breathe: boolean }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!breathe || reduced) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: motion.pulse / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.pulse / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, reduced, opacity]);
  return <Animated.View style={[s.dot, { opacity }]} accessible={false} />;
}

export function StatusLine({ model, onPress, onAction }: Props) {
  // Tell a screen reader when a problem appears.
  const lastKind = useRef(model.kind);
  useEffect(() => {
    if (lastKind.current !== model.kind && model.red) {
      AccessibilityInfo.announceForAccessibility(model.a11yLabel);
    }
    lastKind.current = model.kind;
  }, [model.kind, model.red, model.a11yLabel]);

  const quiet = model.look === "fine" || model.look === "live" || model.look === "neutral";

  const leading = quiet ? (
    model.look === "neutral" ? (
      <View style={s.ring} accessible={false} />
    ) : (
      <LiveDot breathe={model.look === "live"} />
    )
  ) : (
    <Ionicons
      name={(model.icon ?? "alert-circle") as keyof typeof Ionicons.glyphMap}
      size={model.look === "blocking" ? 20 : 18}
      color={model.look === "blocking" ? colors.red : colors.amber}
      accessible={false}
    />
  );

  const title = (
    <Text style={s.title} maxFontSizeMultiplier={fontScaleCap.body}>
      {model.title}
    </Text>
  );

  const paused = model.kind === "paused" && model.action;

  const main = (
    <Pressable
      onPress={onPress}
      style={s.main}
      accessibilityRole="button"
      accessibilityLabel={paused ? model.title : model.a11yLabel}
      accessibilityHint={paused ? "Opens recording options" : HINTS[model.tap]}
    >
      {leading}
      <View style={s.titleWrap}>{title}</View>
      {!paused && model.look === "blocking" && model.action ? (
        <Text style={s.fix} maxFontSizeMultiplier={fontScaleCap.body}>
          {model.action}
        </Text>
      ) : null}
      {!paused ? (
        <Ionicons name="chevron-forward" size={14} color={colors.text3} accessible={false} />
      ) : null}
    </Pressable>
  );

  return (
    <View
      style={[
        s.row,
        quiet && s.rowQuiet,
        model.look === "warning" && s.rowWarning,
        model.look === "blocking" && s.rowBlocking,
      ]}
    >
      {main}
      {paused ? (
        <Pressable
          onPress={onAction}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={s.resume}
          accessibilityRole="button"
          accessibilityLabel="Resume recording now"
        >
          <Text style={s.resumeText} maxFontSizeMultiplier={fontScaleCap.body}>
            {model.action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  rowQuiet: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowWarning: {
    backgroundColor: colors.amberDim,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  rowBlocking: {
    backgroundColor: colors.redDim,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.redEdge,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingVertical: 6 },
  titleWrap: { flex: 1 },
  title: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1, fontVariant: ["tabular-nums"] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  ring: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.text2 },
  fix: { fontSize: 14, fontFamily: fonts.bold, color: colors.red },
  resume: {
    minHeight: 30,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  resumeText: { fontSize: 13, fontFamily: fonts.bold, color: colors.amber },
});
