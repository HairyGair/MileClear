import { View, Text, StyleSheet, PixelRatio } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";
import { digitGroups, fitsDigitCells, formatOdo } from "../../lib/odometer/logic";
import type { OdometerReadingSource } from "../../lib/api/odometer";

// SPEC-VISUAL 1: one figure component, two sizes. "large" draws each digit in
// a recessed cell (vehicle screen, log top card); "compact" is a plain tabular
// number (list rows, Trips day line). Estimated vs recorded is never colour.

const CELL_W = 26;
const CELL_H = 40;

interface FigureProps {
  miles: number;
  size?: "large" | "compact";
  /** Spoken label for the whole figure; the digits are never read one by one. */
  accessibilityLabel?: string;
}

export function OdometerFigure({ miles, size = "large", accessibilityLabel }: FigureProps) {
  const label = accessibilityLabel ?? `${formatOdo(miles)} miles`;
  if (size === "compact" || !fitsDigitCells(miles)) {
    return (
      <Text
        style={size === "compact" ? styles.compact : styles.compactBig}
        accessibilityLabel={label}
        maxFontSizeMultiplier={fontScaleCap.display}
      >
        {formatOdo(miles)} mi
      </Text>
    );
  }
  const scale = Math.min(PixelRatio.getFontScale(), 1.3);
  const w = CELL_W * Math.max(scale, 1);
  const h = CELL_H * Math.max(scale, 1);
  const groups = digitGroups(miles);
  return (
    <View style={styles.cells} accessible accessibilityRole="text" accessibilityLabel={label}>
      {groups.map((g, gi) => (
        <View key={gi} style={[styles.group, gi > 0 && { marginLeft: 10 }]}>
          {g.map((d, di) => (
            <View key={di} style={[styles.cell, { width: w, height: h }, di > 0 && { marginLeft: 3 }]} accessible={false}>
              <Text style={styles.digit} maxFontSizeMultiplier={fontScaleCap.display} accessible={false}>
                {d}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.unit} maxFontSizeMultiplier={fontScaleCap.heading} accessible={false}>
        mi
      </Text>
    </View>
  );
}

const SOURCE_ICON: Record<OdometerReadingSource, keyof typeof Ionicons.glyphMap> = {
  user: "create-outline",
  fuel: "water-outline",
  trip: "car-outline",
};

/** "Recorded" (solid border, source icon) or "Estimated" (dashed border, calculator). */
export function StatusChip({
  recorded,
  source = "user",
}: {
  recorded: boolean;
  source?: OdometerReadingSource;
}) {
  return (
    <View
      style={[styles.chip, recorded ? styles.chipRecorded : styles.chipEstimated]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons
        name={recorded ? SOURCE_ICON[source] : "calculator-outline"}
        size={12}
        color={recorded ? colors.text1 : colors.text2}
        accessible={false}
      />
      <Text
        style={[styles.chipText, { color: recorded ? colors.text1 : colors.text2 }]}
        maxFontSizeMultiplier={fontScaleCap.heading}
      >
        {recorded ? "Recorded" : "Estimated"}
      </Text>
    </View>
  );
}

/** Small square mark beside a recorded reading in log rows (SPEC-VISUAL 5c). */
export function RecordedMark({ source = "user" }: { source?: OdometerReadingSource }) {
  return (
    <View style={styles.mark} accessible={false}>
      <Ionicons name={SOURCE_ICON[source]} size={12} color={colors.text1} accessible={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1, fontVariant: ["tabular-nums"] },
  compactBig: { fontSize: 28, fontFamily: fonts.semibold, color: colors.text1, fontVariant: ["tabular-nums"] },
  cells: { flexDirection: "row", alignItems: "flex-end" },
  group: { flexDirection: "row" },
  cell: {
    backgroundColor: colors.bg,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  digit: {
    fontSize: 28,
    fontFamily: fonts.semibold,
    color: colors.text1,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    includeFontPadding: false,
  },
  unit: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text2, marginLeft: 6, marginBottom: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  chipRecorded: { borderColor: colors.text3, borderStyle: "solid" },
  chipEstimated: { borderColor: colors.text2, borderStyle: "dashed" },
  chipText: { fontSize: 12, fontFamily: fonts.semibold },
  mark: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.text3,
    alignItems: "center",
    justifyContent: "center",
  },
});
