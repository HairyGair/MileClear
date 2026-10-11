// End of year, part 1: the checks before HMRC's end-of-year calculation.
//   1. Are all the quarterly updates for the year in? (HMRC's obligations)
//   2. Allowances and adjustments: what HMRC holds, and why MileClear sends none.
//   3. Other income: the tax return covers ALL income, MileClear only holds
//      self-employment, so anything else must reach HMRC some other way first.
// Then on to tax-mtd-year-end-review for the calculation and the declaration.
//
// Everything is HMRC's test service until production credentials arrive.

import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { PremiumGate } from "../components/PremiumGate";
import {
  TaxReturnTestBanner,
  Section,
  Body,
  Note,
  TickBox,
  PrimaryButton,
  partStyles as s,
} from "../components/taxReturn/TaxReturnParts";
import {
  fetchTaxReturnStatus,
  fetchAnnualReview,
  type TaxReturnStatus,
  type AnnualReview,
} from "../lib/api/hmrcTaxReturn";
import { isApiError } from "../lib/api";
import {
  taxReturnYearOptions,
  taxYearRangeLabel,
  taxYearEndLabel,
  shortDate,
  heldAnnualLines,
} from "../lib/tax/taxReturnCopy";
import { colors } from "../lib/theme";

const GOVUK_ADDITIONAL_INCOME = "https://www.gov.uk/check-additional-income-tax";

type OtherIncome = "unanswered" | "no" | "yes";

export default function TaxMtdYearEndScreen() {
  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: "End of year", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text1 }} />
      <PremiumGate feature="End of year">
        <YearEndChecks />
      </PremiumGate>
    </View>
  );
}

function errMsg(err: unknown, fallback: string): string {
  return isApiError(err) ? err.message : err instanceof Error ? err.message : fallback;
}

function YearEndChecks() {
  const years = taxReturnYearOptions();
  const [taxYear, setTaxYear] = useState(years[0]);
  const [status, setStatus] = useState<TaxReturnStatus | null>(null);
  const [annual, setAnnual] = useState<AnnualReview | null>(null);
  const [annualError, setAnnualError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [carryOnInTest, setCarryOnInTest] = useState(false);
  const [annualRead, setAnnualRead] = useState(false);
  const [otherIncome, setOtherIncome] = useState<OtherIncome>("unanswered");
  const [otherIncomeSent, setOtherIncomeSent] = useState(false);
  const [nothingElse, setNothingElse] = useState(false);

  const load = useCallback(async (year: string) => {
    setLoading(true);
    setError(null);
    setAnnualError(null);
    setStatus(null);
    setAnnual(null);
    setCarryOnInTest(false);
    setAnnualRead(false);
    setOtherIncome("unanswered");
    setOtherIncomeSent(false);
    setNothingElse(false);
    try {
      const [st, an] = await Promise.allSettled([fetchTaxReturnStatus(year), fetchAnnualReview(year)]);
      if (st.status === "rejected") throw st.reason;
      setStatus(st.value.data);
      if (an.status === "fulfilled") setAnnual(an.value.data);
      else setAnnualError(errMsg(an.reason, "Couldn't load your allowances and adjustments."));
    } catch (err) {
      setError(errMsg(err, "Couldn't load your end-of-year details. Try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(taxYear);
  }, [taxYear, load]);

  const isTest = status?.environment !== "production";
  const quartersOk = !!status && (status.quarterly.allSent || (isTest && carryOnInTest));
  const incomeOk = otherIncome === "no" || (otherIncome === "yes" && otherIncomeSent);
  const canContinue = quartersOk && annualRead && incomeOk && nothingElse && !status?.submitted;

  const onContinue = () => {
    router.push({ pathname: "/tax-mtd-year-end-review" as never, params: { taxYear, environment: status?.environment ?? "sandbox" } });
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <TaxReturnTestBanner />

      <Body>
        Your tax return covers the whole tax year. MileClear walks you through it, then HMRC works out your tax
        and you check it before anything is submitted.
      </Body>

      <View style={[s.chipRow, { marginTop: 12 }]}>
        {years.map((y) => (
          <TouchableOpacity
            key={y}
            style={[s.chip, y === taxYear && s.chipOn]}
            onPress={() => setTaxYear(y)}
            accessibilityRole="button"
            accessibilityState={{ selected: y === taxYear }}
            accessibilityLabel={`Tax year ${y}`}
          >
            <Text style={[s.chipText, y === taxYear && s.chipTextOn]}>{y}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && (
        <View style={{ paddingVertical: 48, alignItems: "center", gap: 12 }}>
          <ActivityIndicator color={colors.amber} />
          <Body muted>Checking with HMRC's test service...</Body>
        </View>
      )}

      {!loading && error && (
        <Section title="Something went wrong">
          <Note tone="bad" text={error} />
          <PrimaryButton label="Try again" icon="refresh" onPress={() => load(taxYear)} />
        </Section>
      )}

      {!loading && status && status.submitted && (
        <Section title={`Tax year ${taxYear}`}>
          <Note
            tone="good"
            text={`HMRC's test service already has a tax return for ${taxYear}${
              status.submitted.submittedAt ? `, submitted on ${shortDate(status.submitted.submittedAt)}` : ""
            }. To change it, contact HMRC.`}
          />
          <Body muted>Reference: {status.submitted.calculationId}</Body>
        </Section>
      )}

      {!loading && status && !status.submitted && (
        <>
          {!status.yearEnded && (
            <Note
              tone="warn"
              text={`The ${taxYear} tax year ends on ${taxYearEndLabel(taxYear)}. HMRC won't take its tax return until after that. You can still walk through the steps in the test version.`}
            />
          )}

          {/* 1. Quarterly updates */}
          <Section step="Step 1" title="Quarterly updates">
            <Body muted>{taxYearRangeLabel(taxYear)}</Body>
            {status.quarterly.quarters.length === 0 ? (
              <Note tone="warn" text="HMRC hasn't listed any quarterly updates for this business and year." />
            ) : (
              status.quarterly.quarters.map((q) => (
                <View key={`${q.start}-${q.end}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons
                    name={q.sent ? "checkmark-circle" : "ellipse-outline"}
                    size={18}
                    color={q.sent ? colors.green : colors.text3}
                    accessible={false}
                  />
                  <Text style={[s.rowLabel]}>
                    {shortDate(q.start)} to {shortDate(q.end)}
                  </Text>
                  <Text style={s.rowValue}>{q.sent ? "Sent" : "Not sent"}</Text>
                </View>
              ))
            )}
            {status.quarterly.allSent ? (
              <Note tone="good" text="HMRC has all your quarterly updates for this year." />
            ) : (
              <>
                <Note
                  tone="warn"
                  text={`HMRC has ${status.quarterly.sentCount} of ${status.quarterly.quarters.length} quarterly updates for this year. Send the rest from Quarterly updates before your tax return.`}
                />
                {isTest && (
                  <TickBox
                    checked={carryOnInTest}
                    onToggle={() => setCarryOnInTest((v) => !v)}
                    label="Carry on anyway. Test version only: the real service will not let you."
                  />
                )}
              </>
            )}
          </Section>

          {/* 2. Allowances and adjustments */}
          <Section step="Step 2" title="Allowances and adjustments">
            {annualError ? (
              <Note tone="bad" text={annualError} />
            ) : annual ? (
              <>
                <Body>MileClear has nothing to send to HMRC here. This is why:</Body>
                {annual.proposal.items.map((item) => (
                  <View key={item.key} style={{ gap: 2 }}>
                    <Text style={s.rowValue}>{item.label}</Text>
                    <Body muted>{item.reason}</Body>
                  </View>
                ))}
                {annual.proposal.notes.map((n, i) => (
                  <Note key={i} tone="warn" text={n} />
                ))}
                {annual.held && heldAnnualLines(annual.held).length > 0 && (
                  <View style={{ gap: 4 }}>
                    <Body>HMRC already holds these for {taxYear}, sent by other software. MileClear won't change them:</Body>
                    {heldAnnualLines(annual.held).map((line) => (
                      <Body key={line} muted>{line}</Body>
                    ))}
                  </View>
                )}
                <TickBox
                  checked={annualRead}
                  onToggle={() => setAnnualRead((v) => !v)}
                  label="I've read this. If I need to claim any of these, I'll do it with other software or HMRC online services first."
                />
              </>
            ) : null}
          </Section>

          {/* 3. Other income */}
          <Section step="Step 3" title="Other income">
            <Text style={[s.rowValue, { lineHeight: 21 }]}>
              Do you have any other income for this tax year, such as a job, a pension, savings interest over your
              allowance, or rent?
            </Text>
            <Choice
              selected={otherIncome === "no"}
              label="No, my self-employment is my only income"
              onPress={() => {
                setOtherIncome("no");
                setOtherIncomeSent(false);
              }}
            />
            <Choice selected={otherIncome === "yes"} label="Yes, I have other income" onPress={() => setOtherIncome("yes")} />

            {otherIncome === "yes" && (
              <View style={{ gap: 10 }}>
                <Note
                  tone="warn"
                  text="Your tax return must include all your income. MileClear can only send your self-employment. Send your other income to HMRC first, through HMRC online services or other software. Come back here when that's done."
                />
                <TouchableOpacity
                  onPress={() => Linking.openURL(GOVUK_ADDITIONAL_INCOME)}
                  accessibilityRole="link"
                  accessibilityLabel="Check what other income to tell HMRC about, on GOV.UK"
                >
                  <Text style={s.link}>Check what to tell HMRC about on GOV.UK ›</Text>
                </TouchableOpacity>
                <TickBox
                  checked={otherIncomeSent}
                  onToggle={() => setOtherIncomeSent((v) => !v)}
                  label={`I've already sent all my other income for ${taxYear} to HMRC.`}
                />
              </View>
            )}

            {otherIncome !== "unanswered" && (
              <TickBox
                checked={nothingElse}
                onToggle={() => setNothingElse((v) => !v)}
                label="I have nothing else to tell HMRC for this year, such as a loss or a claim for tax relief. If I do, I've already sent it."
              />
            )}
          </Section>

          <PrimaryButton label="Get my tax calculation" onPress={onContinue} disabled={!canContinue} />
          {!canContinue && (
            <Body muted>Finish each step above to carry on. Your tax return is not submitted until the last step.</Body>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Choice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.choice, selected && s.choiceOn]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
    >
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? colors.amber : colors.text3} />
      <Text style={s.choiceText}>{label}</Text>
    </TouchableOpacity>
  );
}
