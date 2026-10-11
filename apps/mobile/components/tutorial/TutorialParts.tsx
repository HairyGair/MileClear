// Shared pieces of the first-run tour's screens: the top bar (back, step
// dots, Skip), the pinned bottom button, ticks, and the boxes. Drawn with
// plain Views and Ionicons, no images (PROPOSALS 0.8).

import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";

export function TopBar(props: {
  index: number;
  total: number;
  onBack: (() => void) | null;
  onSkip: (() => void) | null;
}) {
  return (
    <View style={s.topBar}>
      <View style={s.topSide}>
        {props.onBack ? (
          <Pressable
            onPress={props.onBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={s.topButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={26} color={colors.text1} accessible={false} />
          </Pressable>
        ) : null}
      </View>
      <View
        style={s.dots}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${props.index + 1} of ${props.total}`}
      >
        {Array.from({ length: props.total }, (_, i) => (
          <View key={i} style={[s.dot, i === props.index && s.dotOn]} />
        ))}
      </View>
      <View style={[s.topSide, { alignItems: "flex-end" }]}>
        {props.onSkip ? (
          <Pressable
            onPress={props.onSkip}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={s.topButton}
            accessibilityRole="button"
            accessibilityLabel="Skip the tour"
          >
            <Text style={s.skip} maxFontSizeMultiplier={fontScaleCap.heading}>
              Skip
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Title({ children, center }: { children: string; center?: boolean }) {
  return (
    <Text
      style={[s.title, center && s.center]}
      accessibilityRole="header"
      maxFontSizeMultiplier={fontScaleCap.display}
    >
      {children}
    </Text>
  );
}

export function Body({ children, center }: { children: ReactNode; center?: boolean }) {
  return (
    <Text style={[s.body, center && s.center]} maxFontSizeMultiplier={fontScaleCap.body}>
      {children}
    </Text>
  );
}

export function PrimaryButton(props: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
}) {
  const off = props.disabled || props.busy;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={off}
      style={({ pressed }) => [s.primary, off && s.primaryOff, pressed && !off && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={props.title}
      accessibilityHint={props.hint}
      accessibilityState={{ disabled: !!off, busy: !!props.busy }}
    >
      {props.busy ? (
        <ActivityIndicator color={colors.bg} />
      ) : (
        <Text style={s.primaryText} maxFontSizeMultiplier={fontScaleCap.heading}>
          {props.title}
        </Text>
      )}
    </Pressable>
  );
}

export function LinkButton(props: { title: string; onPress: () => void; hint?: string }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={s.link}
      accessibilityRole="button"
      accessibilityLabel={props.title}
      accessibilityHint={props.hint}
    >
      <Text style={s.linkText} maxFontSizeMultiplier={fontScaleCap.heading}>
        {props.title}
      </Text>
    </Pressable>
  );
}

/** A green tick or an empty amber ring, so the state never rests on colour alone. */
export function Tick({ ok }: { ok: boolean }) {
  return ok ? (
    <View style={s.tickOk} accessible={false}>
      <Ionicons name="checkmark" size={16} color={colors.bg} />
    </View>
  ) : (
    <View style={s.tickRing} accessible={false} />
  );
}

export function TickLine({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={s.tickLine} accessible accessibilityLabel={`${title}. ${hint}`}>
      <Tick ok />
      <View style={{ flex: 1 }}>
        <Text style={s.tickTitle} maxFontSizeMultiplier={fontScaleCap.body}>
          {title}
        </Text>
        <Text style={s.tickHint} maxFontSizeMultiplier={fontScaleCap.body}>
          {hint}
        </Text>
      </View>
    </View>
  );
}

export function Box({ children, tone }: { children: ReactNode; tone?: "amber" }) {
  return <View style={[s.box, tone === "amber" && s.boxAmber]}>{children}</View>;
}

export function IconBadge({ name, dim }: { name: keyof typeof Ionicons.glyphMap; dim?: boolean }) {
  return (
    <View style={[s.iconBadge, dim && { backgroundColor: "rgba(255,255,255,0.05)" }]} accessible={false}>
      <Ionicons name={name} size={44} color={dim ? colors.text3 : colors.amber} />
    </View>
  );
}

export const parts = StyleSheet.create({
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.text2,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  boxTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text1, marginBottom: 6 },
  boxTitleAmber: { fontSize: 16, fontFamily: fonts.bold, color: colors.amber, marginBottom: 6 },
  boxBody: { fontSize: 15, fontFamily: fonts.regular, color: colors.text1, lineHeight: 22 },
  small: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, lineHeight: 19 },
  amberText: { color: colors.amber, fontFamily: fonts.semibold },
});

const s = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  topSide: { width: 72, justifyContent: "center" },
  topButton: { minHeight: 44, minWidth: 44, justifyContent: "center" },
  dots: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" },
  dotOn: { width: 18, backgroundColor: colors.amber },
  skip: { fontSize: 16, fontFamily: fonts.medium, color: colors.text2 },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: fonts.bold,
    color: colors.text1,
    marginBottom: spacing.sm,
  },
  body: { fontSize: 16, lineHeight: 24, fontFamily: fonts.regular, color: colors.text2 },
  center: { textAlign: "center" },
  primary: {
    minHeight: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  primaryOff: { opacity: 0.45 },
  primaryText: { fontSize: 17, fontFamily: fonts.bold, color: colors.bg },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, paddingHorizontal: spacing.md },
  linkText: { fontSize: 15, fontFamily: fonts.medium, color: colors.text2, textAlign: "center" },
  tickOk: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  tickRing: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.amber, marginTop: 1 },
  tickLine: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  tickTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  tickHint: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, marginTop: 2, lineHeight: 20 },
  box: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  boxAmber: { backgroundColor: "#181a20", borderColor: "rgba(245,166,35,0.35)" },
  iconBadge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing.xl,
  },
});
