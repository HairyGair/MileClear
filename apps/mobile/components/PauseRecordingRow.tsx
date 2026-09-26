// PauseRecordingRow: one quiet line under the Start Trip buttons.
//
// Not paused: "Pause recording" in the muted text colour, with the battery
// fact in the sheet it opens, because people assume far worse than 2 to 4%
// over a shift. Paused: an amber warning pill, "Recording paused until Thu 1
// Oct", with a solid Resume button. It used to be a quiet amber line, and on
// 26 Sep 2026 Peter drove two working days past it without noticing, so it
// now reads as a warning at a glance. The choices have ends on purpose; see
// lib/tracking/pauseRule.ts.

import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../lib/theme";
import { pauseChoices, pausedRowText, type PauseChoice } from "../lib/tracking/pauseRule";

interface Props {
  /** Epoch ms when the pause ends, or null when recording is on. */
  pausedUntil: number | null;
  now: number;
  onPause: (choice: PauseChoice) => void;
  onResume: () => void;
}

export function PauseRecordingRow({ pausedUntil, now, onPause, onResume }: Props) {
  if (pausedUntil !== null) {
    return (
      <View style={s.pausedRow}>
        <Ionicons name="pause-circle" size={20} color={colors.amber} accessible={false} />
        <Text style={s.pausedText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
          {pausedRowText(pausedUntil, now)}
        </Text>
        <TouchableOpacity
          style={s.resumeBtn}
          onPress={onResume}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Resume recording now"
        >
          <Text style={s.resumeText}>Resume</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ask = () => {
    const choices = pauseChoices(Date.now());
    Alert.alert(
      "Pause recording?",
      "MileClear uses about 2 to 4% of battery over an 8-hour shift. Recording comes back on by itself when the pause ends. You can still add trips by hand.",
      [
        ...choices.map((c) => ({ text: c.label, onPress: () => onPause(c) })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={s.row}
      onPress={ask}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Pause recording"
    >
      <Ionicons name="pause-outline" size={14} color={colors.text3} accessible={false} />
      <Text style={s.rowText}>Pause recording</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    marginBottom: 6,
  },
  rowText: { fontSize: 12, fontFamily: fonts.medium, color: colors.text3 },
  pausedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    marginBottom: 10,
    borderRadius: 999,
    backgroundColor: colors.amberDim,
    borderWidth: 1,
    borderColor: colors.amberGlow,
  },
  pausedText: { flex: 1, fontSize: 14, fontFamily: fonts.bold, color: colors.text1 },
  resumeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.amber,
  },
  resumeText: { fontSize: 13, fontFamily: fonts.bold, color: colors.bg },
});
