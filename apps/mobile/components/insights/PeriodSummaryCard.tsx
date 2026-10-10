// The one hero on Insights: "Your week" in a sentence, a headline number,
// three figures and bars. Personal mode draws the avatar dial; Work mode is
// the same card without it (Anthony, decision F). Comparison with the
// previous period is Pro only (decision A): free drivers get this period's
// figures and one quiet line that opens the paywall.

import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Platform, Switch, Text, TouchableOpacity, useWindowDimensions, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";
import { colors, fonts, fontScaleCap, heroCard, numberSizes } from "../../lib/theme";
import { haptic } from "../../lib/haptics";
import { Skeleton } from "../Skeleton";
import { Dial } from "./Dial";
import { PeriodBars } from "./PeriodBars";
import { RecapShareCard, captureAndShareRecap, type RecapShareCardProps } from "../personal/ShareableRecap";
import type { PeriodSummaryState, PeriodTripsState } from "../../hooks/useInsightsData";
import type { Celebration } from "../../hooks/useInsightsCelebration";
import { BusinessRecapShareCard, captureAndShareBusinessRecap } from "../business/BusinessShareableRecap";
import { buildBusinessShareData, canIncludeEarnings, createPendingShare } from "../../lib/insights/businessShare";
import { shareHeading, sharePeriodTotalLabel } from "../../lib/insights/shareLabels";
import {
  bucketTrips,
  summaryTitle,
  type InsightsPeriod,
  type PeriodRange,
} from "../../lib/insights/period";
import {
  buildFigures,
  buildSummarySentence,
  compareUpsellText,
  formatMilesShort,
  milesWord,
  whenPhrase,
  type Figure,
} from "../../lib/insights/summary";

interface PeriodSummaryCardProps {
  mode: "work" | "personal";
  period: InsightsPeriod;
  offset: number;
  range: PeriodRange;
  summary: PeriodSummaryState;
  bars: PeriodTripsState;
  /** Lifetime trips; null while unknown. */
  tripsEver: number | null;
  isPro: boolean;
  avatarId: string | null | undefined;
  region?: string;
  /** 0 to 1 for the dial, and its words. Personal only. */
  dialProgress: number;
  dialLabel: string | null;
  celebration: Celebration | null;
  reducedMotion: boolean;
  onUpsell: () => void;
  onHelp: () => void;
}

export function PeriodSummaryCard(props: PeriodSummaryCardProps) {
  const { mode, period, offset, range, summary, bars, tripsEver, isPro, reducedMotion } = props;
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 380 || fontScale > 1.3;
  const shareRef = useRef<View>(null);
  const isPersonal = mode === "personal";
  // Work share: a small sheet with "Include earnings" (off by default).
  const [shareOpen, setShareOpen] = useState(false);
  const [includeEarnings, setIncludeEarnings] = useState(false);
  const pendingBusinessShare = useRef(createPendingShare<ReturnType<typeof buildBusinessShareData>>()).current;

  const current = summary.current;
  const showComparison = isPro && period !== "tax_year";
  const title = summaryTitle(period, offset, range);

  // Celebration: one haptic when the spark plays; announced for screen readers.
  useEffect(() => {
    if (!props.celebration) return;
    AccessibilityInfo.announceForAccessibility(`${props.celebration.title}. ${props.celebration.detail}`);
    if (!reducedMotion) haptic("success");
  }, [props.celebration, reducedMotion]);

  const sentence = useMemo(() => {
    if (!current) return null;
    return buildSummarySentence({
      period,
      offset,
      miles: current.miles,
      trips: current.trips,
      prevMiles: summary.previous ? summary.previous.miles : null,
      showComparison,
      // Unknown lifetime count: never claim "no trips ever" on a guess.
      tripsEver: tripsEver ?? Math.max(current.trips, 1),
      busiestDay: current.busiestDayLabel,
      busiestDayMiles: current.busiestDayMiles,
    });
  }, [current, summary.previous, period, offset, showComparison, tripsEver]);

  // Loading: skeleton, never a spinner page.
  if (summary.status === "loading" && !current) {
    return (
      <View style={[styles.hero, styles.skeletonHero]} accessibilityLabel="Loading your summary" accessibilityRole="progressbar">
        <Skeleton width={120} height={16} />
        <Skeleton width={160} height={44} style={{ marginTop: 16 }} />
        <Skeleton width="90%" height={16} style={{ marginTop: 12 }} />
        <Skeleton width="60%" height={16} style={{ marginTop: 8 }} />
        <Skeleton height={96} style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (summary.status === "error" || !current || !sentence) {
    return (
      <View style={styles.hero}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body} maxFontSizeMultiplier={fontScaleCap.body}>
          Couldn't load this. Pull down to try again.
        </Text>
      </View>
    );
  }

  // Empty: no trips ever.
  if (sentence.kind === "empty") {
    return (
      <View style={styles.hero}>
        <View style={styles.emptyIcon}>
          <Ionicons name="car-sport-outline" size={28} color={colors.amber} />
        </View>
        <Text style={styles.emptyTitle} maxFontSizeMultiplier={fontScaleCap.heading}>
          Your insights start with your first trip
        </Text>
        <Text style={styles.body} maxFontSizeMultiplier={fontScaleCap.body}>
          Drive with MileClear running and your week, records and badges appear here.
        </Text>
        <TouchableOpacity onPress={props.onHelp} style={styles.linkBtn} accessibilityRole="button" accessibilityLabel="How trips are recorded">
          <Text style={styles.linkText} maxFontSizeMultiplier={fontScaleCap.body}>How trips are recorded</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const claim = current.claimPence;
  const workClaimHeadline = !isPersonal && claim !== null && claim > 0 && current.trips > 0;
  const quiet = sentence.kind === "quiet";

  let figures: Figure[] = buildFigures({
    mode,
    period,
    miles: current.miles,
    trips: current.trips,
    prevMiles: summary.previous ? summary.previous.miles : null,
    showComparison,
    claimPence: claim,
    formatPence,
  });
  if (workClaimHeadline) {
    figures = figures.filter((f) => f.key !== "claim");
    figures.unshift({
      key: "miles",
      value: formatMilesShort(current.miles),
      label: milesWord(current.miles),
      spoken: `${formatMilesShort(current.miles)} ${milesWord(current.miles)}`,
    });
    figures = figures.slice(0, 3);
  }

  const headlineValue = quiet
    ? offset === 0
      ? `A quiet ${period === "tax_year" ? "tax year" : period}`
      : "A quiet one"
    : workClaimHeadline
      ? formatPence(claim as number)
      : formatMilesShort(current.miles);
  const headlineUnit = quiet ? null : workClaimHeadline ? "claim built" : milesWord(current.miles);
  const periodLine = quiet ? null : whenPhrase(period, offset);

  const headlineSpoken = quiet
    ? headlineValue
    : workClaimHeadline
      ? `${headlineValue} mileage claim built ${whenPhrase(period, offset)}`
      : `${formatMilesShort(current.miles)} ${milesWord(current.miles)} ${whenPhrase(period, offset)}`;

  const buckets = !bars.truncated && bars.status === "ready" ? bucketTrips(bars.trips, period, offset) : null;

  const shareData: RecapShareCardProps = {
    period: period === "tax_year" ? "yearly" : "monthly",
    monthLabel: shareHeading(period, offset, range),
    heading: shareHeading(period, offset, range),
    totalLabel: sharePeriodTotalLabel(period, offset, range),
    monthMiles: current.miles,
    monthTrips: current.trips,
    avgTripMiles: current.trips > 0 ? current.miles / current.trips : 0,
    totalMiles: current.miles,
    busiestDay: null,
    prevMonthMiles: null,
    deductionPence: 0,
    region: props.region,
  };

  const businessShare = !isPersonal
    ? buildBusinessShareData(shareHeading(period, offset, range), current, includeEarnings)
    : null;
  const earningsToInclude = canIncludeEarnings(current);
  const runPendingBusinessShare = () => {
    const data = pendingBusinessShare.take();
    if (data) captureAndShareBusinessRecap(shareRef, data);
  };
  const doShare = () => {
    if (businessShare) {
      // iOS will not present the share sheet while this Modal is still on
      // screen (a fixed delay raced the fade and nothing opened), so share
      // from the Modal's onDismiss there. Android has no onDismiss: wait.
      pendingBusinessShare.set(businessShare);
      setShareOpen(false);
      if (Platform.OS !== "ios") setTimeout(runPendingBusinessShare, 350);
    } else {
      captureAndShareRecap(shareRef, shareData);
    }
  };

  const showDial = isPersonal && !quiet;
  const dial = showDial ? (
    <Dial
      progress={props.dialProgress}
      avatarId={props.avatarId}
      reducedMotion={reducedMotion}
      celebrate={!!props.celebration}
    />
  ) : null;

  const text = (
    <View style={stacked ? styles.textStacked : styles.textSide}>
      <Text
        style={[styles.headline, quiet && styles.headlineQuiet, stacked && { textAlign: "center" }]}
        maxFontSizeMultiplier={fontScaleCap.display}
        accessibilityLabel={headlineSpoken}
      >
        {headlineValue}
        {headlineUnit ? <Text style={styles.unit}>{` ${headlineUnit}`}</Text> : null}
      </Text>
      {periodLine && (
        <Text style={[styles.periodLine, stacked && { textAlign: "center" }]} maxFontSizeMultiplier={fontScaleCap.body}>
          {periodLine}
        </Text>
      )}
      <Text style={[styles.sentence, stacked && { textAlign: "center" }]} maxFontSizeMultiplier={fontScaleCap.body}>
        {sentence.text}
      </Text>
      {props.dialLabel && showDial && (
        <Text style={[styles.dialLabel, stacked && { textAlign: "center" }]} maxFontSizeMultiplier={fontScaleCap.display}>
          {props.dialLabel}
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.hero}>
      {/* Off-screen share card, captured as an image on Share. */}
      <View style={styles.offScreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View ref={shareRef} collapsable={false}>
          {businessShare ? <BusinessRecapShareCard {...businessShare} /> : <RecapShareCard {...shareData} />}
        </View>
      </View>

      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Ionicons name={isPersonal ? "person-outline" : "briefcase-outline"} size={14} color={colors.text2} />
          <Text style={styles.title} maxFontSizeMultiplier={fontScaleCap.heading} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {!quiet && (
          <TouchableOpacity
            style={styles.share}
            onPress={() => (isPersonal ? doShare() : setShareOpen(true))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Share your ${period === "tax_year" ? "tax year" : period} as a picture`}
          >
            <Ionicons name="share-outline" size={16} color={colors.text1} />
            <Text style={styles.shareText} maxFontSizeMultiplier={fontScaleCap.heading}>Share</Text>
          </TouchableOpacity>
        )}
      </View>

      {businessShare && (
        <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)} onDismiss={runPendingBusinessShare}>
          <View style={styles.sheetBackdrop}>
            <View style={styles.sheet} accessibilityViewIsModal>
              <Text style={styles.sheetTitle} maxFontSizeMultiplier={fontScaleCap.heading} accessibilityRole="header">
                Share {shareHeading(period, offset, range)}
              </Text>
              <Text style={styles.sheetBody} maxFontSizeMultiplier={fontScaleCap.body}>
                A picture of your business miles and mileage claim. It never shows where you went.
              </Text>
              {earningsToInclude && (
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel} maxFontSizeMultiplier={fontScaleCap.body}>Include earnings</Text>
                  <Switch
                    value={includeEarnings}
                    onValueChange={setIncludeEarnings}
                    trackColor={{ true: colors.amber, false: colors.surfaceBorder }}
                    accessibilityLabel="Include earnings"
                  />
                </View>
              )}
              <TouchableOpacity style={styles.sheetPrimary} onPress={doShare} accessibilityRole="button" accessibilityLabel="Share">
                <Text style={styles.sheetPrimaryText} maxFontSizeMultiplier={fontScaleCap.heading}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShareOpen(false)} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={styles.sheetCancelText} maxFontSizeMultiplier={fontScaleCap.heading}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {props.celebration && (
        <View style={styles.celebrate} accessible accessibilityRole="text" accessibilityLabel={`${props.celebration.title}. ${props.celebration.detail}`}>
          <Ionicons name="ribbon" size={16} color={colors.amber} />
          <View style={{ flex: 1 }}>
            <Text style={styles.celebrateTitle} maxFontSizeMultiplier={fontScaleCap.body}>{props.celebration.title}</Text>
            <Text style={styles.celebrateDetail} maxFontSizeMultiplier={fontScaleCap.body}>{props.celebration.detail}</Text>
          </View>
        </View>
      )}

      <View
        style={stacked || !dial ? styles.colLayout : styles.rowLayout}
        accessible={false}
      >
        {dial}
        {text}
      </View>

      {figures.length > 0 && (
        <>
          <View style={styles.hairline} />
          <View style={styles.figures} accessible accessibilityLabel={figures.map((f) => f.spoken).join(". ")}>
            {figures.map((f) => (
              <View key={f.key} style={styles.figure}>
                <View style={styles.figureValueRow}>
                  {f.arrow && <Ionicons name={f.arrow === "up" ? "arrow-up" : "arrow-down"} size={12} color={colors.text2} />}
                  <Text style={styles.figureValue} maxFontSizeMultiplier={fontScaleCap.display}>{f.value}</Text>
                </View>
                <Text style={styles.figureLabel} maxFontSizeMultiplier={fontScaleCap.display}>{f.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {!isPro && period !== "tax_year" && !quiet && (
        <TouchableOpacity
          style={styles.upsell}
          onPress={props.onUpsell}
          accessibilityRole="button"
          accessibilityLabel={compareUpsellText(period)}
        >
          <Ionicons name="diamond-outline" size={14} color={colors.text2} />
          <Text style={styles.upsellText} maxFontSizeMultiplier={fontScaleCap.body}>{compareUpsellText(period)}</Text>
        </TouchableOpacity>
      )}

      {buckets ? (
        <>
          <View style={styles.hairline} />
          <PeriodBars buckets={buckets} period={period} offset={offset} reducedMotion={reducedMotion} />
        </>
      ) : bars.status === "loading" ? (
        <Skeleton height={96} style={{ marginTop: 16 }} />
      ) : null}

      {summary.offline && (
        <Text style={styles.offline} maxFontSizeMultiplier={fontScaleCap.body}>
          You are offline. Showing what is on this phone.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: heroCard.tint,
    borderRadius: heroCard.radius,
    borderWidth: 1,
    borderColor: heroCard.border,
    padding: 20,
    marginBottom: 12,
  },
  skeletonHero: { minHeight: 280 },
  offScreen: { position: "absolute", left: -10000, top: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, minHeight: 28 },
  titleLeft: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  title: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text2 },
  share: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28 },
  shareText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  sheet: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.surfaceBorder, padding: 20 },
  sheetTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.text1 },
  sheetBody: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, lineHeight: 20, marginTop: 6 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, marginTop: 12 },
  switchLabel: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1, flex: 1 },
  sheetPrimary: { minHeight: 48, borderRadius: 12, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center", marginTop: 16 },
  sheetPrimaryText: { fontSize: 16, fontFamily: fonts.bold, color: colors.bg },
  sheetCancel: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
  sheetCancelText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text2 },
  celebrate: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: colors.amberDim,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  celebrateTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.text1 },
  celebrateDetail: { fontSize: 12, fontFamily: fonts.medium, color: colors.text2, marginTop: 1 },
  rowLayout: { flexDirection: "row", alignItems: "center", gap: 16 },
  colLayout: { alignItems: "center", gap: 12 },
  textSide: { flex: 1 },
  textStacked: { alignSelf: "stretch" },
  headline: {
    fontSize: numberSizes.hero,
    fontFamily: fonts.bold,
    color: colors.text1,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  headlineQuiet: { fontSize: 22, letterSpacing: 0 },
  unit: { fontSize: 18, fontFamily: fonts.semibold, color: colors.text2, letterSpacing: 0 },
  periodLine: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2, marginTop: 2 },
  sentence: { fontSize: 16, fontFamily: fonts.regular, color: colors.text1, lineHeight: 22, marginTop: 10 },
  dialLabel: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text2, marginTop: 8 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginVertical: 16 },
  figures: { flexDirection: "row", gap: 12 },
  figure: { flex: 1 },
  figureValueRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  figureValue: { fontSize: numberSizes.small, fontFamily: fonts.bold, color: colors.text1, fontVariant: ["tabular-nums"] },
  figureLabel: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text2, marginTop: 2 },
  upsell: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, minHeight: 28 },
  upsellText: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2 },
  offline: { fontSize: 12, fontFamily: fonts.medium, color: colors.text2, marginTop: 12 },
  body: { fontSize: 16, fontFamily: fonts.regular, color: colors.text2, lineHeight: 22, marginTop: 4 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 22, fontFamily: fonts.bold, color: colors.text1, textAlign: "center" },
  linkBtn: { alignSelf: "center", marginTop: 14, minHeight: 44, justifyContent: "center" },
  linkText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.amber },
});
