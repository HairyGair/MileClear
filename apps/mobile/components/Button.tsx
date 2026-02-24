import { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  Text,
  ActivityIndicator,
  View,
  StyleSheet,
  Platform,
} from "react-native";
import type { ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost" | "hero";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: ButtonVariant;
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  fullWidth?: boolean;
  size?: ButtonSize;
  style?: ViewStyle;
}

// Size system — vertical padding, horizontal padding, font size, icon size, icon gap
const SIZE_MAP = {
  sm: { pv: 10, ph: 16, fs: 14, icon: 16, gap: 6, ls: 0.1 },
  md: { pv: 16, ph: 20, fs: 16, icon: 18, gap: 8, ls: 0.15 },
  lg: { pv: 18, ph: 24, fs: 17, icon: 20, gap: 9, ls: 0.3 },
} as const;

// Variant visual definitions
const VARIANTS = {
  primary: {
    bg: "#f5a623",
    text: "#030712",
    font: "PlusJakartaSans_700Bold",
    border: null as string | null,
    radius: 12,
  },
  secondary: {
    bg: "#151e2d",
    text: "#c9d1db",
    font: "PlusJakartaSans_600SemiBold",
    border: "#2a3544",
    radius: 12,
  },
  destructive: {
    bg: "rgba(239,68,68,0.08)",
    text: "#f87171",
    font: "PlusJakartaSans_600SemiBold",
    border: "rgba(239,68,68,0.20)",
    radius: 12,
  },
  ghost: {
    bg: "transparent",
    text: "#8494a7",
    font: "PlusJakartaSans_600SemiBold",
    border: null as string | null,
    radius: 12,
  },
  hero: {
    bg: "#f5a623",
    text: "#030712",
    font: "PlusJakartaSans_700Bold",
    border: null as string | null,
    radius: 14,
  },
} as const;

export function Button({
  variant = "primary",
  title,
  onPress,
  loading = false,
  disabled = false,
  icon,
  danger = false,
  fullWidth = true,
  size = "md",
  style,
}: ButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const spinnerOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0.12)).current;
  const glowRadius = useRef(new Animated.Value(10)).current;
  const glowRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Hero breathing glow (iOS only) ──────────────────────────
  useEffect(() => {
    if (variant !== "hero" || Platform.OS !== "ios") return;

    if (loading || disabled) {
      glowRef.current?.stop();
      glowOpacity.setValue(0.12);
      glowRadius.setValue(10);
      return;
    }

    const breathe = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowOpacity, {
            toValue: 0.45,
            duration: 2200,
            useNativeDriver: false,
          }),
          Animated.timing(glowRadius, {
            toValue: 20,
            duration: 2200,
            useNativeDriver: false,
          }),
        ]),
        Animated.parallel([
          Animated.timing(glowOpacity, {
            toValue: 0.12,
            duration: 2200,
            useNativeDriver: false,
          }),
          Animated.timing(glowRadius, {
            toValue: 10,
            duration: 2200,
            useNativeDriver: false,
          }),
        ]),
      ])
    );
    glowRef.current = breathe;
    breathe.start();

    return () => breathe.stop();
  }, [variant, loading, disabled, glowOpacity, glowRadius]);

  // ── Loading crossfade ───────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: loading ? 0 : 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(spinnerOpacity, {
        toValue: loading ? 1 : 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [loading, contentOpacity, spinnerOpacity]);

  // ── Press spring — decisive in, satisfying out ──────────────
  const handlePressIn = useCallback(() => {
    if (disabled || loading) return;
    Animated.spring(scaleAnim, {
      toValue: 0.965,
      tension: 400,
      friction: 30,
      useNativeDriver: true,
    }).start();
  }, [disabled, loading, scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 200,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  // ── Resolve variant visuals ─────────────────────────────────
  const v = VARIANTS[variant];
  const s = SIZE_MAP[size];
  const isGhostDanger = variant === "ghost" && danger;
  const textColor = isGhostDanger ? "#f87171" : v.text;

  // ── Outer animated wrapper ──────────────────────────────────
  const outerStyle: Animated.AnimatedProps<ViewStyle>[] = [
    { transform: [{ scale: scaleAnim }] },
    ...(!fullWidth ? [{ alignSelf: "flex-start" as const }] : []),
  ];

  // Hero glow — animate both opacity and radius for a breathing feel
  if (variant === "hero" && Platform.OS === "ios") {
    outerStyle.push({
      shadowColor: "#e8991a",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: glowOpacity as unknown as number,
      shadowRadius: glowRadius as unknown as number,
    });
  }

  // Primary — static warm shadow
  if (variant === "primary" && Platform.OS === "ios") {
    outerStyle.push({
      shadowColor: "#d4891a",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
    });
  }

  if (style) outerStyle.push(style);

  return (
    <Animated.View style={outerStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={[
          styles.base,
          {
            paddingVertical: s.pv,
            paddingHorizontal: s.ph,
            backgroundColor: v.bg,
            borderRadius: v.radius,
          },
          v.border != null && {
            borderWidth: 1,
            borderColor: v.border,
          },
          // Secondary — amber accent strip on left edge
          variant === "secondary" && styles.secondaryAccent,
          // Hero — Android static elevation
          variant === "hero" && Platform.OS === "android" && { elevation: 6 },
          // Primary — Android slight elevation
          variant === "primary" && Platform.OS === "android" && { elevation: 3 },
          // Disabled state
          (disabled || loading) && styles.disabled,
        ]}
      >
        {/* Content — fades out when loading */}
        <Animated.View style={[styles.content, { opacity: contentOpacity }]}>
          {icon && (
            <Ionicons
              name={icon}
              size={s.icon}
              color={textColor}
              style={{ marginRight: s.gap }}
            />
          )}
          <Text
            style={{
              fontSize: s.fs,
              fontFamily: v.font,
              color: textColor,
              letterSpacing: s.ls,
            }}
          >
            {title}
          </Text>
        </Animated.View>

        {/* Spinner — fades in when loading, overlaid on content */}
        <Animated.View
          style={[styles.spinnerOverlay, { opacity: spinnerOpacity }]}
          pointerEvents="none"
        >
          <ActivityIndicator color={textColor} size="small" />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.4,
  },
  secondaryAccent: {
    borderLeftWidth: 3,
    borderLeftColor: "#f5a623",
  },
});
