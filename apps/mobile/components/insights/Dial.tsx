// The hero dial (SPEC-VISUAL 5.1): 36 ticks on a 270 degree arc, the driver's
// vehicle avatar in the middle. Plain Views and the built-in Animated API, so
// it ships by OTA with no new native code. Personal mode only (decision F).

import { useEffect, useRef } from "react";
import { Animated, Easing, Image, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, chart, motion } from "../../lib/theme";
import { AVATARS, getAvatarById } from "../avatars/AvatarRegistry";

const SIZE = 132;
const TICKS = 36;
const RADIUS = 56;
const TICK_W = 4;
const TICK_H = 12;
const AVATAR = 64;

const tickAngles = Array.from({ length: TICKS }, (_, i) => -135 + i * (270 / (TICKS - 1)));

interface DialProps {
  /** 0 to 1. Over 1 shows every tick lit plus a tick badge. */
  progress: number;
  avatarId: string | null | undefined;
  reducedMotion: boolean;
  /** Plays the spark burst once when this flips to true. */
  celebrate?: boolean;
  /** Plays the dial lighting animation. Off after the first view in a session. */
  animate?: boolean;
}

export function Dial({ progress, avatarId, reducedMotion, celebrate, animate = true }: DialProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const lit = Math.round(clamped * TICKS);
  const target = lit / TICKS;
  const anim = useRef(new Animated.Value(reducedMotion || !animate ? target : 0)).current;

  useEffect(() => {
    if (reducedMotion || !animate) {
      anim.setValue(target);
      return;
    }
    Animated.timing(anim, {
      toValue: target,
      duration: motion.settle,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [target, reducedMotion, animate, anim]);

  const source = (avatarId ? getAvatarById(avatarId)?.image : null) ?? AVATARS[0].image;
  const complete = progress >= 1;

  return (
    <View style={styles.dial} accessible={false} importantForAccessibility="no-hide-descendants">
      {tickAngles.map((deg, i) => {
        const opacity = anim.interpolate({
          inputRange: [i / TICKS, i / TICKS + 0.001],
          outputRange: [0, 1],
          extrapolate: "clamp",
        });
        const place = { transform: [{ rotate: `${deg}deg` }, { translateY: -RADIUS }] };
        return (
          <View key={i} style={[styles.tickBox, place]}>
            <View style={[styles.tick, { backgroundColor: chart.trackOnHero }]} />
            <Animated.View style={[styles.tick, styles.tickLit, { opacity }]} />
          </View>
        );
      })}
      <View style={styles.avatarRing}>
        <Image source={source} style={styles.avatar} resizeMode="cover" accessible={false} />
      </View>
      {complete && (
        <View style={styles.doneBadge}>
          <Ionicons name="checkmark-circle" size={16} color={colors.green} />
        </View>
      )}
      <SparkBurst play={!!celebrate && !reducedMotion} />
    </View>
  );
}

const SPOKES = Array.from({ length: 8 }, (_, i) => i * 45);

/** Eight dots fly out from the centre once, 700ms. Hidden from screen readers. */
export function SparkBurst({ play }: { play: boolean }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!play) return;
    t.setValue(0);
    Animated.timing(t, {
      toValue: 1,
      duration: motion.celebrate,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [play, t]);

  if (!play) return null;
  return (
    <View style={styles.sparkLayer} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {SPOKES.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const tx = t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(rad) * 36] });
        const ty = t.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.cos(rad) * 36] });
        const scale = t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] });
        const opacity = t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.9, 0] });
        return (
          <Animated.View
            key={deg}
            style={[
              styles.spark,
              { backgroundColor: i % 2 === 0 ? colors.amber : colors.text1, opacity, transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dial: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  tickBox: { position: "absolute", left: (SIZE - TICK_W) / 2, top: (SIZE - TICK_H) / 2, width: TICK_W, height: TICK_H },
  tick: { position: "absolute", left: 0, top: 0, width: TICK_W, height: TICK_H, borderRadius: 2 },
  tickLit: { backgroundColor: chart.current },
  avatarRing: {
    width: AVATAR + 4,
    height: AVATAR + 4,
    borderRadius: (AVATAR + 4) / 2,
    borderWidth: 2,
    borderColor: colors.bg,
    overflow: "hidden",
    backgroundColor: colors.bg,
  },
  avatar: { width: AVATAR, height: AVATAR },
  doneBadge: { position: "absolute", bottom: 0, alignSelf: "center" },
  sparkLayer: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  spark: { position: "absolute", width: 6, height: 6, borderRadius: 3 },
});
