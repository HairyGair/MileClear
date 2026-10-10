import { useCallback, useEffect, useState } from "react";
import { Alert, TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { DRIVE_FOR_OPTIONS, driveForOf, driveForPatch, type DriveFor } from "@mileclear/shared";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { fetchProfile, updateProfile } from "../../lib/api/user";
import { useUser } from "../../lib/user/context";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";
import { useIsPremium } from "../../components/PremiumGate";
import { usePrompt } from "../../components/prompt";

/**
 * "Your tax details" sub-screen. Owns the settings that feed the Tax tab
 * and the exports, led by "You drive for" (which replaced Dashboard mode and
 * Work type on 10 Oct 2026):
 *
 *   - You drive for (gig / employer / both / company car / just me)
 *   - Employer mileage rate (employer answers only)
 *   - Other annual income (drives the marginal tax-rate calculation)
 */
export default function WorkTaxSettings() {
  const { refreshUser } = useUser();
  const isPremium = useIsPremium();
  const { prompt } = usePrompt();
  const [driveFor, setDriveFor] = useState<DriveFor>("gig");
  const [dashboardMode, setDashboardMode] = useState<string | null>(null);
  // Choices stay off until the profile has loaded: a tap before then would save
  // against a missing current mode and could turn "work" into "both".
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
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
        setDriveFor(driveForOf(res.data));
        setDashboardMode(res.data.dashboardMode ?? null);
        setEmployerRate(res.data.employerMileageRatePence ?? null);
        setEmployerRateAfter10k(res.data.employerMileageRatePenceAfter10k ?? null);
        setOtherIncomePence(res.data.otherAnnualIncomePence ?? null);
        const profile = res.data as unknown as {
          payeAnnualPaidTaxPence?: number | null;
          taxBasis?: "cash" | "accruals" | null;
        };
        setPayeTaxPaidPence(profile.payeAnnualPaidTaxPence ?? null);
        setTaxBasis(profile.taxBasis ?? "cash");
        setLoaded(true);
      } catch (e) {
        console.warn("[settings/work-tax] profile load failed:", e);
        setLoadFailed(true);
      }
    })();
  }, []);

  // ── You drive for ─────────────────────────────────────────────────
  // Replaced Dashboard mode and Work type (10 Oct 2026). Saves into the same
  // two fields they used; reminders follow it. Just me stops tax and work
  // reminders (the old Personal mode); anything else switches them back on.
  const handleDriveFor = useCallback(
    async (answer: DriveFor) => {
      if (!loaded || answer === driveFor) return;
      const previous = { driveFor, dashboardMode };
      const patch = driveForPatch(answer, dashboardMode);
      setDriveFor(answer);
      setDashboardMode(patch.dashboardMode);
      try {
        await updateProfile(patch);
        refreshUser();
      } catch {
        setDriveFor(previous.driveFor);
        setDashboardMode(previous.dashboardMode);
        Alert.alert("Couldn't save that", "Try again in a moment.");
      }
    },
    [loaded, driveFor, dashboardMode, refreshUser]
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
      title: "Tax already taken off your pay",
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
      "How you count income",
      "Most drivers count income when they are paid, and costs when they pay them. The other way counts income when you earn it (when you send an invoice). Most sole traders should stay on the first.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "When I'm paid",
          onPress: async () => {
            setTaxBasis("cash");
            await updateProfile({ taxBasis: "cash" }).catch(() => {});
            refreshUser();
          },
        },
        {
          text: "When I earn it",
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
  const hasEmployer = driveFor === "employee" || driveFor === "both";
  const selfEmployed = driveFor === "gig" || driveFor === "both";
  const noTaxRows = driveFor === "company" || driveFor === "personal";

  return (
    <SettingsScreen>
      <SettingsGroup title="YOU DRIVE FOR">
        {DRIVE_FOR_OPTIONS.map((opt) => {
          const selected = driveFor === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionRow, !loaded && { opacity: 0.5 }]}
              disabled={!loaded}
              onPress={() => handleDriveFor(opt.value)}
              activeOpacity={0.6}
              accessibilityRole="radio"
              accessibilityLabel={opt.label}
              accessibilityHint={opt.hint}
              accessibilityState={{ selected, disabled: !loaded }}
            >
              <Ionicons
                name={selected ? "radio-button-on" : "radio-button-off"}
                size={22}
                color={selected ? colors.amber : colors.text3}
                accessible={false}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.label} maxFontSizeMultiplier={fontScaleCap.body}>{opt.label}</Text>
                <Text style={styles.hint} maxFontSizeMultiplier={fontScaleCap.body}>{opt.hint}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </SettingsGroup>

      {loadFailed && !loaded ? (
        <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>
          Couldn't load your answer. Check your connection, then come back to this screen.
        </Text>
      ) : null}

      {noTaxRows ? (
        <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>
          {driveFor === "personal"
            ? "Nothing else to set here. MileClear won't send tax or work reminders. Pick another answer any time to switch them back on."
            : "Nothing else to set here. Your employer provides the car, so there is no tax claim to work out and no tax reminders."}
        </Text>
      ) : (
        <SettingsGroup title="MILEAGE AND TAX">
          {hasEmployer && (
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
          {hasEmployer && (
            <SettingsRow
              icon="calculator-outline"
              label="Work out tax back on work miles"
              hint="Mileage Allowance Relief: tax back on work miles your employer doesn't fully pay"
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
          {hasEmployer && (
            <SettingsRow
              icon="receipt-outline"
              label="Tax already taken off your pay"
              hint={
                // With other income set, the estimate is already only the extra
                // tax your profit adds, so it isn't taken off again (7 Oct 2026).
                otherIncomePence != null && otherIncomePence > 0
                  ? "Not needed: your other income above already covers this"
                  : payeTaxPaidPence != null
                    ? `£${(payeTaxPaidPence / 100).toLocaleString("en-GB")} taken off what you still owe`
                    : "Enter what your employer has taken off so your tax so far is right"
              }
              badge={payeTaxPaidPence != null ? "Edit" : "Set"}
              onPress={handlePayeTaxPaid}
              helpTopicId="paye-offset"
            />
          )}
        </SettingsGroup>
      )}

      {/* Employees have no self-employed income, so quarterly updates and the
          self-employed settings only show for gig work and both. */}
      {selfEmployed && (
        <SettingsGroup title="IF YOU WORK FOR YOURSELF">
          <SettingsRow
            icon="cloud-upload-outline"
            label="Quarterly updates (test version)"
            hint="Try quarterly reporting. Nothing is sent to HMRC yet."
            badge={isPremium ? undefined : "Pro"}
            onPress={() => router.push("/tax-mtd")}
            helpTopicId="mtd-itsa"
          />
          <SettingsRow
            icon="layers-outline"
            label="How you count income"
            hint={taxBasis === "cash" ? "When you're paid (most drivers)" : "When you earn it (when you invoice)"}
            badge={taxBasis === "cash" ? "Paid" : "Earned"}
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
      )}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: spacing.md,
    minHeight: 56,
  },
  note: {
    marginTop: spacing.lg,
    marginHorizontal: 4,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: colors.text2,
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
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: 2,
  },
});
