// "Coming up next": the next mileage milestone as a road with the driver's
// vehicle on it, the next badge with progress, and the streak
// (SPEC-UX 3.2, SPEC-VISUAL 5.5 and 5.7a).
//
// Personal streak counts WEEKS in a row with a trip (decision B), worked out
// on the phone. Work keeps the daily streak from /gamification/stats.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ACHIEVEMENT_META } from "@mileclear/shared";
import type { GamificationStats } from "@mileclear/shared";
import { chart, colors, fonts, fontScaleCap, motion } from "../../lib/theme";
import { AVATARS, getAvatarById } from "../avatars/AvatarRegistry";
import { Skeleton } from "../Skeleton";
import { Medal } from "./BadgesRow";
import { getMilestoneRoadOrStart, milesToGoText } from "../../lib/insights/milestones";
import { nextBadges } from "../../lib/insights/badges";
import { weekStreak, weekStreakLine } from "../../lib/insights/streak";

const CAR = 28;

interface ComingUpCardProps {
  mode: "work" | "personal";
  loading: boolean;
  lifetimeMiles: number | null;
  lifetimeTrips: number | null;
  stats: GamificationStats | null;
  earnedTypes: ReadonlySet<string>;
  /** Trip start times for the Personal week streak; null until loaded. */
  tripDates: string[] | null;
  /** Company drivers: streaks are noise, hide the row. */
  hideStreak: boolean;
  hasWeeklyGoal: boolean;
  avatarId: string | null | undefined;
  reducedMotion: boolean;
  onOpenAchievements: () => void;
  onSetGoal: () => void;
}

export function ComingUpCard(props: ComingUpCardProps) {
  const { mode, stats, lifetimeMiles, reducedMotion } = props;
  const isPersonal = mode === "personal";

  if (props.loading && lifetimeMiles === null) {
    return (
      <View style={styles.card} accessibilityRole="progressbar" accessibilityLabel="Loading what is coming up">
        <Skeleton width={140} height={16} />
        <Skeleton height={8} style={{ marginTop: 16 }} />
        <Skeleton width="50%" height={14} style={{ marginTop: 12 }} />
      </View>
    );
  }

  const road = lifetimeMiles !== null ? getMilestoneRoadOrStart(lifetimeMiles) : null;

  const badgeStats = stats
    ? {
        totalMiles: lifetimeMiles ?? stats.totalMiles,
        totalTrips: props.lifetimeTrips ?? stats.totalTrips,
        totalShifts: stats.totalShifts,
        longestStreakDays: stats.longestStreakDays,
      }
    : null;
  const next = badgeStats ? nextBadges(Object.keys(ACHIEVEMENT_META), props.earnedTypes, badgeStats, mode, 1)[0] : undefined;
  const nextMeta = next ? (ACHIEVEMENT_META as Record<string, { label: string }>)[next.type] : undefined;

  let streak: { title: string; nudge: string | null; dots?: Array<{ done: boolean; isCurrent: boolean }>; alive: boolean } | null = null;
  if (!props.hideStreak) {
    if (isPersonal) {
      if (props.tripDates) {
        const s = weekStreak(props.tripDates);
        const line = weekStreakLine(s);
        streak = { ...line, dots: s.dots, alive: s.doneThisWeek };
      }
    } else if (stats && stats.currentStreakDays > 0) {
      const n = stats.currentStreakDays;
      const doneToday = stats.todayTrips > 0;
      streak = {
        title: `${n} day streak`,
        nudge: doneToday ? null : `Drive today to make it ${n + 1}.`,
        alive: doneToday,
      };
    }
  }

  if (!road && !next && !streak && !(isPersonal && !props.hasWeeklyGoal)) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.heading} maxFontSizeMultiplier={fontScaleCap.heading} accessibilityRole="header">
        Coming up next
      </Text>

      {road && <Road road={road} avatarId={props.avatarId} reducedMotion={reducedMotion} />}

      {next && nextMeta && (
        <TouchableOpacity
          style={[styles.row, road && styles.rowDivider]}
          onPress={props.onOpenAchievements}
          accessibilityRole="button"
          accessibilityLabel={`Next badge, ${nextMeta.label}, ${next.progressText}. Opens badges`}
        >
          <Medal type={next.type} state="next" progress={next.progress} size={40} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} maxFontSizeMultiplier={fontScaleCap.body}>{nextMeta.label}</Text>
            <Text style={styles.rowSub} maxFontSizeMultiplier={fontScaleCap.body}>{next.progressText}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text3} />
        </TouchableOpacity>
      )}

      {streak && (
        <View style={[styles.row, (road || next) && styles.rowDivider]} accessible accessibilityLabel={`${streak.title}${streak.nudge ? `. ${streak.nudge}` : ""}`}>
          <View style={styles.flame}>
            <Ionicons name={streak.alive ? "flame" : "flame-outline"} size={22} color={streak.alive ? colors.amber : colors.text3} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} maxFontSizeMultiplier={fontScaleCap.body}>{streak.title}</Text>
            {streak.nudge && <Text style={styles.rowSub} maxFontSizeMultiplier={fontScaleCap.body}>{streak.nudge}</Text>}
            {streak.dots && (
              <View style={styles.dots}>
                {streak.dots.map((d, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      d.done
                        ? { backgroundColor: colors.amber }
                        : d.isCurrent
                          ? { borderWidth: 1.5, borderColor: colors.amber }
                          : { backgroundColor: chart.track },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {isPersonal && !props.hasWeeklyGoal && (
        <TouchableOpacity
          style={[styles.row, (road || next || streak) && styles.rowDivider]}
          onPress={props.onSetGoal}
          accessibilityRole="button"
          accessibilityLabel="Set a weekly goal. Opens settings"
        >
          <View style={styles.flame}>
            <Ionicons name="flag-outline" size={20} color={colors.text2} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} maxFontSizeMultiplier={fontScaleCap.body}>Set a weekly goal</Text>
            <Text style={styles.rowSub} maxFontSizeMultiplier={fontScaleCap.body}>Your goal shows on the dial above.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text3} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function Road({
  road,
  avatarId,
  reducedMotion,
}: {
  road: NonNullable<ReturnType<typeof getMilestoneRoadOrStart>>;
  avatarId: string | null | undefined;
  reducedMotion: boolean;
}) {
  const [trackW, setTrackW] = useState(0);
  const pos = useRef(new Animated.Value(reducedMotion ? road.progress : 0)).current;
  const played = useRef(false);

  useEffect(() => {
    if (reducedMotion || played.current) {
      pos.setValue(road.progress);
      played.current = true;
      return;
    }
    if (trackW === 0) return;
    played.current = true;
    Animated.timing(pos, {
      toValue: road.progress,
      duration: motion.settle * 1.5,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [road.progress, reducedMotion, trackW, pos]);

  const source = (avatarId ? getAvatarById(avatarId)?.image : null) ?? AVATARS[0].image;
  const fillWidth = pos.interpolate({ inputRange: [0, 1], outputRange: [0, trackW] });
  const carLeft = pos.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(0, trackW - CAR)],
  });
  const nearEnd = road.progress >= 0.9;

  return (
    <View
      accessible
      accessibilityLabel={`Next milestone, ${road.next.label}, ${road.next.miles} miles. ${road.next.funFact}. ${milesToGoText(road.milesToGo)}`}
    >
      <View style={styles.roadHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} maxFontSizeMultiplier={fontScaleCap.body}>Next: {road.next.label}</Text>
          <Text style={styles.rowSub} maxFontSizeMultiplier={fontScaleCap.body}>
            {road.next.funFact}, {road.next.miles.toLocaleString("en-GB")} mi
          </Text>
        </View>
      </View>
      <View style={styles.roadWrap}>
        <View style={styles.trackBox} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width: fillWidth }]} />
          </View>
          <Animated.View style={[styles.car, { left: carLeft }]}>
            <Image source={source} style={styles.carImg} accessible={false} />
          </Animated.View>
        </View>
        <Ionicons name="flag" size={16} color={nearEnd ? colors.amber : colors.text3} style={styles.flag} />
      </View>
      <Text style={styles.toGo} maxFontSizeMultiplier={fontScaleCap.body}>{milesToGoText(road.milesToGo)}</Text>
      {road.lastAchieved && (
        <View style={styles.achieved}>
          <Ionicons name="checkmark-circle" size={16} color={colors.green} />
          <Text style={styles.achievedText} maxFontSizeMultiplier={fontScaleCap.body} numberOfLines={2}>
            {road.lastAchieved.label}: {road.lastAchieved.funFact}
          </Text>
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
    borderColor: colors.surfaceBorder,
    padding: 16,
    marginBottom: 12,
  },
  heading: { fontSize: 16, fontFamily: fonts.bold, color: colors.text1, marginBottom: 14 },
  roadHead: { flexDirection: "row", alignItems: "center" },
  roadWrap: { flexDirection: "row", alignItems: "center", marginTop: 12, height: CAR + 4 },
  trackBox: { flex: 1, height: CAR, justifyContent: "center" },
  track: { height: 8, borderRadius: 4, backgroundColor: chart.track, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: chart.current },
  car: {
    position: "absolute",
    top: 0,
    width: CAR,
    height: CAR,
    borderRadius: CAR / 2,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: colors.bg,
    backgroundColor: colors.bg,
  },
  carImg: { width: CAR - 3, height: CAR - 3 },
  flag: { marginLeft: 6 },
  toGo: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1, marginTop: 8 },
  achieved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  achievedText: { flex: 1, fontSize: 14, fontFamily: fonts.regular, color: colors.text2 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  rowDivider: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.text1 },
  rowSub: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2, marginTop: 2 },
  flame: { width: 40, alignItems: "center" },
  dots: { flexDirection: "row", gap: 6, marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
