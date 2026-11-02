import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  checkMtdScope,
  mtdPhaseLine,
  MTD_PHASES,
  MTD_SCOPE_TAX_YEARS,
  type MtdScopeResult,
} from "@mileclear/shared";
import { fetchSelfAssessmentSummary } from "../lib/api/selfAssessment";
import { colors, fonts } from "../lib/theme";
import {
  scopeFromReads,
  scopeMissingYears,
  SCOPE_CHECKER_LINK,
  SCOPE_HOW_LINK,
  SCOPE_LIMITS_INTRO,
  SCOPE_RENT_NOTE,
  type ScopeLine,
} from "../lib/tax/mtdSetupCopy";

const GOVUK_MTD_WHO = "https://www.gov.uk/guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax";

/** The scope answer, kept by the screen so a reload doesn't ask again. */
export interface ScopeState {
  line: ScopeLine;
  result: MtdScopeResult | null;
}

/** Tax years that have started (a year still to come has no income to look up). */
function startedTaxYears(today: Date): string[] {
  return MTD_SCOPE_TAX_YEARS.filter((ty) => {
    const start = new Date(parseInt(ty.slice(0, 4), 10), 3, 6);
    return today.getTime() >= start.getTime();
  });
}

/**
 * "Do I need to send quarterly updates?" as one compact line at the top of
 * the setup screen. Uses the self-employment income already in MileClear for
 * each tax year HMRC looks at (packages/shared checkMtdScope has the rules).
 * When a year is missing it says it can't tell, never "you don't need to".
 * "How we worked this out" opens the limits, the rent note, and HMRC's own
 * checker (shown straight away when we can't tell).
 *
 * `value` / `onChange` hold the answer in the screen, so the screen's reload
 * spinner doesn't make it ask again.
 */
export function MtdScopeCheck({
  value,
  onChange,
}: {
  value: ScopeState | null;
  onChange: (s: ScopeState) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value) return;
    let cancelled = false;
    const today = new Date();
    const years = startedTaxYears(today);
    Promise.all(
      years.map((ty) =>
        fetchSelfAssessmentSummary(ty)
          .then((r) => [ty, r.data.totalEarningsPence ?? null] as const)
          // One year failing shouldn't hide the answer for the others.
          .catch(() => [ty, "error"] as const)
      )
    ).then((pairs) => {
      if (cancelled) return;
      const reads: Record<string, number | null | "error"> = {};
      for (const [ty, v] of pairs) reads[ty] = v;
      onChange(scopeFromReads(reads, (byYear) => checkMtdScope({ selfEmploymentPenceByTaxYear: byYear, today })));
    });
    return () => {
      cancelled = true;
    };
    // Asks once; the answer then lives in the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const line = value?.line ?? null;
  const result = value?.result ?? null;
  const tone =
    line?.tone === "not_yet" ? colors.green : line?.tone === "now" || line?.tone === "later" ? colors.amber : colors.text3;
  const missing = result ? scopeMissingYears(result.missingTaxYears) : null;

  const checker = (
    <TouchableOpacity
      onPress={() => Linking.openURL(GOVUK_MTD_WHO)}
      accessibilityRole="link"
      accessibilityLabel={SCOPE_CHECKER_LINK}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ alignSelf: "flex-start" }}
    >
      <Text style={styles.smallLink}>{SCOPE_CHECKER_LINK} ›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.card} accessibilityLabel="Do I need to send quarterly updates?">
      {!line && <ActivityIndicator color={colors.amber} style={{ marginVertical: 8 }} />}
      {line && (
        <View style={styles.row}>
          <Ionicons
            name={
              line.tone === "not_yet"
                ? "checkmark-circle-outline"
                : line.tone === "now" || line.tone === "later"
                  ? "calendar-outline"
                  : "help-circle-outline"
            }
            size={22}
            color={tone}
            accessible={false}
            style={{ marginTop: 1 }}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.headline}>{line.headline}</Text>
            <Text style={styles.body}>{line.detail}</Text>
            {line.showChecker && checker}
            <TouchableOpacity
              onPress={() => setOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityLabel={SCOPE_HOW_LINK}
              accessibilityState={{ expanded: open }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.howRow}
            >
              <Text style={styles.link}>{SCOPE_HOW_LINK}</Text>
              <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.amber} />
            </TouchableOpacity>
            {open && (
              <View style={styles.limits}>
                <Text style={styles.small}>{SCOPE_LIMITS_INTRO}</Text>
                {MTD_PHASES.map((phase) => (
                  <Text key={phase.startsOn} style={styles.small}>• {mtdPhaseLine(phase)}</Text>
                ))}
                <Text style={[styles.small, { marginTop: 4 }]}>{SCOPE_RENT_NOTE}</Text>
                {missing && <Text style={[styles.small, { marginTop: 4 }]}>{missing}</Text>}
                {!line.showChecker && checker}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 16,
    marginBottom: 24,
  },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  headline: { color: colors.text1, fontSize: 16, fontFamily: fonts.bold },
  body: { color: colors.text2, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  howRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start" },
  link: { color: colors.amber, fontSize: 14, fontFamily: fonts.semibold },
  limits: { marginTop: 8, gap: 2 },
  small: { color: colors.text3, fontSize: 12, lineHeight: 18, fontFamily: fonts.regular },
  smallLink: { color: colors.text2, fontSize: 12, fontFamily: fonts.semibold, marginTop: 6, textDecorationLine: "underline" },
});
