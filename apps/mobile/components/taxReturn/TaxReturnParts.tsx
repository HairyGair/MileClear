// Shared bits for the end-of-year tax return screens (tax-mtd-year-end*.tsx).

import type { ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BetaBanner } from "../BetaBanner";
import { colors, fonts } from "../../lib/theme";

/** The "Test version" banner every tax return screen carries until HMRC lets us go live. */
export function TaxReturnTestBanner({ title, body }: { title?: string; body?: string }) {
  return (
    <BetaBanner
      label="Test version"
      title={title ?? "The tax return is a test version"}
      body={
        body ??
        "This works with HMRC's test service while we wait to be allowed to send real returns. Nothing you do here reaches HMRC and your tax account is not changed. You still need to send your real tax return."
      }
    />
  );
}

export function Section({ title, step, children }: { title: string; step?: string; children: ReactNode }) {
  return (
    <View style={partStyles.section}>
      <Text style={partStyles.sectionTitle}>{step ? `${step} · ${title}` : title}</Text>
      {children}
    </View>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[partStyles.body, muted && { color: colors.text3 }]}>{children}</Text>;
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={partStyles.row}>
      <Text style={[partStyles.rowLabel, strong && partStyles.rowStrong]}>{label}</Text>
      <Text style={[partStyles.rowValue, strong && partStyles.rowStrong]}>{value}</Text>
    </View>
  );
}

export function Note({ text, tone = "info" }: { text: string; tone?: "info" | "warn" | "bad" | "good" }) {
  const icon =
    tone === "good" ? "checkmark-circle" : tone === "bad" ? "alert-circle" : tone === "warn" ? "warning" : "information-circle-outline";
  const color =
    tone === "good" ? colors.green : tone === "bad" ? colors.red : tone === "warn" ? colors.amber : colors.text3;
  return (
    <View style={partStyles.note}>
      <Ionicons name={icon} size={18} color={color} style={{ marginTop: 1 }} accessible={false} />
      <Text style={partStyles.noteText}>{text}</Text>
    </View>
  );
}

/** A tick box with its label. The whole row is the touch target. */
export function TickBox({
  checked,
  onToggle,
  label,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[partStyles.tickRow, disabled && { opacity: 0.5 }]}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
    >
      <View style={[partStyles.tickBox, checked && partStyles.tickBoxOn]}>
        {checked && <Ionicons name="checkmark" size={16} color="#000" />}
      </View>
      <Text style={partStyles.tickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  icon = "arrow-forward",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <TouchableOpacity
      style={[partStyles.primary, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text style={partStyles.primaryText}>{label}</Text>
      <Ionicons name={icon} size={18} color="#000" />
    </TouchableOpacity>
  );
}

export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={partStyles.secondary} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={partStyles.secondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

export const partStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 64 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: colors.bg },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    color: colors.text3,
    fontSize: 11,
    fontFamily: fonts.semibold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  body: { color: colors.text2, fontSize: 14, fontFamily: fonts.regular, lineHeight: 21 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, gap: 12 },
  rowLabel: { color: colors.text2, fontSize: 14, fontFamily: fonts.regular, flex: 1 },
  rowValue: { color: colors.text1, fontSize: 14, fontFamily: fonts.semibold },
  rowStrong: { color: colors.text1, fontFamily: fonts.bold, fontSize: 15 },
  note: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  noteText: { color: colors.text2, fontSize: 13, fontFamily: fonts.regular, lineHeight: 19, flex: 1 },
  tickRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 6 },
  tickBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  tickBoxOn: { backgroundColor: colors.amber },
  tickLabel: { color: colors.text1, fontSize: 14, fontFamily: fonts.medium, lineHeight: 21, flex: 1 },
  primary: {
    backgroundColor: colors.amber,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  primaryText: { color: "#000", fontFamily: fonts.semibold, fontSize: 16 },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryText: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 15 },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  chipOn: { backgroundColor: colors.amberDim, borderColor: colors.amber },
  chipText: { color: colors.text2, fontFamily: fonts.medium, fontSize: 14 },
  chipTextOn: { color: colors.amber },
  choice: {
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  choiceOn: { borderColor: colors.amber, backgroundColor: colors.amberDim },
  choiceText: { color: colors.text1, fontFamily: fonts.medium, fontSize: 14, flex: 1, lineHeight: 20 },
  headline: { color: colors.amber, fontSize: 30, fontFamily: fonts.bold, textAlign: "center" },
  headlineLabel: {
    color: colors.text3,
    fontSize: 12,
    fontFamily: fonts.semibold,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  declaration: {
    borderLeftWidth: 3,
    borderLeftColor: colors.amber,
    paddingLeft: 12,
    color: colors.text1,
    fontSize: 15,
    fontFamily: fonts.medium,
    lineHeight: 23,
  },
  link: { color: colors.amber, fontSize: 14, fontFamily: fonts.semibold },
});
