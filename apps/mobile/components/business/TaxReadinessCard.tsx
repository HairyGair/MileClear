import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  LayoutAnimation,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { fetchTaxSnapshot } from "../../lib/api/businessInsights";
import { formatPence, UK_TAX_2025_26 } from "@mileclear/shared";
import type { TaxSnapshot } from "@mileclear/shared";

// Show the higher-rate warning when YTD taxable profit is between £35k and
// the higher-rate threshold (£50,270). The £35k floor avoids spamming most
// users who will never cross over.
const HIGHER_RATE_WARNING_FLOOR_PENCE = 3_500_000;

const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const GREEN = "#10b981";
const RED = "#ef4444";
const AMBER_FAINT = "rgba(245,166,35,0.08)";
const RED_FAINT = "rgba(239,68,68,0.10)";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";

function deadlineTone(days: number): {
  color: string;
  background: string;
  label: string;
} {
  if (days < 0) {
    return { color: RED, background: RED_FAINT, label: `${Math.abs(days)} days overdue` };
  }
  if (days <= 30) {
    return { color: RED, background: RED_FAINT, label: `${days} days to file` };
  }
  if (days <= 90) {
    return { color: AMBER, background: AMBER_FAINT, label: `${days} days to file` };
  }
  return { color: TEXT_2, background: "rgba(255,255,255,0.04)", label: `${days} days to file` };
}

export function TaxReadinessCard() {
  const router = useRouter();
  const [snap, setSnap] = useState<TaxSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTaxSnapshot()
      .then((res) => {
        if (!cancelled) setSnap(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <View style={[s.card, s.loadingCard]}>
        <ActivityIndicator size="small" color={AMBER} />
      </View>
    );
  }

  if (!snap) return null;

  const tone = deadlineTone(snap.daysToFilingDeadline);
  const hasYtdEarnings = snap.ytd.grossEarningsPence > 0;
  const hasSetAside = snap.setAsideThisWeek.suggestedSetAsidePence > 0;
  const allReady = snap.readiness.percentComplete === 100;

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View style={s.card}>
      {/* Top row: tax year + filing deadline */}
      <View style={s.topRow}>
        <Text style={s.taxYearLabel}>HMRC {snap.taxYear}</Text>
        <View style={[s.deadlinePill, { backgroundColor: tone.background }]}>
          <Ionicons name="time-outline" size={11} color={tone.color} />
          <Text style={[s.deadlinePillText, { color: tone.color }]}>{tone.label}</Text>
        </View>
      </View>

      {/* Hero: tax estimate this year (or zero-state) */}
      {hasYtdEarnings ? (
        <>
          <Text style={s.heroLabel}>Estimated tax + NI this year</Text>
          <Text style={s.heroValue}>{formatPence(snap.ytd.estimatedTaxPence)}</Text>
          <Text style={s.heroMeta}>
            On {formatPence(snap.ytd.grossEarningsPence)} earnings, after{" "}
            {formatPence(snap.ytd.mileageDeductionPence)} mileage deduction
          </Text>
        </>
      ) : (
        <>
          <Text style={s.heroLabel}>Tax estimate</Text>
          <Text style={s.heroValueDim}>£0.00</Text>
          <Text style={s.heroMeta}>
            Add earnings in the Earnings tab to see your live HMRC estimate.
          </Text>
        </>
      )}

      {/* Higher-rate threshold warning (only fires for users approaching £50,270) */}
      {hasYtdEarnings &&
        snap.ytd.taxableProfitPence >= HIGHER_RATE_WARNING_FLOOR_PENCE &&
        snap.ytd.taxableProfitPence < UK_TAX_2025_26.basicRateThresholdPence && (
          <View style={s.higherRateRow}>
            <Ionicons name="trending-up-outline" size={14} color={AMBER} />
            <Text style={s.higherRateText}>
              {formatPence(
                UK_TAX_2025_26.basicRateThresholdPence - snap.ytd.taxableProfitPence
              )}{" "}
              from higher rate (40%) - claim every business mile to stay in basic rate.
            </Text>
          </View>
        )}

      {/* Earnings nudge - drives the largest gap in our active-user data */}
      {snap.nudges?.earnings && (
        <TouchableOpacity
          onPress={() => router.navigate("/earning-form" as never)}
          style={s.nudgeRow}
          accessibilityRole="button"
          accessibilityLabel="Log this week's earnings to see your real tax estimate"
        >
          <Ionicons name="cash-outline" size={14} color={AMBER} />
          <Text style={s.nudgeText}>
            You&apos;re tracking trips but no earnings yet. Log this week&apos;s earnings to see your real tax estimate.
          </Text>
          <Ionicons name="chevron-forward" size={14} color={AMBER} />
        </TouchableOpacity>
      )}

      {/* Set-aside this week row */}
      {hasSetAside && (
        <View style={s.setAsideRow}>
          <View style={s.setAsideLeft}>
            <Text style={s.setAsideLabel}>Set aside this week</Text>
            <Text style={s.setAsideValue}>
              {formatPence(snap.setAsideThisWeek.suggestedSetAsidePence)}
            </Text>
          </View>
          <View style={s.setAsideRight}>
            <Text style={s.setAsideMeta}>
              {snap.setAsideThisWeek.rateUsedPercent}% of {formatPence(snap.setAsideThisWeek.earningsLast7DaysPence)}
            </Text>
          </View>
        </View>
      )}

      {/* Readiness chip — tap to expand */}
      <TouchableOpacity
        style={[
          s.readinessChip,
          allReady && { borderColor: GREEN, backgroundColor: "rgba(16,185,129,0.06)" },
        ]}
        onPress={toggleExpand}
        accessibilityRole="button"
        accessibilityLabel={`Readiness ${snap.readiness.percentComplete} percent complete. Tap to ${expanded ? "collapse" : "expand"}.`}
      >
        <Ionicons
          name={allReady ? "checkmark-circle" : "alert-circle-outline"}
          size={14}
          color={allReady ? GREEN : AMBER}
        />
        <Text style={[s.readinessText, allReady && { color: GREEN }]}>
          Records {snap.readiness.percentComplete}% complete
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={TEXT_3}
          style={{ marginLeft: "auto" }}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={s.readinessList}>
          {snap.readiness.items.map((item) => (
            <View key={item.id} style={s.readinessItem}>
              <Ionicons
                name={item.done ? "checkmark-circle" : "ellipse-outline"}
                size={16}
                color={item.done ? GREEN : TEXT_3}
              />
              <View style={s.readinessItemBody}>
                <Text style={[s.readinessItemLabel, !item.done && { color: TEXT_1 }]}>
                  {item.label}
                </Text>
                {!item.done && item.hint && (
                  <Text style={s.readinessHint}>{item.hint}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* First-time guide link - subtle, low-priority entry point */}
      <TouchableOpacity
        onPress={() => router.navigate("/first-tax-return" as never)}
        style={s.guideLink}
        accessibilityRole="button"
        accessibilityLabel="Open first-time Self Assessment guide"
      >
        <Ionicons name="book-outline" size={13} color={TEXT_3} />
        <Text style={s.guideLinkText}>First Self Assessment? Read the guide</Text>
        <Ionicons name="chevron-forward" size={13} color={TEXT_3} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.navigate("/hmrc-reconciliation" as never)}
        style={s.guideLink}
        accessibilityRole="button"
        accessibilityLabel="Reconcile your earnings with what HMRC has reported"
      >
        <Ionicons name="git-compare-outline" size={13} color={TEXT_3} />
        <Text style={s.guideLinkText}>Reconcile vs HMRC&apos;s figures</Text>
        <Ionicons name="chevron-forward" size={13} color={TEXT_3} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    marginBottom: 12,
  },
  loadingCard: {
    minHeight: 96,
    justifyContent: "center",
    alignItems: "center",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  taxYearLabel: {
    color: TEXT_2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  deadlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  deadlinePillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  heroLabel: {
    color: TEXT_3,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 2,
  },
  heroValue: {
    color: TEXT_1,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroValueDim: {
    color: TEXT_2,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroMeta: {
    color: TEXT_2,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  higherRateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: AMBER_FAINT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  higherRateText: {
    color: TEXT_1,
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  nudgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: AMBER_FAINT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.18)",
  },
  nudgeText: {
    color: TEXT_1,
    fontSize: 12.5,
    lineHeight: 16,
    flex: 1,
    fontWeight: "500",
  },
  setAsideRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: AMBER_FAINT,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  setAsideLeft: { flex: 1 },
  setAsideLabel: {
    color: AMBER,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  setAsideValue: {
    color: TEXT_1,
    fontSize: 18,
    fontWeight: "700",
  },
  setAsideRight: { alignItems: "flex-end" },
  setAsideMeta: {
    color: TEXT_2,
    fontSize: 11,
    fontWeight: "500",
  },
  readinessChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  readinessText: {
    color: TEXT_1,
    fontSize: 13,
    fontWeight: "600",
  },
  readinessList: {
    marginTop: 10,
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
  },
  readinessItem: {
    flexDirection: "row",
    gap: 10,
  },
  readinessItemBody: { flex: 1 },
  readinessItemLabel: {
    color: TEXT_2,
    fontSize: 13,
    fontWeight: "500",
  },
  readinessHint: {
    color: TEXT_3,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  guideLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
  },
  guideLinkText: {
    color: TEXT_2,
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
});
