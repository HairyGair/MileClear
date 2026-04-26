import { useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { fetchMotHistory } from "../lib/api/vehicles";
import type { MotHistoryResult, MotTestRecord } from "@mileclear/shared";

const BG = "#030712";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const GREEN = "#10b981";
const RED = "#ef4444";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function resultColor(result: string): string {
  if (result === "PASSED") return GREEN;
  if (result === "FAILED") return RED;
  return AMBER;
}

function formatOdometer(value: number | null, unit: string | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString()} ${unit ?? ""}`.trim();
}

function defectTone(type: MotTestRecord["defects"][number]["type"]): {
  color: string;
  label: string;
} {
  switch (type) {
    case "ADVISORY":
      return { color: AMBER, label: "Advisory" };
    case "MINOR":
      return { color: AMBER, label: "Minor" };
    case "MAJOR":
    case "FAIL":
      return { color: RED, label: "Major" };
    case "DANGEROUS":
      return { color: RED, label: "Dangerous" };
    case "PRS":
      return { color: AMBER, label: "PRS" };
    default:
      return { color: TEXT_3, label: "Note" };
  }
}

function TestRecord({
  test,
  previousOdometer,
}: {
  test: MotTestRecord;
  previousOdometer: number | null;
}) {
  const tone = resultColor(test.testResult);
  const milesSincePrevious =
    test.odometerValue !== null && previousOdometer !== null
      ? test.odometerValue - previousOdometer
      : null;

  return (
    <View style={s.testCard}>
      <View style={s.testHead}>
        <View style={s.testHeadLeft}>
          <View style={[s.resultDot, { backgroundColor: tone }]} />
          <Text style={s.testDate}>{formatDate(test.completedDate)}</Text>
        </View>
        <Text style={[s.testResult, { color: tone }]}>{test.testResult}</Text>
      </View>

      <View style={s.testStatsRow}>
        <View style={s.testStat}>
          <Text style={s.testStatLabel}>Odometer</Text>
          <Text style={s.testStatValue}>
            {formatOdometer(test.odometerValue, test.odometerUnit)}
          </Text>
          {milesSincePrevious !== null && milesSincePrevious > 0 && (
            <Text style={s.testStatDelta}>
              +{milesSincePrevious.toLocaleString()} since last test
            </Text>
          )}
        </View>
        {test.expiryDate && (
          <View style={s.testStat}>
            <Text style={s.testStatLabel}>Expiry</Text>
            <Text style={s.testStatValue}>{formatDate(test.expiryDate)}</Text>
          </View>
        )}
      </View>

      {test.defects.length > 0 && (
        <View style={s.defectsBlock}>
          <Text style={s.defectsHead}>
            {test.defects.length}{" "}
            {test.defects.length === 1 ? "item" : "items"} flagged
          </Text>
          {test.defects.map((d, idx) => {
            const t = defectTone(d.type);
            return (
              <View key={idx} style={s.defectRow}>
                <View style={[s.defectBadge, { backgroundColor: `${t.color}1f` }]}>
                  <Text style={[s.defectBadgeText, { color: t.color }]}>
                    {t.label}
                  </Text>
                </View>
                <Text style={s.defectText}>{d.text}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={s.testNumber}>Test #{test.motTestNumber}</Text>
    </View>
  );
}

export default function VehicleMotHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [history, setHistory] = useState<MotHistoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchMotHistory(id)
      .then((res) => {
        if (!cancelled) setHistory(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "Could not load MOT history";
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color={AMBER} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.loading}>
        <Ionicons name="alert-circle-outline" size={32} color={RED} />
        <Text style={s.errorText}>{error}</Text>
      </View>
    );
  }

  if (!history) {
    return (
      <View style={s.loading}>
        <Ionicons name="document-outline" size={32} color={TEXT_3} />
        <Text style={s.emptyText}>
          No MOT records found for this vehicle. Brand new cars don&apos;t need an
          MOT until their third birthday.
        </Text>
      </View>
    );
  }

  // Pre-compute previous odometer for delta display (tests are sorted newest-first).
  const tests = history.motTests;
  const passes = tests.filter((t) => t.testResult === "PASSED").length;
  const failures = tests.filter((t) => t.testResult === "FAILED").length;
  const totalAdvisories = tests.reduce(
    (sum, t) => sum + t.defects.filter((d) => d.type === "ADVISORY").length,
    0
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.summary}>
        <Text style={s.summaryTitle}>
          {history.make} {history.model}
        </Text>
        <Text style={s.summarySub}>
          {history.registrationNumber.toUpperCase()}{" "}
          {history.firstUsedDate
            ? `· first used ${formatDate(history.firstUsedDate)}`
            : ""}
        </Text>
        <View style={s.summaryStats}>
          <View style={s.summaryStat}>
            <Text style={[s.summaryStatValue, { color: GREEN }]}>{passes}</Text>
            <Text style={s.summaryStatLabel}>passes</Text>
          </View>
          <View style={s.summaryStat}>
            <Text style={[s.summaryStatValue, { color: RED }]}>{failures}</Text>
            <Text style={s.summaryStatLabel}>fails</Text>
          </View>
          <View style={s.summaryStat}>
            <Text style={[s.summaryStatValue, { color: AMBER }]}>
              {totalAdvisories}
            </Text>
            <Text style={s.summaryStatLabel}>advisories</Text>
          </View>
        </View>
      </View>

      {tests.map((t, idx) => {
        // The "previous" odometer for delta calc is the next-newer test (i.e.
        // the test taken before this one chronologically). Because tests are
        // newest-first, that's tests[idx + 1].
        const prev = tests[idx + 1]?.odometerValue ?? null;
        return (
          <TestRecord key={t.motTestNumber} test={t} previousOdometer={prev} />
        );
      })}

      <Text style={s.footer}>
        Source: DVSA MOT History API. Records are public data published by the
        Driver and Vehicle Standards Agency.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: BG, flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 },
  loading: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  errorText: {
    color: TEXT_2,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  emptyText: {
    color: TEXT_2,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 24,
  },
  summary: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    marginBottom: 12,
  },
  summaryTitle: {
    color: TEXT_1,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },
  summarySub: {
    color: TEXT_2,
    fontSize: 12,
    marginBottom: 14,
  },
  summaryStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  summaryStat: { alignItems: "center" },
  summaryStatValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  summaryStatLabel: {
    color: TEXT_3,
    fontSize: 11,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  testCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    marginBottom: 10,
  },
  testHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  testHeadLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  testDate: {
    color: TEXT_1,
    fontSize: 14,
    fontWeight: "600",
  },
  testResult: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  testStatsRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 8,
  },
  testStat: { flex: 1 },
  testStatLabel: {
    color: TEXT_3,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  testStatValue: {
    color: TEXT_1,
    fontSize: 14,
    fontWeight: "600",
  },
  testStatDelta: {
    color: TEXT_2,
    fontSize: 11,
    marginTop: 2,
  },
  defectsBlock: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
  },
  defectsHead: {
    color: TEXT_2,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  defectRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  defectBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    minWidth: 56,
  },
  defectBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  defectText: {
    color: TEXT_1,
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  testNumber: {
    color: TEXT_3,
    fontSize: 10,
    marginTop: 8,
  },
  footer: {
    color: TEXT_3,
    fontSize: 10,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 12,
    lineHeight: 14,
  },
});
