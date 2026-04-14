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
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { getTaxYear, formatPence, formatMiles, SA103_BOXES, SA103_GUIDANCE } from "@mileclear/shared";
import { fetchSelfAssessmentSummary, type SelfAssessmentSummary } from "../lib/api/selfAssessment";
import { downloadAndShareExport } from "../lib/api/exports";
import { fetchProfile } from "../lib/api/user";
import { usePaywall } from "../components/paywall";

// ── Helpers ────────────────────────────────────────────────────────────────

function generateTaxYears(count: number): string[] {
  const current = getTaxYear(new Date());
  const startYear = parseInt(current.split("-")[0], 10);
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i;
    return `${y}-${String(y + 1).slice(2)}`;
  });
}

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
  if (type === "class2_ni") return "Class 2 NI";
  if (type === "class4_ni") return "Class 4 NI";
  return type;
}

const STEP_LABELS = [
  "Tax Year",
  "Income",
  "Mileage",
  "Expenses",
  "Tax Estimate",
  "SA103 Guide",
] as const;

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
  return (
    <>
      <SectionCard>
        <Text style={styles.stepTitle}>Income Summary</Text>
        <Text style={styles.stepDesc}>
          Your total gross income from all platforms in {summary.taxYear}. This maps to Box 9 of SA103.
        </Text>
        <HeroValue label="Total Earnings (Box 9)" value={formatPence(summary.totalEarningsPence)} />
      </SectionCard>

      {summary.platformBreakdown.length > 0 && (
        <SectionCard>
          <Text style={styles.cardTitle}>By Platform</Text>
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
          <Text style={styles.emptyText}>
            No earnings recorded for {summary.taxYear}. Add earnings from the Earnings screen.
          </Text>
        </SectionCard>
      )}
    </>
  );
}

function StepMileage({ summary }: { summary: SelfAssessmentSummary }) {
  return (
    <>
      <SectionCard>
        <Text style={styles.stepTitle}>Mileage Deduction</Text>
        <Text style={styles.stepDesc}>
          HMRC simplified mileage - 45p per mile for the first 10,000 business miles, 25p thereafter. Goes in Box 46.
        </Text>
        <HeroValue label="Mileage Deduction (Box 46)" value={formatPence(summary.mileageDeductionPence)} />
      </SectionCard>

      <SectionCard>
        <Text style={styles.cardTitle}>Miles Breakdown</Text>
        <DataRow label="Business miles" value={`${formatMiles(summary.businessMiles)} mi`} highlight />
        <DataRow label="Personal miles" value={`${formatMiles(summary.personalMiles)} mi`} />
        <View style={styles.divider} />
        <DataRow label="Total miles" value={`${formatMiles(summary.totalMiles)} mi`} />
      </SectionCard>

      {summary.vehicleBreakdown.length > 1 && (
        <SectionCard>
          <Text style={styles.cardTitle}>By Vehicle</Text>
          {summary.vehicleBreakdown.map((v) => (
            <View key={v.vehicleId} style={styles.vehicleRow}>
              <Text style={styles.vehicleRowName}>{v.make} {v.model}</Text>
              <View style={styles.vehicleRowDetails}>
                <DataRow label="Business" value={`${formatMiles(v.businessMiles)} mi`} />
                <DataRow label="Deduction" value={formatPence(v.deductionPence)} highlight />
              </View>
            </View>
          ))}
        </SectionCard>
      )}

      <View style={styles.noteBox}>
        <Ionicons name="information-circle-outline" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
        <Text style={styles.noteText}>
          You are using the simplified mileage method (Box 46). You cannot also claim actual vehicle costs in Box 25 for the same vehicle.
        </Text>
      </View>
    </>
  );
}

function StepExpenses({ summary }: { summary: SelfAssessmentSummary }) {
  const claimable = summary.expenseBreakdown.filter((e) => e.deductibleWithMileage && e.totalPence > 0);
  const notClaimable = summary.expenseBreakdown.filter((e) => !e.deductibleWithMileage && e.totalPence > 0);

  return (
    <>
      <SectionCard>
        <Text style={styles.stepTitle}>Allowable Expenses</Text>
        <Text style={styles.stepDesc}>
          Expenses claimable alongside simplified mileage (parking, tolls, phone, equipment) go in Box 27. Vehicle running costs cannot be claimed.
        </Text>
        <HeroValue label="Claimable Expenses (Box 27)" value={formatPence(summary.allowableExpensesPence)} />
      </SectionCard>

      {claimable.length > 0 && (
        <SectionCard>
          <Text style={styles.cardTitle}>Claimable alongside mileage</Text>
          {claimable.map((e) => (
            <DataRow key={e.category} label={e.label} value={formatPence(e.totalPence)} />
          ))}
          <View style={styles.divider} />
          <DataRow label="Subtotal" value={formatPence(summary.allowableExpensesPence)} highlight />
        </SectionCard>
      )}

      {notClaimable.length > 0 && (
        <SectionCard>
          <Text style={styles.cardTitle}>Not claimable with mileage method</Text>
          <Text style={styles.cardSubDesc}>
            Tracked for your records but not deductible when using simplified mileage.
          </Text>
          {notClaimable.map((e) => (
            <DataRow key={e.category} label={e.label} value={formatPence(e.totalPence)} dimmed />
          ))}
        </SectionCard>
      )}

      {claimable.length === 0 && notClaimable.length === 0 && (
        <SectionCard>
          <Text style={styles.emptyText}>
            No expenses recorded for {summary.taxYear}. Log expenses from the Expenses screen.
          </Text>
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
        <Text style={styles.stepTitle}>Tax Estimate</Text>
        <Text style={styles.stepDesc}>
          An estimated breakdown for {summary.taxYear}. Your actual liability may differ - speak to an accountant for certainty.
        </Text>
      </SectionCard>

      <SectionCard>
        <Text style={styles.cardTitle}>Taxable Income Calculation</Text>
        <DataRow label="Total earnings" value={formatPence(summary.totalEarningsPence)} />
        <DataRow label="Mileage deduction (Box 46)" value={`- ${formatPence(summary.mileageDeductionPence)}`} />
        <DataRow label="Allowable expenses (Box 27)" value={`- ${formatPence(summary.allowableExpensesPence)}`} />
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

      <HeroValue label="Estimated Total Tax" value={formatPence(summary.totalTaxPence)} />
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
}: {
  summary: SelfAssessmentSummary;
  onDownload: () => void;
  downloading: boolean;
}) {
  const keyBoxNums = new Set([9, 27, 46]);

  const relevantBoxes = SA103_BOXES.filter((box) => {
    const val = summary.sa103Values?.[box.dataKey];
    return val !== undefined && val > 0;
  });

  return (
    <>
      <SectionCard>
        <Text style={styles.stepTitle}>SA103 Form Guide</Text>
        <Text style={styles.stepDesc}>
          These box values map directly to your HMRC SA103 Self-employment pages. Use them when filing at gov.uk/self-assessment or with your accountant.
        </Text>
      </SectionCard>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>{SA103_GUIDANCE.disclaimer}</Text>
      </View>

      {relevantBoxes.map((box) => {
        const val = summary.sa103Values?.[box.dataKey] ?? 0;
        const isKey = keyBoxNums.has(box.box);
        return (
          <View key={box.box} style={[styles.sa103Box, isKey && styles.sa103BoxKey]}>
            <View style={styles.sa103BoxHeader}>
              <View style={styles.sa103BoxNumWrap}>
                <Text style={styles.sa103BoxNum}>Box {box.box}</Text>
              </View>
              {isKey && <Text style={styles.sa103KeyBadge}>KEY BOX</Text>}
            </View>
            <Text style={styles.sa103BoxLabel}>{box.label}</Text>
            <Text style={styles.sa103BoxDesc}>{box.description}</Text>
            <Text style={styles.sa103BoxValue}>{formatPence(val)}</Text>
          </View>
        );
      })}

      {relevantBoxes.length === 0 && (
        <SectionCard>
          <Text style={styles.emptyText}>Complete earlier steps to see your SA103 box values.</Text>
        </SectionCard>
      )}

      <TouchableOpacity
        style={[styles.downloadBtn, downloading && { opacity: 0.6 }]}
        onPress={onDownload}
        disabled={downloading}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Download Self-Assessment PDF"
      >
        {downloading ? (
          <ActivityIndicator color="#030712" size="small" />
        ) : (
          <>
            <Ionicons name="download-outline" size={18} color="#030712" style={{ marginRight: 6 }} />
            <Text style={styles.downloadBtnText}>Download PDF Summary</Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function SelfAssessmentScreen() {
  const { showPaywall } = usePaywall();
  const taxYears = generateTaxYears(4);

  const [step, setStep] = useState(0);
  const [selectedYear, setSelectedYear] = useState(taxYears[1] ?? taxYears[0]);
  const [summary, setSummary] = useState<SelfAssessmentSummary | null>(null);
  const [loading, setLoading] = useState(false);
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
      const msg = err instanceof Error ? err.message : "Failed to load";
      if (msg === "Premium subscription required" || msg.includes("403")) {
        showPaywall("self-assessment");
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleNext = useCallback(() => {
    if (step === 0) {
      setSummary(null);
      fetchSummary(selectedYear);
      setStep(1);
    } else if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    }
  }, [step, selectedYear, fetchSummary]);

  const handleBack = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const handleYearPick = useCallback(() => {
    Alert.alert(
      "Select Tax Year",
      undefined,
      [
        ...taxYears.map((year) => ({
          text: year,
          onPress: () => {
            setSelectedYear(year);
            setSummary(null);
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }, [taxYears]);

  const handleDownload = useCallback(async () => {
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
  }, [selectedYear]);

  // Loading premium status
  if (isPremium === null) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Self Assessment" }} />
        <View style={styles.centered}>
          <ActivityIndicator color="#f5a623" />
        </View>
      </View>
    );
  }

  // Premium gate
  if (isPremium === false) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Self Assessment" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <TouchableOpacity
            style={styles.paywallBanner}
            onPress={() => showPaywall("self-assessment")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to MileClear Pro"
          >
            <Text style={styles.paywallTitle}>Pro Feature</Text>
            <Text style={styles.paywallText}>
              The Self Assessment Wizard - with income breakdowns, mileage deductions, SA103 box mapping and PDF summary - requires MileClear Pro.
            </Text>
            <Text style={styles.paywallCta}>Upgrade Now</Text>
            <Text style={styles.paywallLegal}>Auto-renews monthly. Cancel anytime.</Text>
            <View style={styles.paywallLinks}>
              <Text style={styles.paywallLink} onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/terms")}>
                Terms of Use
              </Text>
              <Text style={styles.paywallSep}>|</Text>
              <Text style={styles.paywallLink} onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/privacy")}>
                Privacy Policy
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  const progressPct = step === 0 ? 0 : (step / (TOTAL_STEPS - 1)) * 100;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Self Assessment Guide" }} />

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
                <Ionicons name="checkmark" size={10} color="#10b981" />
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
          Step {step + 1} of {TOTAL_STEPS} - {STEP_LABELS[step]}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Step 0: Year selection */}
        {step === 0 && (
          <>
            <SectionCard>
              <Text style={styles.stepTitle}>Select Tax Year</Text>
              <Text style={styles.stepDesc}>
                Choose the tax year for your Self Assessment. The UK tax year runs from 6 April to 5 April the following year.
              </Text>
            </SectionCard>
            <TouchableOpacity
              style={styles.yearPicker}
              onPress={handleYearPick}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Tax year: ${selectedYear}. Tap to change`}
            >
              <Text style={styles.yearPickerLabel}>Selected tax year</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.yearPickerValue}>{selectedYear}</Text>
                <Ionicons name="chevron-down" size={16} color="#f5a623" />
              </View>
            </TouchableOpacity>
            <Text style={styles.yearSubtext}>
              6 April {selectedYear.split("-")[0]} to 5 April {parseInt(selectedYear.split("-")[0]) + 1}
            </Text>
          </>
        )}

        {/* Loading */}
        {step > 0 && loading && (
          <View style={styles.centered}>
            <ActivityIndicator color="#f5a623" size="large" />
            <Text style={styles.loadingText}>Loading {selectedYear} data...</Text>
          </View>
        )}

        {/* Error */}
        {step > 0 && error && !loading && (
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

        {/* Step data */}
        {step > 0 && !loading && !error && summary && (
          <>
            {step === 1 && <StepIncome summary={summary} />}
            {step === 2 && <StepMileage summary={summary} />}
            {step === 3 && <StepExpenses summary={summary} />}
            {step === 4 && <StepTaxEstimate summary={summary} />}
            {step === 5 && (
              <StepSa103Guide
                summary={summary}
                onDownload={handleDownload}
                downloading={downloading}
              />
            )}
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
            <Ionicons name="chevron-back" size={18} color="#f0f2f5" />
            <Text style={styles.navBtnText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}

        {step < TOTAL_STEPS - 1 ? (
          <TouchableOpacity
            style={[styles.navBtnPrimary, (step > 0 && (loading || !summary)) && { opacity: 0.4 }]}
            onPress={handleNext}
            disabled={step > 0 && (loading || !summary)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Next step"
          >
            <Text style={styles.navBtnPrimaryText}>
              {step === 0 ? "Start" : loading ? "Loading..." : "Next"}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#030712" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setStep(0)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Start over"
          >
            <Text style={styles.navBtnText}>Start Over</Text>
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
    backgroundColor: "#030712",
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
    backgroundColor: "#030712",
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
    backgroundColor: "#f5a623",
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
    backgroundColor: "#0a1120",
    justifyContent: "center",
    alignItems: "center",
  },
  stepDotActive: {
    borderColor: "#f5a623",
    backgroundColor: "rgba(245,166,35,0.12)",
  },
  stepDotDone: {
    borderColor: "rgba(16,185,129,0.5)",
    backgroundColor: "rgba(16,185,129,0.1)",
  },
  stepDotText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#6b7280",
  },
  stepDotTextActive: {
    color: "#f5a623",
  },
  stepDotTextDone: {
    color: "#10b981",
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },

  // Section cards
  sectionCard: {
    backgroundColor: "#0a1120",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  stepTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
    marginBottom: 6,
  },
  stepDesc: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    lineHeight: 20,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
    marginBottom: 10,
  },
  cardSubDesc: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  heroValueAmount: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    flex: 1,
  },
  dataRowValue: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  dataRowValueHighlight: {
    color: "#f5a623",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
    marginBottom: 4,
  },
  vehicleRowDetails: {
    paddingLeft: 8,
  },

  // Year picker
  yearPicker: {
    backgroundColor: "#0a1120",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
  },
  yearPickerValue: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
  },
  yearSubtext: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    lineHeight: 18,
  },

  // Effective rate
  effectiveRate: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    lineHeight: 18,
  },

  // SA103 boxes
  sa103Box: {
    backgroundColor: "#0a1120",
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
  },
  sa103KeyBadge: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  sa103BoxLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
    marginBottom: 4,
    lineHeight: 18,
  },
  sa103BoxDesc: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    lineHeight: 18,
    marginBottom: 10,
  },
  sa103BoxValue: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
  },

  // Download button
  downloadBtn: {
    backgroundColor: "#f5a623",
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#ef4444",
    marginBottom: 10,
  },
  retryBtn: {
    alignSelf: "flex-start",
  },
  retryBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },

  // Loading
  loadingText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
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
    backgroundColor: "#030712",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  navBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#f5a623",
  },
  navBtnPrimaryText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },

  // Paywall
  paywallBanner: {
    backgroundColor: "#0a1120",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f5a623",
  },
  paywallTitle: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
    marginBottom: 8,
  },
  paywallText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    lineHeight: 22,
    marginBottom: 14,
  },
  paywallCta: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
    marginBottom: 8,
  },
  paywallLegal: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
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
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#3b82f6",
  },
  paywallSep: {
    fontSize: 11,
    color: "#4b5563",
  },

  // Empty
  emptyText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    textAlign: "center",
    paddingVertical: 12,
    lineHeight: 20,
  },
});
