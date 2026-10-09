// Week | Month | Tax year switch with a back/forward stepper
// (SPEC-UX 1, SPEC-VISUAL 4). Neutral colours: amber stays for the hero.

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap } from "../../lib/theme";
import { haptic } from "../../lib/haptics";
import { taxYearName, taxYearStartYear, type InsightsPeriod, type PeriodRange } from "../../lib/insights/period";

const OPTIONS: Array<{ key: InsightsPeriod; label: string }> = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "tax_year", label: "Tax year" },
];

interface PeriodSwitchProps {
  period: InsightsPeriod;
  onPeriodChange: (p: InsightsPeriod) => void;
  offset: number;
  onOffsetChange: (o: number) => void;
  range: PeriodRange;
}

export function PeriodSwitch({ period, onPeriodChange, offset, onOffsetChange, range }: PeriodSwitchProps) {
  const isTaxYear = period === "tax_year";
  const now = new Date();
  const thisYear = taxYearStartYear(now);

  const step = (delta: number) => {
    haptic("selection");
    onOffsetChange(Math.min(0, offset + delta));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.track} accessibilityRole="tablist">
        {OPTIONS.map((o) => {
          const active = o.key === period;
          return (
            <TouchableOpacity
              key={o.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => {
                if (active) return;
                haptic("selection");
                onPeriodChange(o.key);
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 2, bottom: 2 }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={o.label}
            >
              <Text
                style={[styles.tabLabel, active && styles.tabLabelActive]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isTaxYear ? (
        <View style={styles.stepper}>
          <Text style={[styles.stepLabel, styles.stepLabelLeft]} maxFontSizeMultiplier={fontScaleCap.heading} numberOfLines={2}>
            {range.label}
          </Text>
          <View style={styles.chips}>
            {[0, -1].map((o) => {
              const active = o === offset;
              const name = taxYearName(thisYear + o);
              return (
                <TouchableOpacity
                  key={o}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => {
                    if (active) return;
                    haptic("selection");
                    onOffsetChange(o);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Tax year ${name}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} maxFontSizeMultiplier={1.3}>
                    {name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.stepper}>
          <TouchableOpacity
            style={styles.arrow}
            onPress={() => step(-1)}
            accessibilityRole="button"
            accessibilityLabel={`Previous ${period}`}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text2} />
          </TouchableOpacity>
          <Text
            style={styles.stepLabel}
            numberOfLines={1}
            maxFontSizeMultiplier={fontScaleCap.heading}
            accessibilityRole="header"
          >
            {range.label}
          </Text>
          <TouchableOpacity
            style={[styles.arrow, offset >= 0 && styles.arrowOff]}
            onPress={() => step(1)}
            disabled={offset >= 0}
            accessibilityRole="button"
            accessibilityLabel={`Next ${period}`}
            accessibilityState={{ disabled: offset >= 0 }}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.text2} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  track: {
    flexDirection: "row",
    height: 46,
    backgroundColor: colors.surface,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tab: { flex: 1, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  tabActive: { backgroundColor: colors.personal, borderColor: colors.personalEdge },
  tabLabel: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text2 },
  tabLabelActive: { color: colors.text1 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  arrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  arrowOff: { opacity: 0.3 },
  stepLabel: { flex: 1, textAlign: "center", fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  stepLabelLeft: { textAlign: "left", paddingRight: 8 },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  chipActive: { backgroundColor: colors.personal, borderColor: colors.personalEdge },
  chipText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text2 },
  chipTextActive: { color: colors.text1 },
});
