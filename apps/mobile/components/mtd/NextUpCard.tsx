import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";
import { colors, fonts, fontSizes, radii, spacing } from "../../lib/theme";
import { taxCard } from "../tax/cardStyles";
import {
  daysLeftText,
  daysLeftTone,
  formatDueLong,
  formatDueShort,
  type Quarter,
} from "../../lib/tax/mtdQuarters";
import {
  LATE_BODY,
  lateTitle,
  nextUpTitle,
  sendReassurance,
  tripsToMarkText,
  upToDateBody,
  upToDateTitle,
} from "../../lib/tax/mtdHubCopy";
import type { HmrcEnv } from "../../lib/tax/mtdCopy";

/** Year-to-date figures behind the hero. Any of them can be null when it couldn't be loaded. */
export interface NextUpFigures {
  earningsPence: number | null;
  businessMiles: number | null;
  tripsToSort: number | null;
}

interface Props {
  /** The quarter to send now (due or late). Null when nothing needs sending. */
  quarter: Quarter | null;
  /** The next quarter still running, for the "up to date" wording. */
  following: { label: string; due: string } | null;
  allSent: boolean;
  sentCount: number;
  taxYear: string;
  env: HmrcEnv;
  figures: NextUpFigures | null;
  onReview: () => void;
  onFixTrips: () => void;
  onMissedDeadline: () => void;
  now?: Date;
}

/**
 * The top card of the Quarterly updates hub. Three looks: update due (amber
 * edge), update late (red edge), and up to date (green). One button at most.
 */
export function NextUpCard({
  quarter,
  following,
  allSent,
  sentCount,
  taxYear,
  env,
  figures,
  onReview,
  onFixTrips,
  onMissedDeadline,
  now = new Date(),
}: Props) {
  if (!quarter) {
    const dueText = following ? formatDueShort(following.due, now) : "";
    return (
      <View style={[taxCard.hero, styles.upToDate]} accessible accessibilityLabel={upToDateTitle(allSent, sentCount, taxYear)}>
        <View style={styles.upRow}>
          <View style={styles.tick}>
            <Ionicons name="checkmark" size={18} color={colors.green} />
          </View>
          <Text style={[taxCard.eyebrow, { color: colors.green }]}>Up to date</Text>
        </View>
        <Text style={taxCard.headline}>{upToDateTitle(allSent, sentCount, taxYear)}</Text>
        <Text style={taxCard.body}>
          {upToDateBody(following ? { label: following.label, dueText } : null)}
        </Text>
      </View>
    );
  }

  const late = quarter.state === "overdue";
  const tone = daysLeftTone(quarter.daysLeft);
  const pill =
    tone === "late"
      ? { bg: colors.redDim, fg: colors.red }
      : tone === "soon"
        ? { bg: colors.amberDim, fg: colors.amber }
        : { bg: "rgba(255,255,255,0.08)", fg: colors.text2 };
  const miles = figures?.businessMiles;
  const earnings = figures?.earningsPence;
  const toSort = figures?.tripsToSort ?? 0;
  const title = late ? lateTitle(quarter.label) : nextUpTitle(quarter.label);

  return (
    <View style={[taxCard.hero, late && styles.lateEdge]}>
      <View style={taxCard.topRow}>
        <Text style={taxCard.eyebrow}>{late ? "Late" : "Next up"}</Text>
        <View style={[taxCard.pill, { backgroundColor: pill.bg, flexDirection: "row", alignItems: "center", gap: 5 }]}>
          <Ionicons name={late ? "alert-circle-outline" : "time-outline"} size={13} color={pill.fg} />
          <Text style={[taxCard.pillText, { color: pill.fg }]}>{daysLeftText(quarter.daysLeft)}</Text>
        </View>
      </View>

      <Text style={[taxCard.headline, styles.title]} accessibilityRole="header">
        {title}
      </Text>
      {late ? (
        <Text style={taxCard.body}>{LATE_BODY}</Text>
      ) : null}
      <Text style={styles.due}>
        {late ? "Was due " : "Due by "}
        <Text style={styles.dueStrong}>{formatDueLong(quarter.due, now)}</Text>
      </Text>

      {(earnings != null || miles != null) && (
        <View style={styles.tiles}>
          {earnings != null && (
            <View style={styles.tile}>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatPence(earnings)}
              </Text>
              <Text style={styles.tileLabel}>Earnings since 6 April</Text>
            </View>
          )}
          {miles != null && (
            <View style={styles.tile}>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
                {Math.round(miles).toLocaleString("en-GB")} mi
              </Text>
              <Text style={styles.tileLabel}>Business miles</Text>
            </View>
          )}
        </View>
      )}

      {toSort > 0 && (
        <TouchableOpacity
          style={styles.attention}
          onPress={onFixTrips}
          accessibilityRole="button"
          accessibilityLabel={tripsToMarkText(toSort)}
          accessibilityHint="Opens your trips waiting to be sorted"
        >
          <Ionicons name="alert-circle-outline" size={18} color={colors.amber} />
          <Text style={styles.attentionText}>{tripsToMarkText(toSort)}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.amber} />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.button}
        onPress={onReview}
        accessibilityRole="button"
        accessibilityLabel={`Review and send your ${quarter.label} update`}
        accessibilityHint="Opens a preview. Nothing goes to HMRC until you tap Send there."
      >
        <Text style={styles.buttonText}>Review and send</Text>
        <Ionicons name="chevron-forward" size={18} color="#000" />
      </TouchableOpacity>
      <Text style={styles.reassure}>{sendReassurance(env)}</Text>

      {late && (
        <TouchableOpacity
          style={taxCard.linkRow}
          onPress={onMissedDeadline}
          accessibilityRole="button"
          accessibilityLabel="What if I miss a deadline?"
        >
          <Text style={taxCard.link}>What if I miss a deadline?</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSizes.display - 2, lineHeight: 34, marginTop: spacing.md },
  lateEdge: { borderColor: colors.redEdge },
  upToDate: { borderColor: "rgba(16,185,129,0.35)" },
  upRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.greenDim,
    alignItems: "center",
    justifyContent: "center",
  },
  due: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.bodyLg,
    color: colors.text2,
    marginTop: spacing.sm,
  },
  dueStrong: { fontFamily: fonts.bold, color: colors.text1 },
  tiles: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  tile: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  tileValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.title + 2,
    color: colors.text1,
    fontVariant: ["tabular-nums"],
  },
  tileLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.caption,
    color: colors.text2,
    marginTop: 2,
  },
  attention: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.amberDim,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  attentionText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.body,
    color: colors.amber,
  },
  button: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.amber,
    borderRadius: radii.lg,
    marginTop: spacing.lg,
  },
  buttonText: { fontFamily: fonts.bold, fontSize: fontSizes.bodyLg + 1, color: "#000" },
  reassure: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text2,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
