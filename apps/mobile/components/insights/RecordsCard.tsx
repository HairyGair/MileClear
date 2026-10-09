// Personal records with dates and a "New" tag (SPEC-UX 3.6, SPEC-VISUAL 5.3).
// Zero records are hidden. Personal mode never shows trips per shift. The API
// does not send a trip id with the longest trip yet, so no cell is a button.

import { Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap, numberSizes } from "../../lib/theme";
import { Skeleton } from "../Skeleton";
import { buildRecords, type RecordsInput, type RecordCell } from "../../lib/insights/records";

const ICONS: Record<RecordCell["key"], keyof typeof Ionicons.glyphMap> = {
  bestDay: "trophy-outline",
  longestTrip: "navigate-outline",
  tripsInShift: "list-outline",
  bestStreak: "flame-outline",
};

interface RecordsCardProps {
  mode: "work" | "personal";
  records: RecordsInput | null;
  loading: boolean;
  range: { start: Date; end: Date };
}

export function RecordsCard({ mode, records, loading, range }: RecordsCardProps) {
  if (loading && !records) {
    return (
      <View style={styles.card}>
        <Skeleton width={100} height={16} />
        <View style={styles.grid}>
          <Skeleton height={96} style={{ flex: 1, minWidth: "45%" }} />
          <Skeleton height={96} style={{ flex: 1, minWidth: "45%" }} />
        </View>
      </View>
    );
  }
  if (!records) return null;

  const cells = buildRecords(records, mode, range);

  return (
    <View style={styles.card}>
      <Text style={styles.title} maxFontSizeMultiplier={fontScaleCap.heading} accessibilityRole="header">
        {mode === "work" ? "Your records" : "Records"}
      </Text>
      {cells.length < 2 ? (
        <View style={styles.empty}>
          <Ionicons name="trophy-outline" size={20} color={colors.text3} />
          <Text style={styles.emptyText} maxFontSizeMultiplier={fontScaleCap.body}>Records start after a few trips.</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {cells.map((c) => (
            <View key={c.key} style={styles.cell} accessible accessibilityLabel={c.spoken}>
              <View style={styles.topRow}>
                <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.display}>{c.label}</Text>
                {c.isNew ? (
                  <View style={styles.newPill}>
                    <Text style={styles.newText} maxFontSizeMultiplier={1}>New</Text>
                  </View>
                ) : (
                  <Ionicons name={ICONS[c.key]} size={16} color={colors.text3} />
                )}
              </View>
              <Text style={styles.value} maxFontSizeMultiplier={fontScaleCap.display}>
                {c.value}
                {c.unit ? <Text style={styles.unit}>{` ${c.unit}`}</Text> : null}
              </Text>
              {c.dateLabel && (
                <Text style={styles.date} maxFontSizeMultiplier={fontScaleCap.display}>{c.dateLabel}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
    marginBottom: 12,
  },
  title: { fontSize: 16, fontFamily: fonts.bold, color: colors.text1, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  cell: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 96,
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 12,
    justifyContent: "space-between",
  },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 6 },
  label: { flex: 1, fontSize: 14, fontFamily: fonts.medium, color: colors.text2 },
  value: { fontSize: numberSizes.stat, fontFamily: fonts.bold, color: colors.text1, fontVariant: ["tabular-nums"], marginTop: 6 },
  unit: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text2 },
  date: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text2, marginTop: 2 },
  newPill: { backgroundColor: colors.green, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  newText: { fontSize: 11, fontFamily: fonts.bold, color: colors.bg },
  empty: { flexDirection: "row", alignItems: "center", gap: 8 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, flex: 1 },
});
