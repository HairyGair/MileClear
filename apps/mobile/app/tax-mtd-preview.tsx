import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getTaxYear, formatPence } from "@mileclear/shared";
import {
  fetchHmrcStatus,
  previewPeriodSubmission,
  submitPeriod,
  type PeriodSubmissionPayload,
} from "../lib/api/hmrc";
import { isApiError } from "../lib/api";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;
const RED = colors.red;

// HMRC tax years run 6 April to 5 April. Convert from a calendar date
// to the tax year string the API expects ("YYYY-YY").
function deriveTaxYear(periodStartIso: string): string {
  const d = new Date(periodStartIso);
  if (Number.isNaN(d.getTime())) return getTaxYear(new Date());
  return getTaxYear(d);
}

export default function TaxMtdPreviewScreen() {
  const { from, to } = useLocalSearchParams<{ from: string; to: string }>();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PeriodSubmissionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taxYear = from ? deriveTaxYear(from) : getTaxYear(new Date());

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    (async () => {
      try {
        // Pull businessId from status — we know it's set because the
        // entry screen wouldn't have routed here otherwise. Defensive
        // refetch in case the user disconnected mid-navigation.
        const status = await fetchHmrcStatus();
        if (cancelled) return;
        if (!status.data.connected || !status.data.businessId) {
          setError("Reconnect to HMRC and confirm your trade before submitting.");
          setLoading(false);
          return;
        }
        setBusinessId(status.data.businessId);

        const res = await previewPeriodSubmission({
          businessId: status.data.businessId,
          taxYear,
          from,
          to,
        });
        if (!cancelled) {
          setPreview(res.data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.message : err instanceof Error ? err.message : "Couldn't load preview."
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, taxYear]);

  const onSubmit = useCallback(() => {
    if (!preview || !businessId) return;
    Alert.alert(
      "Submit to HMRC",
      `You're about to submit ${formatPeriodLabel(preview.periodDates.periodStartDate, preview.periodDates.periodEndDate)} to HMRC. ` +
        `Once submitted, you can amend the figures but not delete the submission.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          style: "default",
          onPress: async () => {
            setSubmitting(true);
            try {
              const result = await submitPeriod({
                businessId,
                taxYear,
                periodStartDate: preview.periodDates.periodStartDate,
                periodEndDate: preview.periodDates.periodEndDate,
              });
              router.replace({
                pathname: "/tax-mtd-submitted" as never,
                params: { periodId: result.data.periodId, taxYear },
              });
            } catch (err) {
              Alert.alert(
                "Submission failed",
                isApiError(err) ? err.message : err instanceof Error ? err.message : "Try again."
              );
              setSubmitting(false);
            }
          },
        },
      ]
    );
  }, [preview, businessId, taxYear]);

  if (loading) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: BG }]}>
        <Stack.Screen options={{ title: "Review submission", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
        <ActivityIndicator color={AMBER} size="large" />
        <Text style={styles.loadingText}>Calculating from your MileClear data…</Text>
      </View>
    );
  }

  if (error || !preview) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: BG, padding: 24 }]}>
        <Stack.Screen options={{ title: "Review submission", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
        <Ionicons name="alert-circle-outline" size={48} color={RED} />
        <Text style={[styles.title, { marginTop: 16 }]}>Couldn't build preview</Text>
        <Text style={styles.body}>{error ?? "Unknown error."}</Text>
      </View>
    );
  }

  const b = preview.breakdown;
  const turnoverPounds = (preview.periodIncome.turnover ?? 0).toFixed(2);
  const totalExpenses =
    (preview.periodExpenses.carVanTravelExpenses ?? 0) +
    (preview.periodExpenses.adminCosts ?? 0) +
    (preview.periodExpenses.otherExpenses ?? 0);
  const profit = (preview.periodIncome.turnover ?? 0) - totalExpenses;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
      <Stack.Screen options={{ title: "Review submission", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />

      <View style={styles.headerCard}>
        <Text style={styles.headerLabel}>QUARTERLY UPDATE</Text>
        <Text style={styles.headerPeriod}>
          {formatPeriodLabel(preview.periodDates.periodStartDate, preview.periodDates.periodEndDate)}
        </Text>
        <Text style={styles.headerTaxYear}>Tax year {taxYear}</Text>

        <View style={styles.divider} />

        <View style={styles.headlineRow}>
          <View style={styles.headlineItem}>
            <Text style={styles.headlineValue}>£{turnoverPounds}</Text>
            <Text style={styles.headlineLabel}>Income</Text>
          </View>
          <View style={styles.headlineItem}>
            <Text style={styles.headlineValue}>£{totalExpenses.toFixed(2)}</Text>
            <Text style={styles.headlineLabel}>Allowable expenses</Text>
          </View>
          <View style={styles.headlineItem}>
            <Text style={[styles.headlineValue, profit >= 0 ? { color: GREEN } : { color: RED }]}>
              £{profit.toFixed(2)}
            </Text>
            <Text style={styles.headlineLabel}>Net profit</Text>
          </View>
        </View>
      </View>

      {b.warnings.length > 0 && (
        <View style={styles.warningsCard}>
          <Ionicons name="information-circle-outline" size={18} color={AMBER} />
          <View style={{ flex: 1, gap: 6 }}>
            {b.warnings.map((w, i) => (
              <Text key={i} style={styles.warningText}>{w}</Text>
            ))}
          </View>
        </View>
      )}

      <Section title="Income">
        <SectionRow label="Total turnover" value={`£${turnoverPounds}`} />
        <SectionRow label="From" value={`${b.income.earningCount} earning${b.income.earningCount === 1 ? "" : "s"}`} muted />
        {b.income.perPlatform.map((p) => (
          <SectionRow
            key={p.platform}
            label={`  ${platformLabel(p.platform)}`}
            value={formatPence(p.pence)}
            muted
          />
        ))}
      </Section>

      <Section title="Mileage">
        <SectionRow label="Business miles this period" value={b.mileage.businessMilesThisPeriod.toLocaleString("en-GB", { maximumFractionDigits: 1 })} />
        <SectionRow label="Trips" value={String(b.mileage.tripCount)} muted />
        {b.mileage.businessMilesPriorInTaxYear > 0 && (
          <SectionRow
            label="Earlier in this tax year"
            value={`${b.mileage.businessMilesPriorInTaxYear.toLocaleString("en-GB", { maximumFractionDigits: 0 })} miles`}
            muted
          />
        )}
        <SectionRow
          label="AMAP rate"
          value={
            b.mileage.rateFirst10kPence === b.mileage.rateAfter10kPence
              ? `${b.mileage.rateFirst10kPence}p / mile`
              : `${b.mileage.rateFirst10kPence}p / ${b.mileage.rateAfter10kPence}p`
          }
          muted
        />
        <SectionRow
          label="Mileage deduction"
          value={formatPence(b.mileage.deductionPence)}
          highlight
        />
        {b.mileage.crossesTenKThreshold && (
          <Text style={styles.tierNote}>
            ⓘ Crosses the 10,000-mile threshold this period — tier-crossing handled
            automatically.
          </Text>
        )}
      </Section>

      <Section title="Expenses">
        {(preview.periodExpenses.carVanTravelExpenses ?? 0) > 0 && (
          <SectionRow
            label="Car/van/travel (incl. mileage)"
            value={`£${(preview.periodExpenses.carVanTravelExpenses ?? 0).toFixed(2)}`}
          />
        )}
        {(preview.periodExpenses.adminCosts ?? 0) > 0 && (
          <SectionRow
            label="Admin costs"
            value={`£${(preview.periodExpenses.adminCosts ?? 0).toFixed(2)}`}
          />
        )}
        {(preview.periodExpenses.otherExpenses ?? 0) > 0 && (
          <SectionRow
            label="Other allowable"
            value={`£${(preview.periodExpenses.otherExpenses ?? 0).toFixed(2)}`}
          />
        )}
        <SectionRow label="Tracked expenses" value={String(b.expenses.expenseCount)} muted />
        {b.expenses.excludedNonAmapPence > 0 && (
          <Text style={styles.helperNote}>
            {formatPence(b.expenses.excludedNonAmapPence)} of motor running costs (fuel, insurance, road tax, MOT, maintenance) excluded — those are folded into the AMAP per-mile rate.
          </Text>
        )}
      </Section>

      <View style={styles.submitRow}>
        <TouchableOpacity
          style={[styles.primaryButton, submitting && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Submit to HMRC"
          accessibilityState={{ disabled: submitting }}
        >
          {submitting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Submit to HMRC</Text>
              <Ionicons name="cloud-upload-outline" size={18} color="#000" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SectionRow({
  label,
  value,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && styles.rowLabelMuted]}>{label}</Text>
      <Text style={[styles.rowValue, muted && styles.rowValueMuted, highlight && styles.rowValueHighlight]}>
        {value}
      </Text>
    </View>
  );
}

function platformLabel(tag: string): string {
  const MAP: Record<string, string> = {
    uber: "Uber",
    deliveroo: "Deliveroo",
    just_eat: "Just Eat",
    amazon_flex: "Amazon Flex",
    stuart: "Stuart",
    gophr: "Gophr",
    dpd: "DPD",
    yodel: "Yodel",
    evri: "Evri",
    freelance: "Freelance",
    other: "Other",
  };
  return MAP[tag] ?? tag;
}

function formatPeriodLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startMonth = start.toLocaleDateString("en-GB", { month: "short" });
  const endMonth = end.toLocaleDateString("en-GB", { month: "short" });
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
  }
  return `${start.getDate()} ${startMonth} ${start.getFullYear()} – ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  loadingText: {
    color: TEXT_3,
    fontSize: 13,
    marginTop: 16,
    fontFamily: fonts.regular,
  },
  title: { color: TEXT_1, fontSize: 20, fontFamily: fonts.bold, textAlign: "center" },
  body: { color: TEXT_2, fontSize: 14, textAlign: "center", marginTop: 8, fontFamily: fonts.regular },

  headerCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  headerLabel: {
    color: AMBER,
    fontSize: 11,
    fontFamily: fonts.semibold,
    letterSpacing: 0.6,
  },
  headerPeriod: {
    color: TEXT_1,
    fontSize: 22,
    fontFamily: fonts.bold,
    marginTop: 4,
  },
  headerTaxYear: {
    color: TEXT_3,
    fontSize: 13,
    fontFamily: fonts.regular,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginVertical: 16,
  },
  headlineRow: { flexDirection: "row", justifyContent: "space-between" },
  headlineItem: { flex: 1, alignItems: "center" },
  headlineValue: {
    color: TEXT_1,
    fontSize: 18,
    fontFamily: fonts.bold,
  },
  headlineLabel: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.regular,
    marginTop: 2,
    textAlign: "center",
  },

  warningsCard: {
    backgroundColor: "rgba(245, 166, 35, 0.08)",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 12,
  },
  warningText: {
    color: TEXT_2,
    fontSize: 13,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },

  section: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.semibold,
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  row: { flexDirection: "row", paddingVertical: 6, alignItems: "center", justifyContent: "space-between" },
  rowLabel: { color: TEXT_1, fontSize: 14, fontFamily: fonts.regular, flex: 1 },
  rowLabelMuted: { color: TEXT_3 },
  rowValue: { color: TEXT_1, fontSize: 14, fontFamily: fonts.semibold },
  rowValueMuted: { color: TEXT_3, fontFamily: fonts.regular },
  rowValueHighlight: { color: AMBER },

  tierNote: {
    color: AMBER,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 8,
    lineHeight: 18,
  },
  helperNote: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 8,
    lineHeight: 18,
  },

  submitRow: { marginTop: 16 },
  primaryButton: {
    backgroundColor: AMBER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#000", fontFamily: fonts.semibold, fontSize: 16 },
});
