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
import {
  triggerCalculation,
  pollCalculation,
  type HmrcCalculationSummary,
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

type CalcState =
  | { status: "triggering" }
  | { status: "polling"; calculationId: string }
  | { status: "ready"; result: HmrcCalculationSummary }
  | { status: "error"; message: string };

export default function TaxMtdSubmittedScreen() {
  const { taxYear } = useLocalSearchParams<{ taxYear: string; periodId: string }>();
  const [calc, setCalc] = useState<CalcState>({ status: "triggering" });

  useEffect(() => {
    if (!taxYear) return;
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        const trigger = await triggerCalculation({ taxYear, calculationType: "in-year" });
        if (cancelled) return;
        setCalc({ status: "polling", calculationId: trigger.data.calculationId });

        const result = await pollCalculation(trigger.data.calculationId, { signal: ac.signal });
        if (cancelled) return;
        setCalc({ status: "ready", result });
      } catch (err) {
        if (cancelled) return;
        setCalc({
          status: "error",
          message:
            isApiError(err) ? err.message : err instanceof Error ? err.message : "Calculation failed.",
        });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [taxYear]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
      <Stack.Screen
        options={{
          title: "Submitted",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT_1,
          headerBackVisible: false,
        }}
      />

      <View style={styles.successCard}>
        <View style={styles.successIconWrap}>
          <Ionicons name="checkmark" size={42} color="#000" />
        </View>
        <Text style={styles.successTitle}>Submitted to HMRC</Text>
        <Text style={styles.successBody}>
          Your quarterly update is in. We'll keep this submission on file and remind
          you when the next obligation is due.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>HMRC Calculation</Text>

        {calc.status === "triggering" && (
          <View style={styles.calcPlaceholder}>
            <ActivityIndicator color={AMBER} />
            <Text style={styles.calcPlaceholderText}>Asking HMRC for an in-year calculation…</Text>
          </View>
        )}

        {calc.status === "polling" && (
          <View style={styles.calcPlaceholder}>
            <ActivityIndicator color={AMBER} />
            <Text style={styles.calcPlaceholderText}>HMRC is calculating your tax…</Text>
            <Text style={styles.calcPlaceholderHint}>Usually takes 10–30 seconds.</Text>
          </View>
        )}

        {calc.status === "error" && (
          <View style={styles.calcPlaceholder}>
            <Ionicons name="alert-circle-outline" size={32} color={TEXT_3} />
            <Text style={styles.calcPlaceholderText}>{calc.message}</Text>
            <Text style={styles.calcPlaceholderHint}>
              You can re-trigger the calc later from the Tax screen — your submission isn't affected.
            </Text>
          </View>
        )}

        {calc.status === "ready" && <CalcSummary summary={calc.result} />}
      </View>

      <TouchableOpacity
        style={styles.doneButton}
        onPress={() => router.replace("/tax-mtd" as never)}
      >
        <Text style={styles.doneButtonText}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function CalcSummary({ summary }: { summary: HmrcCalculationSummary }) {
  const fmt = (v: number | undefined) =>
    v === undefined ? "—" : `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.headlineCard}>
        <Text style={styles.headlineLabel}>Total tax + NIC due</Text>
        <Text style={styles.headlineValue}>{fmt(summary.totalIncomeTaxAndNicsDue)}</Text>
        <Text style={styles.headlineSubLabel}>HMRC's in-year estimate · tax year {summary.taxYear}</Text>
      </View>

      <View style={styles.breakdownGrid}>
        <BreakdownTile label="Income tax" value={fmt(summary.incomeTaxAmount)} />
        <BreakdownTile label="Class 2 NI" value={fmt(summary.nic2)} />
        <BreakdownTile label="Class 4 NI" value={fmt(summary.nic4)} />
      </View>

      {summary.totalIncomeReceived !== undefined && (
        <View style={styles.contextCard}>
          <ContextRow label="Total income" value={fmt(summary.totalIncomeReceived)} />
          {summary.totalAllowancesAndDeductions !== undefined && (
            <ContextRow label="Allowances + deductions" value={fmt(summary.totalAllowancesAndDeductions)} />
          )}
          {summary.totalTaxableIncome !== undefined && (
            <ContextRow label="Taxable income" value={fmt(summary.totalTaxableIncome)} highlight />
          )}
        </View>
      )}

      <Text style={styles.disclaimerText}>
        These are HMRC's figures — what you'll owe at year-end if your earning pattern
        stays the same. They update each time you submit a quarter.
      </Text>
    </View>
  );
}

function BreakdownTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

function ContextRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.contextRow}>
      <Text style={styles.contextLabel}>{label}</Text>
      <Text style={[styles.contextValue, highlight && { color: AMBER, fontFamily: fonts.bold }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  successCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  successIconWrap: {
    backgroundColor: GREEN,
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    color: TEXT_1,
    fontSize: 22,
    fontFamily: fonts.bold,
    marginTop: 16,
  },
  successBody: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },

  section: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.semibold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  calcPlaceholder: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 12,
  },
  calcPlaceholderText: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: "center",
  },
  calcPlaceholderHint: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: "center",
  },

  headlineCard: {
    backgroundColor: BG,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  headlineLabel: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.semibold,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  headlineValue: {
    color: AMBER,
    fontSize: 32,
    fontFamily: fonts.bold,
    marginTop: 4,
  },
  headlineSubLabel: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 6,
  },

  breakdownGrid: {
    flexDirection: "row",
    gap: 8,
  },
  tile: {
    flex: 1,
    backgroundColor: BG,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  tileLabel: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.regular,
    textAlign: "center",
  },
  tileValue: {
    color: TEXT_1,
    fontSize: 14,
    fontFamily: fonts.semibold,
  },

  contextCard: {
    backgroundColor: BG,
    borderRadius: 10,
    padding: 12,
  },
  contextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  contextLabel: {
    color: TEXT_2,
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  contextValue: {
    color: TEXT_1,
    fontSize: 13,
    fontFamily: fonts.semibold,
  },

  disclaimerText: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },

  doneButton: {
    backgroundColor: CARD_BG,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  doneButtonText: {
    color: TEXT_1,
    fontSize: 16,
    fontFamily: fonts.semibold,
  },
});
