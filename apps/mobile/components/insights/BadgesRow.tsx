// Badges as drawn medals (SPEC-VISUAL 5.6). Ionicons instead of emoji, which
// showed as "?" boxes on some phones. Earned medals are amber; the next
// three show how close you are. Emoji stay in share text only.

import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ACHIEVEMENT_META } from "@mileclear/shared";
import type { AchievementWithMeta } from "@mileclear/shared";
import { chart, colors, fonts, fontScaleCap } from "../../lib/theme";
import { badgeIcon, nextBadges, type BadgeStats } from "../../lib/insights/badges";
import { Skeleton } from "../Skeleton";

const RING_TICKS = 12;
const ringAngles = Array.from({ length: RING_TICKS }, (_, i) => i * (360 / RING_TICKS));

export function Medal({
  type,
  state,
  progress = 0,
  size = 56,
}: {
  type: string;
  state: "earned" | "next";
  progress?: number;
  size?: number;
}) {
  const earned = state === "earned";
  const box = size + 12;
  const lit = Math.round(Math.max(0, Math.min(1, progress)) * RING_TICKS);
  return (
    <View style={{ width: box, height: box, alignItems: "center", justifyContent: "center" }} importantForAccessibility="no-hide-descendants" accessible={false}>
      {!earned &&
        ringAngles.map((deg, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: (box - 3) / 2,
              top: (box - 6) / 2,
              width: 3,
              height: 6,
              borderRadius: 1.5,
              backgroundColor: i < lit ? chart.past : chart.track,
              transform: [{ rotate: `${deg}deg` }, { translateY: -(size / 2 + 3) }],
            }}
          />
        ))}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: earned ? colors.amberDim : colors.surface,
          borderWidth: 2,
          borderColor: earned ? colors.amber : chart.track,
        }}
      >
        <Ionicons name={badgeIcon(type)} size={Math.round(size * 0.46)} color={earned ? colors.amber : colors.text3} />
      </View>
    </View>
  );
}

interface BadgesRowProps {
  achievements: AchievementWithMeta[];
  stats: BadgeStats | null;
  mode: "work" | "personal";
  loading: boolean;
  /** How many of the nearest unearned badges "Coming up next" already shows. They are not repeated here. */
  skipNext?: number;
  onSeeAll: () => void;
}

export function BadgesRow({ achievements, stats, mode, loading, skipNext = 0, onSeeAll }: BadgesRowProps) {
  if (loading && achievements.length === 0) {
    return (
      <View style={styles.card}>
        <Skeleton width={140} height={16} />
        <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width={56} height={56} radius={28} />
          ))}
        </View>
      </View>
    );
  }

  const allTypes = Object.keys(ACHIEVEMENT_META);
  const earnedTypes = new Set(achievements.map((a) => a.type));
  const recent = [...achievements]
    .sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
    .slice(0, 3);
  const next = stats ? nextBadges(allTypes, earnedTypes, stats, mode, skipNext + 3).slice(skipNext) : [];
  if (recent.length === 0 && next.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title} maxFontSizeMultiplier={fontScaleCap.heading} accessibilityRole="header">
          {achievements.length} of {allTypes.length} badges
        </Text>
        <TouchableOpacity onPress={onSeeAll} hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }} accessibilityRole="button" accessibilityLabel="See all badges">
          <Text style={styles.seeAll} maxFontSizeMultiplier={fontScaleCap.body}>See all</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {recent.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={styles.item}
            onPress={onSeeAll}
            accessibilityRole="button"
            accessibilityLabel={`${a.label}, earned`}
          >
            <Medal type={a.type} state="earned" />
            <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.display}>{a.label}</Text>
          </TouchableOpacity>
        ))}
        {next.map((n) => {
          const meta = (ACHIEVEMENT_META as Record<string, { label: string }>)[n.type];
          return (
            <TouchableOpacity
              key={n.type}
              style={styles.item}
              onPress={onSeeAll}
              accessibilityRole="button"
              accessibilityLabel={`${meta?.label ?? "Badge"}, not earned yet, ${n.progressText}`}
            >
              <Medal type={n.type} state="next" progress={n.progress} />
              <Text style={[styles.label, { color: colors.text2 }]} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.display}>
                {meta?.label ?? ""}
              </Text>
              <Text style={styles.hint} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.display}>{n.progressText}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
    marginBottom: 12,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text2 },
  seeAll: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  scroll: { gap: 12, paddingRight: 4 },
  item: { width: 72, alignItems: "center" },
  label: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text1, textAlign: "center", marginTop: 4 },
  hint: { fontSize: 12, fontFamily: fonts.medium, color: colors.text3, textAlign: "center", marginTop: 2 },
});
