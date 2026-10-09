// Go deeper, Work (Pro): pay per mile and per hour (this tax year) and the
// week's money in and out. Opened from a row in GoDeeper.

import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { formatPence } from "@mileclear/shared";
import type { BusinessInsights, WeeklyPnL } from "@mileclear/shared";
import { fetchBusinessInsights, fetchWeeklyPnL } from "../../lib/api/businessInsights";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

export function useWorkMoney(enabled: boolean, weeksBack: number, refreshToken: number) {
  const [insights, setInsights] = useState<BusinessInsights | null>(null);
  const [pnl, setPnl] = useState<WeeklyPnL | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const [i, p] = await Promise.all([fetchBusinessInsights(), fetchWeeklyPnL(weeksBack)]);
      setInsights(i.data);
      setPnl(p.data);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [enabled, weeksBack]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  return { insights, pnl, loading, failed, reload: load };
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={[styles.label, strong && styles.strong]} maxFontSizeMultiplier={fontScaleCap.body}>{label}</Text>
      <Text
        style={[styles.value, strong && styles.strong, tone === "good" && { color: colors.green }, tone === "bad" && { color: colors.red }]}
        maxFontSizeMultiplier={fontScaleCap.body}
      >
        {value}
      </Text>
    </View>
  );
}

export function PayPerMileCard({ insights }: { insights: BusinessInsights }) {
  return (
    <View style={styles.card}>
      <Line label="Pay per mile" value={formatPence(insights.earningsPerMilePence)} strong />
      {insights.earningsPerHourPence > 0 && <Line label="Pay per hour" value={formatPence(insights.earningsPerHourPence)} />}
      <Line label="Paid in" value={formatPence(insights.totalEarningsPence)} />
      <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>
        Across this tax year, from the earnings you have added.
      </Text>
    </View>
  );
}

export function WeeklyMoneyCard({ pnl }: { pnl: WeeklyPnL }) {
  const net = pnl.netProfitPence;
  return (
    <View style={styles.card}>
      <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>{pnl.periodLabel}</Text>
      <Line label="Paid in" value={formatPence(pnl.grossEarningsPence)} />
      <Line label="Fuel (estimate)" value={`-${formatPence(pnl.estimatedFuelCostPence)}`} />
      <Line label="Wear and tear (estimate)" value={`-${formatPence(pnl.estimatedWearCostPence)}`} />
      <Line label="Left after costs" value={formatPence(Math.abs(net))} strong tone={net >= 0 ? "good" : "bad"} />
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
    marginBottom: 8,
  },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, minHeight: 32 },
  label: { flex: 1, fontSize: 14, fontFamily: fonts.medium, color: colors.text2 },
  value: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1, fontVariant: ["tabular-nums"] },
  strong: { fontFamily: fonts.bold, color: colors.text1 },
  note: { fontSize: 12, fontFamily: fonts.medium, color: colors.text2, marginTop: 4, marginBottom: 4 },
});
