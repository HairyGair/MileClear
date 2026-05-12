import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
} from "react-native";
import { router, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { colors, fonts, radii, spacing } from "../lib/theme";
import { getDatabase } from "../lib/db";
import { HELP_SECTIONS, type HelpTopic } from "../lib/help/topics";

/**
 * Help & Tutorials — in-app guide for first-time users + anyone who
 * needs a refresher. Sectioned FAQ with tap-to-expand answers + a
 * "Show me the quick start again" button at the top.
 *
 * Content is the shared HELP_SECTIONS registry — the same source
 * the ContextualHelp component reads from, so when this screen
 * gets updated, every inline (i) icon across the app stays in sync.
 */


export default function HelpScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleReplayTour = useCallback(async () => {
    try {
      const db = await getDatabase();
      await db.runAsync(
        "DELETE FROM tracking_state WHERE key = 'quick_start_shown'"
      );
    } catch {
      // No-op — replay just won't fire if SQLite is unavailable
    }
    router.replace("/(tabs)/dashboard" as never);
  }, []);

  const handleTopic = useCallback((topic: HelpTopic) => {
    if (topic.externalUrl) {
      WebBrowser.openBrowserAsync(topic.externalUrl).catch(() => {});
      return;
    }
    if (topic.goTo) {
      router.push(topic.goTo as never);
      return;
    }
    setExpandedId((prev) => (prev === topic.id ? null : topic.id));
  }, []);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: "Help & Tutorials",
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text1,
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="play-circle-outline" size={28} color={colors.amber} />
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle} maxFontSizeMultiplier={1.4}>
              Replay the Quick Start
            </Text>
            <Text style={styles.heroSubtitle} maxFontSizeMultiplier={1.4}>
              The 5-card welcome tour you saw on first launch.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.heroCta}
            onPress={handleReplayTour}
            accessibilityRole="button"
            accessibilityLabel="Replay the Quick Start tour"
          >
            <Text style={styles.heroCtaText} maxFontSizeMultiplier={1.2}>
              Play
            </Text>
          </TouchableOpacity>
        </View>

        {HELP_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name={section.icon} size={18} color={colors.amber} accessible={false} />
              <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.4}>
                {section.title}
              </Text>
            </View>
            <View style={styles.sectionCard}>
              {section.topics.map((topic, idx) => {
                const isExpanded = expandedId === topic.id;
                const isLast = idx === section.topics.length - 1;
                return (
                  <View key={topic.id} style={[!isLast && styles.topicBorder]}>
                    <TouchableOpacity
                      style={styles.topicRow}
                      onPress={() => handleTopic(topic)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={topic.q}
                      accessibilityState={{ expanded: isExpanded }}
                      accessibilityHint={
                        topic.goTo
                          ? "Opens the related screen"
                          : topic.externalUrl
                          ? "Opens an external article"
                          : "Tap to read the answer"
                      }
                    >
                      <Text style={styles.topicQ} maxFontSizeMultiplier={1.5}>
                        {topic.q}
                      </Text>
                      <Ionicons
                        name={
                          topic.goTo || topic.externalUrl
                            ? "chevron-forward"
                            : isExpanded
                            ? "chevron-up"
                            : "chevron-down"
                        }
                        size={16}
                        color={colors.text3}
                        accessible={false}
                      />
                    </TouchableOpacity>
                    {isExpanded && !topic.goTo && !topic.externalUrl ? (
                      <View style={styles.topicAnswer}>
                        <Text style={styles.topicAnswerText} maxFontSizeMultiplier={1.5}>
                          {topic.a}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.footerCard}>
          <Text style={styles.footerLabel} maxFontSizeMultiplier={1.2}>
            STILL STUCK?
          </Text>
          <TouchableOpacity
            style={styles.footerBtn}
            onPress={() => Linking.openURL("mailto:support@mileclear.com?subject=MileClear%20Support")}
            accessibilityRole="button"
            accessibilityLabel="Email MileClear support"
          >
            <Ionicons name="mail-outline" size={18} color={colors.amber} accessible={false} />
            <Text style={styles.footerBtnText} maxFontSizeMultiplier={1.3}>
              Email support@mileclear.com
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.footerBtn}
            onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/support")}
            accessibilityRole="link"
            accessibilityLabel="Open the full MileClear support site"
          >
            <Ionicons name="open-outline" size={18} color={colors.amber} accessible={false} />
            <Text style={styles.footerBtnText} maxFontSizeMultiplier={1.3}>
              Open mileclear.com/support
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.amberDim,
    justifyContent: "center",
    alignItems: "center",
  },
  heroBody: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  heroSubtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: 2,
  },
  heroCta: {
    backgroundColor: colors.amber,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  heroCtaText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.bg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.text2,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: "hidden",
  },
  topicBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  topicQ: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.text1,
  },
  topicAnswer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  topicAnswerText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    lineHeight: 21,
  },
  footerCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.md,
    gap: 8,
    marginTop: spacing.md,
  },
  footerLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.text2,
    letterSpacing: 1,
    marginBottom: 4,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: "rgba(245, 166, 35, 0.06)",
  },
  footerBtnText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.amber,
  },
});
