import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { WorkType } from "@mileclear/shared";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { fetchProfile, updateProfile } from "../../lib/api/user";
import { useUser } from "../../lib/user/context";
import { getDatabase } from "../../lib/db";
import { colors, fonts, radii, spacing } from "../../lib/theme";

/**
 * Work & Tax sub-screen. Owns the three "self-employed driver" settings
 * that feed the tax-readiness card and HMRC exports:
 *
 *   - Work type (gig / employee / both)
 *   - Employer mileage rate (visible only when employee/both)
 *   - Other annual income (drives the marginal tax-rate calculation)
 *   - Weekly miles goal (carries over from the old SETTINGS section)
 */
export default function WorkTaxSettings() {
  const { refreshUser } = useUser();
  const [workType, setWorkType] = useState<WorkType>("gig");
  const [employerRate, setEmployerRate] = useState<number | null>(null);
  const [employerRateAfter10k, setEmployerRateAfter10k] = useState<number | null>(null);
  const [otherIncomePence, setOtherIncomePence] = useState<number | null>(null);
  const [payeTaxPaidPence, setPayeTaxPaidPence] = useState<number | null>(null);
  const [taxBasis, setTaxBasis] = useState<"cash" | "accruals">("cash");
  const [weeklyGoal, setWeeklyGoal] = useState<number | null>(null);

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
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'personal_goal_miles'"
        );
        if (row) {
          const n = parseFloat(row.value);
          setWeeklyGoal(n > 0 && isFinite(n) ? n : null);
        }
      } catch (e) {
        console.warn("[settings/work-tax] weekly goal load failed:", e);
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
  const handleEmployerRate = useCallback(() => {
    const promptAfter10k = (firstTier: number | null) => {
      if (firstTier == null) {
        setEmployerRateAfter10k(null);
        updateProfile({
          employerMileageRatePence: null,
          employerMileageRatePenceAfter10k: null,
        }).catch(() => {});
        refreshUser();
        return;
      }
      Alert.prompt(
        "Rate after 10,000 miles",
        `Some employers pay less per mile after 10,000 business miles in the tax year. Leave blank if they pay ${firstTier}p the whole way.`,
        [
          {
            text: "Skip",
            onPress: async () => {
              setEmployerRateAfter10k(null);
              try {
                await updateProfile({
                  employerMileageRatePence: firstTier,
                  employerMileageRatePenceAfter10k: null,
                });
                refreshUser();
              } catch {
                Alert.alert("Couldn't save the rate", "Try again in a moment.");
              }
            },
          },
          {
            text: "Save",
            onPress: async (value: string | undefined) => {
              const trimmed = value?.trim() ?? "";
              const after = trimmed === "" ? null : parseInt(trimmed, 10);
              if (after !== null && (isNaN(after) || after < 0 || after > 100)) {
                Alert.alert("Out of range", "Enter a value between 0 and 100, or leave blank.");
                return;
              }
              setEmployerRateAfter10k(after);
              try {
                await updateProfile({
                  employerMileageRatePence: firstTier,
                  employerMileageRatePenceAfter10k: after,
                });
                refreshUser();
              } catch {
                Alert.alert("Couldn't save the rate", "Try again in a moment.");
              }
            },
          },
        ],
        "plain-text",
        employerRateAfter10k ? String(employerRateAfter10k) : "",
        "number-pad"
      );
    };

    if (Platform.OS === "ios") {
      Alert.prompt(
        "Rate for first 10,000 miles",
        "Pence per mile your employer reimburses (0 to clear). HMRC's AMAP rate is 45p, so anything below leaves a gap you can claim back via Mileage Allowance Relief.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Next",
            onPress: (value: string | undefined) => {
              if (!value?.trim()) return;
              const parsed = parseInt(value.trim(), 10);
              if (isNaN(parsed) || parsed < 0 || parsed > 100) {
                Alert.alert("Out of range", "Enter a value between 0 and 100.");
                return;
              }
              const firstTier = parsed === 0 ? null : parsed;
              setEmployerRate(firstTier);
              promptAfter10k(firstTier);
            },
          },
        ],
        "plain-text",
        employerRate ? String(employerRate) : "",
        "number-pad"
      );
    } else {
      // Android Alert can't capture text input. Quick presets cover the
      // common employer policies; finer control lives in the web dashboard.
      Alert.alert(
        "Employer Mileage Rate",
        `Current: ${employerRate ? `${employerRate}p${employerRateAfter10k != null ? ` / ${employerRateAfter10k}p after 10k` : ""}` : "Not set"}\n\nFor a custom two-tier rate, use the web dashboard.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Clear", onPress: async () => { setEmployerRate(null); setEmployerRateAfter10k(null); await updateProfile({ employerMileageRatePence: null, employerMileageRatePenceAfter10k: null }).catch(() => {}); refreshUser(); } },
          { text: "40p flat", onPress: async () => { setEmployerRate(40); setEmployerRateAfter10k(null); await updateProfile({ employerMileageRatePence: 40, employerMileageRatePenceAfter10k: null }).catch(() => {}); refreshUser(); } },
          { text: "45p / 25p (HMRC)", onPress: async () => { setEmployerRate(45); setEmployerRateAfter10k(25); await updateProfile({ employerMileageRatePence: 45, employerMileageRatePenceAfter10k: 25 }).catch(() => {}); refreshUser(); } },
        ]
      );
    }
  }, [employerRate, employerRateAfter10k, refreshUser]);

  // ── Other annual income ───────────────────────────────────────────
  const handleOtherIncome = useCallback(() => {
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

    if (Platform.OS === "ios") {
      Alert.prompt(
        "Other annual income",
        "Pre-tax income from your main job, pension, rental, etc. We use this to calculate the right tax bracket on your gig profit. Leave blank if MileClear earnings are your only taxable income.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save", onPress: save },
        ],
        "plain-text",
        currentPounds,
        "number-pad"
      );
    } else {
      Alert.alert(
        "Other annual income",
        `Current: ${otherIncomePence != null ? `£${(otherIncomePence / 100).toLocaleString("en-GB")}` : "Not set"}\n\nFor a precise figure, use the web dashboard.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Clear", onPress: () => save("") },
          { text: "£25,000 (basic)", onPress: () => save("25000") },
          { text: "£50,000 (higher)", onPress: () => save("50000") },
          { text: "£75,000 (higher)", onPress: () => save("75000") },
        ]
      );
    }
  }, [otherIncomePence, refreshUser]);

  // ── PAYE tax already paid this year ──────────────────────────────
  const handlePayeTaxPaid = useCallback(() => {
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

    if (Platform.OS === "ios") {
      Alert.prompt(
        "PAYE tax already paid",
        "Total tax deducted by your employer so far this tax year (from your latest payslip). We subtract it from the Tax Readiness figure so you see what's still owed, not the gross liability.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save", onPress: save },
        ],
        "plain-text",
        currentPounds,
        "number-pad"
      );
    } else {
      Alert.alert(
        "PAYE tax already paid",
        `Current: ${payeTaxPaidPence != null ? `£${(payeTaxPaidPence / 100).toLocaleString("en-GB")}` : "Not set"}\n\nFor a precise figure, use the web dashboard.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Clear", onPress: () => save("") },
        ]
      );
    }
  }, [payeTaxPaidPence, refreshUser]);

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

  // ── Weekly goal ───────────────────────────────────────────────────
  const handleWeeklyGoal = useCallback(() => {
    const persistGoal = async (n: number | null) => {
      const db = await getDatabase();
      if (n === null) {
        await db.runAsync("DELETE FROM tracking_state WHERE key = 'personal_goal_miles'");
      } else {
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('personal_goal_miles', ?)",
          [String(n)]
        );
      }
      setWeeklyGoal(n);
    };

    if (Platform.OS === "ios") {
      Alert.prompt(
        "Weekly miles goal",
        "Set a target for your weekly driving (e.g. 50). Leave blank to remove.",
        [
          { text: "Cancel", style: "cancel" },
          ...(weeklyGoal !== null
            ? [{ text: "Remove", style: "destructive" as const, onPress: () => persistGoal(null) }]
            : []),
          {
            text: "Save",
            onPress: async (value: string | undefined) => {
              if (!value?.trim()) return;
              const parsed = parseFloat(value.trim());
              if (!isFinite(parsed) || parsed <= 0) {
                Alert.alert("Invalid", "Enter a positive number of miles.");
                return;
              }
              persistGoal(Math.round(parsed * 10) / 10);
            },
          },
        ],
        "plain-text",
        weeklyGoal ? String(weeklyGoal) : "",
        "number-pad"
      );
    } else {
      Alert.alert(
        "Weekly miles goal",
        `Current: ${weeklyGoal ? `${weeklyGoal} miles` : "Not set"}`,
        [
          { text: "Cancel", style: "cancel" },
          ...(weeklyGoal !== null
            ? [{ text: "Remove", style: "destructive" as const, onPress: () => persistGoal(null) }]
            : []),
          { text: "25 mi", onPress: () => persistGoal(25) },
          { text: "50 mi", onPress: () => persistGoal(50) },
          { text: "100 mi", onPress: () => persistGoal(100) },
        ]
      );
    }
  }, [weeklyGoal]);

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
                  ? `${employerRate}p first 10k mi / ${employerRateAfter10k}p after`
                  : `${employerRate}p / mi flat`
                : "Not set - claim full 45p HMRC rate"
            }
            badge={employerRate ? "Edit" : "Set"}
            onPress={handleEmployerRate}
          />
        )}
        <SettingsRow
          icon="wallet-outline"
          label="Other annual income"
          hint={
            otherIncomePence != null
              ? `£${(otherIncomePence / 100).toLocaleString("en-GB")} / year - tax bracket adjusted`
              : "Main job, pension, etc. Sets the right tax bracket."
          }
          badge={otherIncomePence != null ? "Edit" : "Set"}
          onPress={handleOtherIncome}
        />
      </SettingsGroup>

      <SettingsGroup title="GOALS">
        <SettingsRow
          icon="flag-outline"
          label="Weekly miles goal"
          hint={weeklyGoal ? `${weeklyGoal} miles / week` : "Track progress against a weekly target"}
          badge={weeklyGoal ? "Edit" : "Set"}
          onPress={handleWeeklyGoal}
        />
      </SettingsGroup>

      <SettingsGroup title="MTD ITSA">
        <SettingsRow
          icon="cloud-upload-outline"
          label="Quarterly Self Assessment"
          hint="Connect to HMRC and submit quarterly updates direct from MileClear"
          badge="Pro"
          onPress={() => router.push("/tax-mtd")}
        />
      </SettingsGroup>

      <SettingsGroup title="SOLE TRADER">
        <SettingsRow
          icon="document-text-outline"
          label="Invoices"
          hint="Track who owes you for freelance work + what's been paid"
          onPress={() => router.push("/invoices")}
        />
        <SettingsRow
          icon="layers-outline"
          label="Tax basis"
          hint={taxBasis === "cash" ? "Cash basis (recommended)" : "Accruals (count when invoiced)"}
          badge={taxBasis === "cash" ? "Cash" : "Accruals"}
          onPress={handleTaxBasis}
        />
        <SettingsRow
          icon="briefcase-outline"
          label="My Accountant"
          hint="Name, contact and annual fee — added to your weekly set-aside"
          onPress={() => router.push("/accountant" as never)}
        />
      </SettingsGroup>

      {(workType === "employee" || workType === "both") && (
        <SettingsGroup title="PAYE EMPLOYMENT">
          <SettingsRow
            icon="receipt-outline"
            label="Tax already deducted"
            hint={
              payeTaxPaidPence != null
                ? `£${(payeTaxPaidPence / 100).toLocaleString("en-GB")} subtracted from "still owed"`
                : "Enter PAYE deductions so Tax Readiness is honest"
            }
            badge={payeTaxPaidPence != null ? "Edit" : "Set"}
            onPress={handlePayeTaxPaid}
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
