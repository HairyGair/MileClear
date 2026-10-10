import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatPence, formatMiles, SA103_BOXES, SA103_GUIDANCE, EXPENSE_CATEGORIES } from "@mileclear/shared";
import { fetchSelfAssessmentSummary, type SelfAssessmentSummary } from "../lib/api/selfAssessment";
import { downloadAndShareExport } from "../lib/api/exports";
import { fetchProfile } from "../lib/api/user";
import { usePaywall } from "../components/paywall";
import { colors, fonts } from "../lib/theme";
import { useTaxOverview } from "../lib/tax/useTaxOverview";
import { defaultReturnYear, recentTaxYears } from "../lib/tax/taxYears";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;
const RED = colors.red;

// ── Helpers ────────────────────────────────────────────────────────────────

function platformLabel(tag: string): string {
  const MAP: Record<string, string> = {
    uber: "Uber / Uber Eats",
    deliveroo: "Deliveroo",
    just_eat: "Just Eat",
    amazon_flex: "Amazon Flex",
    stuart: "Stuart",
    gophr: "Gophr",
    dpd: "DPD",
    yodel: "Yodel",
    evri: "Evri",
    other: "Other",
  };
  return MAP[tag] ?? tag;
}

function taxTypeLabel(type: string): string {
  if (type === "income_tax") return "Income Tax";
  if (type === "class2_ni") return "National Insurance (Class 2)";
  if (type === "class4_ni") return "National Insurance (Class 4)";
  return type;
}

const STEP_LABELS = [
  "Income",
  "Mileage",
  "Expenses",
  "Tax estimate",
  "Box by box",
] as const;

/** SA103S box for an expense category, or null for an unknown category. */
function expenseBox(category: string): number | null {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.sa103sBox ?? null;
}

const TOTAL_STEPS = STEP_LABELS.length;

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.sectionCard}>{children}</View>;
}

function HeroValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroValue}>
      <Text style={styles.heroValueLabel}>{label}</Text>
      <Text style={styles.heroValueAmount}>{value}</Text>
    </View>
  );
}

function DataRow({
  label,
  value,
  highlight,
  dimmed,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  dimmed?: boolean;
}) {
  return (
    <View style={styles.dataRow}>
      <Text style={[styles.dataRowLabel, dimmed && { opacity: 0.5 }]}>{label}</Text>
      <Text
        style={[
          styles.dataRowValue,
          highlight && styles.dataRowValueHighlight,
          dimmed && { opacity: 0.5 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Step content components ────────────────────────────────────────────────

function StepIncome({ summary }: { summary: SelfAssessmentSummary }) {
  const router = useRouter();
  return (
    <>
      <SectionCard>
        <Text style={styles.stepTitle}>Your income</Text>
        <Text style={styles.stepDesc}>
          Your total income from all platforms in {summary.taxYear}. It goes in box 9 on the short self-employment pages (SA103S).
        </Text>
        <HeroValue label="Earnings · goes in box 9" value={formatPence(summary.totalEarningsPence)} />
      </SectionCard>

      {summary.platformBreakdown.length > 0 && (
        <SectionCard>
          <Text style={styles.cardTitle}>By platform</Text>
          {summary.platformBreakdown.map((row) => (
            <DataRow
              key={row.platform}
              label={platformLabel(row.platform)}
              value={formatPence(row.totalPence)}
            />
          ))}
          <View style={styles.divider} />
          <DataRow
            label="Total"
            value={formatPence(summary.totalEarningsPence)}
            highlight
          />
        </SectionCard>
      )}

      {summary.platformBreakdown.length === 0 && (
        <SectionCard>
          <Text style={styles.emptyText}>No earnings recorded for {summary.taxYear}.</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push("/earning-form" as never)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add earnings"
          >
            <Text style={styles.emptyBtnText}>Add earnings</Text>
          </TouchableOpacity>
        </SectionCard>
      )}
    </>
  );
}

function StepMileage({ summary }: { summary: SelfAssessmentSummary }) {
  // The rate depends on the tax year being filed: the 2025-26 return (due
  // 31 Jan 2027) is still at 45p. Same rule as the web walkthrough.
  const isPost2026 = summary.taxYear >= "2026-27";
  const firstTier = isPost2026 ? "55p" : "45p";
  return (
    <>
      <SectionCard>
        <Text style={styles.stepTitle}>Mileage on your tax return</Text>
        <Text style={styles.stepDesc}>
          For {summary.taxYear}: {firstTier} a mile for the first 10,000 business miles, then 25p. It goes in box 12 with your other travel costs.
        </Text>
        <HeroValue label="Part of box 12" value={formatPence(summary.mileageDeductionPence)} />
      </SectionCard>

      <SectionCard>
        <Text style={styles.cardTitle}>Miles breakdown</Text>
        <DataRow label="Business miles" value={formatMiles(summary.businessMiles)} highlight />
        <DataRow label="Personal miles" value={formatMiles(summary.personalMiles)} />
        <View style={styles.divider} />
        <DataRow label="Total miles" value={formatMiles(summary.totalMiles)} />
      </SectionCard>

      {summary.vehicleBreakdown.length > 1 && (
        <SectionCard>
          <Text style={styles.cardTitle}>By vehicle</Text>
          {summary.vehicleBreakdown.map((v) => (
            <View key={v.vehicleId} style={styles.vehicleRow}>
              <Text style={styles.vehicleRowName}>{v.make} {v.model}</Text>
              <View style={styles.vehicleRowDetails}>
                <DataRow label="Business" value={formatMiles(v.businessMiles)} />
                <DataRow label="On your return" value={formatPence(v.deductionPence)} highlight />
              </View>
            </View>
          ))}
        </SectionCard>
      )}

      <View style={styles.noteBox}>
        <Ionicons name="information-circle-outline" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
        <Text style={styles.noteText}>
          You are using the simplified mileage method. You cannot also claim the actual running costs (fuel, insurance, repairs, road tax, MOT) of the same vehicle.
        </Text>
      </View>
    </>
  );
}

function StepExpenses({ summary }: { summary: SelfAssessmentSummary }) {
  const router = useRouter();
  const claimable = summary.expenseBreakdown.filter((e) => e.deductibleWithMileage && e.totalPence > 0);
  const notClaimable = summary.expenseBreakdown.filter((e) => !e.deductibleWithMileage && e.totalPence > 0);

  return (
    <>
      <SectionCard>
        <Text style={styles.stepTitle}>Expenses</Text>
        <Text style={styles.stepDesc}>
          Expenses you can claim alongside simplified mileage. Each shows its SA103S box: parking, tolls and fares go in box 12 with your mileage, your phone in box 18. Vehicle running costs cannot be claimed.
        </Text>
        <HeroValue label="You can claim" value={formatPence(summary.allowableExpensesPence)} />
      </SectionCard>

      {claimable.length > 0 && (
        <SectionCard>
          <Text style={styles.cardTitle}>Claimable alongside mileage</Text>
          {claimable.map((e) => {
            const box = expenseBox(e.category);
            return (
              <DataRow
                key={e.category}
                label={box ? `${e.label} (box ${box})` : e.label}
                value={formatPence(e.totalPence)}
              />
            );
          })}
          <View style={styles.divider} />
          <DataRow label="Subtotal" value={formatPence(summary.allowableExpensesPence)} highlight />
        </SectionCard>
      )}

      {notClaimable.length > 0 && (
        <SectionCard>
          <Text style={styles.cardTitle}>Not claimable with the mileage method</Text>
          <Text style={styles.cardSubDesc}>
            Tracked for your records, but you cannot claim them when you use simplified mileage.
          </Text>
          {notClaimable.map((e) => (
            <DataRow key={e.category} label={e.label} value={formatPence(e.totalPence)} dimmed />
          ))}
        </SectionCard>
      )}

      {claimable.length === 0 && notClaimable.length === 0 && (
        <SectionCard>
          <Text style={styles.emptyText}>No expenses recorded for {summary.taxYear}.</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push("/expenses" as never)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add expenses"
          >
            <Text style={styles.emptyBtnText}>Add expenses</Text>
          </TouchableOpacity>
        </SectionCard>
      )}
    </>
  );
}

function StepTaxEstimate({ summary }: { summary: SelfAssessmentSummary }) {
  const incomeTax = summary.taxBandBreakdown.filter((b) => b.type === "income_tax" && b.amountPence > 0);
  const niRows = summary.taxBandBreakdown.filter((b) => b.type !== "income_tax" && b.amountPence > 0);

  return (
    <>
      <SectionCard>
        <Text style={styles.stepTitle}>Tax estimate</Text>
        <Text style={styles.stepDesc}>
          An estimated breakdown for {summary.taxYear}. Your actual bill may differ, so check with an accountant if you want to be sure.
        </Text>
      </SectionCard>

      <SectionCard>
        <Text style={styles.cardTitle}>Taxable profit</Text>
        <DataRow label="Total earnings" value={formatPence(summary.totalEarningsPence)} />
        <DataRow label="Mileage on your return" value={`- ${formatPence(summary.mileageDeductionPence)}`} />
        <DataRow label="Other allowable expenses" value={`- ${formatPence(summary.allowableExpensesPence)}`} />
        <View style={styles.divider} />
        <DataRow label="Taxable profit" value={formatPence(summary.taxableProfitPence)} highlight />
      </SectionCard>

      {incomeTax.length > 0 && (
        <SectionCard>
          <Text style={styles.cardTitle}>Income Tax</Text>
          {incomeTax.map((b) => (
            <DataRow
              key={b.band}
              label={`${b.band}${b.ratePct != null ? ` (${Math.round(b.ratePct * 100)}%)` : ""}`}
              value={formatPence(b.amountPence)}
            />
          ))}
        </SectionCard>
      )}

      {niRows.length > 0 && (
        <SectionCard>
          <Text style={styles.cardTitle}>National Insurance</Text>
          {niRows.map((b) => (
            <DataRow
              key={b.band}
              label={taxTypeLabel(b.type)}
              value={formatPence(b.amountPence)}
            />
          ))}
        </SectionCard>
      )}

      <HeroValue label="Estimated tax and National Insurance" value={formatPence(summary.totalTaxPence)} />
      {summary.effectiveRatePercent > 0 && (
        <Text style={styles.effectiveRate}>
          Effective rate: {summary.effectiveRatePercent.toFixed(1)}%
        </Text>
      )}

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>{SA103_GUIDANCE.disclaimer}</Text>
      </View>
    </>
  );
}

function StepSa103Guide({
  summary,
  onDownload,
  downloading,
  isPremium,
}: {
  summary: SelfAssessmentSummary;
  onDownload: () => void;
  downloading: boolean;
  isPremium: boolean | null;
}) {
  const relevantBoxes = SA103_BOXES.filter((box) => {
    const val = summary.sa103Values?.[box.dataKey];
    return val !== undefined && val > 0;
  });

  return (
    <>
      <SectionCard>
        <Text style={styles.stepTitle}>Box by box</Text>
        <Text style={styles.stepDesc}>
          Box numbers are for the short self-employment pages (SA103S), used when your turnover was below £90,000. With a turnover of £90,000 or more you need the full pages (SA103F), which number their boxes differently. Use these figures when you file at GOV.UK or give them to your accountant.
        </Text>
      </SectionCard>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>{SA103_GUIDANCE.disclaimer}</Text>
      </View>

      {relevantBoxes.map((box) => {
        const val = summary.sa103Values?.[box.dataKey] ?? 0;
        const isKey = box.key === true;
        return (
          <View key={box.box} style={[styles.sa103Box, isKey && styles.sa103BoxKey]}>
            <View style={styles.sa103BoxHeader}>
              <View style={styles.sa103BoxNumWrap}>
                <Text style={styles.sa103BoxNum}>Box {box.box}</Text>
              </View>
              {isKey && <Text style={styles.sa103KeyBadge}>Main box</Text>}
            </View>
            <Text style={styles.sa103BoxLabel}>{box.label}</Text>
            <Text style={styles.sa103BoxDesc}>{box.description}</Text>
            <Text style={styles.sa103BoxValue}>{formatPence(val)}</Text>
          </View>
        );
      })}

      {relevantBoxes.length === 0 && (
        <SectionCard>
          <Text style={styles.emptyText}>Nothing recorded for {summary.taxYear}, so there's nothing to put in the boxes yet.</Text>
        </SectionCard>
      )}

      <TouchableOpacity
        style={[styles.downloadBtn, downloading && { opacity: 0.6 }]}
        onPress={onDownload}
        disabled={downloading}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={isPremium ? "Download PDF" : "Download PDF, Pro"}
      >
        {downloading ? (
          <ActivityIndicator color={BG} size="small" />
        ) : (
          <>
            <Ionicons
              name={isPremium ? "download-outline" : "lock-closed"}
              size={18}
              color={BG}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.downloadBtnText}>
              {isPremium ? "Download PDF" : "Download PDF (Pro)"}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function SelfAssessmentScreen() {
  const router = useRouter();
  const { showPaywall } = usePaywall();
  const taxYears = recentTaxYears(4);
  const overview = useTaxOverview();

  const [step, setStep] = useState(0);
  // The return due next when the Tax tab has loaded, else last tax year.
  const [selectedYear, setSelectedYear] = useState(() =>
    defaultReturnYear(overview.data?.return?.taxYear),
  );
  const [summary, setSummary] = useState<SelfAssessmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then((res) => setIsPremium(res.data.isPremium))
      .catch(() => setIsPremium(false));
  }, []);

  const fetchSummary = useCallback(async (year: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSelfAssessmentSummary(year);
      setSummary(res.data);
    } catch (err: unknown) {
      // The walkthrough is free; only the PDF is Pro. A 403 here would be
      // a server-side regression rather than the paywall, so show it.
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSummary(null);
    fetchSummary(selectedYear);
  }, [selectedYear, fetchSummary]);

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
  }, [step]);

  const handleBack = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const handleYearPick = useCallback(() => {
    Alert.alert(
      "Tax year",
      undefined,
      [
        ...taxYears.map((year) => ({
          text: year,
          onPress: () => setSelectedYear(year),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = useCallback(async () => {
    // Known free: open the Pro screen straight away rather than asking the
    // server for a PDF it will refuse (it still refuses, as the backstop).
    if (isPremium === false) {
      showPaywall("self-assessment");
      return;
    }
    setDownloading(true);
    try {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `mileclear-self-assessment-${selectedYear}-${date}.pdf`;
      await downloadAndShareExport(
        `/exports/self-assessment?taxYear=${encodeURIComponent(selectedYear)}`,
        filename,
        "application/pdf"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      if (msg === "Premium subscription required") {
        showPaywall("self-assessment");
        return;
      }
      Alert.alert("Download failed", msg);
    } finally {
      setDownloading(false);
    }
  }, [selectedYear, showPaywall, isPremium]);

  const progressPct = (step / (TOTAL_STEPS - 1)) * 100;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Box by box",
          headerRight: () => (
            <TouchableOpacity
              onPress={handleYearPick}
              hitSlop={8}
              style={styles.yearChip}
              accessibilityRole="button"
              accessibilityLabel={`Tax year ${selectedYear}. Tap to change`}
            >
              <Text style={styles.yearChipText}>{selectedYear}</Text>
              <Ionicons name="chevron-down" size={14} color={AMBER} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Step dots */}
      <View style={styles.stepBar}>
        <View style={styles.stepProgressTrack}>
          <View style={[styles.stepProgressFill, { width: `${progressPct}%` as any }]} />
        </View>
        <View style={styles.stepDots}>
          {STEP_LABELS.map((label, i) => (
            <View
              key={label}
              style={[
                styles.stepDot,
                i === step && styles.stepDotActive,
                i < step && styles.stepDotDone,
              ]}
              accessibilityLabel={`Step ${i + 1}: ${label}${i === step ? " (current)" : ""}`}
            >
              {i < step ? (
                <Ionicons name="checkmark" size={10} color={GREEN} />
              ) : (
                <Text
                  style={[
                    styles.stepDotText,
                    i === step && styles.stepDotTextActive,
                    i < step && styles.stepDotTextDone,
                  ]}
                >
                  {i + 1}
                </Text>
              )}
            </View>
          ))}
        </View>
        <Text style={styles.stepLabel}>
          Step {step + 1} of {TOTAL_STEPS}: {STEP_LABELS[step]}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 && isPremium === false && (
          <View style={styles.noteBox}>
            <Ionicons name="information-circle-outline" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
            <Text style={styles.noteText}>
              This walkthrough is free. A printable PDF of it is part of Pro.
            </Text>
          </View>
        )}

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator color={AMBER} size="large" />
            <Text style={styles.loadingText}>Loading {selectedYear}...</Text>
          </View>
        )}

        {error && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => fetchSummary(selectedYear)}
              accessibilityRole="button"
              accessibilityLabel="Retry"
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && summary && (
          <>
            {step === 0 && <StepIncome summary={summary} />}
            {step === 1 && <StepMileage summary={summary} />}
            {step === 2 && <StepExpenses summary={summary} />}
            {step === 3 && <StepTaxEstimate summary={summary} />}
            {step === 4 && (
              <StepSa103Guide
                summary={summary}
                onDownload={handleDownload}
                downloading={downloading}
                isPremium={isPremium}
              />
            )}
            <TouchableOpacity
              style={styles.checklistLink}
              onPress={() => router.push("/sa-checklist" as never)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Open your return checklist"
            >
              <Ionicons name="checkbox-outline" size={16} color={AMBER} />
              <Text style={styles.checklistLinkText}>See what's left on your return</Text>
              <Ionicons name="chevron-forward" size={14} color={AMBER} />
            </TouchableOpacity>
          </>
        )}

        {/* Bottom spacing for nav bar */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Navigation bar */}
      <View style={styles.navBar}>
        {step > 0 ? (
          <TouchableOpacity
            style={styles.navBtn}
            onPress={handleBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Previous step"
          >
            <Ionicons name="chevron-back" size={18} color={TEXT_1} />
            <Text style={styles.navBtnText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}

        {step < TOTAL_STEPS - 1 ? (
          <TouchableOpacity
            style={[styles.navBtnPrimary, (loading || !summary) && { opacity: 0.4 }]}
            onPress={handleNext}
            disabled={loading || !summary}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Next step"
          >
            <Text style={styles.navBtnPrimaryText}>{loading ? "Loading..." : "Next"}</Text>
            <Ionicons name="chevron-forward" size={18} color={BG} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.navBtnPrimary}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.navBtnPrimaryText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  checklistLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
  },
  checklistLinkText: {
    flex: 1,
    color: TEXT_1,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },

  // Step progress bar
  stepBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: BG,
  },
  stepProgressTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 2,
    marginBottom: 10,
    overflow: "hidden",
  },
  stepProgressFill: {
    height: "100%",
    backgroundColor: AMBER,
    borderRadius: 2,
  },
  stepDots: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginBottom: 6,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: CARD_BG,
    justifyContent: "center",
    alignItems: "center",
  },
  stepDotActive: {
    borderColor: AMBER,
    backgroundColor: "rgba(245,166,35,0.12)",
  },
  stepDotDone: {
    borderColor: "rgba(16,185,129,0.5)",
    backgroundColor: "rgba(16,185,129,0.1)",
  },
  stepDotText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: TEXT_3,
  },
  stepDotTextActive: {
    color: AMBER,
  },
  stepDotTextDone: {
    color: GREEN,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },

  // Section cards
  sectionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  stepTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginBottom: 6,
  },
  stepDesc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 20,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginBottom: 10,
  },
  cardSubDesc: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginBottom: 10,
    lineHeight: 18,
  },

  // Hero value
  heroValue: {
    backgroundColor: "rgba(245,166,35,0.06)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.15)",
    borderRadius: 10,
    padding: 14,
    marginBottom: 4,
  },
  heroValueLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  heroValueAmount: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: AMBER,
  },

  // Data rows
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  dataRowLabel: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    flex: 1,
  },
  dataRowValue: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  dataRowValueHighlight: {
    color: AMBER,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    marginVertical: 6,
  },

  // Vehicle sub-row
  vehicleRow: {
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
    paddingBottom: 10,
  },
  vehicleRowName: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 4,
  },
  vehicleRowDetails: {
    paddingLeft: 8,
  },

  // Year picker
  yearPicker: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.25)",
  },
  yearPickerLabel: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  yearPickerValue: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: AMBER,
  },
  yearSubtext: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginBottom: 12,
  },

  // Note box
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(59,130,246,0.06)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.15)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 18,
  },

  // Effective rate
  effectiveRate: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 12,
  },

  // Disclaimer
  disclaimer: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderLeftWidth: 3,
    borderLeftColor: "rgba(245,166,35,0.4)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  disclaimerText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    lineHeight: 18,
  },

  // SA103 boxes
  sa103Box: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  sa103BoxKey: {
    borderColor: "rgba(245,166,35,0.3)",
    backgroundColor: "rgba(245,166,35,0.04)",
  },
  sa103BoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  sa103BoxNumWrap: {
    backgroundColor: "rgba(245,166,35,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sa103BoxNum: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: AMBER,
  },
  sa103KeyBadge: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: AMBER,
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  sa103BoxLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 4,
    lineHeight: 18,
  },
  sa103BoxDesc: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    lineHeight: 18,
    marginBottom: 10,
  },
  sa103BoxValue: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: AMBER,
  },

  // Download button
  downloadBtn: {
    backgroundColor: AMBER,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  downloadBtnText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: BG,
  },

  // Error
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: RED,
    marginBottom: 10,
  },
  retryBtn: {
    alignSelf: "flex-start",
  },
  retryBtnText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: AMBER,
  },

  // Loading
  loadingText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 12,
  },

  // Navigation bar
  navBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: BG,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  navBtnText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  navBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: AMBER,
  },
  navBtnPrimaryText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: BG,
  },

  // Paywall
  paywallBanner: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: AMBER,
  },
  paywallTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: AMBER,
    marginBottom: 8,
  },
  paywallText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 22,
    marginBottom: 14,
  },
  paywallCta: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: AMBER,
    marginBottom: 8,
  },
  paywallLegal: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 6,
  },
  paywallLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  paywallLink: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: "#3b82f6",
  },
  paywallSep: {
    fontSize: 11,
    color: TEXT_3,
  },

  // Empty
  yearChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245,166,35,0.12)",
    marginRight: 4,
  },
  yearChipText: {
    color: AMBER,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  emptyBtn: {
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.4)",
  },
  emptyBtnText: {
    color: AMBER,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_3,
    textAlign: "center",
    paddingVertical: 12,
    lineHeight: 20,
  },
});
