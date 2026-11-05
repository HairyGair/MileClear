import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";
import {
  triggerCalculation,
  pollCalculation,
  fetchHmrcObligations,
  type HmrcCalculationSummary,
  type HmrcObligation,
} from "../lib/api/hmrc";
import { isApiError } from "../lib/api";
import { BetaBanner } from "../components/BetaBanner";
import { EstimateExplained } from "../components/mtd/EstimateExplained";
import {
  isMtdTest,
  sentNavTitle,
  sentHeading,
  estimateWaitingText,
  ESTIMATE_FAILED_TEXT,
  NOTHING_TO_PAY_COPY,
  SENT_SIGNPOST_TEXT,
} from "../lib/tax/mtdCopy";
import { useHmrcEnvironment } from "../lib/tax/useHmrcEnvironment";
import { getNotificationPreferences } from "../lib/notifications/preferences";
import { finishTheYearDeadline, localDay, nextUpdates, periodSentence } from "../lib/tax/mtdChecks";
import { GOVUK_PERSONAL_TAX_ACCOUNT } from "../components/MtdSignpost";
import * as WebBrowser from "expo-web-browser";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;

type CalcState =
  | { status: "triggering" }
  | { status: "polling"; calculationId: string }
  | { status: "ready"; result: HmrcCalculationSummary }
  | { status: "error"; message: string };

function sentAtText(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `Sent ${date}, ${time}`;
}

export default function TaxMtdSubmittedScreen() {
  const { taxYear, periodStart, periodEnd, earningsPence, costsPence, sentAt } = useLocalSearchParams<{
    taxYear: string;
    periodId: string;
    periodStart?: string;
    periodEnd?: string;
    earningsPence?: string;
    costsPence?: string;
    sentAt?: string;
  }>();
  const [calc, setCalc] = useState<CalcState>({ status: "triggering" });
  const [obligations, setObligations] = useState<HmrcObligation[] | null>(null);
  const [remindersOn, setRemindersOn] = useState<boolean | null>(null);
  const env = useHmrcEnvironment();
  const test = isMtdTest(env);

  useEffect(() => {
    if (!taxYear) return;
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        const trigger = await triggerCalculation({ taxYear, calculationType: "in-year" });
        if (cancelled) return;
        setCalc({ status: "polling", calculationId: trigger.data.calculationId });

        const result = await pollCalculation(trigger.data.calculationId, taxYear, { signal: ac.signal });
        if (cancelled) return;
        setCalc({ status: "ready", result });
      } catch (err) {
        if (cancelled) return;
        setCalc({
          status: "error",
          message: isApiError(err) ? err.message : err instanceof Error ? err.message : "Calculation failed.",
        });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [taxYear]);

  // What happens next. Both reads are best effort: the screen reads fine without them.
  useEffect(() => {
    if (!taxYear) return;
    let cancelled = false;
    const startYear = Number(taxYear.slice(0, 4));
    fetchHmrcObligations({ from: `${startYear}-04-06`, to: `${startYear + 1}-04-05` })
      .then((r) => !cancelled && setObligations(r.data.obligations))
      .catch(() => {});
    getNotificationPreferences()
      .then((p) => !cancelled && setRemindersOn(p.taxDeadline))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [taxYear]);

  const earnings = earningsPence !== undefined ? Number(earningsPence) : NaN;
  const costs = costsPence !== undefined ? Number(costsPence) : NaN;
  const hasReceipt = Number.isFinite(earnings) && Number.isFinite(costs);
  const periodText =
    periodStart && periodEnd ? periodSentence(localDay(periodStart), localDay(periodEnd)) : null;
  const subtitle = [periodText, sentAtText(sentAt)].filter(Boolean).join(" · ");
  const next = obligations && periodEnd ? nextUpdates(obligations, localDay(periodEnd)) : [];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen
        options={{
          title: sentNavTitle(env),
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT_1,
          headerBackVisible: false,
          gestureEnabled: false,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.replace("/tax-mtd" as never)}
              accessibilityRole="button"
              accessibilityLabel="Done"
              hitSlop={8}
            >
              <Text style={styles.headerDone}>Done</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {test && (
          <BetaBanner
            label="Test version"
            title="Sent to HMRC's test service"
            body="You've completed a test update. Nothing reached HMRC and your real tax record is not changed. There's nothing more you need to do."
          />
        )}

        <View style={styles.success}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark" size={40} color="#000" />
          </View>
          <Text style={styles.successTitle} accessibilityRole="header">
            {sentHeading(env)}
          </Text>
          {subtitle ? <Text style={styles.successSub}>{subtitle}</Text> : null}
        </View>

        {hasReceipt && (
          <View style={styles.receipt}>
            <ReceiptRow label="Earnings" value={formatPence(earnings)} />
            <ReceiptRow label="Costs" value={formatPence(costs)} />
            <View style={styles.receiptDivider} />
            <ReceiptRow label="Profit so far" value={formatPence(earnings - costs)} strong />
          </View>
        )}

        <Text accessibilityRole="header" style={styles.section}>YOUR TAX SO FAR</Text>

        {(calc.status === "triggering" || calc.status === "polling") && (
          <View style={styles.waiting}>
            <ActivityIndicator color={AMBER} />
            <Text style={styles.waitingText}>{estimateWaitingText(env)}</Text>
          </View>
        )}

        {calc.status === "error" && (
          <View style={styles.waiting}>
            <Ionicons name="alert-circle-outline" size={28} color={TEXT_3} />
            <Text style={styles.waitingText}>{ESTIMATE_FAILED_TEXT}</Text>
          </View>
        )}

        {calc.status === "ready" && <EstimateExplained summary={calc.result} env={env} />}

        <View style={styles.nothing}>
          <Ionicons name="cash-outline" size={20} color={GREEN} style={{ marginTop: 1 }} accessible={false} />
          <View style={{ flex: 1 }}>
            <Text style={styles.nothingTitle}>{NOTHING_TO_PAY_COPY.title}</Text>
            <Text style={styles.nothingBody}>{NOTHING_TO_PAY_COPY.body}</Text>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => router.push("/tax-planner" as never)}
              accessibilityRole="link"
              accessibilityLabel={NOTHING_TO_PAY_COPY.link}
            >
              <Text style={styles.link}>{NOTHING_TO_PAY_COPY.link}</Text>
              <Ionicons name="chevron-forward" size={14} color={AMBER} accessible={false} />
            </TouchableOpacity>
          </View>
        </View>

        {taxYear ? (
          <>
            <Text accessibilityRole="header" style={styles.section}>WHAT HAPPENS NEXT</Text>
            <View style={styles.nextCard}>
              {next.map((n, i) => (
                <NextRow
                  key={`${n.due}-${i}`}
                  icon={i === 0 ? "notifications-outline" : "calendar-outline"}
                  when={n.due.toUpperCase()}
                  title={n.title}
                  sub={
                    n.last
                      ? `The last one for ${taxYear}.`
                      : remindersOn === false
                        ? "Reminders are off on this phone. You can turn them on in Settings."
                        : "We'll remind you 7 days and 1 day before."
                  }
                />
              ))}
              <NextRow
                icon="flag-outline"
                when={`BY ${finishTheYearDeadline(taxYear).toUpperCase()}`}
                title="Finish the year"
                sub="Confirm your final figures with HMRC. We'll tell you what to do nearer the time."
                last
              />
            </View>
          </>
        ) : null}

        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => router.replace("/tax-mtd" as never)}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>

        <Text style={styles.signpost}>
          {SENT_SIGNPOST_TEXT}{" "}
          <Text
            style={styles.signpostLink}
            onPress={() => void WebBrowser.openBrowserAsync(GOVUK_PERSONAL_TAX_ACCOUNT)}
            accessibilityRole="link"
          >
            Open on GOV.UK ›
          </Text>
        </Text>
      </ScrollView>
    </View>
  );
}

function ReceiptRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={[styles.receiptLabel, strong && styles.receiptStrong]}>{label}</Text>
      <Text style={[styles.receiptValue, strong && styles.receiptStrong]}>{value}</Text>
    </View>
  );
}

function NextRow({
  icon,
  when,
  title,
  sub,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  when: string;
  title: string;
  sub: string;
  last?: boolean;
}) {
  return (
    <View style={styles.nextRow}>
      <View style={{ alignItems: "center" }}>
        <View style={styles.nextIcon}>
          <Ionicons name={icon} size={18} color={TEXT_3} accessible={false} />
        </View>
        {!last && <View style={styles.nextLine} />}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 16 }}>
        <Text style={styles.nextWhen}>{when}</Text>
        <Text style={styles.nextTitle}>{title}</Text>
        <Text style={styles.nextSub}>{sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerDone: { fontFamily: fonts.semibold, fontSize: 16, color: AMBER },

  success: { alignItems: "center", paddingVertical: 12 },
  successIconWrap: {
    backgroundColor: GREEN,
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: { color: TEXT_1, fontSize: 24, fontFamily: fonts.bold, marginTop: 16, textAlign: "center" },
  successSub: { color: TEXT_2, fontSize: 14, fontFamily: fonts.regular, textAlign: "center", marginTop: 6 },

  receipt: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
    marginTop: 12,
  },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 },
  receiptLabel: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 15, color: TEXT_2 },
  receiptValue: { fontFamily: fonts.semibold, fontSize: 15, color: TEXT_1, fontVariant: ["tabular-nums"] },
  receiptStrong: { fontFamily: fonts.bold, color: TEXT_1 },
  receiptDivider: { height: 1, backgroundColor: colors.hairline, marginVertical: 6 },

  section: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.6, color: TEXT_2, marginTop: 22, marginBottom: 8, marginLeft: 4 },

  waiting: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 12,
  },
  waitingText: { color: TEXT_2, fontSize: 14, fontFamily: fonts.regular, textAlign: "center", lineHeight: 20 },

  nothing: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.greenDim,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.28)",
    borderRadius: 16,
    padding: 16,
    marginTop: 14,
  },
  nothingTitle: { fontFamily: fonts.bold, fontSize: 16, color: TEXT_1 },
  nothingBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: TEXT_2, marginTop: 2 },
  linkRow: { minHeight: 44, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4 },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: AMBER },

  nextCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
  },
  nextRow: { flexDirection: "row", gap: 12 },
  nextIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  nextLine: { width: 1, flex: 1, backgroundColor: colors.hairline, marginVertical: 4 },
  nextWhen: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.5, color: AMBER },
  nextTitle: { fontFamily: fonts.semibold, fontSize: 16, color: TEXT_1, marginTop: 2 },
  nextSub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: TEXT_2, marginTop: 2 },

  doneButton: {
    backgroundColor: AMBER,
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  doneButtonText: { color: "#000", fontSize: 17, fontFamily: fonts.semibold },

  signpost: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: TEXT_2, textAlign: "center", marginTop: 16 },
  signpostLink: { fontFamily: fonts.semibold, color: AMBER },
});
