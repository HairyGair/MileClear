import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  TouchableOpacity,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";
import type { ReconciliationSummary } from "@mileclear/shared";
import {
  fetchHmrcReconciliation,
  saveHmrcReconciliation,
} from "../lib/api/hmrcReconciliation";
import { colors, fonts } from "../lib/theme";
import { useUser } from "../lib/user/context";
import { useTaxOverview } from "../lib/tax/useTaxOverview";
import { defaultReturnYear, recentTaxYears } from "../lib/tax/taxYears";

const BG = colors.bg;
const CARD_BG = colors.surface;
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = colors.amber;
const AMBER_FAINT = "rgba(245,166,35,0.08)";
const GREEN = colors.green;
const GREEN_FAINT = "rgba(16,185,129,0.08)";
const RED = colors.red;
const RED_FAINT = "rgba(239,68,68,0.10)";
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

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
  if (diffPence > 0) return `${formatPence(abs)} more reported by the app`;
  return `${formatPence(abs)} more recorded by you`;
}

export default function HmrcReconciliationScreen() {
  const router = useRouter();
  const { user, isCompanyDriver } = useUser();
  const overview = useTaxOverview();
  const [taxYear, setTaxYear] = useState(() => defaultReturnYear(overview.data?.return?.taxYear));
  const [data, setData] = useState<ReconciliationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPlatform, setSavingPlatform] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const pickYear = () => {
    Alert.alert("Tax year", undefined, [
      ...recentTaxYears(3).map((y) => ({
        text: y,
        onPress: () => {
          if (y === taxYear) return;
          setLoading(true);
          setData(null);
          setDrafts({});
          setTaxYear(y);
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

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

  if (user?.workType === "employee" || isCompanyDriver) {
    return (
      <View style={s.loading}>
        <Text style={s.errorText}>
          This is for self-employed drivers who get reports from gig apps.
        </Text>
      </View>
    );
  }

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
        <Text style={s.errorText}>Couldn't load your platform figures. Go back and try again.</Text>
      </View>
    );
  }

  const overall = data.totals;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.intro}>
        <TouchableOpacity
          style={s.taxYearBadge}
          onPress={pickYear}
          accessibilityRole="button"
          accessibilityLabel={`Tax year ${data.taxYear}. Tap to change`}
        >
          <Text style={s.taxYearBadgeText}>{data.taxYear}</Text>
          <Ionicons name="chevron-down" size={14} color={AMBER} />
        </TouchableOpacity>
        <Text style={s.intro2}>
          Gig apps now send HMRC a yearly report of what they paid you. If HMRC has
          shown you these figures, type each one in and MileClear shows any gap.
        </Text>
        <Text style={s.intro2}>
          Their reports cover January to December, so they won't match your tax year
          exactly. A small gap is normal.
        </Text>
      </View>

      {/* Totals card */}
      {overall.completedPlatforms > 0 && (
        <View style={s.totals}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Reported by the apps</Text>
            <Text style={s.totalsValue}>{formatPence(overall.hmrcReportedPence)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>You recorded</Text>
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
          {overall.diffPence > 0 && (
            <TouchableOpacity
              style={s.addBtn}
              onPress={() => router.push("/earning-form" as never)}
              accessibilityRole="button"
              accessibilityLabel="Add missing earnings"
            >
              <Text style={s.addBtnText}>Add missing earnings</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {data.rows.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="document-outline" size={28} color={TEXT_3} />
          <Text style={s.emptyText}>
            No earnings recorded for {data.taxYear}. Add your earnings first, then come
            back here to compare them with what the apps reported.
          </Text>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => router.push("/earning-form" as never)}
            accessibilityRole="button"
            accessibilityLabel="Add earnings"
          >
            <Text style={s.addBtnText}>Add earnings</Text>
          </TouchableOpacity>
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
                  <Text style={s.fieldLabel}>Reported by the app (£)</Text>
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
                  <Text style={s.fieldLabel}>You recorded</Text>
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
          stay in MileClear and don't go to HMRC. To see what HMRC has on file, sign in to your Personal
          Tax Account on GOV.UK.
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
    fontFamily: fonts.regular,
    textAlign: "center",
  },
  intro: { marginBottom: 14 },
  addBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.4)",
    marginTop: 8,
  },
  addBtnText: { color: AMBER, fontSize: 14, fontFamily: fonts.semibold },
  taxYearBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36,
    alignSelf: "flex-start",
    backgroundColor: AMBER_FAINT,
    paddingHorizontal: 12,
    borderRadius: 18,
    marginBottom: 8,
  },
  taxYearBadgeText: {
    color: AMBER,
    fontSize: 14,
    fontFamily: fonts.bold,
    letterSpacing: 0.6,
  },
  intro2: {
    color: TEXT_2,
    fontSize: 13,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.medium,
  },
  totalsValue: {
    color: TEXT_1,
    fontSize: 14,
    fontFamily: fonts.semibold,
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
    fontFamily: fonts.bold,
  },
  totalsNote: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
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
    fontFamily: fonts.bold,
    flex: 1,
  },
  diffPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  diffPillText: {
    fontSize: 10,
    fontFamily: fonts.semibold,
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
    fontFamily: fonts.regular,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  input: {
    color: TEXT_1,
    fontSize: 14,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.semibold,
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
    fontFamily: fonts.regular,
    lineHeight: 15,
    flex: 1,
  },
});
