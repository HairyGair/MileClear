// Bars for the shown period (SPEC-VISUAL 5.2): 7 days for a week, one bar per
// week for a month, 12 months for a tax year. Plain Views; the whole chart is
// one accessible element with a sentence label.

import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { chart, colors, fonts, fontScaleCap, motion } from "../../lib/theme";
import { chartLabel, type Bucket, type InsightsPeriod } from "../../lib/insights/period";
import { formatMilesShort, milesWord, tripsWord } from "../../lib/insights/summary";

const PLOT = chart.barMaxHeight;

interface PeriodBarsProps {
  buckets: Bucket[];
  period: InsightsPeriod;
  offset: number;
  reducedMotion: boolean;
}

export function PeriodBars({ buckets, period, offset, reducedMotion }: PeriodBarsProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const grow = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const grown = useRef(false);

  useEffect(() => {
    if (grown.current) return;
    grown.current = true;
    if (reducedMotion) {
      grow.setValue(1);
      return;
    }
    Animated.timing(grow, {
      toValue: 1,
      duration: motion.settle,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [grow, reducedMotion]);

  useEffect(() => setPicked(null), [period, offset]);

  const max = useMemo(() => Math.max(...buckets.map((b) => b.miles), 0), [buckets]);
  const topIndex = useMemo(() => buckets.findIndex((b) => b.miles === max && max > 0), [buckets, max]);
  const label = useMemo(() => chartLabel(buckets, period, offset), [buckets, period, offset]);
  const total = buckets.reduce((s, b) => s + b.miles, 0);
  const drivenCount = buckets.filter((b) => b.miles >= 0.05).length;

  if (total < 0.05) {
    return (
      <Text style={styles.empty} maxFontSizeMultiplier={fontScaleCap.body}>
        {offset === 0 ? "Your week fills in as you drive." : "No driving in this period."}
      </Text>
    );
  }

  const unit = period === "week" ? "days" : period === "month" ? "weeks" : "months";
  const pick = picked !== null ? buckets[picked] : null;

  return (
    <View>
      <Text style={styles.meta} maxFontSizeMultiplier={fontScaleCap.display}>
        {drivenCount} {drivenCount === 1 ? unit.slice(0, -1) : unit} driven
      </Text>
      <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.row}>
        {buckets.map((b, i) => {
          const h = b.miles >= 0.05 ? Math.max(6, (b.miles / max) * PLOT) : 6;
          const isStub = b.miles < 0.05;
          const showValue = !b.isFuture && b.miles >= 0.5 && (i === topIndex || (b.isCurrent && offset === 0));
          const color = isStub
            ? chart.trackOnHero
            : b.isCurrent && offset === 0
              ? chart.current
              : chart.past;
          const height = grow.interpolate({ inputRange: [0, 1], outputRange: [0, h] });
          return (
            <TouchableOpacity
              key={i}
              style={styles.col}
              activeOpacity={0.8}
              disabled={b.isFuture}
              onPress={() => setPicked(picked === i ? null : i)}
              accessible={false}
              importantForAccessibility="no"
            >
              <View style={styles.plot}>
                {showValue && (
                  <Text
                    style={[styles.value, i === topIndex && { color: colors.text1 }]}
                    maxFontSizeMultiplier={fontScaleCap.display}
                    numberOfLines={1}
                  >
                    {Math.round(b.miles)}
                  </Text>
                )}
                {!b.isFuture && <Animated.View style={[styles.bar, { height, backgroundColor: color }]} />}
              </View>
              <Text
                style={[
                  styles.letter,
                  b.isFuture && { opacity: 0.5, color: colors.text3 },
                  b.isCurrent && offset === 0 && styles.letterNow,
                ]}
                numberOfLines={1}
                maxFontSizeMultiplier={fontScaleCap.display}
              >
                {b.label}
              </Text>
              <View style={[styles.dot, b.isCurrent && offset === 0 && { backgroundColor: chart.current }]} />
            </TouchableOpacity>
          );
        })}
      </View>
      {pick && (
        <Text style={styles.picked} maxFontSizeMultiplier={fontScaleCap.body} accessibilityLiveRegion="polite">
          {pick.name}: {pick.miles >= 0.05 ? `${formatMilesShort(pick.miles)} ${milesWord(pick.miles)} over ${pick.trips} ${tripsWord(pick.trips)}` : "no driving"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text2, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "flex-end" },
  col: { flex: 1, alignItems: "center" },
  plot: { height: PLOT + 16, width: "100%", alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "60%", maxWidth: 28, minWidth: 16, borderTopLeftRadius: chart.barRadius, borderTopRightRadius: chart.barRadius, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  value: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text2, marginBottom: 3 },
  letter: { fontSize: 12, fontFamily: fonts.medium, color: colors.text2, marginTop: 6 },
  letterNow: { color: colors.amber, fontFamily: fonts.bold },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3, backgroundColor: "transparent" },
  picked: { fontSize: 14, fontFamily: fonts.medium, color: colors.text1, marginTop: 8, textAlign: "center" },
  empty: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, textAlign: "center", paddingVertical: 6 },
});
