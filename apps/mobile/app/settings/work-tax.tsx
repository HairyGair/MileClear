import { useCallback, useEffect, useState } from "react";
import { Alert, TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { WorkType } from "@mileclear/shared";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { fetchProfile, updateProfile } from "../../lib/api/user";
import { useUser } from "../../lib/user/context";
import { colors, fonts, radii, spacing } from "../../lib/theme";
import { useIsPremium } from "../../components/PremiumGate";
import { usePrompt } from "../../components/prompt";

/**
 * "Your tax details" sub-screen. Owns the settings that feed the Tax tab
 * and the exports:
 *
 *   - Work type (gig / employee / both)
 *   - Employer mileage rate (visible only when employee/both)
 *   - Other annual income (drives the marginal tax-rate calculation)
 *   (The weekly miles goal moved to settings/preferences on 10 Oct 2026.)
 */
export default function WorkTaxSettings() {
  const { refreshUser } = useUser();
  const isPremium = useIsPremium();
  const { prompt } = usePrompt();
  const [workType, setWorkType] = useState<WorkType>("gig");
  const [employerRate, setEmployerRate] = useState<number | null>(null);
  const [employerRateAfter10k, setEmployerRateAfter10k] = useState<number | null>(null);
  const [otherIncomePence, setOtherIncomePence] = useState<number | null>(null);
  const [payeTaxPaidPence, setPayeTaxPaidPence] = useState<number | null>(null);
  const [taxBasis, setTaxBasis] = useState<"cash" | "accruals">("cash");

  // Load on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchProfile();
        if (res.data.workType) setWorkType(res.data.workType as WorkType);
        setEmployerRate(res.data.employerMileageRatePence ?? null);
        setEmployerRateAfter10k(res.data.employerMileageRatePenceAfter10k ?? null);
        setOtherIncomePence(res.data.otherAnnualIncomePence ?? null);
        const profile = res.data as unknown as {
          payeAnnualPaidTaxPence?: number | null;
          taxBasis?: "cash" | "accruals" | null;
        };
        setPayeTaxPaidPence(profile.payeAnnualPaidTaxPence ?? null);
        setTaxBasis(profile.taxBasis ?? "cash");
      } catch (e) {
        console.warn("[settings/work-tax] profile load failed:", e);
      }
    })();
  }, []);

  // ── Work type ─────────────────────────────────────────────────────
  const handleWorkType = useCallback(
    async (wt: WorkType) => {
      setWorkType(wt);
      try {
        await updateProfile({ workType: wt });
        refreshUser();
      } catch {
        Alert.alert("Couldn't update work type", "Try again in a moment.");
      }
    },
    [refreshUser]
  );

  // ── Employer rate (two-tier prompt on iOS) ────────────────────────
  const handleEmployerRate = useCallback(async () => {
    const saveTiers = async (first: number | null, after: number | null) => {
      setEmployerRate(first);
      setEmployerRateAfter10k(after);
      try {
        await updateProfile({
          employerMileageRatePence: first,
          employerMileageRatePenceAfter10k: after,
        });
        refreshUser();
      } catch {
        Alert.alert("Couldn't save the rate", "Try again in a moment.");
      }
    };

    const firstRes = await prompt({
      title: "Rate for first 10,000 miles",
      message:
        "Pence per mile your employer reimburses (0 to clear). The approved rate is 55p for the first 10,000 miles, then 25p, so anything below leaves a gap you can claim back through Mileage Allowance Relief (the rate rose from 45p to 55p on 6 April 2026).",
      defaultValue: employerRate ? String(employerRate) : "",
      keyboardType: "number-pad",
      submitLabel: "Next",
    });
    if (firstRes.action !== "submit") return;
    if (!firstRes.value.trim()) return;

    const parsed = parseInt(firstRes.value.trim(), 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      Alert.alert("Out of range", "Enter a value between 0 and 100.");
      return;
    }

    const firstTier = parsed === 0 ? null : parsed;
    // 0 means "clear" - no rate, so no second tier to ask about.
    if (firstTier == null) {
      await saveTiers(null, null);
      return;
    }

    const afterRes = await prompt({
      title: "Rate after 10,000 miles",
      message: `Some employers pay less per mile after 10,000 business miles in the tax year. Leave blank if they pay ${firstTier}p the whole way.`,
      defaultValue: employerRateAfter10k ? String(employerRateAfter10k) : "",
      keyboardType: "number-pad",
      cancelLabel: null,
      neutralLabel: "Skip",
    });
    if (afterRes.action === "cancel") return;
    if (afterRes.action === "neutral") {
      await saveTiers(firstTier, null);
      return;
    }

    const trimmed = afterRes.value.trim();
    const after = trimmed === "" ? null : parseInt(trimmed, 10);
    if (after !== null && (isNaN(after) || after < 0 || after > 100)) {
      Alert.alert("Out of range", "Enter a value between 0 and 100, or leave blank.");
      return;
    }
    await saveTiers(firstTier, after);
  }, [employerRate, employerRateAfter10k, refreshUser, prompt]);

  // ── Other annual income ───────────────────────────────────────────
  const handleOtherIncome = useCallback(async () => {
    const currentPounds = otherIncomePence != null
      ? Math.round(otherIncomePence / 100).toString()
      : "";
    const save = async (value: string | undefined) => {
      const trimmed = value?.trim() ?? "";
      if (trimmed === "") {
        setOtherIncomePence(null);
        try {
          await updateProfile({ otherAnnualIncomePence: null });
          refreshUser();
        } catch {
          Alert.alert("Couldn't save", "Try again in a moment.");
        }
        return;
      }
      const cleaned = trimmed.replace(/[£,\s]/g, "");
      const pounds = parseFloat(cleaned);
      if (!isFinite(pounds) || pounds < 0 || pounds > 10_000_000) {
        Alert.alert("Out of range", "Enter your yearly income in pounds, or leave blank.");
        return;
      }
      const pence = Math.round(pounds * 100);
      setOtherIncomePence(pence);
      try {
        await updateProfile({ otherAnnualIncomePence: pence });
        refreshUser();
      } catch {
        Alert.alert("Couldn't save", "Try again in a moment.");
      }
    };

    const res = await prompt({
      title: "Other annual income",
      message:
        "Pre-tax income from your main job, pension, rental, etc. We use it to work out the right tax rate on your gig profit. Leave blank if MileClear earnings are your only taxable income.",
      defaultValue: currentPounds,
      keyboardType: "number-pad",
    });
    if (res.action !== "submit") return;
    await save(res.value);
  }, [otherIncomePence, refreshUser, prompt]);

  // ── PAYE tax already paid this year ──────────────────────────────
  const handlePayeTaxPaid = useCallback(async () => {
    const currentPounds =
      payeTaxPaidPence != null ? Math.round(payeTaxPaidPence / 100).toString() : "";
    const save = async (value: string | undefined) => {
      const trimmed = value?.trim() ?? "";
      if (trimmed === "") {
        setPayeTaxPaidPence(null);
        try {
          await updateProfile({ payeAnnualPaidTaxPence: null });
          refreshUser();
        } catch {
          Alert.alert("Couldn't save", "Try again in a moment.");
        }
        return;
      }
      const cleaned = trimmed.replace(/[£,\s]/g, "");
      const pounds = parseFloat(cleaned);
      if (!isFinite(pounds) || pounds < 0 || pounds > 1_000_000) {
        Alert.alert("Out of range", "Enter the tax already paid in pounds, or leave blank.");
        return;
      }
      const pence = Math.round(pounds * 100);
      setPayeTaxPaidPence(pence);
      try {
        await updateProfile({ payeAnnualPaidTaxPence: pence });
        refreshUser();
      } catch {
        Alert.alert("Couldn't save", "Try again in a moment.");
      }
    };

    const res = await prompt({
      title: "PAYE tax already paid",
      message:
        "Total tax deducted by your employer so far this tax year (from your latest payslip). We take it off your tax so far, so you see what is still owed.",
      defaultValue: currentPounds,
      keyboardType: "number-pad",
    });
    if (res.action !== "submit") return;
    await save(res.value);
  }, [payeTaxPaidPence, refreshUser, prompt]);

  // ── Tax basis (cash vs accruals) ──────────────────────────────────
  const handleTaxBasis = useCallback(() => {
    Alert.alert(
      "Tax basis",
      "Cash basis (default since April 2024) counts income when it's received and expenses when paid. Accruals counts when invoiced. Most sole traders should stay on cash.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Cash basis",
          onPress: async () => {
            setTaxBasis("cash");
            await updateProfile({ taxBasis: "cash" }).catch(() => {});
            refreshUser();
          },
        },
        {
          text: "Accruals",
          onPress: async () => {
            setTaxBasis("accruals");
            await updateProfile({ taxBasis: "accruals" }).catch(() => {});
            refreshUser();
          },
        },
      ]
    );
  }, [refreshUser]);

  // ── Render ────────────────────────────────────────────────────────
  const workTypeLabel =
    workType === "gig" ? "Gig / delivery platforms"
    : workType === "employee" ? "Employee using own vehicle"
    : "Gig work + employee driving";

  return (
    <SettingsScreen>
      <SettingsGroup title="WORK TYPE">
        <View style={styles.workTypeRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="briefcase-outline" size={18} color={colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Work type</Text>
            <Text style={styles.hint}>{workTypeLabel}</Text>
          </View>
        </View>
        <View style={styles.pillRow}>
          {([
            { value: "gig" as WorkType, label: "Gig" },
            { value: "employee" as WorkType, label: "Employee" },
            { value: "both" as WorkType, label: "Both" },
          ]).map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.pill, workType === opt.value && styles.pillActive]}
              onPress={() => handleWorkType(opt.value)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: workType === opt.value }}
            >
              <Text style={[styles.pillText, workType === opt.value && styles.pillTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SettingsGroup>

      <SettingsGroup title="MILEAGE & TAX">
        {(workType === "employee" || workType === "both") && (
          <SettingsRow
            icon="cash-outline"
            label="Employer mileage rate"
            hint={
              employerRate
                ? employerRateAfter10k != null
                  ? `${employerRate}p for the first 10,000 miles, then ${employerRateAfter10k}p`
                  : `${employerRate}p a mile`
                : "Not set. Assumes your employer pays nothing."
            }
            badge={employerRate ? "Edit" : "Set"}
            onPress={handleEmployerRate}
            helpTopicId="employer-mileage"
          />
        )}
        {(workType === "employee" || workType === "both") && (
          <SettingsRow
            icon="calculator-outline"
            label="Mileage Allowance Relief"
            hint="Tax relief when your employer pays less per mile than the approved rates"
            onPress={() => router.push("/mileage-relief")}
          />
        )}
        <SettingsRow
          icon="wallet-outline"
          label="Other annual income"
          hint={
            otherIncomePence != null
              ? `£${(otherIncomePence / 100).toLocaleString("en-GB")} a year, used to work out your tax rate`
              : "Main job, pension, etc. Sets the right tax bracket."
          }
          badge={otherIncomePence != null ? "Edit" : "Set"}
          onPress={handleOtherIncome}
        />
      </SettingsGroup>

      <SettingsGroup title="QUARTERLY UPDATES">
        <SettingsRow
          icon="cloud-upload-outline"
          label="Quarterly updates (test version)"
          hint="Try quarterly reporting. Nothing is sent to HMRC yet."
          badge={isPremium ? undefined : "Pro"}
          onPress={() => router.push("/tax-mtd")}
          helpTopicId="mtd-itsa"
        />
      </SettingsGroup>

      <SettingsGroup title="SELF-EMPLOYED">
        <SettingsRow
          icon="layers-outline"
          label="Tax basis"
          hint={taxBasis === "cash" ? "Cash basis (recommended)" : "Accruals (counted when invoiced)"}
          badge={taxBasis === "cash" ? "Cash" : "Accruals"}
          onPress={handleTaxBasis}
          helpTopicId="cash-vs-accruals"
        />
        <SettingsRow
          icon="briefcase-outline"
          label="Your accountant"
          hint="Name, contact and annual fee, added to your weekly put-by"
          onPress={() => router.push("/accountant" as never)}
          helpTopicId="accountant"
        />
      </SettingsGroup>

      {(workType === "employee" || workType === "both") && (
        <SettingsGroup title="PAYE EMPLOYMENT">
          <SettingsRow
            icon="receipt-outline"
            label="Tax already deducted"
            hint={
              // With other income set, the estimate is already only the extra
              // tax your profit adds, so PAYE isn't taken off again (7 Oct 2026).
              otherIncomePence != null && otherIncomePence > 0
                ? "Not needed: your other income above already covers this"
                : payeTaxPaidPence != null
                  ? `£${(payeTaxPaidPence / 100).toLocaleString("en-GB")} taken off what you still owe`
                  : "Enter PAYE deductions so your tax so far is right"
            }
            badge={payeTaxPaidPence != null ? "Edit" : "Set"}
            onPress={handlePayeTaxPaid}
            helpTopicId="paye-offset"
          />
        </SettingsGroup>
      )}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  workTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.text1,
  },
  hint: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.text3,
    marginTop: 2,
  },
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  pillActive: {
    backgroundColor: colors.amberDim,
    borderColor: colors.amber,
  },
  pillText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text2,
  },
  pillTextActive: {
    color: colors.amber,
    fontFamily: fonts.semibold,
  },
});
