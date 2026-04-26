import { useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatPence, getTaxYear } from "@mileclear/shared";
import type { ReconciliationSummary } from "@mileclear/shared";
import {
  fetchHmrcReconciliation,
  saveHmrcReconciliation,
} from "../lib/api/hmrcReconciliation";

const BG = "#030712";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const AMBER_FAINT = "rgba(245,166,35,0.08)";
const GREEN = "#10b981";
const GREEN_FAINT = "rgba(16,185,129,0.08)";
const RED = "#ef4444";
const RED_FAINT = "rgba(239,68,68,0.10)";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";

function diffTone(diffPence: number): { color: string; bg: string } {
  // Within £20 = neutral. Over-reported (HMRC > MileClear) = red. Under
  // (MileClear > HMRC) = amber. Both flag potential audit issues.
  const abs = Math.abs(diffPence);
  if (abs < 2_000) return { color: GREEN, bg: GREEN_FAINT };
  if (diffPence > 0) return { color: RED, bg: RED_FAINT };
  return { color: AMBER, bg: AMBER_FAINT };
}

function diffLabel(diffPence: number): string {
  const abs = Math.abs(diffPence);
  if (abs < 2_000) return "matches";
  if (diffPence > 0) return `${formatPence(abs)} HMRC sees more`;
  return `${formatPence(abs)} you tracked more`;
}

export default function HmrcReconciliationScreen() {
  const [taxYear] = useState(() => getTaxYear(new Date()));
  const [data, setData] = useState<ReconciliationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPlatform, setSavingPlatform] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetchHmrcReconciliation(taxYear)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        // Pre-fill text inputs with existing values
        const initial: Record<string, string> = {};
        for (const r of res.data.rows) {
          if (r.hmrcReportedPence !== null) {
            initial[r.platform] = (r.hmrcReportedPence / 100).toFixed(2);
          }
        }
        setDrafts(initial);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taxYear]);

  const handleSave = async (platform: string) => {
    const raw = drafts[platform]?.trim() ?? "";
    if (!raw) return;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      Alert.alert("Invalid amount", "Enter a positive £ amount.");
      return;
    }
    const pence = Math.round(parsed * 100);
    setSavingPlatform(platform);
    try {
      const res = await saveHmrcReconciliation({
        taxYear,
        platform,
        hmrcReportedPence: pence,
      });
      setData(res.data);
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save reconciliation."
      );
    } finally {
      setSavingPlatform(null);
    }
  };

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color={AMBER} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={s.loading}>
        <Text style={s.errorText}>Could not load reconciliation.</Text>
      </View>
    );
  }

  const overall = data.totals;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.intro}>
        <View style={s.taxYearBadge}>
          <Text style={s.taxYearBadgeText}>TAX YEAR {data.taxYear}</Text>
        </View>
        <Text style={s.title}>Reconcile vs HMRC</Text>
        <Text style={s.intro2}>
          Since January 2024, every gig platform has been reporting your earnings to
          HMRC under the Digital Platform Reporting rules. The first reports landed at
          HMRC by 31 January 2026 covering 2025 calendar-year earnings.
        </Text>
        <Text style={s.intro2}>
          Enter the figure HMRC says each platform reported (from the notice in your
          Personal Tax Account). MileClear shows you the gap so you can address it
          before HMRC does.
        </Text>
      </View>

      {/* Totals card */}
      {overall.completedPlatforms > 0 && (
        <View style={s.totals}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>HMRC reported</Text>
            <Text style={s.totalsValue}>{formatPence(overall.hmrcReportedPence)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>You tracked</Text>
            <Text style={s.totalsValue}>
              {formatPence(overall.mileclearTrackedPence)}
            </Text>
          </View>
          <View style={[s.totalsRow, s.totalsDiffRow]}>
            <Text style={s.totalsLabel}>Difference</Text>
            <Text
              style={[
                s.totalsDiffValue,
                { color: diffTone(overall.diffPence).color },
              ]}
            >
              {overall.diffPence > 0
                ? `+${formatPence(Math.abs(overall.diffPence))}`
                : overall.diffPence < 0
                  ? `-${formatPence(Math.abs(overall.diffPence))}`
                  : formatPence(0)}
            </Text>
          </View>
          <Text style={s.totalsNote}>
            {overall.completedPlatforms} of {overall.totalPlatforms} platforms entered
          </Text>
        </View>
      )}

      {data.rows.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="document-outline" size={28} color={TEXT_3} />
          <Text style={s.emptyText}>
            No earnings tracked yet for {data.taxYear}. Add earnings on the Earnings
            tab first, then come back here to reconcile against HMRC.
          </Text>
        </View>
      ) : (
        data.rows.map((row) => {
          const tone =
            row.diffPence !== null ? diffTone(row.diffPence) : null;
          const label =
            row.diffPence !== null ? diffLabel(row.diffPence) : null;
          return (
            <View key={row.platform} style={s.platformCard}>
              <View style={s.platformHead}>
                <Text style={s.platformLabel}>{row.label}</Text>
                {tone && label && (
                  <View
                    style={[
                      s.diffPill,
                      { backgroundColor: tone.bg },
                    ]}
                  >
                    <Text style={[s.diffPillText, { color: tone.color }]}>
                      {label}
                    </Text>
                  </View>
                )}
              </View>

              <View style={s.platformBody}>
                <View style={s.platformInputCol}>
                  <Text style={s.fieldLabel}>HMRC reported (£)</Text>
                  <TextInput
                    style={s.input}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={TEXT_3}
                    value={drafts[row.platform] ?? ""}
                    onChangeText={(v) =>
                      setDrafts((prev) => ({ ...prev, [row.platform]: v }))
                    }
                    onBlur={() => handleSave(row.platform)}
                    returnKeyType="done"
                    onSubmitEditing={() => handleSave(row.platform)}
                  />
                  {savingPlatform === row.platform && (
                    <ActivityIndicator
                      size="small"
                      color={AMBER}
                      style={{ marginTop: 4 }}
                    />
                  )}
                </View>
                <View style={s.platformValueCol}>
                  <Text style={s.fieldLabel}>You tracked</Text>
                  <Text style={s.trackedValue}>
                    {formatPence(row.mileclearTrackedPence)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })
      )}

      <View style={s.disclaimer}>
        <Ionicons name="information-circle-outline" size={14} color={TEXT_3} />
        <Text style={s.disclaimerText}>
          The figures here are entered by you and stored for your reference only. They
          are not submitted to HMRC. To check what HMRC actually has on file, log in to
          your Personal Tax Account on gov.uk.
        </Text>
      </View>
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
  },
  errorText: {
    color: TEXT_2,
    fontSize: 13,
    textAlign: "center",
  },
  intro: { marginBottom: 14 },
  taxYearBadge: {
    alignSelf: "flex-start",
    backgroundColor: AMBER_FAINT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 8,
  },
  taxYearBadgeText: {
    color: AMBER,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  title: {
    color: TEXT_1,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  intro2: {
    color: TEXT_2,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  totals: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    marginBottom: 12,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  totalsLabel: {
    color: TEXT_2,
    fontSize: 12,
    fontWeight: "500",
  },
  totalsValue: {
    color: TEXT_1,
    fontSize: 14,
    fontWeight: "600",
  },
  totalsDiffRow: {
    paddingTop: 8,
    marginTop: 4,
    marginBottom: 6,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
  },
  totalsDiffValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  totalsNote: {
    color: TEXT_3,
    fontSize: 11,
    marginTop: 4,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 12,
  },
  emptyText: {
    color: TEXT_2,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  platformCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 12,
    marginBottom: 8,
  },
  platformHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  platformLabel: {
    color: TEXT_1,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  diffPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  diffPillText: {
    fontSize: 10,
    fontWeight: "600",
  },
  platformBody: {
    flexDirection: "row",
    gap: 10,
  },
  platformInputCol: { flex: 1 },
  platformValueCol: { flex: 1 },
  fieldLabel: {
    color: TEXT_3,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  input: {
    color: TEXT_1,
    fontSize: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  trackedValue: {
    color: TEXT_1,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 8,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 4,
    marginTop: 10,
    marginBottom: 16,
  },
  disclaimerText: {
    color: TEXT_3,
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
});
