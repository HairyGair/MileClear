import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
} from "react-native";
import { router, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { colors, fonts, radii, spacing } from "../lib/theme";
import {
  getVisibleHelpSections,
  searchHelpTopics,
  type HelpSection,
  type HelpTopic,
} from "../lib/help/topics";

/**
 * Help and how-tos. Every answer comes from @mileclear/shared (data/help.ts),
 * the same words the (i) help sheets, the website and EmSee use. Tap a
 * question to read the answer; topics about a screen add a "Go there" button
 * under the answer. The search box finds answers from a driver's own words.
 */
export default function HelpScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const sections: HelpSection[] = useMemo(() => {
    if (query.trim().length < 2) return getVisibleHelpSections();
    const found = searchHelpTopics(query);
    return found.length ? [{ title: "Best matches", icon: "search-outline", topics: found }] : [];
  }, [query]);

  const toggle = useCallback((topic: HelpTopic) => {
    setExpandedId((prev) => (prev === topic.id ? null : topic.id));
  }, []);

  const goThere = useCallback((topic: HelpTopic) => {
    if (topic.externalUrl) {
      WebBrowser.openBrowserAsync(topic.externalUrl).catch(() => {});
      return;
    }
    if (topic.goTo) router.push(topic.goTo as never);
  }, []);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: "Help and how-tos",
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text1,
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.search}>
          <Ionicons name="search-outline" size={18} color={colors.text3} accessible={false} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search, e.g. pause, missing trip, cancel"
            placeholderTextColor={colors.text3}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search help"
            maxFontSizeMultiplier={1.4}
          />
        </View>

        {sections.length === 0 ? (
          <Text style={styles.noResults} maxFontSizeMultiplier={1.5}>
            Nothing found for that. Try other words, or ask us below.
          </Text>
        ) : null}

        {sections.map((section) => (
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
                      onPress={() => toggle(topic)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={topic.q}
                      accessibilityState={{ expanded: isExpanded }}
                      accessibilityHint="Shows the answer"
                    >
                      <Text style={styles.topicQ} maxFontSizeMultiplier={1.5}>
                        {topic.q}
                      </Text>
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={colors.text3}
                        accessible={false}
                      />
                    </TouchableOpacity>
                    {isExpanded ? (
                      <View style={styles.topicAnswer}>
                        <Text style={styles.topicAnswerText} maxFontSizeMultiplier={1.5}>
                          {topic.a}
                        </Text>
                        {topic.goTo || topic.externalUrl ? (
                          <TouchableOpacity
                            style={styles.goBtn}
                            onPress={() => goThere(topic)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="Go there"
                            accessibilityHint={topic.externalUrl ? "Opens a web page" : "Opens the screen this answer is about"}
                          >
                            <Text style={styles.goBtnText} maxFontSizeMultiplier={1.3}>
                              Go there
                            </Text>
                            <Ionicons name="arrow-forward" size={16} color={colors.amber} accessible={false} />
                          </TouchableOpacity>
                        ) : null}
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
            onPress={() => router.push("/feedback" as never)}
            accessibilityRole="button"
            accessibilityLabel="Tell us about a problem or idea"
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.amber} accessible={false} />
            <Text style={styles.footerBtnText} maxFontSizeMultiplier={1.3}>
              Tell us about a problem or idea
            </Text>
          </TouchableOpacity>
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
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text1,
    paddingVertical: 12,
  },
  noResults: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
    lineHeight: 21,
  },
  goBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.amberDim,
  },
  goBtnText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.amber,
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
