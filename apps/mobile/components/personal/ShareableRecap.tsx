import { type RefObject } from "react";
import { View, Text, StyleSheet, Share as RNShare } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { getDistanceEquivalent } from "@mileclear/shared";

// ─── Data types ─────────────────────────────────────────────

export interface RecapShareCardProps {
  period?: "daily" | "monthly" | "yearly";
  monthLabel: string;
  monthMiles: number;
  monthTrips: number;
  avgTripMiles: number;
  totalMiles: number;
  busiestDay: string | null;
  prevMonthMiles: number | null;
  deductionPence: number;
  region?: string;
}

// ─── Helpers ────────────────────────────────────────────────

function formatMilesReadable(miles: number): string {
  if (miles < 100) return miles.toFixed(1);
  return Math.round(miles).toLocaleString("en-GB");
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function prevMonthName(current: string): string {
  const idx = MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === current.toLowerCase()
  );
  if (idx === -1) return "last month";
  return MONTH_NAMES[(idx + 11) % 12];
}

// ─── Visual certificate card (rendered off-screen, captured as image) ───

export function RecapShareCard({
  period = "monthly",
  monthLabel,
  monthMiles,
  monthTrips,
  avgTripMiles,
  totalMiles,
  busiestDay,
  prevMonthMiles,
  deductionPence,
  region,
}: RecapShareCardProps) {
  const year = new Date().getFullYear();
  const milesStr = formatMilesReadable(monthMiles);
  const avgStr = avgTripMiles < 10 ? avgTripMiles.toFixed(1) : String(Math.round(avgTripMiles));
  const deductionStr = deductionPence > 0
    ? `\u00A3${(deductionPence / 100).toFixed(2)}`
    : null;
  const totalStr = Math.round(totalMiles).toLocaleString("en-GB");
  const tripWord = monthTrips === 1 ? "trip" : "trips";

  // Month-over-month comparison
  let comparisonText: string | null = null;
  if (prevMonthMiles !== null && prevMonthMiles > 0) {
    const diff = monthMiles - prevMonthMiles;
    const pct = Math.round(Math.abs(diff / prevMonthMiles) * 100);
    if (pct >= 1) {
      const prev = prevMonthName(monthLabel);
      comparisonText = diff > 0
        ? `${pct}% more miles than ${prev}`
        : `${pct}% fewer miles than ${prev}`;
    }
  }

  const distanceEquiv = getDistanceEquivalent(monthMiles, region);
  const hasInsights = busiestDay || comparisonText || distanceEquiv;

  return (
    <View style={s.card}>
      {/* Subtle ambient glow behind the content */}
      <View style={s.ambientGlow} />

      {/* Corner accents — certificate-style frame markers */}
      <View style={[s.corner, { top: 14, left: 14, borderTopWidth: 1, borderLeftWidth: 1 }]} />
      <View style={[s.corner, { top: 14, right: 14, borderTopWidth: 1, borderRightWidth: 1 }]} />
      <View style={[s.corner, { bottom: 14, left: 14, borderBottomWidth: 1, borderLeftWidth: 1 }]} />
      <View style={[s.corner, { bottom: 14, right: 14, borderBottomWidth: 1, borderRightWidth: 1 }]} />

      {/* Top accent line */}
      <View style={s.accentLine} />

      {/* MileClear wordmark */}
      <View style={s.wordmark}>
        <Text style={s.wordMile}>Mile</Text>
        <Text style={s.wordClear}>Clear</Text>
      </View>

      {/* Recap type label with flanking lines */}
      <View style={s.labelRow}>
        <View style={s.labelLine} />
        <Text style={s.labelText}>
          {period === "daily" ? "DAILY RECAP" : period === "yearly" ? "YEAR IN REVIEW" : "DRIVING RECAP"}
        </Text>
        <View style={s.labelLine} />
      </View>

      {/* Period heading */}
      <Text style={s.monthYear}>
        {period === "daily" ? monthLabel.toUpperCase() : period === "yearly" ? monthLabel.toUpperCase() : `${monthLabel.toUpperCase()} ${year}`}
      </Text>

      {/* Hero miles — the big number */}
      <Text style={s.heroMiles}>{milesStr}</Text>
      <Text style={s.heroUnit}>miles driven</Text>

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statValue}>{monthTrips}</Text>
          <Text style={s.statLabel}>{tripWord}</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statBox}>
          <Text style={s.statValue}>{avgStr}</Text>
          <Text style={s.statLabel}>avg miles</Text>
        </View>
        {deductionStr && (
          <>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={[s.statValue, { color: "#10b981" }]}>{deductionStr}</Text>
              <Text style={s.statLabel}>HMRC deduction</Text>
            </View>
          </>
        )}
      </View>

      {/* Insights */}
      {hasInsights && (
        <View style={s.insights}>
          {busiestDay && (
            <View style={s.insightRow}>
              <View style={s.insightDot} />
              <Text style={s.insightText}>
                Busiest day:{" "}
                <Text style={s.insightHighlight}>{busiestDay}</Text>
              </Text>
            </View>
          )}
          {comparisonText && (
            <View style={s.insightRow}>
              <View style={s.insightDot} />
              <Text style={s.insightText}>{comparisonText}</Text>
            </View>
          )}
          {distanceEquiv && (
            <View style={s.insightRow}>
              <View style={s.insightDot} />
              <Text style={s.insightText}>{distanceEquiv}</Text>
            </View>
          )}
        </View>
      )}

      {/* Divider */}
      <View style={s.divider} />

      {/* Lifetime total */}
      <Text style={s.lifetimeText}>
        {totalStr} total miles tracked
      </Text>

      {/* Bottom accent line */}
      <View style={[s.accentLine, { marginTop: 24 }]} />

      {/* Footer */}
      <View style={s.footer}>
        <View style={s.footerWordmark}>
          <Text style={[s.wordMile, { fontSize: 13 }]}>Mile</Text>
          <Text style={[s.wordClear, { fontSize: 13 }]}>Clear</Text>
        </View>
        <Text style={s.footerTagline}>Your mileage journal</Text>
      </View>
    </View>
  );
}

// ─── Capture + share ────────────────────────────────────────

export async function captureAndShareRecap(
  viewRef: RefObject<View | null>,
  data: RecapShareCardProps
): Promise<void> {
  try {
    const uri = await captureRef(viewRef, {
      format: "png",
      quality: 1,
    });
    const dialogLabel = data.period === "daily" ? "Daily" : data.monthLabel;
    await Sharing.shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle: `My ${dialogLabel} Driving Recap`,
    });
  } catch {
    // Fallback to text sharing if image capture fails
    await textFallbackShare(data);
  }
}

// ─── Text fallback (for environments where view-shot is unavailable) ────

async function textFallbackShare(data: RecapShareCardProps): Promise<void> {
  const { period, monthLabel, monthMiles, monthTrips, avgTripMiles, totalMiles, deductionPence } = data;
  const milesStr = formatMilesReadable(monthMiles);
  const avgStr = avgTripMiles < 10 ? avgTripMiles.toFixed(1) : String(Math.round(avgTripMiles));
  const totalStr = Math.round(totalMiles).toLocaleString("en-GB");
  const tripWord = monthTrips === 1 ? "trip" : "trips";
  const recapLabel = period === "daily" ? "today's" : monthLabel;

  const lines = [
    `My ${recapLabel} driving recap:`,
    `- ${milesStr} miles across ${monthTrips} ${tripWord}`,
    `- Average trip: ${avgStr} miles`,
  ];
  if (deductionPence > 0) {
    lines.push(`- \u00A3${(deductionPence / 100).toFixed(2)} HMRC deduction`);
  }
  lines.push(
    `- ${totalStr} total miles tracked!`,
    "",
    "Tracked with MileClear \u2014 your mileage journal",
    "https://apps.apple.com/app/mileclear/id6740041879",
  );
  const message = lines.join("\n");

  try {
    await RNShare.share(
      { message },
      { subject: `My ${recapLabel} Driving Recap` }
    );
  } catch {
    // Share dismissed
  }
}

// ─── Styles ─────────────────────────────────────────────────

const CARD_WIDTH = 360;

const s = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: "#030712",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 32,
    overflow: "hidden",
  },
  ambientGlow: {
    position: "absolute",
    top: "30%",
    left: "20%",
    width: "60%",
    height: "40%",
    backgroundColor: "rgba(245, 166, 35, 0.025)",
    borderRadius: 999,
  },
  corner: {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: "rgba(245, 166, 35, 0.3)",
  },
  accentLine: {
    height: 1.5,
    backgroundColor: "#f5a623",
    opacity: 0.5,
    marginHorizontal: 8,
  },
  wordmark: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 6,
  },
  wordMile: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
    letterSpacing: -0.5,
  },
  wordClear: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
    letterSpacing: -0.5,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 4,
  },
  labelLine: {
    width: 32,
    height: 1,
    backgroundColor: "rgba(132, 148, 167, 0.3)",
  },
  labelText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
    letterSpacing: 3,
  },
  monthYear: {
    textAlign: "center",
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
    letterSpacing: 1.5,
    marginBottom: 20,
  },
  heroMiles: {
    textAlign: "center",
    fontSize: 56,
    fontFamily: "PlusJakartaSans_300Light",
    color: "#f5a623",
    letterSpacing: -2,
    lineHeight: 62,
  },
  heroUnit: {
    textAlign: "center",
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
    letterSpacing: 0.5,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statValue: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
    letterSpacing: 0.3,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  insights: {
    gap: 8,
    marginBottom: 20,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  insightDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(245, 166, 35, 0.5)",
  },
  insightText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#8494a7",
  },
  insightHighlight: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    marginBottom: 16,
  },
  lifetimeText: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#64748b",
    letterSpacing: 0.2,
  },
  footer: {
    alignItems: "center",
    marginTop: 16,
    gap: 2,
  },
  footerWordmark: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerTagline: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
    letterSpacing: 0.5,
  },
});
