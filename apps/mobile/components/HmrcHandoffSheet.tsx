import { useRef } from "react";
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppModal } from "./AppModal";
import { colors, fonts, fontScaleCap, fontSizes, radii, spacing } from "../lib/theme";
import { COME_BACK_TITLE, HAVE_READY_TITLE, type HandoffCopy } from "../lib/tax/mtdHandoffCopy";

// iOS drops a browser or alert presented while a modal is still closing, so
// the sheet closes first and the action runs once it's gone (as the hub's
// Manage sheet does for Disconnect).
const AFTER_CLOSE_MS = 450;

interface Props {
  visible: boolean;
  copy: HandoffCopy;
  onClose: () => void;
  /** Runs after the sheet has closed: open the page, or start HMRC sign-in. */
  onPrimary: () => void;
  /** Runs at once when the primary button is tapped, before the close delay (to block a second start). */
  onPrimaryTap?: () => void;
  /** Runs after the sheet has closed. Shown only when the copy has a secondary label. */
  onSecondary?: () => void;
}

/**
 * The short sheet a driver sees before we send them to GOV.UK or HMRC's
 * sign-in (HMRC redesign spec 4.4): where they're going, what happens there,
 * and how to come back. One component for Sign up, Connect, Pay and File.
 */
export function HmrcHandoffSheet({ visible, copy, onClose, onPrimary, onPrimaryTap, onSecondary }: Props) {
  // A second tap while the sheet is closing must not open the page twice.
  const busy = useRef(false);
  const runAfterClose = (fn: () => void) => {
    if (busy.current) return;
    busy.current = true;
    onClose();
    setTimeout(() => {
      busy.current = false;
      fn();
    }, AFTER_CLOSE_MS);
  };

  return (
    <AppModal visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: spacing.sm }}>
            <View style={styles.topRow}>
              <View style={styles.pill}>
                <Ionicons
                  name={copy.kind === "connect" ? "lock-closed-outline" : "open-outline"}
                  size={13}
                  color={colors.text2}
                  accessible={false}
                />
                <Text style={styles.pillText} maxFontSizeMultiplier={fontScaleCap.body}>{copy.pill}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={colors.text2} />
              </TouchableOpacity>
            </View>

            <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
              {copy.title}
            </Text>
            {copy.why ? <Text style={styles.why} maxFontSizeMultiplier={fontScaleCap.body}>{copy.why}</Text> : null}

            {copy.rows.length > 0 && (
              <View style={styles.rows}>
                {copy.rows.map((r) => (
                  <View key={r.label} style={styles.row} accessible accessibilityLabel={`${r.label}: ${r.value}`}>
                    <Text style={styles.rowLabel}>{r.label}</Text>
                    <Text style={styles.rowValue}>{r.value}</Text>
                  </View>
                ))}
              </View>
            )}

            {copy.steps.length > 0 && (
              <View style={styles.steps}>
                {copy.steps.map((s, i) => (
                  <View
                    key={s.title}
                    style={styles.step}
                    accessible
                    accessibilityLabel={`Step ${i + 1}: ${s.title}${s.body ? `. ${s.body}` : ""}`}
                  >
                    <View style={styles.num}>
                      <Text style={styles.numText} maxFontSizeMultiplier={fontScaleCap.body}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepTitle} maxFontSizeMultiplier={fontScaleCap.body}>{s.title}</Text>
                      {s.body ? <Text style={styles.stepBody} maxFontSizeMultiplier={fontScaleCap.body}>{s.body}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {copy.haveReady ? (
              <Box icon="document-text-outline" iconColor={colors.amber} title={HAVE_READY_TITLE} body={copy.haveReady} />
            ) : null}
            {copy.comeBack ? (
              <Box icon="phone-portrait-outline" iconColor={colors.green} title={COME_BACK_TITLE} body={copy.comeBack} />
            ) : null}
          </ScrollView>

          <TouchableOpacity
            style={styles.primary}
            onPress={() => {
              if (!busy.current) onPrimaryTap?.();
              runAfterClose(onPrimary);
            }}
            accessibilityRole={copy.primaryOpensWeb ? "link" : "button"}
            accessibilityLabel={copy.primary}
          >
            <Text style={styles.primaryText} maxFontSizeMultiplier={fontScaleCap.body}>{copy.primary}</Text>
            <Ionicons name={copy.primaryOpensWeb ? "open-outline" : "arrow-forward"} size={18} color="#000" />
          </TouchableOpacity>
          {copy.secondary && onSecondary ? (
            <TouchableOpacity
              style={styles.secondary}
              onPress={() => runAfterClose(onSecondary)}
              accessibilityRole="button"
              accessibilityLabel={copy.secondary}
            >
              <Text style={styles.secondaryText} maxFontSizeMultiplier={fontScaleCap.body}>{copy.secondary}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </AppModal>
  );
}

function Box({
  icon,
  iconColor,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.box} accessible accessibilityLabel={`${title}. ${body}`}>
      <Ionicons name={icon} size={22} color={iconColor} accessible={false} />
      <View style={{ flex: 1 }}>
        <Text style={styles.boxTitle} maxFontSizeMultiplier={fontScaleCap.body}>{title}</Text>
        <Text style={styles.boxBody} maxFontSizeMultiplier={fontScaleCap.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  sheet: {
    maxHeight: "92%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.hairline,
    marginBottom: spacing.lg,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text2 },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.heading, color: colors.text1 },
  why: { fontFamily: fonts.regular, fontSize: fontSizes.bodyLg - 1, lineHeight: 22, color: colors.text2, marginTop: spacing.sm },
  rows: { marginTop: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowLabel: { fontFamily: fonts.regular, fontSize: fontSizes.body + 1, color: colors.text2 },
  rowValue: { fontFamily: fonts.bold, fontSize: fontSizes.bodyLg, color: colors.text1 },
  steps: { marginTop: spacing.lg, gap: spacing.lg },
  step: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  numText: { fontFamily: fonts.bold, fontSize: 13, color: colors.amber },
  stepTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg, color: colors.text1 },
  stepBody: { fontFamily: fonts.regular, fontSize: fontSizes.body, lineHeight: 20, color: colors.text2, marginTop: 2 },
  box: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  boxTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.body + 1, color: colors.text1 },
  boxBody: { fontFamily: fonts.regular, fontSize: fontSizes.body, lineHeight: 20, color: colors.text2, marginTop: 2 },
  primary: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.amber,
    borderRadius: radii.md,
    marginTop: spacing.lg,
  },
  primaryText: { fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg, color: "#000" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  secondaryText: { fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg, color: colors.text1 },
});
