// ContextualHelp — small "ⓘ" button that opens a bottom-sheet
// explaining the UI it sits next to. Used inline on screens where
// a label, number, or control might confuse a first-time user:
//
//   <View style={row}>
//     <Text>Tax Readiness</Text>
//     <ContextualHelp topicId="tax-readiness" />
//   </View>
//
// Reads from the shared HELP_SECTIONS registry in lib/help/topics.ts
// so the sheet's content stays in sync with the full Help & Tutorials
// screen — update one place, every (i) button across the app picks
// up the change.
//
// If the topic has a goTo, the sheet shows an extra "Open" CTA that
// deep-links to the relevant screen. Otherwise it's read-and-close.

import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AppModal } from "./AppModal";
import { getHelpTopic } from "../lib/help/topics";
import { colors, fonts, radii, spacing } from "../lib/theme";

interface ContextualHelpProps {
  /** Stable id from lib/help/topics.ts. If unknown, the button hides. */
  topicId: string;
  /** Override the icon size (default 16). Bigger on hero stats, smaller
   *  in dense rows. */
  size?: number;
  /** Override the icon colour. Defaults to text3 (muted) so the icon
   *  doesn't compete with the label it explains. */
  color?: string;
  /** Optional accessibility label override. Defaults to the topic
   *  question, so VoiceOver announces "What does Tax Readiness mean?
   *  Button. Help." */
  accessibilityLabel?: string;
}

export function ContextualHelp({
  topicId,
  size = 16,
  color = colors.text3,
  accessibilityLabel,
}: ContextualHelpProps) {
  const [visible, setVisible] = useState(false);
  const topic = getHelpTopic(topicId);

  const handleOpenScreen = useCallback(() => {
    if (!topic?.goTo) return;
    setVisible(false);
    // Small delay so the modal dismiss completes before the navigation
    // — without it iOS occasionally drops the push.
    setTimeout(() => router.push(topic.goTo as never), 250);
  }, [topic]);

  if (!topic) return null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `Help: ${topic.q}`}
        accessibilityHint="Opens a sheet explaining this control"
      >
        <Ionicons name="information-circle-outline" size={size} color={color} />
      </TouchableOpacity>

      <AppModal visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.iconWrap}>
                <Ionicons name="bulb-outline" size={20} color={colors.amber} />
              </View>
              <Text style={styles.title} maxFontSizeMultiplier={1.4}>
                {topic.q}
              </Text>
              <TouchableOpacity
                onPress={() => setVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close help"
              >
                <Ionicons name="close" size={20} color={colors.text2} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              <Text style={styles.bodyText} maxFontSizeMultiplier={1.5}>
                {topic.a}
              </Text>
            </ScrollView>

            <View style={styles.footer}>
              {topic.goTo ? (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleOpenScreen}
                  accessibilityRole="button"
                  accessibilityLabel={`Open the related screen`}
                >
                  <Ionicons name="arrow-forward" size={16} color={colors.bg} />
                  <Text style={styles.primaryBtnText} maxFontSizeMultiplier={1.3}>
                    Open
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.secondaryBtn, !topic.goTo && styles.secondaryBtnFull]}
                onPress={() => setVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close help"
              >
                <Text style={styles.secondaryBtnText} maxFontSizeMultiplier={1.3}>
                  Got it
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.fullHelpLink}
              onPress={() => {
                setVisible(false);
                setTimeout(() => router.push("/help" as never), 250);
              }}
              accessibilityRole="button"
              accessibilityLabel="Open the full Help and Tutorials screen"
            >
              <Text style={styles.fullHelpLinkText} maxFontSizeMultiplier={1.3}>
                See all help topics
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.text2} />
            </TouchableOpacity>
          </View>
        </View>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingBottom: spacing.xl,
    maxHeight: "85%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.amberDim,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text1,
    lineHeight: 22,
    paddingTop: 4,
  },
  body: {
    paddingHorizontal: spacing.lg,
  },
  bodyContent: {
    paddingBottom: spacing.md,
  },
  bodyText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    lineHeight: 22,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flex: 1,
    backgroundColor: colors.amber,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.bg,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
  },
  secondaryBtnFull: {
    flex: 1,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  fullHelpLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: spacing.md,
  },
  fullHelpLinkText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.text2,
  },
});
