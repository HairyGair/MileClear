import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getTaxYear, formatPence } from "@mileclear/shared";
import { BetaBanner } from "../components/BetaBanner";
import { FigureRow } from "../components/mtd/FigureRow";
import { PreSendChecks } from "../components/mtd/PreSendChecks";
import {
  isMtdTest,
  couldntSendTitle,
  updateFailedBody,
  confirmSendTitle,
  confirmSendBody,
  sendButtonLabel,
  CHECK_AND_SEND_TITLE,
  RUNNING_TOTAL_TEXT,
  MISTAKE_LATER_TEXT,
  type HmrcEnv,
} from "../lib/tax/mtdCopy";
import { useHmrcEnvironment, rememberHmrcEnvironment } from "../lib/tax/useHmrcEnvironment";
import {
  fetchHmrcStatus,
  fetchHmrcObligations,
  fetchHmrcPeriod,
  previewPeriodSubmission,
  submitPeriod,
  type HmrcObligation,
  type PeriodSubmissionPayload,
} from "../lib/api/hmrc";
import { taxYearOfPeriodStart } from "../lib/tax/mtdQuarters";
import { invalidateHubCache } from "../lib/tax/mtdHubCache";
import {
  buildFigureSources,
  buildPreSendChecks,
  costsPence,
  localDay,
  longDay,
  periodSentence,
  previousUpdateProfitPence,
  updateNumber,
} from "../lib/tax/mtdChecks";
import { isApiError } from "../lib/api";
import { chart, colors, fonts, heroCard } from "../lib/theme";

const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const RED = colors.red;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The tax year an update period belongs to ("YYYY-YY"). A period starting on
// or after 1 April is in the year starting that April (calendar quarters too).
function deriveTaxYear(periodStartIso: string): string {
  return taxYearOfPeriodStart(periodStartIso) || getTaxYear(new Date());
}

function pounds(pence: number): string {
  return formatPence(Math.abs(pence));
}

export default function TaxMtdPreviewScreen() {
  const { from, to } = useLocalSearchParams<{ from: string; to: string }>();
  const insets = useSafeAreaInsets();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PeriodSubmissionPayload | null>(null);
  const [obligations, setObligations] = useState<HmrcObligation[] | null>(null);
  // undefined while HMRC is being asked, null when there is no earlier update to compare with.
  const [lastProfitPence, setLastProfitPence] = useState<number | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedEnv, setFetchedEnv] = useState<HmrcEnv>(null);
  const fallbackEnv = useHmrcEnvironment();
  const env = fetchedEnv ?? fallbackEnv;
  const test = isMtdTest(env);
  const sendLabel = sendButtonLabel(env);

  const taxYear = from ? deriveTaxYear(from) : getTaxYear(new Date());
  const fromDay = from ? localDay(from) : "";
  const toDay = to ? localDay(to) : "";

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    (async () => {
      try {
        // Pull businessId from status. We know it's set because the
        // entry screen wouldn't have routed here otherwise. Defensive
        // refetch in case the user disconnected mid-navigation.
        const status = await fetchHmrcStatus();
        if (cancelled) return;
        setFetchedEnv(status.data.environment ?? null);
        rememberHmrcEnvironment(status.data.environment);
        if (!status.data.connected || !status.data.businessId) {
          setError(
            status.data.environment === "production"
              ? "Connect to HMRC again and confirm your trade first."
              : "Connect again to the test service and confirm your trade first.",
          );
          setLoading(false);
          return;
        }
        const bid = status.data.businessId;
        setBusinessId(bid);

        const res = await previewPeriodSubmission({ businessId: bid, taxYear, from, to });
        if (cancelled) return;
        setPreview(res.data);
        setLoading(false);

        // Everything below is extra context. If any of it fails the screen
        // still works, just without that line. The server only returns this
        // driver's self-employment obligations (it filters by the connected
        // business), so a property business never adds updates here.
        const startYear = Number(taxYear.slice(0, 4));
        fetchHmrcObligations({ from: `${startYear}-04-06`, to: `${startYear + 1}-04-05` })
          .then((r) => !cancelled && setObligations(r.data.obligations))
          .catch(() => {});

        // The cumulative summary is stored under the tax year as its id: one
        // call tells us what HMRC holds and how far it runs.
        fetchHmrcPeriod(bid, taxYear, taxYear)
          .then((detail) => {
            if (!cancelled) setLastProfitPence(previousUpdateProfitPence(detail.data, localDay(to)));
          })
          .catch(() => !cancelled && setLastProfitPence(null));
      } catch (err) {
        if (!cancelled) {
          setError(
            isApiError(err) ? err.message : err instanceof Error ? err.message : "Couldn't load your update.",
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
    const period = periodSentence(
      localDay(preview.periodDates.periodStartDate),
      localDay(preview.periodDates.periodEndDate),
    );
    Alert.alert(confirmSendTitle(env), confirmSendBody(env, period), [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send",
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
            // The server rebuilds the figures at send time, so the receipt comes
            // from what it says it sent, not from the preview we looked at.
            const sent = result.data.breakdown;
            const sentEarnings = sent
              ? sent.income.turnoverPence
              : Math.round((preview.periodIncome.turnover ?? 0) * 100);
            const sentCosts = sent
              ? sent.expenses.carVanTravelPence +
                (sent.expenses.professionalFeesPence ?? 0) +
                sent.expenses.adminCostsPence +
                sent.expenses.otherExpensesPence
              : costsPence(preview);
            // The hub must not show this quarter as still to send.
            invalidateHubCache();
            router.replace({
              pathname: "/tax-mtd-submitted" as never,
              params: {
                periodId: result.data.periodId,
                taxYear,
                periodStart: preview.periodDates.periodStartDate,
                periodEnd: preview.periodDates.periodEndDate,
                earningsPence: String(sentEarnings),
                costsPence: String(sentCosts),
                sentAt: new Date().toISOString(),
              },
            });
          } catch (err) {
            Alert.alert(
              couldntSendTitle(env),
              updateFailedBody(env, isApiError(err) ? err.message : err instanceof Error ? err.message : null),
            );
            setSubmitting(false);
          }
        },
      },
    ]);
  }, [preview, businessId, taxYear, env]);

  const onCheckAction = useCallback((target: "trips-to-sort" | "earnings") => {
    if (target === "trips-to-sort") router.push("/(tabs)/trips?filter=unclassified" as never);
    else router.push("/earning-form" as never);
  }, []);

  const onOpenNote = useCallback((link: "earnings" | "trips") => {
    router.push((link === "earnings" ? "/(tabs)/earnings" : "/(tabs)/trips") as never);
  }, []);

  const screenOptions = {
    title: CHECK_AND_SEND_TITLE,
    headerStyle: { backgroundColor: BG },
    headerTintColor: TEXT_1,
  };

  const position = useMemo(
    () => (obligations && toDay ? updateNumber(obligations, toDay) : null),
    [obligations, toDay],
  );
  const dueDay = useMemo(() => {
    const o = obligations?.find((x) => localDay(x.end) === toDay);
    return o ? localDay(o.due) : "";
  }, [obligations, toDay]);

  const sources = useMemo(() => (preview ? buildFigureSources(preview) : []), [preview]);

  if (loading) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: BG }]}>
        <Stack.Screen options={screenOptions} />
        <ActivityIndicator color={AMBER} size="large" />
        <Text style={styles.loadingText}>Working out your figures from your trips and earnings...</Text>
      </View>
    );
  }

  if (error || !preview) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: BG, padding: 24 }]}>
        <Stack.Screen options={screenOptions} />
        <Ionicons name="alert-circle-outline" size={48} color={RED} />
        <Text style={[styles.title, { marginTop: 16 }]}>Couldn't work out your update</Text>
        <Text style={styles.body}>{error ?? "Something went wrong."}</Text>
      </View>
    );
  }

  const b = preview.breakdown;
  const earningsPence = Math.round((preview.periodIncome.turnover ?? 0) * 100);
  const costs = costsPence(preview);
  const profitPence = earningsPence - costs;
  const delta = typeof lastProfitPence === "number" ? profitPence - lastProfitPence : null;

  const serverChecks = preview.checks ?? null;
  const checks = buildPreSendChecks({
    unmarkedCount: serverChecks?.unmarkedTrips ?? 0,
    // No server answer: no earnings row, rather than a guess from the phone.
    missingWeeks: serverChecks ? serverChecks.weeksMissingEarnings : null,
    excludedMotorPence: b.expenses.excludedNonAmapPence,
    serverWarnings: b.warnings,
    fromDay,
    toDay,
    formatPence,
  });

  const segments = Math.max(4, obligations?.length ?? 0);
  const eyebrow = position
    ? `UPDATE ${position.number} OF ${position.of}${dueDay ? ` · DUE ${longDay(dueDay).toUpperCase()}` : ""}`
    : "QUARTERLY UPDATE";

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen options={screenOptions} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {test && (
          <BetaBanner
            label="Test version"
            title="This is a test update"
            body="Your figures are worked out from your real trips and earnings, but the update only goes to HMRC's test service. Nothing is sent to HMRC and your tax account is not changed."
          />
        )}

        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.h2} accessibilityRole="header">
          {periodSentence(localDay(preview.periodDates.periodStartDate), localDay(preview.periodDates.periodEndDate))}
        </Text>
        <Text style={styles.lead}>{RUNNING_TOTAL_TEXT}</Text>

        {position && obligations && (
          <View style={styles.strip} accessible accessibilityLabel={`Update ${position.number} of ${position.of}`}>
            {Array.from({ length: segments }, (_, i) => {
              const o = [...obligations].sort((a, c) => a.start.localeCompare(c.start))[i];
              const state = i < position.number - 1 ? "sent" : i === position.number - 1 ? "new" : "later";
              const label = o
                ? `${MONTH_SHORT[Number(localDay(o.start).slice(5, 7)) - 1]}-${MONTH_SHORT[Number(localDay(o.end).slice(5, 7)) - 1]}`
                : "";
              return (
                <View key={i} style={{ flex: 1 }}>
                  <View
                    style={[
                      styles.seg,
                      state === "sent" && { backgroundColor: chart.past },
                      state === "new" && { backgroundColor: AMBER },
                    ]}
                  />
                  <Text style={[styles.segLabel, state === "new" && { color: AMBER }]}>
                    {label}
                    {state === "sent" ? "\nsent" : state === "new" ? "\nnew" : ""}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>PROFIT SO FAR</Text>
          <Text
            style={[styles.heroBig, profitPence < 0 && { color: RED }]}
            accessibilityLabel={`${profitPence < 0 ? "Loss" : "Profit"} so far ${pounds(profitPence)}`}
          >
            {profitPence < 0 ? "-" : ""}
            {pounds(profitPence)}
          </Text>
          <View style={styles.eq}>
            <Text style={styles.eqText}>
              Earnings <Text style={styles.eqStrong}>{formatPence(earningsPence)}</Text>
            </Text>
            <Text style={styles.eqText}>-</Text>
            <Text style={styles.eqText}>
              Costs <Text style={styles.eqStrong}>{formatPence(costs)}</Text>
            </Text>
          </View>
          {/* The line's height is reserved until HMRC answers, so nothing jumps. */}
          {lastProfitPence === undefined ? (
            <View style={styles.heroSmallReserve} />
          ) : delta !== null && delta !== 0 ? (
            <Text style={styles.heroSmall}>
              {delta > 0 ? "Up" : "Down"} {pounds(delta)} since your last update.
            </Text>
          ) : null}
        </View>

        {checks.length > 0 && (
          <>
            <Text style={styles.section}>CHECK BEFORE YOU SEND</Text>
            <PreSendChecks checks={checks} onAction={onCheckAction} />
          </>
        )}

        <Text style={styles.section}>WHAT HMRC WILL SEE</Text>
        <View style={styles.listCard}>
          {sources.map((s, i) => (
            <View key={s.id} style={i > 0 && styles.listBorder}>
              <FigureRow source={s} onOpenNote={onOpenNote} />
            </View>
          ))}
        </View>
        <Text style={styles.fixLine}>
          Something wrong? Fix it in MileClear and come back. The figures update straight away.
        </Text>
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.primaryButton, submitting && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
          accessibilityState={{ disabled: submitting }}
        >
          {submitting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>{sendLabel}</Text>
              <Ionicons name="cloud-upload-outline" size={19} color="#000" />
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.stickyNote}>{MISTAKE_LATER_TEXT}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  loadingText: { color: TEXT_3, fontSize: 13, marginTop: 16, fontFamily: fonts.regular, textAlign: "center", paddingHorizontal: 32 },
  title: { color: TEXT_1, fontSize: 20, fontFamily: fonts.bold, textAlign: "center" },
  body: { color: TEXT_2, fontSize: 14, textAlign: "center", marginTop: 8, fontFamily: fonts.regular },

  eyebrow: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: TEXT_2 },
  h2: { fontFamily: fonts.bold, fontSize: 24, color: TEXT_1, marginTop: 8 },
  lead: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: TEXT_2, marginTop: 4 },

  strip: { flexDirection: "row", gap: 4, marginTop: 14 },
  seg: { height: 8, borderRadius: 4, backgroundColor: chart.track },
  segLabel: { fontFamily: fonts.semibold, fontSize: 11, color: TEXT_3, marginTop: 6 },

  hero: {
    backgroundColor: heroCard.tint,
    borderWidth: 1,
    borderColor: heroCard.border,
    borderRadius: heroCard.radius,
    padding: 18,
    marginTop: 18,
  },
  heroEyebrow: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: TEXT_2 },
  heroBig: { fontFamily: fonts.bold, fontSize: 44, color: TEXT_1, marginTop: 6, fontVariant: ["tabular-nums"] },
  eq: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 },
  eqText: { fontFamily: fonts.regular, fontSize: 13, color: TEXT_2 },
  eqStrong: { fontFamily: fonts.semibold, color: TEXT_1, fontVariant: ["tabular-nums"] },
  heroSmallReserve: { height: 18, marginTop: 8 },
  heroSmall: { fontFamily: fonts.regular, fontSize: 13, color: TEXT_2, marginTop: 8 },

  section: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.6, color: TEXT_2, marginTop: 22, marginBottom: 8, marginLeft: 4 },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 2,
  },
  listBorder: { borderTopWidth: 1, borderTopColor: colors.hairline },
  fixLine: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: TEXT_2, marginTop: 12, marginHorizontal: 6 },

  sticky: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  primaryButton: {
    backgroundColor: AMBER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#000", fontFamily: fonts.semibold, fontSize: 17 },
  stickyNote: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: TEXT_2, textAlign: "center", marginTop: 8 },
});
