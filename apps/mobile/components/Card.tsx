// Card — themed surface with consistent padding, radius and border.
// Replaces the dozens of ad-hoc { backgroundColor: "#0a1120", padding: 16,
// borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }
// blocks scattered across screens.
//
// Variants:
//   default   - standard surface card, used for most content blocks
//   elevated  - same surface but with subtle shadow on iOS (Profile, Hero)
//   glow      - amber-tinted border, for "this is the active/important one"

import { View, StyleSheet, type ViewStyle, Platform } from "react-native";
import { colors, radii, spacing } from "../lib/theme";

interface CardProps {
  children: React.ReactNode;
  variant?: "default" | "elevated" | "glow";
  /** Override the default padding. Pass 0 for edge-to-edge content. */
  padding?: number;
  style?: ViewStyle;
}

export function Card({ children, variant = "default", padding = spacing.lg, style }: CardProps) {
  return (
    <View
      style={[
        styles.base,
        { padding },
        variant === "elevated" && styles.elevated,
        variant === "glow" && styles.glow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  elevated: {
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  glow: {
    borderColor: colors.amberGlow,
    backgroundColor: colors.amberDim,
  },
});
