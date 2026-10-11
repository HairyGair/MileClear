// End of year, part 2: HMRC's end-of-year calculation, HMRC's declaration,
// and the button that submits the tax return.
//
// HMRC's rules (docs/hmrc-end-of-year-oct2026.md):
//   - show the calculation before the declaration (at least an SA302's worth)
//   - show HMRC's declaration and get the driver's agreement (a tick box here)
//   - submit against the same calculation the driver saw
// The server checks the calculation again before it submits anything.

import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Alert, Linking } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  TAX_RETURN_DECLARATION_INTRO,
  TAX_RETURN_DECLARATION_STATEMENT,
  TAX_RETURN_DECLARATION_VERSION,
} from "@mileclear/shared";
import { PremiumGate } from "../components/PremiumGate";
import {
  TaxReturnTestBanner,
  Section,
  Body,
  Row,
  Note,
  TickBox,
  PrimaryButton,
  SecondaryButton,
  partStyles as s,
} from "../components/taxReturn/TaxReturnParts";
import {
  triggerTaxReturnCalculation,
  pollTaxReturnCalculation,
  submitTaxReturn,
  type TaxReturnCalculation,
} from "../lib/api/hmrcTaxReturn";
import { isApiError } from "../lib/api";
import { formatPounds, totalDueLine, taxYearRangeLabel } from "../lib/tax/taxReturnCopy";
import { colors } from "../lib/theme";

const GOVUK_SIGN_IN = "https://www.gov.uk/personal-tax-account";

type CalcState =
  | { status: "working" }
  | { status: "ready"; calc: TaxReturnCalculation }
  | { status: "error"; message: string };

export default function TaxMtdYearEndReviewScreen() {
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: "Check and submit", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text1 }} />
      <PremiumGate feature="End of year">
        <Review />
      </PremiumGate>
    </View>
  );
}

function errMsg(err: unknown, fallback: string): string {
  return isApiError(err) ? err.message : err instanceof Error ? err.message : fallback;
}

function Review() {
  const { taxYear, environment } = useLocalSearchParams<{ taxYear: string; environment?: string }>();
  const isLive = environment === "production";
  const [state, setState] = useState<CalcState>({ status: "working" });
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!taxYear) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ status: "working" });
    setAgreed(false);
    try {
      const trigger = await triggerTaxReturnCalculation(taxYear);
      const calc = await pollTaxReturnCalculation(taxYear, trigger.data.calculationId, { signal: ac.signal });
      if (!ac.signal.aborted) setState({ status: "ready", calc });
    } catch (err) {
      if (!ac.signal.aborted) setState({ status: "error", message: errMsg(err, "Couldn't get your tax calculation.") });
    }
  }, [taxYear]);

  useEffect(() => {
    run();
    return () => abortRef.current?.abort();
  }, [run]);

  const onSubmit = useCallback(() => {
    if (state.status !== "ready" || !taxYear) return;
    const calc = state.calc;
    const due = totalDueLine(calc.totalIncomeTaxAndNicsDue);
    Alert.alert(
      "Submit your tax return?",
      isLive
        ? `This submits your ${taxYear} tax return to HMRC. ${due.label}: ${due.amount}. You can't undo this. To change it later you'll need to amend your return.`
        : `This submits your ${taxYear} tax return to HMRC's test service. ${due.label}: ${due.amount}. In the test version nothing reaches HMRC and your tax account is not changed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit tax return",
          onPress: async () => {
            setSubmitting(true);
            try {
              const res = await submitTaxReturn({
                taxYear,
                calculationId: calc.calculationId,
                declarationVersion: TAX_RETURN_DECLARATION_VERSION,
              });
              const d = res.data;
              router.replace({
                pathname: "/tax-mtd-year-end-done" as never,
                params: {
                  taxYear: d.taxYear,
                  calculationId: d.calculationId,
                  correlationId: d.correlationId ?? "",
                  submittedAt: d.submittedAt,
                  environment: d.environment,
                  total: d.totalIncomeTaxAndNicsDue === null ? "" : String(d.totalIncomeTaxAndNicsDue),
                },
              });
            } catch (err) {
              setSubmitting(false);
              Alert.alert("Your tax return was not submitted", errMsg(err, "Try again."));
            }
          },
        },
      ]
    );
  }, [state, taxYear, isLive]);

  if (!taxYear) {
    return (
      <View style={s.center}>
        <Body>Go back and choose a tax year first.</Body>
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <TaxReturnTestBanner />

      {state.status === "working" && (
        <View style={{ paddingVertical: 48, alignItems: "center", gap: 12 }}>
          <ActivityIndicator color={colors.amber} size="large" />
          <Body>HMRC's test service is working out your tax for {taxYear}.</Body>
          <Body muted>This usually takes 10 to 30 seconds.</Body>
        </View>
      )}

      {state.status === "error" && (
        <Section title="No calculation yet">
          <Note tone="bad" text={state.message} />
          <PrimaryButton label="Try again" icon="refresh" onPress={run} />
        </Section>
      )}

      {state.status === "ready" && (
        <CalcAndDeclaration
          calc={state.calc}
          taxYear={taxYear}
          agreed={agreed}
          onToggleAgreed={() => setAgreed((v) => !v)}
          submitting={submitting}
          onSubmit={onSubmit}
          onRecalculate={run}
        />
      )}
    </ScrollView>
  );
}

function CalcAndDeclaration({
  calc,
  taxYear,
  agreed,
  onToggleAgreed,
  submitting,
  onSubmit,
  onRecalculate,
}: {
  calc: TaxReturnCalculation;
  taxYear: string;
  agreed: boolean;
  onToggleAgreed: () => void;
  submitting: boolean;
  onSubmit: () => void;
  onRecalculate: () => void;
}) {
  const due = totalDueLine(calc.totalIncomeTaxAndNicsDue);

  if (calc.errors.length > 0 || calc.blocker) {
    return (
      <Section title="HMRC can't take this tax return yet">
        {calc.blocker && <Note tone="bad" text={calc.blocker} />}
        {calc.errors.map((e) => (
          <Note key={`${e.id}-${e.text}`} tone="bad" text={e.text || e.id} />
        ))}
        <Body muted>
          These messages come from HMRC. Fix what they describe, for example by correcting a quarterly update, then get a
          new calculation.
        </Body>
        <SecondaryButton label="Get a new calculation" onPress={onRecalculate} />
      </Section>
    );
  }

  return (
    <>
      <Section step="Step 6" title="Your tax calculation from HMRC">
        <Body muted>Tax year {taxYear}: {taxYearRangeLabel(taxYear)}</Body>
        <View style={{ paddingVertical: 8, gap: 4 }}>
          <Text style={s.headlineLabel}>{due.label}</Text>
          <Text style={s.headline}>{due.amount}</Text>
        </View>
        <Body muted>
          HMRC worked this out from everything it holds for you this year, not just what MileClear sent. MileClear has
          not checked HMRC's figures.
        </Body>
      </Section>

      <Section title="Income">
        {calc.incomeSources.map((src, i) => (
          <Row key={`${src.label}-${i}`} label={src.label} value={formatPounds(src.amount)} />
        ))}
        <Row label="Total income" value={formatPounds(calc.totalIncomeReceived)} strong />
      </Section>

      <Section title="Allowances">
        {calc.personalAllowance !== undefined && <Row label="Personal Allowance" value={formatPounds(calc.personalAllowance)} />}
        <Row label="Total allowances and deductions" value={formatPounds(calc.totalAllowancesAndDeductions)} />
        <Row label="Income you pay tax on" value={formatPounds(calc.totalTaxableIncome)} strong />
      </Section>

      <Section title="Income Tax and National Insurance">
        {calc.taxBands.map((b, i) => (
          <Row
            key={`${b.name}-${i}`}
            label={`${b.name}: ${formatPounds(b.income)} at ${b.rate}%`}
            value={formatPounds(b.taxAmount)}
          />
        ))}
        <Row label="Income Tax" value={formatPounds(calc.incomeTax)} />
        <Row label="Class 2 National Insurance" value={formatPounds(calc.class2Nics)} />
        <Row label="Class 4 National Insurance" value={formatPounds(calc.class4Nics)} />
        {calc.totalTaxDeducted !== undefined && calc.totalTaxDeducted !== 0 && (
          <Row label="Tax already paid, for example through a job" value={formatPounds(calc.totalTaxDeducted)} />
        )}
        <Row label={due.label} value={due.amount} strong />
      </Section>

      {(calc.warnings.length > 0 || calc.info.length > 0) && (
        <Section title="Messages from HMRC">
          {calc.warnings.map((m) => (
            <Note key={`w-${m.id}-${m.text}`} tone="warn" text={m.text || m.id} />
          ))}
          {calc.info.map((m) => (
            <Note key={`i-${m.id}-${m.text}`} text={m.text || m.id} />
          ))}
        </Section>
      )}

      <Section title="Something wrong?">
        <Body>
          If a figure is wrong because of something you sent, correct it first (for example a quarterly update), then
          get a new calculation. If you think HMRC's rules are wrong, contact HMRC before you submit.
        </Body>
        <Text style={s.link} onPress={() => Linking.openURL(GOVUK_SIGN_IN)} accessibilityRole="link">
          See your full calculation in HMRC online services ›
        </Text>
        <SecondaryButton label="Get a new calculation" onPress={onRecalculate} />
      </Section>

      <Section step="Step 7" title="Declaration">
        <Body>{TAX_RETURN_DECLARATION_INTRO}</Body>
        <Text style={s.declaration}>{TAX_RETURN_DECLARATION_STATEMENT}</Text>
        <TickBox checked={agreed} onToggle={onToggleAgreed} label="I agree to the statement above." disabled={submitting} />
      </Section>

      <PrimaryButton
        label={submitting ? "Submitting..." : "Submit tax return"}
        icon="paper-plane-outline"
        onPress={onSubmit}
        disabled={!agreed || submitting}
      />
      <Body muted>You'll be asked to confirm before anything is submitted.</Body>
    </>
  );
}
