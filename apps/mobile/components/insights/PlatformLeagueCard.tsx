// "Your platforms, ranked" (Work, gig drivers): ONE league of platforms ranked
// by pay per mile. Replaces both "Platform Performance" and "Profit by
// platform". Pro sees pay per mile, trips and miles. Free drivers (Decision C)
// see the order and the platform names only, with one amber link to the
// paywall; no figure of any kind reaches the screen (maskLeagueForFree).
//
// Usage:
//   <PlatformLeagueCard period="month" offset={0} mode="work" isPro={isPro} />
// The window is the period shown (week, month or tax year, any offset). Pro
// reads GET /business-insights/platform-pnl?period=; free drivers get the same
// ranking rule from free endpoints (platformLeagueData.ts), figures masked.

import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useUser } from "../../lib/user/context";
import { usePaywall } from "../paywall";
import { useAsyncData } from "../../lib/insights/useAsyncData";
import { loadLeague } from "../../lib/insights/platformLeagueData";
import { getPeriodRange, summaryTitle } from "../../lib/insights/period";
import {
  hasLeague,
  formatPerMile,
  leagueSubline,
  type LeagueRow,
} from "../../lib/insights/platformLeague";
import { chart, colors, fonts, fontScaleCap, spacing } from "../../lib/theme";
import { InsightCard, CardSkeleton, CardError, type InsightCardProps } from "./work/InsightCardUi";

export default function PlatformLeagueCard({ period, offset, mode, isPro, refreshToken }: InsightCardProps) {
  const { user, isCompanyDriver } = useUser();
  const { showPaywall } = usePaywall();
  const workType = user?.workType ?? "gig";
  const isGig = (workType === "gig" || workType === "both") && !isCompanyDriver;
  const hidden = mode !== "work" || !isGig;

  const range = useMemo(() => getPeriodRange(period, offset), [period, offset]);
  // Pro and free read different sources, so they are different keys.
  const key = `league|${period}|${offset}|${isPro ? "pro" : "free"}`;
  const { data: rows, loading, failed, reload } = useAsyncData<LeagueRow[]>(
    () => loadLeague(period, range, isPro),
    key,
    refreshToken,
    !hidden
  );

  if (hidden) return null;
  if (loading && !rows) return <CardSkeleton lines={4} />;
  if (failed && !rows) return <CardError onRetry={reload} />;
  if (!rows || !hasLeague(rows)) return null;

  return (
    <InsightCard title="Your platforms, ranked" meta={range.isCurrent && period === "tax_year" ? "Tax year so far" : summaryTitle(period, offset, range)}>
      {rows.map((r, i) => (
        <LeagueRowView key={r.platform} row={r} last={i === rows.length - 1} isPro={isPro} />
      ))}
      <Text style={styles.footnote} maxFontSizeMultiplier={fontScaleCap.body}>
        {isPro
          ? "Ranked by pay per mile on business trips. Platforms with fewer than 5 trips are listed last."
          : "Ranked by pay per mile on business trips."}
      </Text>
      {!isPro && (
        <TouchableOpacity
          onPress={() => showPaywall("platform_league")}
          style={styles.proLink}
          accessibilityRole="button"
          accessibilityLabel="See pay per mile with Pro"
        >
          <Text style={styles.proLinkText} maxFontSizeMultiplier={fontScaleCap.body}>
            See pay per mile with Pro
          </Text>
        </TouchableOpacity>
      )}
    </InsightCard>
  );
}

function LeagueRowView({ row, last, isPro }: { row: LeagueRow; last: boolean; isPro: boolean }) {
  const top = row.rank === 1 && !row.fewTrips;
  const sub = leagueSubline(row);
  const label =
    `Number ${row.rank}, ${row.label}` +
    (row.perMilePence != null ? `, ${formatPerMile(row.perMilePence)}` : "") +
    (sub ? `, ${sub}` : "") +
    (row.fewTrips ? ", few trips" : "");

  return (
    <View style={[styles.row, !last && styles.rowDivider]} accessible accessibilityLabel={label}>
      <Text style={[styles.rank, top && styles.rankTop]} maxFontSizeMultiplier={fontScaleCap.display}>
        {row.rank}
      </Text>
      <View style={styles.mid}>
        <Text style={styles.name} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.heading}>
          {row.label}
        </Text>
        {isPro && row.barFraction != null && (
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.max(4, Math.round(row.barFraction * 100))}%` },
                { backgroundColor: top ? chart.current : chart.past },
              ]}
            />
          </View>
        )}
        {row.fewTrips && (
          <Text style={styles.few} maxFontSizeMultiplier={fontScaleCap.body}>
            few trips
          </Text>
        )}
      </View>
      <View style={styles.right}>
        {row.perMilePence != null ? (
          <>
            <Text style={styles.figure} maxFontSizeMultiplier={fontScaleCap.display}>
              {formatPerMile(row.perMilePence)}
            </Text>
            {sub && (
              <Text style={styles.sub} maxFontSizeMultiplier={fontScaleCap.display}>
                {sub}
              </Text>
            )}
          </>
        ) : isPro ? (
          <Text style={styles.sub} maxFontSizeMultiplier={fontScaleCap.display}>
            {row.trips === 0 ? "No trips tagged" : "No earnings"}
          </Text>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 52, paddingVertical: spacing.sm, gap: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  rank: { width: 20, fontSize: 16, fontFamily: fonts.bold, color: colors.text3 },
  rankTop: { color: colors.amber },
  mid: { flex: 1 },
  name: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: chart.track, marginTop: 6, overflow: "hidden" },
  barFill: { height: 4, borderRadius: 2 },
  few: { marginTop: 2, fontSize: 12, fontFamily: fonts.medium, color: colors.text3 },
  right: { alignItems: "flex-end", maxWidth: "45%" },
  figure: { fontSize: 16, fontFamily: fonts.bold, color: colors.text1 },
  sub: { fontSize: 12, fontFamily: fonts.medium, color: colors.text2, textAlign: "right" },
  placeholder: { width: 56, height: 12, borderRadius: 6, backgroundColor: chart.track },
  footnote: { marginTop: spacing.sm, fontSize: 12, fontFamily: fonts.regular, color: colors.text3, lineHeight: 17 },
  proLink: { marginTop: spacing.xs, minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  proLinkText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.amber },
});
