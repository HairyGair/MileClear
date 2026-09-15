// "Looks like a shift": a run of recent trips the server clustered into a
// work session the driver never recorded as a shift.
//
// Only 152 of the 626 drivers active in the last 30 days (15 Sep 2026) ever
// pressed Start Shift, so the shift scorecard sat unused by the rest. This
// card offers the session instead: one tap on "Grade it" creates the shift,
// attaches the trips and shows the scorecard; "Not a shift" hides it for
// good. One suggestion at a time, newest first, and nothing at all when the
// server has none, so it stays invisible for the common case.
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import type { ShiftScorecard } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";
import {
  fetchShiftSuggestions,
  resolveShiftSuggestion,
  type ShiftSuggestion,
} from "../lib/api/shifts";

interface Props {
  /** Called with the new shift's scorecard once "Grade it" succeeds. When
   *  the caller has nowhere to show it, the card opens the Shifts screen. */
  onGraded?: (scorecard: ShiftScorecard | null, shiftId: string) => void;
}

function clockTime(d: Date): string {
  const h24 = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, "0");
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mins}${h24 < 12 ? "am" : "pm"}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "6 trips, 4:10pm to 10:35pm, 38 miles", with the day in front when it
 *  was not today. */
export function describeSuggestion(s: ShiftSuggestion, now: Date = new Date()): string {
  const start = new Date(s.startedAt);
  const end = new Date(s.endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${s.tripCount} trips, ${Math.round(s.totalMiles)} miles`;
  }
  const day = sameDay(start, now)
    ? ""
    : `${start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, `;
  const miles = s.totalMiles < 10 ? s.totalMiles.toFixed(1) : String(Math.round(s.totalMiles));
  return `${s.tripCount} trips, ${day}${clockTime(start)} to ${clockTime(end)}, ${miles} miles`;
}

export function ShiftSuggestionCard({ onGraded }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ShiftSuggestion[]>([]);
  const [busy, setBusy] = useState<"accept" | "dismiss" | null>(null);

  const load = useCallback(() => {
    fetchShiftSuggestions()
      .then((r) => setItems(r.suggestions ?? []))
      .catch(() => {});
  }, []);

  // Re-scan whenever the dashboard regains focus, so a session the driver
  // has since started a shift for, or classified as personal, drops out.
  useFocusEffect(load);

  const current = items[0];
  if (!current) return null;

  const grade = async () => {
    if (busy) return;
    setBusy("accept");
    try {
      const res = await resolveShiftSuggestion(current.id, "accept");
      setItems((prev) => prev.filter((p) => p.id !== current.id));
      if (res.skipped) return;
      if (onGraded) {
        onGraded(res.scorecard ?? null, res.shiftId ?? "");
      } else {
        router.push("/shifts");
      }
    } catch {
      load(); // restore truth on failure
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async () => {
    if (busy) return;
    setBusy("dismiss");
    setItems((prev) => prev.filter((p) => p.id !== current.id)); // optimistic
    try {
      await resolveShiftSuggestion(current.id, "dismiss");
    } catch {
      load();
    } finally {
      setBusy(null);
    }
  };

  const remaining = items.length - 1;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.header}>
        <Ionicons name="time-outline" size={16} color={colors.amber} accessible={false} />
        <Text style={styles.headerText}>Looks like a shift</Text>
        {remaining > 0 && (
          <Text style={styles.remaining}>+{remaining} more</Text>
        )}
      </View>
      <Text style={styles.summary}>{describeSuggestion(current)}</Text>
      <Text style={styles.hint}>
        Grade it to see your shift score, and your miles and deduction for the session.
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.gradeBtn, busy === "accept" && styles.btnBusy]}
          onPress={grade}
          disabled={busy !== null}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Grade it. ${describeSuggestion(current)}`}
        >
          {busy === "accept" ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <Text style={styles.gradeText}>Grade it</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={dismiss}
          disabled={busy !== null}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Not a shift"
        >
          {busy === "dismiss" ? (
            <ActivityIndicator size="small" color={colors.text3} />
          ) : (
            <Text style={styles.dismissText}>Not a shift</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  headerText: {
    color: colors.text1,
    fontFamily: fonts.bold,
    fontSize: 14,
    flex: 1,
  },
  remaining: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  summary: {
    color: colors.text1,
    fontFamily: fonts.medium,
    fontSize: 14.5,
  },
  hint: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    marginTop: 3,
    lineHeight: 17,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  gradeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.amber,
    minWidth: 92,
    alignItems: "center",
  },
  btnBusy: {
    opacity: 0.8,
  },
  gradeText: {
    color: colors.bg,
    fontFamily: fonts.bold,
    fontSize: 13.5,
  },
  dismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    minWidth: 100,
    alignItems: "center",
  },
  dismissText: {
    color: colors.text2,
    fontFamily: fonts.medium,
    fontSize: 13.5,
  },
});
