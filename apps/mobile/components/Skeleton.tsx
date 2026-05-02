// Skeleton — replaces raw <ActivityIndicator> spinners in loading states.
//
// Pulse-animated grey block that mimics the approximate shape of the content
// about to load. Using skeletons (rather than spinners) makes load feel
// faster because the user's eye gets a layout cue immediately and waits
// less time looking at a blank box. Premium-app standard.
//
// Usage:
//   <Skeleton width="100%" height={20} />            // text line
//   <Skeleton width={120} height={120} radius={12} /> // square card
//   <Skeleton.Group>                                 // multi-line layout
//     <Skeleton height={24} />
//     <Skeleton height={16} width="60%" />
//   </Skeleton.Group>

import { useEffect, useRef } from "react";
import { Animated, View, StyleSheet, type ViewStyle, type DimensionValue } from "react-native";
import { colors, radii, spacing } from "../lib/theme";

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = "100%", height = 16, radius = radii.sm, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius: radius, opacity },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

interface SkeletonGroupProps {
  children: React.ReactNode;
  gap?: number;
  style?: ViewStyle;
}

function SkeletonGroup({ children, gap = spacing.sm, style }: SkeletonGroupProps) {
  return (
    <View style={[{ gap }, style]} accessibilityLabel="Loading content" accessibilityRole="progressbar">
      {children}
    </View>
  );
}

Skeleton.Group = SkeletonGroup;

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
  },
});
