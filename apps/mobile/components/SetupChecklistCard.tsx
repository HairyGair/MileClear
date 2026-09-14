// SetupChecklistCard — the five permission nags, as one card with a finish line.
//
// Until 14 Sep 2026 the dashboard carried five separate amber cards (Always
// location, Motion & Fitness, notifications denied, notifications primer,
// battery optimisation). Each snoozed for 7 days and then came back on its
// own cadence, so a driver could clear one and meet the next, indefinitely,
// with no sense of progress or of ever being finished.
//
// One card, a count, and a tick per row. When every row is done it disappears
// for good, because there is nothing left to ask for.
//
// Usage:
//   <SetupChecklistCard
//     items={rows}
//     done={messages.setup.done}
//     total={messages.setup.total}
//   />

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../lib/theme";

export interface SetupChecklistRow {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** One short line. The row is not the place to explain at length. */
  hint: string;
  done: boolean;
  /** Waiting on an earlier step (chasing Motion before location is sorted
   *  asks for the wrong thing first), so it renders muted and inert. */
  actionable: boolean;
  onPress?: () => void;
}

interface Props {
  rows: SetupChecklistRow[];
  done: number;
  total: number;
  /** Optional. Omitted, the card stays until it is genuinely finished. */
  onSnooze?: () => void;
}

export function SetupChecklistCard({ rows, done, total, onSnooze }: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.iconWrap}>
          <Ionicons name="checkmark-circle-outline" size={20} color={colors.amber} accessible={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Finish setting up</Text>
          <Text style={s.subtitle}>
            {done} of {total} done
          </Text>
        </View>
        {onSnooze ? (
          <TouchableOpacity
            onPress={onSnooze}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Remind me later"
          >
            <Ionicons name="close" size={16} color="#6b7280" accessible={false} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={s.track} accessible={false}>
        <View style={[s.fill, { width: `${pct}%` }]} />
      </View>

      <View style={s.rows}>
        {rows.map((r) => {
          const inert = r.done || !r.actionable || !r.onPress;
          return (
            <TouchableOpacity
              key={r.key}
              style={s.row}
              onPress={r.onPress}
              disabled={inert}
              activeOpacity={0.7}
              accessibilityRole={inert ? "text" : "button"}
              accessibilityLabel={
                r.done ? `${r.label}, done` : `${r.label}. ${r.hint}`
              }
            >
              <Ionicons
                name={r.done ? "checkmark-circle" : r.icon}
                size={18}
                color={r.done ? colors.green : r.actionable ? colors.amber : colors.text3}
                accessible={false}
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.rowLabel, r.done && s.rowLabelDone]} numberOfLines={1}>
                  {r.label}
                </Text>
                {!r.done ? <Text style={s.rowHint}>{r.hint}</Text> : null}
              </View>
              {!r.done && r.actionable ? (
                <Ionicons name="chevron-forward" size={14} color={colors.amber} accessible={false} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "rgba(245, 166, 35, 0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.18)",
    padding: 14,
    marginBottom: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245, 166, 35, 0.14)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  subtitle: { fontSize: 12, fontFamily: fonts.regular, color: colors.text3, marginTop: 1 },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginTop: 12,
    overflow: "hidden",
  },
  fill: { height: 3, borderRadius: 2, backgroundColor: colors.amber },
  rows: { marginTop: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
  },
  rowLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.text1 },
  rowLabelDone: { color: colors.text3 },
  rowHint: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.text3,
    marginTop: 1,
    lineHeight: 15,
  },
});
