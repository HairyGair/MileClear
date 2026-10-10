// The small Work | Personal switch that replaces the big toggle (Oct 2026).
// A setting, not an action, so it is slate, not amber (SPEC-VISUAL 5.1).
// Sits in the header next to the avatar; on a narrow phone or at large text it
// moves to its own full-width row under the header (variant="row").

import { View, Text, Pressable, StyleSheet } from "react-native";
import { useMode } from "../../lib/mode/context";
import type { AppMode } from "../../lib/mode/index";
import { haptic } from "../../lib/haptics";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

const SEGMENTS: { label: string; value: AppMode }[] = [
  { label: "Work", value: "work" },
  { label: "Personal", value: "personal" },
];

interface Props {
  variant?: "header" | "row";
  /** Told when the driver taps a segment (for measurement). */
  onChange?: (mode: AppMode) => void;
}

export function ModePill({ variant = "header", onChange }: Props) {
  const { mode, setMode } = useMode();
  const row = variant === "row";

  return (
    <View
      style={[s.track, row && s.trackRow]}
      accessibilityRole="tablist"
      accessibilityLabel="Mode"
    >
      {SEGMENTS.map((seg) => {
        const active = mode === seg.value;
        return (
          <Pressable
            key={seg.value}
            style={[s.segment, row && s.segmentRow, active && s.segmentActive]}
            onPress={() => {
              if (active) return;
              haptic("selection");
              setMode(seg.value);
              onChange?.(seg.value);
            }}
            hitSlop={row ? undefined : { top: 7, bottom: 7, left: 0, right: 0 }}
            accessibilityRole="tab"
            accessibilityLabel={`${seg.label} mode`}
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[s.label, active && s.labelActive]}
              maxFontSizeMultiplier={fontScaleCap.display}
              numberOfLines={1}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    flexDirection: "row",
    height: 30,
    padding: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  trackRow: { height: 36, alignSelf: "stretch" },
  segment: {
    paddingHorizontal: 12,
    minWidth: 52,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  segmentRow: { flex: 1 },
  segmentActive: { backgroundColor: colors.personal, borderColor: colors.personalEdge },
  label: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text2 },
  labelActive: { color: colors.text1 },
});
