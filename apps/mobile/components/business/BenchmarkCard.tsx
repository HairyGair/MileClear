import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  LayoutAnimation,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchBenchmarks } from "../../lib/api/businessInsights";
import type {
  BenchmarkSnapshot,
  BenchmarkComparison,
  PlatformBenchmark,
} from "@mileclear/shared";

const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const AMBER_FAINT = "rgba(245,166,35,0.10)";
const GREEN = "#10b981";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";

function formatValue(v: number, unit: BenchmarkComparison["unit"]): string {
  if (unit === "miles") return `${v.toFixed(1)} mi`;
  if (unit === "trips") return v.toFixed(1);
  return v.toString();
}

function metricLabel(unit: BenchmarkComparison["unit"]): string {
  if (unit === "miles") return "miles/week";
  if (unit === "trips") return "trips/week";
  return "/week";
}

// Visual band: where the user sits between p25 and p75. Returns 0-1 along
// that band, clamped. Below p25 returns 0, above p75 returns 1.
function bandPosition(value: number, p25: number, p75: number): number {
  if (p75 <= p25) return 0.5; // degenerate distribution, centre the marker
  const t = (value - p25) / (p75 - p25);
  return Math.max(0, Math.min(1, t));
}

interface BenchmarkRowProps {
  label: string;
  cmp: BenchmarkComparison;
}

function BenchmarkRow({ label, cmp }: BenchmarkRowProps) {
  if (!cmp.available) {
    return (
      <View style={s.row}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowUnavailable}>
          Need {Math.max(0, 5 - cmp.contributors)} more {cmp.contributors >= 4 ? "driver" : "drivers"} for this benchmark
        </Text>
      </View>
    );
  }

  const yours = cmp.yourValue;
  const yourPct = cmp.yourPercentile;
  const hasYou = yours !== null;
  const tone =
    yourPct === null
      ? TEXT_2
      : yourPct >= 75
        ? GREEN
        : yourPct >= 50
          ? AMBER
          : TEXT_2;
  const youPos = hasYou ? bandPosition(yours!, cmp.p25, cmp.p75) : 0.5;

  return (
    <View style={s.row}>
      <View style={s.rowHead}>
        <Text style={s.rowLabel}>{label}</Text>
        <View style={s.rowValueRight}>
          {hasYou ? (
            <>
              <Text style={[s.rowYouValue, { color: tone }]}>
                {formatValue(yours!, cmp.unit)}
              </Text>
              {yourPct !== null && (
                <Text style={s.rowPercentile}>
                  {yourPct >= 50
                    ? `top ${100 - yourPct}%`
                    : `bottom ${yourPct}%`}
                </Text>
              )}
            </>
          ) : (
            <Text style={s.rowYouNoData}>no data yet</Text>
          )}
        </View>
      </View>

      {/* Distribution bar: p25 ... median ... p75, with you-marker overlaid */}
      <View style={s.distContainer}>
        <View style={s.distBar}>
          <View style={s.distBand} />
          <View style={[s.distMedian, { left: "50%" }]} />
          {hasYou && (
            <View
              style={[
                s.distYou,
                { left: `${youPos * 100}%`, backgroundColor: tone },
              ]}
            />
          )}
        </View>
        <View style={s.distLabels}>
          <Text style={s.distLabel}>{formatValue(cmp.p25, cmp.unit)}</Text>
          <Text style={s.distLabelMed}>
            median {formatValue(cmp.median, cmp.unit)}
          </Text>
          <Text style={s.distLabel}>{formatValue(cmp.p75, cmp.unit)}</Text>
        </View>
      </View>

      <Text style={s.rowFooter}>
        {cmp.contributors} {cmp.contributors === 1 ? "driver" : "drivers"} {metricLabel(cmp.unit)}
      </Text>
    </View>
  );
}

export function BenchmarkCard() {
  const [data, setData] = useState<BenchmarkSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPlatforms, setShowPlatforms] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBenchmarks()
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <View style={[s.card, s.loadingCard]}>
        <ActivityIndicator size="small" color={AMBER} />
      </View>
    );
  }

  if (!data) return null;

  // Privacy floor not yet met across the whole user base.
  if (data.limitedDataNote && !data.national.weeklyMiles.available) {
    return (
      <View style={s.card}>
        <Text style={s.label}>HOW YOU COMPARE</Text>
        <Text style={s.title}>Driver community benchmarks</Text>
        <Text style={s.note}>{data.limitedDataNote}</Text>
        <Text style={s.contributorCount}>
          {data.totalActiveDrivers} {data.totalActiveDrivers === 1 ? "driver" : "drivers"} active in the last 30 days
        </Text>
      </View>
    );
  }

  const togglePlatforms = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowPlatforms((v) => !v);
  };

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>HOW YOU COMPARE</Text>
          <Text style={s.title}>Vs UK drivers, last {data.windowDays} days</Text>
        </View>
        <View style={s.contributorPill}>
          <Ionicons name="people-outline" size={11} color={TEXT_3} />
          <Text style={s.contributorPillText}>{data.totalActiveDrivers}</Text>
        </View>
      </View>

      <BenchmarkRow label="Weekly business miles" cmp={data.national.weeklyMiles} />
      <BenchmarkRow label="Weekly trips" cmp={data.national.weeklyTrips} />

      {data.platforms.length > 0 && (
        <>
          <TouchableOpacity
            onPress={togglePlatforms}
            style={s.platformToggle}
            accessibilityRole="button"
            accessibilityState={{ expanded: showPlatforms }}
          >
            <Ionicons
              name={showPlatforms ? "chevron-up" : "chevron-down"}
              size={14}
              color={TEXT_2}
            />
            <Text style={s.platformToggleText}>
              {showPlatforms ? "Hide" : "Show"} per-platform breakdown
              {!showPlatforms && ` (${data.platforms.length})`}
            </Text>
          </TouchableOpacity>

          {showPlatforms && (
            <View style={s.platformList}>
              {data.platforms.map((p) => (
                <PlatformSection key={p.platform} platform={p} />
              ))}
            </View>
          )}
        </>
      )}

      <Text style={s.privacyNote}>
        Aggregated anonymously across all UK MileClear drivers. Buckets with fewer
        than 5 contributors are never shown.
      </Text>
    </View>
  );
}

function PlatformSection({ platform }: { platform: PlatformBenchmark }) {
  return (
    <View style={s.platformSection}>
      <Text style={s.platformLabel}>{platform.label}</Text>
      <BenchmarkRow label="Weekly miles" cmp={platform.miles} />
      <BenchmarkRow label="Weekly trips" cmp={platform.trips} />
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
    minHeight: 140,
    justifyContent: "center",
    alignItems: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  label: {
    color: TEXT_2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  title: {
    color: TEXT_1,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 2,
  },
  contributorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  contributorPillText: {
    color: TEXT_2,
    fontSize: 11,
    fontWeight: "600",
  },
  note: {
    color: TEXT_2,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    marginBottom: 8,
  },
  contributorCount: {
    color: TEXT_3,
    fontSize: 11,
    marginTop: 4,
  },
  row: {
    marginBottom: 14,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  rowLabel: {
    color: TEXT_1,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  rowValueRight: {
    alignItems: "flex-end",
  },
  rowYouValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  rowYouNoData: {
    color: TEXT_3,
    fontSize: 12,
    fontStyle: "italic",
  },
  rowPercentile: {
    color: TEXT_3,
    fontSize: 11,
    marginTop: 1,
  },
  rowUnavailable: {
    color: TEXT_3,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
  },
  rowFooter: {
    color: TEXT_3,
    fontSize: 10,
    marginTop: 4,
  },
  distContainer: {
    marginVertical: 4,
  },
  distBar: {
    height: 18,
    justifyContent: "center",
    position: "relative",
  },
  distBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 7,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
  },
  distMedian: {
    position: "absolute",
    top: 4,
    width: 2,
    height: 10,
    backgroundColor: TEXT_2,
    marginLeft: -1,
  },
  distYou: {
    position: "absolute",
    top: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    borderWidth: 2,
    borderColor: CARD_BG,
  },
  distLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  distLabel: {
    color: TEXT_3,
    fontSize: 10,
  },
  distLabelMed: {
    color: TEXT_2,
    fontSize: 10,
    fontWeight: "600",
  },
  platformToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
  },
  platformToggleText: {
    color: TEXT_2,
    fontSize: 12,
    fontWeight: "600",
  },
  platformList: {
    marginTop: 4,
  },
  platformSection: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  platformLabel: {
    color: AMBER,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  privacyNote: {
    color: TEXT_3,
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 8,
    lineHeight: 14,
  },
});
