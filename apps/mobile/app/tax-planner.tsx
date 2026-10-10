// Tax bill planner (4 Oct 2026). Free.
//
// "How much will I have to pay HMRC, and when?" for a self-employed driver:
// the next Self Assessment payment dates (31 January and 31 July) with what
// each one is made of, a weekly figure to put by for them, and the bills it
// was worked out from. The maths and its GOV.UK sources live on the API
// (services/taxPlannerMath.ts); this screen only shows it and saves the
// driver's own answers (when they started, any bill HMRC has calculated).
//
// Reached from the Tax tab ("See payment plan"), the avatar
// menu's TAX section and the payment reminder pushes (open_tax_planner).
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatPence, type TaxPlan, type TaxPlannerPayment, type TaxPlannerYear } from "@mileclear/shared";
import { fetchTaxPlan, updateTaxPlannerSettings } from "../lib/api/taxPlanner";
import {
  daysAwayLabel,
  longDate,
  nextPayment,
  partHint,
  partLabel,
  previousTaxYear,
  sourceLabel,
} from "../lib/taxPlanner/copy";
import { colors, fonts, fontSizes } from "../lib/theme";

const GOV_UK_POA_URL = "https://www.gov.uk/understand-self-assessment-bill/payments-on-account";

/** "1,234.56" or "£1234" -> pence. null for blank; NaN for nonsense. */
function poundsToPence(text: string): number | null {
  const cleaned = text.replace(/[£,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  return Math.round(parseFloat(cleaned) * 100);
}

function penceToPounds(pence: number | undefined): string {
  return pence == null ? "" : (pence / 100).toFixed(2);
}

function amountText(p: TaxPlannerPayment): string {
  if (p.amountPence == null) return "Not known yet";
  if (p.amountPence === 0) return "Nothing to pay";
  return formatPence(p.amountPence);
}

export default function TaxPlannerScreen() {
  const router = useRouter();
  const [plan, setPlan] = useState<TaxPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  // Form state for "Your situation", seeded from the stored settings.
  const [started, setStarted] = useState<string | null>(null);
  const [billText, setBillText] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetchTaxPlan();
      setPlan(res.data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload when the driver comes back from adding earnings.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!plan) return;
    setStarted(plan.settings.firstSelfEmployedTaxYear);
    const text: Record<string, string> = {};
    for (const y of plan.years) text[y.taxYear] = penceToPounds(plan.settings.bills[y.taxYear]);
    setBillText(text);
  }, [plan]);

  const save = useCallback(async () => {
    if (!plan) return;
    const bills: Record<string, number | null> = {};
    for (const y of plan.years.slice(0, 2)) {
      const pence = poundsToPence(billText[y.taxYear] ?? "");
      if (pence != null && Number.isNaN(pence)) {
        Alert.alert("Check the amount", `The ${y.taxYear} bill should be a number of pounds, like 1250 or 1250.40.`);
        return;
      }
      bills[y.taxYear] = pence;
    }
    setSaving(true);
    try {
      await updateTaxPlannerSettings({ firstSelfEmployedTaxYear: started, bills });
      await load();
    } catch (err: unknown) {
      Alert.alert("Couldn't save", err instanceof Error ? err.message : "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [plan, billText, started, load]);

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  if (error || !plan) {
    return (
      <View style={[s.container, s.centered]}>
        <Text style={s.errorText}>Couldn&apos;t load your payment plan. Check your connection and try again.</Text>
        <TouchableOpacity
          style={s.retryBtn}
          onPress={() => {
            setLoading(true);
            load();
          }}
          accessibilityRole="button"
        >
          <Text style={s.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const next = nextPayment(plan.payments);
  const lastListed = plan.payments[plan.payments.length - 1]?.dueDate ?? null;
  const current = plan.currentTaxYear;
  const lastYear = previousTaxYear(current);
  const yearBefore = previousTaxYear(lastYear);
  const startChoices: { value: string; label: string }[] = [
    { value: current, label: `This tax year (${current})` },
    { value: lastYear, label: `Last tax year (${lastYear})` },
    { value: "earlier", label: "Before that" },
  ];
  // Bills only matter for years they were working for themselves.
  const billYears = plan.years
    .slice(0, 2)
    .filter((y) => !(started && started !== "earlier" && y.taxYear < started));

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.amber}
          />
        }
      >
        {/* Hero: the next payment with money in it */}
        <View style={s.hero}>
          {next == null ? (
            <>
              <Text style={s.heroLabel}>Next payment to HMRC</Text>
              <Text style={s.heroValue}>Nothing due</Text>
              <Text style={s.heroSub}>
                {lastListed
                  ? `From what you've recorded, nothing is due before ${longDate(lastListed)}.`
                  : "From what you've recorded, nothing is due."}
              </Text>
            </>
          ) : next.amountPence == null ? (
            <>
              <Text style={s.heroLabel}>Next payment to HMRC: {longDate(next.dueDate)}</Text>
              <Text style={s.heroValueDim}>Not known yet</Text>
              <Text style={s.heroSub}>
                MileClear needs your earnings, or the bill HMRC gave you, to work this one out. Add either below.
              </Text>
            </>
          ) : (
            <>
              <View style={s.pill}>
                <Ionicons name="time-outline" size={12} color={colors.amber} />
                <Text style={s.pillText}>{daysAwayLabel(next.daysAway)}</Text>
              </View>
              <Text style={s.heroLabel}>Next payment to HMRC</Text>
              <Text style={s.heroValue} maxFontSizeMultiplier={1.3}>
                {formatPence(next.amountPence)}
              </Text>
              <Text style={s.heroSub}>Due by {longDate(next.dueDate)}</Text>
            </>
          )}

          {next?.firstPaymentOnAccount && (
            <View style={s.callout}>
              <Ionicons name="alert-circle" size={16} color={colors.amber} style={{ marginTop: 1 }} />
              <Text style={s.calloutText}>
                This is the big one. In your first year of payments on account, January takes the whole of last
                year&apos;s bill plus half of it again in advance for this year, so about one and a half times
                the bill at once.
              </Text>
            </View>
          )}

          {plan.mayNotApply && (
            <Text style={s.note}>
              You&apos;ve told us you drive as an employee, or you&apos;re in Personal mode, so this may not apply to
              you. It&apos;s here if you also do self-employed work.
            </Text>
          )}
        </View>

        {/* Weekly set-aside */}
        {plan.weeklySetAsidePence != null && plan.weeklySetAsidePence > 0 && plan.coversTo && (
          <View style={s.setAside}>
            <Text style={s.setAsideLabel}>Put by each week</Text>
            <Text style={s.setAsideValue} maxFontSizeMultiplier={1.3}>
              {formatPence(plan.weeklySetAsidePence)}
            </Text>
            {(plan.accountantWeeklyFeePence ?? 0) > 0 && (
              <Text style={s.setAsideMeta}>
                Includes {formatPence(plan.accountantWeeklyFeePence ?? 0)} a week for your accountant.
              </Text>
            )}
            <Text style={s.setAsideMeta}>
              Starting this week, this covers every payment below by its date, up to {longDate(plan.coversTo)}.
              {plan.coversTo !== lastListed ? " It leaves out the later ones MileClear can't work out yet." : ""}
              {" "}If you&apos;ve already got some put by, you&apos;ll need less.
            </Text>
          </View>
        )}

        {/* No earnings for this tax year: say so, never show £0 as real */}
        {plan.missingCurrentEarnings && (
          <TouchableOpacity
            style={s.nudge}
            onPress={() => router.push("/earning-form" as never)}
            accessibilityRole="button"
            accessibilityLabel={`Add earnings for ${current}`}
          >
            <Ionicons name="cash-outline" size={16} color={colors.amber} />
            <Text style={s.nudgeText}>
              You haven&apos;t added any earnings for {current}, so this year&apos;s tax can&apos;t be worked out.
              Add your earnings to see it.
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.amber} />
          </TouchableOpacity>
        )}

        {/* Payment dates */}
        <Text style={s.sectionTitle}>Payment dates</Text>
        {plan.payments.map((p) => (
          <View key={p.dueDate} style={s.payment}>
            <View style={s.paymentTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.paymentDate}>{longDate(p.dueDate)}</Text>
                <Text style={s.paymentWhen}>{daysAwayLabel(p.daysAway)}</Text>
              </View>
              <Text
                style={[s.paymentAmount, (p.amountPence == null || p.amountPence === 0) && s.paymentAmountDim]}
                maxFontSizeMultiplier={1.3}
              >
                {amountText(p)}
              </Text>
            </View>
            {p.parts.map((part) => {
              const hint = partHint(part);
              return (
                <View key={`${part.kind}-${part.taxYear}`} style={s.part}>
                  <View style={s.partRow}>
                    <Text style={s.partLabel}>{partLabel(part)}</Text>
                    <Text style={s.partAmount}>
                      {part.amountPence == null ? "Not known" : formatPence(part.amountPence)}
                    </Text>
                  </View>
                  {hint && <Text style={s.partHint}>{hint}</Text>}
                </View>
              );
            })}
          </View>
        ))}

        {/* Where the bills come from */}
        <Text style={s.sectionTitle}>Worked out from</Text>
        <View style={s.yearsCard}>
          {plan.years.map((y: TaxPlannerYear, idx) => (
            <View key={y.taxYear} style={[s.yearRow, idx > 0 && s.yearRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.yearLabel}>{y.taxYear} bill</Text>
                <Text style={s.yearSource}>
                  {sourceLabel(y.source, y.taxYear)}
                  {y.partialYear ? ". You joined part-way through, so earlier months aren't counted" : ""}
                </Text>
              </View>
              <Text style={[s.yearValue, y.billPence == null && s.paymentAmountDim]}>
                {y.billPence == null ? "Not known" : formatPence(y.billPence)}
              </Text>
            </View>
          ))}
        </View>

        {/* Your situation */}
        <Text style={s.sectionTitle}>Your situation</Text>
        <View style={s.form}>
          <Text style={s.formLabel}>When did you start working for yourself?</Text>
          {plan.startAssumed && (
            <Text style={s.formHint}>
              Until you say, MileClear assumes it was before {lastYear}.
            </Text>
          )}
          <View style={s.choices}>
            {startChoices.map((c) => {
              // Not said yet shows "Before that", the planner's assumption.
              const on = (started ?? "earlier") === c.value;
              return (
                <TouchableOpacity
                  key={c.value}
                  style={[s.choice, on && s.choiceOn]}
                  onPress={() => setStarted(c.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.choiceText, on && s.choiceTextOn]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {billYears.map((y) => (
            <View key={y.taxYear} style={s.billField}>
              <Text style={s.formLabel}>Your {y.taxYear} bill, if you know it</Text>
              <Text style={s.formHint}>
                {y.taxYear === yearBefore
                  ? `Sets what you've already paid on account towards ${lastYear}. It's on your ${y.taxYear} tax calculation from HMRC.`
                  : "If you've filed, it's the total on your tax calculation from HMRC. Leave it blank to use MileClear's estimate."}
              </Text>
              <View style={s.inputRow}>
                <Text style={s.inputPrefix}>£</Text>
                <TextInput
                  style={s.input}
                  value={billText[y.taxYear] ?? ""}
                  onChangeText={(t) => setBillText((prev) => ({ ...prev, [y.taxYear]: t }))}
                  placeholder="Use MileClear's estimate"
                  placeholderTextColor={colors.text3}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Your ${y.taxYear} Self Assessment bill in pounds`}
                />
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={s.saveBtn}
            onPress={save}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save and update the plan"
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Text style={s.saveText}>Update my plan</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Reminders */}
        <View style={s.reminder}>
          <Ionicons
            name={plan.remindersOn ? "notifications-outline" : "notifications-off-outline"}
            size={16}
            color={colors.text2}
          />
          <Text style={s.reminderText}>
            {plan.remindersOn
              ? "MileClear reminds you 14 days and 3 days before each payment with money due. You can turn this off with the tax deadline switch in Settings, Notifications."
              : "Tax deadline reminders are off, so you won't get a nudge before these dates. Turn them on in Settings, Notifications."}
          </Text>
        </View>

        {/* Caveats */}
        <Text style={s.footer}>
          This is an estimate from what you&apos;ve recorded in MileClear. Your real bill comes from HMRC after you
          file. It counts income tax and Class 4 National Insurance on your self-employed profit, after your mileage
          and expenses. Class 2 is treated as paid for most drivers, so it isn&apos;t included. Student loan
          repayments and any other income you haven&apos;t told MileClear about aren&apos;t included either. This
          year&apos;s figure assumes you keep earning at your pace so far. If you expect to earn less, you can ask
          HMRC to reduce your payments on account.
        </Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(GOV_UK_POA_URL)}
          style={s.link}
          accessibilityRole="link"
          accessibilityLabel="Read about payments on account on GOV.UK"
        >
          <Text style={s.linkText}>Payments on account on GOV.UK</Text>
          <Ionicons name="open-outline" size={13} color={colors.amber} />
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { justifyContent: "center", alignItems: "center", padding: 24 },
  content: { padding: 16, paddingBottom: 48 },
  errorText: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: fontSizes.body,
    textAlign: "center",
    marginBottom: 12,
  },
  retryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.amber,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: { color: colors.amber, fontFamily: fonts.semibold, fontSize: fontSizes.body },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
    marginBottom: 12,
  },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
    backgroundColor: colors.amberDim,
  },
  pillText: { color: colors.amber, fontFamily: fonts.semibold, fontSize: fontSizes.caption },
  heroLabel: { color: colors.text2, fontFamily: fonts.medium, fontSize: fontSizes.body },
  heroValue: { color: colors.text1, fontFamily: fonts.bold, fontSize: 34, marginTop: 4 },
  heroValueDim: { color: colors.text3, fontFamily: fonts.bold, fontSize: fontSizes.display, marginTop: 4 },
  heroSub: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: fontSizes.body,
    lineHeight: 20,
    marginTop: 4,
  },
  callout: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.amberDim,
  },
  calloutText: {
    flex: 1,
    color: colors.text1,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 19,
  },
  note: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  setAside: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.25)",
    padding: 16,
    marginBottom: 12,
  },
  setAsideLabel: { color: colors.text2, fontFamily: fonts.medium, fontSize: fontSizes.body },
  setAsideValue: { color: colors.amber, fontFamily: fonts.bold, fontSize: fontSizes.display, marginTop: 2 },
  setAsideMeta: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  nudge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.amberDim,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  nudgeText: { flex: 1, color: colors.text1, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19 },
  sectionTitle: {
    color: colors.text3,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.caption,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 8,
  },
  payment: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 14,
    marginBottom: 8,
  },
  paymentTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  paymentDate: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 15 },
  paymentWhen: { color: colors.text3, fontFamily: fonts.regular, fontSize: fontSizes.caption, marginTop: 2 },
  paymentAmount: { color: colors.text1, fontFamily: fonts.bold, fontSize: fontSizes.title },
  paymentAmountDim: { color: colors.text3 },
  part: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.subtleBorder },
  partRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  partLabel: { flex: 1, color: colors.text1, fontFamily: fonts.medium, fontSize: 13.5 },
  partAmount: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 13.5 },
  partHint: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: fontSizes.caption,
    lineHeight: 17,
    marginTop: 3,
  },
  yearsCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 14,
  },
  yearRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  yearRowBorder: { borderTopWidth: 1, borderTopColor: colors.subtleBorder },
  yearLabel: { color: colors.text1, fontFamily: fonts.semibold, fontSize: fontSizes.body },
  yearSource: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: fontSizes.caption,
    lineHeight: 17,
    marginTop: 2,
  },
  yearValue: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 15 },
  form: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 14,
  },
  formLabel: { color: colors.text1, fontFamily: fonts.semibold, fontSize: fontSizes.body },
  formHint: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: fontSizes.caption,
    lineHeight: 17,
    marginTop: 3,
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  choice: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceOn: { borderColor: colors.amber, backgroundColor: colors.amberDim },
  choiceText: { color: colors.text2, fontFamily: fonts.medium, fontSize: 13 },
  choiceTextOn: { color: colors.amber },
  billField: { marginTop: 16 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
  },
  inputPrefix: { color: colors.text2, fontFamily: fonts.semibold, fontSize: 15, marginRight: 4 },
  input: {
    flex: 1,
    color: colors.text1,
    fontFamily: fonts.regular,
    fontSize: 15,
    paddingVertical: 10,
  },
  saveBtn: {
    marginTop: 16,
    borderRadius: 10,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  saveText: { color: colors.bg, fontFamily: fonts.semibold, fontSize: 15 },
  reminder: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  reminderText: { flex: 1, color: colors.text2, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  footer: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 16,
  },
  link: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10, alignSelf: "flex-start" },
  linkText: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 13 },
});
