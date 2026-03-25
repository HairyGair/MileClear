import { type RefObject } from "react";
import { View, Text, StyleSheet, Share as RNShare } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { formatPence } from "@mileclear/shared";

export interface BusinessRecapShareData {
  periodLabel: string;
  grossEarningsPence: number;
  netProfitPence: number;
  businessMiles: number;
  totalTrips: number;
  earningsPerMilePence: number;
  earningsPerHourPence: number;
  hmrcDeductionPence: number;
  avgShiftGrade: string | null;
  bestPlatform: string | null;
  totalShiftHours: number;
}

function formatMilesReadable(miles: number): string {
  if (miles < 100) return miles.toFixed(1);
  return Math.round(miles).toLocaleString("en-GB");
}

export function BusinessRecapShareCard(data: BusinessRecapShareData) {
  const year = new Date().getFullYear();
  const tripWord = data.totalTrips === 1 ? "trip" : "trips";
  const hours = Math.round(data.totalShiftHours);
  const hasProfit = data.netProfitPence !== 0;

  return (
    <View style={s.card}>
      <View style={s.ambientGlow} />

      {/* Corner accents */}
      <View style={[s.corner, { top: 14, left: 14, borderTopWidth: 1, borderLeftWidth: 1 }]} />
      <View style={[s.corner, { top: 14, right: 14, borderTopWidth: 1, borderRightWidth: 1 }]} />
      <View style={[s.corner, { bottom: 14, left: 14, borderBottomWidth: 1, borderLeftWidth: 1 }]} />
      <View style={[s.corner, { bottom: 14, right: 14, borderBottomWidth: 1, borderRightWidth: 1 }]} />

      {/* Top accent */}
      <View style={s.accentLine} />

      {/* Wordmark */}
      <View style={s.wordmark}>
        <Text style={s.wordMile}>Mile</Text>
        <Text style={s.wordClear}>Clear</Text>
      </View>

      {/* Label */}
      <View style={s.labelRow}>
        <View style={s.labelLine} />
        <Text style={s.labelText}>EARNINGS REPORT</Text>
        <View style={s.labelLine} />
      </View>

      {/* Period */}
      <Text style={s.period}>{data.periodLabel.toUpperCase()}</Text>

      {/* Hero — gross earnings */}
      <Text style={s.heroValue}>{formatPence(data.grossEarningsPence)}</Text>
      <Text style={s.heroUnit}>gross earnings</Text>

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statValue}>{formatMilesReadable(data.businessMiles)}</Text>
          <Text style={s.statLabel}>miles</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statBox}>
          <Text style={s.statValue}>{data.totalTrips}</Text>
          <Text style={s.statLabel}>{tripWord}</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statBox}>
          <Text style={s.statValue}>{hours}h</Text>
          <Text style={s.statLabel}>on the road</Text>
        </View>
      </View>

      {/* Efficiency row */}
      <View style={s.efficiencyRow}>
        <View style={s.effItem}>
          <Text style={s.effValue}>{formatPence(data.earningsPerMilePence)}</Text>
          <Text style={s.effLabel}>per mile</Text>
        </View>
        <View style={s.effDot} />
        <View style={s.effItem}>
          <Text style={s.effValue}>{formatPence(data.earningsPerHourPence)}</Text>
          <Text style={s.effLabel}>per hour</Text>
        </View>
        {data.avgShiftGrade && (
          <>
            <View style={s.effDot} />
            <View style={s.effItem}>
              <Text style={[s.effValue, { color: "#10b981" }]}>{data.avgShiftGrade}</Text>
              <Text style={s.effLabel}>avg grade</Text>
            </View>
          </>
        )}
      </View>

      {/* Insights */}
      <View style={s.insights}>
        {data.bestPlatform && (
          <View style={s.insightRow}>
            <View style={s.insightDot} />
            <Text style={s.insightText}>
              Top platform: <Text style={s.insightHighlight}>{data.bestPlatform}</Text>
            </Text>
          </View>
        )}
        {data.hmrcDeductionPence > 0 && (
          <View style={s.insightRow}>
            <View style={[s.insightDot, { backgroundColor: "rgba(16, 185, 129, 0.5)" }]} />
            <Text style={s.insightText}>
              <Text style={{ color: "#10b981" }}>{formatPence(data.hmrcDeductionPence)}</Text> HMRC tax deduction
            </Text>
          </View>
        )}
        {hasProfit && (
          <View style={s.insightRow}>
            <View style={[s.insightDot, { backgroundColor: data.netProfitPence >= 0 ? "rgba(16, 185, 129, 0.5)" : "rgba(239, 68, 68, 0.5)" }]} />
            <Text style={s.insightText}>
              Net profit: <Text style={{ color: data.netProfitPence >= 0 ? "#10b981" : "#ef4444" }}>{formatPence(data.netProfitPence)}</Text>
            </Text>
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={s.divider} />

      {/* Bottom accent */}
      <View style={[s.accentLine, { marginTop: 16 }]} />

      {/* Footer */}
      <View style={s.footer}>
        <View style={s.footerWordmark}>
          <Text style={[s.wordMile, { fontSize: 13 }]}>Mile</Text>
          <Text style={[s.wordClear, { fontSize: 13 }]}>Clear</Text>
        </View>
        <Text style={s.footerTagline}>Track smarter, earn more</Text>
      </View>
    </View>
  );
}

// ─── Capture + share ────────────────────────────────────────

export async function captureAndShareBusinessRecap(
  viewRef: RefObject<View | null>,
  data: BusinessRecapShareData,
): Promise<void> {
  try {
    const uri = await captureRef(viewRef, {
      format: "png",
      quality: 1,
    });
    await Sharing.shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle: `My ${data.periodLabel} Earnings Report`,
    });
  } catch {
    await textFallbackShare(data);
  }
}

async function textFallbackShare(data: BusinessRecapShareData): Promise<void> {
  const tripWord = data.totalTrips === 1 ? "trip" : "trips";
  const hours = Math.round(data.totalShiftHours);

  const lines = [
    `My ${data.periodLabel} earnings report:`,
    `- ${formatPence(data.grossEarningsPence)} gross across ${data.totalTrips} ${tripWord}`,
    `- ${formatMilesReadable(data.businessMiles)} business miles in ${hours} hours`,
    `- ${formatPence(data.earningsPerMilePence)}/mi | ${formatPence(data.earningsPerHourPence)}/hr`,
  ];
  if (data.hmrcDeductionPence > 0) {
    lines.push(`- ${formatPence(data.hmrcDeductionPence)} HMRC deduction claimed`);
  }
  if (data.bestPlatform) {
    lines.push(`- Top platform: ${data.bestPlatform}`);
  }
  if (data.avgShiftGrade) {
    lines.push(`- Average shift grade: ${data.avgShiftGrade}`);
  }
  lines.push(
    "",
    "Tracked with MileClear \u2014 track smarter, earn more",
    "https://apps.apple.com/app/mileclear/id6759671005",
  );

  try {
    await RNShare.share(
      { message: lines.join("\n") },
      { subject: `My ${data.periodLabel} Earnings Report` },
    );
  } catch {
    // Dismissed
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
    top: "25%",
    left: "15%",
    width: "70%",
    height: "50%",
    backgroundColor: "rgba(245, 166, 35, 0.02)",
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
    width: 28,
    height: 1,
    backgroundColor: "rgba(132, 148, 167, 0.3)",
  },
  labelText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
    letterSpacing: 3,
  },
  period: {
    textAlign: "center",
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
    letterSpacing: 1.5,
    marginBottom: 20,
  },
  heroValue: {
    textAlign: "center",
    fontSize: 48,
    fontFamily: "PlusJakartaSans_300Light",
    color: "#10b981",
    letterSpacing: -2,
    lineHeight: 54,
  },
  heroUnit: {
    textAlign: "center",
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
    letterSpacing: 0.5,
    marginBottom: 22,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statValue: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
    letterSpacing: 0.3,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  efficiencyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 18,
  },
  effItem: { alignItems: "center" },
  effValue: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },
  effLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
    marginTop: 1,
  },
  effDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  insights: {
    gap: 8,
    marginBottom: 18,
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
