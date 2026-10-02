import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { LocalBenchmark, LocalBenchmarkMode, LocalBenchmarkStat } from "@mileclear/shared";
import { fetchLocalBenchmark } from "../../lib/api/businessInsights";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

// "Drivers near you": how this driver compares with MileClear drivers in
// their own postcode area (falls back to their region, then the UK, when
// fewer than 5 drivers are nearby). Free for everyone. Figures come from
// GET /business-insights/benchmarks/local, which never returns any single
// driver's numbers.

const CARD_BG = colors.surface;
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

/** Below the group's classified share by this many points shows the nudge. */
const CLASSIFY_NUDGE_GAP = 15;

function withCommas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const fmtMiles = (n: number) => `${withCommas(Math.round(n))} mi`;
const fmtPounds = (pence: number) => `£${withCommas(Math.round(pence / 100))}`;
const fmtTrips = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const fmtPct = (n: number) => `${Math.round(n)}%`;

/** "Drivers near you" / "Drivers in Yorkshire and the Humber" / "Drivers across the UK". */
function groupName(data: LocalBenchmark): string {
  if (data.level === "area") return "Drivers near you";
  if (data.level === "region" && data.scopeLabel) return `Drivers in ${data.scopeLabel}`;
  return "Drivers across the UK";
}

function areaLabel(data: LocalBenchmark): string | null {
  return data.area ? `${data.area.name} (${data.area.code})` : null;
}

/** Ten dots, the first N filled: "ahead of N in 10 drivers". */
function TenDots({ filled }: { filled: number }) {
  return (
    <View style={s.dots} accessible={false}>
      {Array.from({ length: 10 }, (_, i) => (
        <View key={i} style={[s.dot, i < filled ? s.dotOn : s.dotOff]} />
      ))}
    </View>
  );
}

interface RowProps {
  label: string;
  stat: LocalBenchmarkStat | null;
  format: (n: number) => string;
}

function CompareRow({ label, stat, format }: RowProps) {
  if (!stat) return null;
  const range = stat.low != null && stat.high != null ? `${format(stat.low)} to ${format(stat.high)}` : null;
  const a11y =
    `${label}: typical ${format(stat.median)}` +
    (stat.you != null ? `, you ${format(stat.you)}` : "") +
    (range ? `. Middle half of drivers: ${range}` : "");
  return (
    <View style={s.row} accessible accessibilityLabel={a11y}>
      <Text style={s.rowLabel} maxFontSizeMultiplier={fontScaleCap.body}>
        {label}
      </Text>
      <View style={s.rowValues}>
        <View style={s.valueCol}>
          <Text style={s.valueSmall} maxFontSizeMultiplier={fontScaleCap.none}>
            Typical
          </Text>
          <Text style={s.valueTypical} maxFontSizeMultiplier={fontScaleCap.display}>
            {format(stat.median)}
          </Text>
        </View>
        <View style={[s.valueCol, { alignItems: "flex-end" }]}>
          <Text style={s.valueSmall} maxFontSizeMultiplier={fontScaleCap.none}>
            You
          </Text>
          <Text style={s.valueYou} maxFontSizeMultiplier={fontScaleCap.display}>
            {stat.you != null ? format(stat.you) : "-"}
          </Text>
        </View>
      </View>
      {range && (
        <Text style={s.rangeText} maxFontSizeMultiplier={fontScaleCap.body}>
          Middle half of drivers: {range}
        </Text>
      )}
    </View>
  );
}

export function LocalBenchmarkCard({ mode }: { mode: LocalBenchmarkMode }) {
  const router = useRouter();
  const [data, setData] = useState<LocalBenchmark | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchLocalBenchmark(mode)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        // Offline or the server is down: show the retry state, never throw.
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => load(), [load]);

  const header = (
    <View style={s.headerRow}>
      <Ionicons name="people-outline" size={14} color={AMBER} accessible={false} />
      <Text style={s.label} maxFontSizeMultiplier={fontScaleCap.none}>
        DRIVERS NEAR YOU
      </Text>
    </View>
  );

  if (loading && !data) {
    return (
      <View style={[s.card, s.loadingCard]}>
        {header}
        <ActivityIndicator size="small" color={AMBER} style={{ marginTop: 16 }} />
      </View>
    );
  }

  if (failed && !data) {
    return (
      <View style={s.card}>
        {header}
        <Text style={s.body} maxFontSizeMultiplier={fontScaleCap.body}>
          We could not load this just now. Check your connection and try again.
        </Text>
        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Try loading drivers near you again"
        >
          <Text style={s.secondaryBtnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) return null;

  const where = areaLabel(data);

  if (!data.available) {
    return (
      <View style={s.card}>
        {header}
        <Text style={s.title} maxFontSizeMultiplier={fontScaleCap.heading}>
          {where ? `Not enough drivers in ${where} yet` : "Not enough drivers to compare yet"}
        </Text>
        <Text style={s.body} maxFontSizeMultiplier={fontScaleCap.body}>
          This compares your last 4 weeks with other MileClear drivers nearby. It needs a few weeks of
          your trips and at least 5 drivers in your area, so check back soon.
        </Text>
      </View>
    );
  }

  const isWork = data.mode === "work";
  const miles = data.weeklyMiles;
  const claim = data.weeklyClaimPence;
  const classified = data.classifiedPct;
  const who = groupName(data);
  const milesWord = isWork ? "business miles" : "miles";

  // One-sentence headline: "Drivers near you average 210 business miles a
  // week and claim about £95 a week in mileage. You're at 160."
  let headline = "";
  if (miles) {
    headline = `${who} average ${withCommas(Math.round(miles.median))} ${milesWord} a week`;
    if (isWork && claim && claim.median > 0) {
      headline += ` and claim about ${fmtPounds(claim.median)} a week in mileage`;
    }
    headline += ".";
    if (miles.you != null) headline += ` You're at ${withCommas(Math.round(miles.you))}.`;
  }

  const ahead = miles?.youAheadOfPerTen ?? null;
  const ranked = ahead != null;

  const showClassifyNudge =
    isWork &&
    classified != null &&
    classified.you != null &&
    classified.median - classified.you >= CLASSIFY_NUDGE_GAP;

  const scopeLine =
    data.level === "area"
      ? `Based on ${data.peerCount} drivers in ${data.scopeLabel}`
      : where
        ? `Not enough drivers in ${where} yet, so this uses ${
            data.level === "region" ? data.scopeLabel : "the whole UK"
          } (${data.peerCount} drivers)`
        : `Based on ${data.peerCount} drivers ${data.level === "region" ? `in ${data.scopeLabel}` : "across the UK"}`;

  return (
    <View style={s.card}>
      {header}
      <Text style={s.title} maxFontSizeMultiplier={fontScaleCap.heading}>
        {data.level === "area" && data.scopeLabel ? `In ${data.scopeLabel}` : `Compared with ${data.scopeLabel}`}
      </Text>
      {headline !== "" && (
        <Text style={s.headline} maxFontSizeMultiplier={fontScaleCap.body}>
          {headline}
        </Text>
      )}

      {ranked ? (
        <View
          style={s.rankBox}
          accessible
          accessibilityLabel={`You drive more ${milesWord} than ${ahead} in 10 of these drivers`}
        >
          <TenDots filled={ahead!} />
          <Text style={s.rankText} maxFontSizeMultiplier={fontScaleCap.body}>
            {ahead === 0
              ? "Fewer miles than most drivers here"
              : `Busier than ${ahead} in 10 drivers`}
          </Text>
        </View>
      ) : (
        <Text style={s.note} maxFontSizeMultiplier={fontScaleCap.body}>
          Drive in at least 2 of the last 4 weeks to see where you sit.
        </Text>
      )}

      <CompareRow label={isWork ? "Business miles a week" : "Miles a week"} stat={miles} format={fmtMiles} />
      {isWork && <CompareRow label="Mileage claim a week" stat={claim} format={fmtPounds} />}
      <CompareRow label="Trips a week" stat={data.weeklyTrips} format={fmtTrips} />
      <CompareRow label="Trips classified" stat={classified} format={fmtPct} />

      {showClassifyNudge && (
        <View style={s.nudge}>
          <Text style={s.nudgeText} maxFontSizeMultiplier={fontScaleCap.body}>
            {who} classify {fmtPct(classified!.median)} of trips; you're at {fmtPct(classified!.you!)}.
            Unclassified trips can't count towards your claim.
          </Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => router.push("/(tabs)/trips?filter=unclassified" as never)}
            accessibilityRole="button"
            accessibilityLabel="Open your unclassified trips"
          >
            <Text style={s.primaryBtnText}>Classify trips</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.bg} accessible={false} />
          </TouchableOpacity>
        </View>
      )}

      <Text style={s.footer} maxFontSizeMultiplier={fontScaleCap.body}>
        {scopeLine}, over the last 4 full weeks.
        {isWork ? " Claim value uses the HMRC mileage rate for each trip's tax year." : ""} Anonymous: groups of fewer
        than 5 drivers are never shown.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    marginBottom: 12,
  },
  loadingCard: {
    minHeight: 120,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    color: TEXT_2,
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 0.6,
  },
  title: {
    color: TEXT_1,
    fontSize: 17,
    fontFamily: fonts.bold,
    marginTop: 4,
  },
  headline: {
    color: TEXT_1,
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 20,
    marginTop: 8,
  },
  body: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 20,
    marginTop: 8,
  },
  note: {
    color: TEXT_3,
    fontSize: 13,
    fontFamily: fonts.regular,
    lineHeight: 18,
    marginTop: 12,
    marginBottom: 4,
  },
  rankBox: {
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  dots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    flex: 1,
    height: 8,
    borderRadius: 4,
  },
  dotOn: {
    backgroundColor: AMBER,
  },
  dotOff: {
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  rankText: {
    color: TEXT_1,
    fontSize: 13,
    fontFamily: fonts.semibold,
    marginTop: 8,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },
  rowLabel: {
    color: TEXT_2,
    fontSize: 13,
    fontFamily: fonts.semibold,
    marginBottom: 4,
  },
  rowValues: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  valueCol: {
    flex: 1,
  },
  valueSmall: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  valueTypical: {
    color: TEXT_1,
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  valueYou: {
    color: AMBER,
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  rangeText: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 4,
  },
  nudge: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.amberDim,
  },
  nudgeText: {
    color: TEXT_1,
    fontSize: 13,
    fontFamily: fonts.regular,
    lineHeight: 19,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: AMBER,
  },
  primaryBtnText: {
    color: colors.bg,
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  secondaryBtn: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryBtnText: {
    color: TEXT_1,
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  footer: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.regular,
    lineHeight: 17,
    marginTop: 12,
  },
});
