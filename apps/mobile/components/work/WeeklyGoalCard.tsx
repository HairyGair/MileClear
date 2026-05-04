import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchWeeklyProgress, updateProfile } from "../../lib/api/user";
import type { WeeklyProgress } from "@mileclear/shared";
import { colors, fonts } from "../../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const BG = colors.bg;
const GREEN = colors.green;

const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const CARD_BG = colors.surface;
const CARD_BORDER = "rgba(255,255,255,0.05)";

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

export function WeeklyGoalCard() {
  const [progress, setProgress] = useState<WeeklyProgress | null>(null);
  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchWeeklyProgress();
      setProgress(res.data);
      if (res.data.goalPence) setGoalInput(String(res.data.goalPence / 100));
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    const pence = goalInput.trim() ? Math.round(parseFloat(goalInput) * 100) : null;
    if (pence !== null && (isNaN(pence) || pence <= 0)) return;
    setSaving(true);
    try {
      await updateProfile({ weeklyEarningsGoalPence: pence });
      await load();
      setEditing(false);
    } catch {}
    setSaving(false);
  }, [goalInput, load]);

  if (!progress) return null;

  const pct = progress.progressPercent ?? 0;
  const hasGoal = progress.goalPence !== null && progress.goalPence > 0;

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="flag" size={16} color={AMBER} accessible={false} />
          <Text style={s.title}>Weekly Earnings</Text>
        </View>
        <TouchableOpacity onPress={() => setEditing((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={hasGoal ? "Edit weekly goal" : "Set weekly goal"}>
          <Text style={s.editBtn}>{hasGoal ? "Edit" : "Set target"}</Text>
        </TouchableOpacity>
      </View>

      {editing && (
        <View style={s.editRow}>
          <TextInput
            style={s.input}
            value={goalInput}
            onChangeText={setGoalInput}
            placeholder="e.g. 500"
            placeholderTextColor={TEXT_3}
            keyboardType="numeric"
            accessibilityLabel="Weekly earnings goal in pounds"
          />
          <Text style={s.perWeek}>/week</Text>
          <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving} accessibilityRole="button" accessibilityLabel="Save goal">
            <Text style={s.saveBtnText}>{saving ? "..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={s.amount}>
        {formatPence(progress.currentWeekEarningsPence)}
        {hasGoal && (
          <Text style={s.target}> / {formatPence(progress.goalPence!)} target</Text>
        )}
      </Text>

      {hasGoal && (
        <View style={s.barWrap}>
          <View style={s.barBg}>
            <View style={[s.barFill, {
              width: `${Math.min(100, pct)}%`,
              backgroundColor: pct >= 100 ? GREEN : AMBER,
            }]} />
          </View>
          <View style={s.barMeta}>
            <Text style={s.barPct}>{pct}%</Text>
            {pct >= 100 ? (
              <Text style={[s.barPct, { color: GREEN }]}>Goal reached!</Text>
            ) : (
              <Text style={s.barPct}>{formatPence(progress.goalPence! - progress.currentWeekEarningsPence)} to go</Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 14, fontFamily: fonts.semibold, color: TEXT_1 },
  editBtn: { fontSize: 13, fontFamily: fonts.medium, color: AMBER },
  editRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  input: {
    width: 90,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_1,
    backgroundColor: BG,
  },
  perWeek: { fontSize: 13, fontFamily: fonts.regular, color: TEXT_2 },
  saveBtn: { backgroundColor: AMBER, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  saveBtnText: { fontSize: 13, fontFamily: fonts.bold, color: BG },
  amount: { fontSize: 22, fontFamily: fonts.bold, color: TEXT_1 },
  target: { fontSize: 13, fontFamily: fonts.regular, color: TEXT_2 },
  barWrap: { marginTop: 10 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  barMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  barPct: { fontSize: 11, fontFamily: fonts.medium, color: TEXT_3 },
});
