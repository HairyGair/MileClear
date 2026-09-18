// PauseRecordingRow: one quiet line under the Start Trip buttons.
//
// Not paused: "Pause recording" in the muted text colour, with the battery
// fact in the sheet it opens, because people assume far worse than 2 to 4%
// over a shift. Paused: an amber line saying until when, and Resume. The
// choices have ends on purpose; see lib/tracking/pauseRule.ts.

import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../lib/theme";
import { describePause, pauseChoices, type PauseChoice } from "../lib/tracking/pauseRule";

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
      <View style={s.pausedRow} accessibilityRole="text">
        <Ionicons name="pause-circle" size={16} color={colors.amber} accessible={false} />
        <Text style={s.pausedText}>{describePause(pausedUntil, now)}</Text>
        <TouchableOpacity
          onPress={onResume}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: "rgba(245, 166, 35, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.30)",
  },
  pausedText: { flex: 1, fontSize: 13, fontFamily: fonts.semibold, color: colors.amber },
  resumeText: { fontSize: 13, fontFamily: fonts.bold, color: colors.amber },
});
