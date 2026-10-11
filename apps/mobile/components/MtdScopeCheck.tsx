import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { checkMtdScope, MTD_SCOPE_TAX_YEARS, type MtdScopeResult } from "@mileclear/shared";
import { fetchSelfAssessmentSummary } from "../lib/api/selfAssessment";
import { colors, fonts } from "../lib/theme";

const GOVUK_MTD_WHO = "https://www.gov.uk/guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax";

/** Tax years that have started (a year still to come has no income to look up). */
function startedTaxYears(today: Date): string[] {
  return MTD_SCOPE_TAX_YEARS.filter((ty) => {
    const start = new Date(parseInt(ty.slice(0, 4), 10), 3, 6);
    return today.getTime() >= start.getTime();
  });
}

/**
 * "Do I need to send quarterly updates?" Shown on the quarterly updates
 * screen before a driver connects to HMRC. Uses the self-employment income
 * already in MileClear for each tax year HMRC looks at (packages/shared
 * checkMtdScope has the rules), and says plainly whether quarterly updates
 * apply to them yet. Most drivers aren't in yet, and should hear that.
 */
export function MtdScopeCheck() {
  const [result, setResult] = useState<MtdScopeResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const today = new Date();
    const years = startedTaxYears(today);
    Promise.all(
      years.map((ty) =>
        fetchSelfAssessmentSummary(ty)
          .then((r) => [ty, r.data.totalEarningsPence] as const)
          // One year failing shouldn't hide the answer for the others.
          .catch(() => [ty, null] as const)
      )
    )
      .then((pairs) => {
        if (cancelled) return;
        const byYear: Record<string, number | null> = {};
        // Nothing logged for a year reads as "not held", not as £0 of income.
        for (const [ty, pence] of pairs) byYear[ty] = pence && pence > 0 ? pence : null;
        setResult(checkMtdScope({ selfEmploymentPenceByTaxYear: byYear, today }));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tone =
    result?.answer === "now" ? colors.red : result?.answer === "later" ? colors.amber : colors.green;

  return (
    <View style={styles.card} accessibilityLabel="Do I need to send quarterly updates?">
      <Text style={styles.eyebrow}>Do I need to send quarterly updates?</Text>
      {!result && !failed && <ActivityIndicator color={colors.amber} style={{ marginVertical: 12 }} />}
      {failed && (
        <Text style={styles.body}>
          We couldn't check your income just now. The limits are below.
        </Text>
      )}
      {result && (
        <>
          <View style={styles.answerRow}>
            <Ionicons
              name={result.answer === "not_yet" ? "checkmark-circle" : "calendar"}
              size={20}
              color={tone}
              accessible={false}
            />
            <Text style={[styles.headline, { color: tone }]}>{result.headline}</Text>
          </View>
          <Text style={styles.body}>{result.detail}</Text>
          {result.missingTaxYears.length > 0 && (
            <Text style={styles.small}>
              MileClear has no earnings for {result.missingTaxYears.join(" or ")}, so this doesn't count that income.
            </Text>
          )}
        </>
      )}
      <View style={styles.limits}>
        <Text style={styles.small}>HMRC looks at your income before expenses, from your Self Assessment:</Text>
        <Text style={styles.small}>• Over £50,000: from 6 April 2026</Text>
        <Text style={styles.small}>• Over £30,000: from 6 April 2027</Text>
        <Text style={styles.small}>• Over £20,000: from 6 April 2028</Text>
        <Text style={styles.small}>
          It counts self-employment income plus any rental (property) income. MileClear only holds your
          driving earnings, so add any rent you get yourself.
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => Linking.openURL(GOVUK_MTD_WHO)}
        accessibilityRole="link"
        accessibilityLabel="Check on GOV.UK"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.link}>Check on GOV.UK ›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 6,
  },
  eyebrow: {
    color: colors.text3,
    fontSize: 12,
    fontFamily: fonts.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  answerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  headline: { fontSize: 18, fontFamily: fonts.bold, flexShrink: 1 },
  body: { color: colors.text2, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  limits: { marginTop: 8, gap: 2 },
  small: { color: colors.text3, fontSize: 12, lineHeight: 18, fontFamily: fonts.regular },
  link: { color: colors.amber, fontSize: 13, fontFamily: fonts.semibold, marginTop: 6 },
});
