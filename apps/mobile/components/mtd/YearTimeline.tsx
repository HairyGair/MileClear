import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { chart, colors, fonts, fontSizes, radii, shared, spacing } from "../../lib/theme";
import { formatDueShort, yearEndDeadline, type Quarter } from "../../lib/tax/mtdQuarters";
import {
  FINISH_YEAR_COPY,
  finishYearSub,
  sentProgressText,
  yearHeading,
} from "../../lib/tax/mtdHubCopy";
import type { HmrcEnv } from "../../lib/tax/mtdCopy";
import { isMtdTest } from "../../lib/tax/mtdCopy";

interface Props {
  quarters: Quarter[];
  sentCount: number;
  taxYear: string;
  env: HmrcEnv;
  /** Tapped on "Finish the year". The hub decides what that opens. */
  onFinishYear: () => void;
  now?: Date;
}

/**
 * "Your 2026-27 year": progress, each quarter in plain months with its state,
 * then Finish the year. Finish the year is a row that explains, never a dead button.
 */
export function YearTimeline({ quarters, sentCount, taxYear, env, onFinishYear, now = new Date() }: Props) {
  if (quarters.length === 0) return null;
  const deadline = yearEndDeadline(taxYear);
  const deadlineText = deadline ? formatDueShort(deadline, new Date(0)) : null;
  const test = isMtdTest(env);

  return (
    <View>
      <Text style={styles.heading} accessibilityRole="header">{yearHeading(taxYear).toUpperCase()}</Text>
      <View style={styles.card}>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>{sentProgressText(sentCount, quarters.length)}</Text>
          <Text style={styles.progressSub}>Tax year 6 Apr to 5 Apr</Text>
        </View>
        <View style={styles.segments} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {quarters.map((q) => (
            <View
              key={q.start}
              style={[
                styles.segment,
                q.state === "sent"
                  ? { backgroundColor: colors.green }
                  : q.state === "due" || q.state === "overdue"
                    ? { backgroundColor: q.state === "overdue" ? colors.red : colors.amber }
                    : null,
              ]}
            />
          ))}
        </View>

        {quarters.map((q, i) => (
          <QuarterRow key={q.start} quarter={q} index={i} now={now} />
        ))}

        <TouchableOpacity
          style={styles.row}
          onPress={onFinishYear}
          accessibilityRole="button"
          accessibilityLabel={`${FINISH_YEAR_COPY.label}. ${finishYearSub(deadlineText, env)}${test ? "" : `. ${FINISH_YEAR_COPY.pill}`}`}
        >
          <View style={styles.rail}>
            <View style={[styles.node, styles.nodeFlag]}>
              <Ionicons name="flag-outline" size={15} color={colors.text2} />
            </View>
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{FINISH_YEAR_COPY.label}</Text>
            <Text style={styles.rowSub}>{finishYearSub(deadlineText, env)}</Text>
          </View>
          {test ? (
            <Ionicons name="chevron-forward" size={18} color={colors.text3} />
          ) : (
            <View style={[styles.pill, styles.pillGrey]}>
              <Text style={[styles.pillText, { color: colors.text2 }]}>{FINISH_YEAR_COPY.pill}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function QuarterRow({
  quarter: q,
  index,
  now,
}: {
  quarter: Quarter;
  index: number;
  now: Date;
}) {
  const sent = q.state === "sent";
  const active = q.state === "due" || q.state === "overdue";
  const sub = sent
    ? q.sentOn
      ? `Sent ${formatDueShort(q.sentOn, now)}${q.late ? ", after the due date" : ""}`
      : "Sent"
    : `Due ${formatDueShort(q.due, now)}`;
  const pill = sent
    ? { text: "Sent", bg: colors.greenDim, fg: colors.green }
    : q.state === "overdue"
      ? { text: "Late", bg: colors.redDim, fg: colors.red }
      : q.state === "due"
        ? { text: "Due now", bg: colors.amberDim, fg: colors.amber }
        : null;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${q.label}. ${sub}${pill ? `. ${pill.text}` : ""}`}
    >
      <View style={styles.rail}>
        <View
          style={[
            styles.node,
            sent && { backgroundColor: colors.green, borderColor: colors.green },
            active && { borderColor: q.state === "overdue" ? colors.red : colors.amber, borderWidth: 2, backgroundColor: "transparent" },
          ]}
        >
          {sent ? (
            <Ionicons name="checkmark" size={16} color="#000" />
          ) : (
            <Text style={[styles.nodeText, active && { color: q.state === "overdue" ? colors.red : colors.amber }]}>
              {index + 1}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{q.label}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      {pill && (
        <View style={[styles.pill, { backgroundColor: pill.bg }]}>
          <Text style={[styles.pillText, { color: pill.fg }]}>{pill.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    letterSpacing: 0.8,
    color: colors.text2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  card: { ...shared.card, paddingVertical: spacing.lg },
  progressRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  progressText: { fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg, color: colors.text1 },
  progressSub: { fontFamily: fonts.regular, fontSize: fontSizes.caption, color: colors.text2 },
  segments: { flexDirection: "row", gap: 6, marginTop: spacing.md, marginBottom: spacing.sm },
  segment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: chart.track },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rail: { width: 30, alignItems: "center" },
  node: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: chart.track,
    borderWidth: 1,
    borderColor: "transparent",
  },
  nodeFlag: { backgroundColor: chart.track },
  nodeText: { fontFamily: fonts.bold, fontSize: fontSizes.body, color: colors.text2 },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg, color: colors.text1 },
  rowSub: { fontFamily: fonts.regular, fontSize: fontSizes.body, color: colors.text2, marginTop: 1 },
  pill: { borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 5 },
  pillGrey: { backgroundColor: "rgba(255,255,255,0.08)" },
  pillText: { fontFamily: fonts.semibold, fontSize: fontSizes.caption },
});
