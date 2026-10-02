// "Ready for 31 January?" Work dashboard card (2 Oct 2026).
//
// Shown from 1 December to 31 January (the API's inSeason flag; see
// lib/saCountdown for how to preview it) to self-employed drivers. One line
// on where they stand, the first thing still to do, and a way into the full
// checklist. Renders nothing out of season, for drivers it is not for, or if
// the checklist could not load: a missing card is better than a broken one.
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { isSaCountdownSeason, type SaChecklist } from "@mileclear/shared";
import { fetchSaChecklist } from "../../lib/api/selfAssessment";
import { useUser } from "../../lib/user/context";
import {
  daysLabel,
  saCountdownAudience,
  showSaCountdownCard,
  wantsSaPreview,
} from "../../lib/saCountdown";
import { colors, fonts } from "../../lib/theme";

export function SaCountdownCard() {
  const router = useRouter();
  const { user, isCompanyDriver } = useUser();
  const [checklist, setChecklist] = useState<SaChecklist | null>(null);
  const audience = saCountdownAudience(user, isCompanyDriver);
  const preview = wantsSaPreview(user);

  // Refetch on focus so sorting a few trips and coming back moves the count.
  useFocusEffect(
    useCallback(() => {
      if (!audience) return;
      let cancelled = false;
      fetchSaChecklist({ preview })
        .then((res) => {
          if (!cancelled) setChecklist(res.data);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [audience, preview])
  );

  if (!audience || !showSaCountdownCard(checklist)) return null;
  const c = checklist!;

  const required = c.items.filter((i) => i.status !== "optional");
  const done = required.filter((i) => i.status === "done").length;
  const pct = required.length > 0 ? Math.round((done / required.length) * 100) : 100;
  const firstGap = c.items.find((i) => i.status === "attention");
  const urgent = c.daysToDeadline <= 14;
  const pillColor = urgent ? colors.red : colors.amber;
  const isPreview = !isSaCountdownSeason(new Date());

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.8}
      onPress={() => router.push("/sa-checklist" as never)}
      accessibilityRole="button"
      accessibilityLabel={`Ready for 31 January? ${c.headline}. ${daysLabel(c.daysToDeadline)}. Opens your Self Assessment checklist.`}
    >
      <View style={s.topRow}>
        <Ionicons name="calendar-outline" size={16} color={colors.amber} />
        <Text style={s.title}>Ready for 31 January?</Text>
        {isPreview && <Text style={s.preview}>Preview</Text>}
        <View style={[s.pill, { backgroundColor: urgent ? colors.redDim : colors.amberDim }]}>
          <Text style={[s.pillText, { color: pillColor }]}>{daysLabel(c.daysToDeadline)}</Text>
        </View>
      </View>

      <Text style={s.headline}>{c.headline}</Text>
      <Text style={s.sub}>Your {c.taxYear} Self Assessment ({c.taxYearLabel})</Text>

      <View style={s.track} accessibilityElementsHidden importantForAccessibility="no">
        <View style={[s.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={s.progress}>
        {done} of {required.length} done
      </Text>

      {firstGap && (
        <View style={s.gapRow}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.amber} style={{ marginTop: 1 }} />
          <Text style={s.gapText}>{firstGap.detail}</Text>
        </View>
      )}

      <View style={s.ctaRow}>
        <Text style={s.cta}>See your checklist</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.amber} />
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.25)",
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  title: {
    flex: 1,
    color: colors.text1,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  preview: {
    color: colors.text3,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
  },
  headline: {
    color: colors.text1,
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
  sub: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    marginTop: 2,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 12,
    overflow: "hidden",
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.amber,
  },
  progress: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 5,
  },
  gapRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  gapText: {
    flex: 1,
    color: colors.text1,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 19,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 12,
  },
  cta: {
    color: colors.amber,
    fontFamily: fonts.semibold,
    fontSize: 13.5,
  },
});
