import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useLayoutPrefs,
  SECTION_REGISTRY,
  SCREEN_LABELS,
  resetAllLayouts,
  type ScreenKey,
} from "../lib/layout/index";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const TEXT_3 = colors.text3;
const BG = colors.bg;
const RED = colors.red;

const SCREENS: ScreenKey[] = [
  "dashboard_work",
  "dashboard_personal",
  "profile",
  "avatar_menu",
];

const TAB_LABELS: Record<ScreenKey, string> = {
  dashboard_work: "Work",
  dashboard_personal: "Personal",
  profile: "Profile",
  avatar_menu: "Menu",
};

export default function CustomizeLayoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<ScreenKey>("dashboard_work");

  const handleResetAll = useCallback(() => {
    Alert.alert(
      "Reset All Layouts",
      "This will restore the default layout for all screens. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await resetAllLayouts();
            // Force reload by switching tabs
            setActiveTab("dashboard_personal");
            setTimeout(() => setActiveTab("dashboard_work"), 50);
            Alert.alert("Done", "All layouts have been reset to default.");
          },
        },
      ]
    );
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={TEXT_1} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Customize Layout</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {SCREENS.map((screen) => (
          <TouchableOpacity
            key={screen}
            style={[styles.tab, activeTab === screen && styles.tabActive]}
            onPress={() => setActiveTab(screen)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={`${TAB_LABELS[screen]} screen layout`}
            accessibilityState={{ selected: activeTab === screen }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === screen && styles.tabTextActive,
              ]}
            >
              {TAB_LABELS[screen]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Section list */}
      <SectionList key={activeTab} screen={activeTab} />

      {/* Reset all button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.resetBtn}
          onPress={handleResetAll}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Reset all layouts to default"
        >
          <Ionicons name="refresh-outline" size={16} color={RED} />
          <Text style={styles.resetText}>Reset All to Default</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SectionList({ screen }: { screen: ScreenKey }) {
  const { prefs, toggleVisibility, moveUp, moveDown, reset } =
    useLayoutPrefs(screen);
  const registry = SECTION_REGISTRY[screen];

  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenLabel}>{SCREEN_LABELS[screen]}</Text>
      <Text style={styles.screenHint}>
        Toggle sections on or off. Use arrows to reorder.
      </Text>

      {prefs.map((pref, idx) => {
        const section = registry.find((s) => s.key === pref.key);
        if (!section) return null;

        const isFirst = idx === 0;
        const isLast = idx === prefs.length - 1;
        const isLocked = section.locked === true;

        return (
          <View
            key={pref.key}
            style={[
              styles.item,
              !pref.visible && !isLocked && styles.itemHidden,
            ]}
          >
            {/* Move arrows */}
            <View style={styles.arrows}>
              <TouchableOpacity
                onPress={() => moveUp(pref.key)}
                disabled={isFirst || isLocked}
                hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                activeOpacity={0.5}
                accessibilityRole="button"
                accessibilityLabel={`Move ${section.label} up`}
                accessibilityState={{ disabled: isFirst || isLocked }}
              >
                <Ionicons
                  name="chevron-up"
                  size={18}
                  color={isFirst || isLocked ? "rgba(255,255,255,0.08)" : TEXT_2}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveDown(pref.key)}
                disabled={isLast || isLocked}
                hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                activeOpacity={0.5}
                accessibilityRole="button"
                accessibilityLabel={`Move ${section.label} down`}
                accessibilityState={{ disabled: isLast || isLocked }}
              >
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={isLast || isLocked ? "rgba(255,255,255,0.08)" : TEXT_2}
                />
              </TouchableOpacity>
            </View>

            {/* Icon */}
            <View style={styles.iconWrap}>
              <Ionicons
                name={isLocked ? "lock-closed" : (section.icon as any)}
                size={18}
                color={isLocked ? TEXT_3 : AMBER}
              />
            </View>

            {/* Label + description */}
            <View style={styles.labelWrap}>
              <Text
                style={[
                  styles.label,
                  !pref.visible && !isLocked && styles.labelHidden,
                ]}
              >
                {section.label}
              </Text>
              {section.description && (
                <Text style={styles.description}>{section.description}</Text>
              )}
            </View>

            {/* Toggle or lock badge */}
            {isLocked ? (
              <View style={styles.lockedBadge}>
                <Text style={styles.lockedText}>ALWAYS</Text>
              </View>
            ) : (
              <Switch
                value={pref.visible}
                onValueChange={() => toggleVisibility(pref.key)}
                trackColor={{ false: "#374151", true: AMBER }}
                thumbColor="#fff"
                style={styles.toggle}
                accessibilityLabel={`${section.label}: ${pref.visible ? "visible" : "hidden"}. Toggle visibility`}
              />
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={styles.resetScreenBtn}
        accessibilityRole="button"
        accessibilityLabel={`Reset ${SCREEN_LABELS[screen]} layout to default`}
        onPress={() => {
          Alert.alert(
            `Reset ${SCREEN_LABELS[screen]}`,
            "Restore default layout for this screen?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Reset",
                style: "destructive",
                onPress: () => reset(),
              },
            ]
          );
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="refresh-outline" size={14} color={TEXT_2} />
        <Text style={styles.resetScreenText}>
          Reset {TAB_LABELS[screen]} layout
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: CARD_BG,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  tabActive: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
    borderColor: "rgba(245, 166, 35, 0.4)",
  },
  tabText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  tabTextActive: {
    color: AMBER,
    fontFamily: fonts.semibold,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  screenLabel: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginBottom: 4,
  },
  screenHint: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 16,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  itemHidden: {
    opacity: 0.5,
  },
  arrows: {
    alignItems: "center",
    marginRight: 8,
    gap: 2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  labelWrap: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  labelHidden: {
    color: TEXT_2,
  },
  description: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 2,
  },
  lockedBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  lockedText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: TEXT_3,
    letterSpacing: 0.5,
  },
  toggle: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
  resetScreenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  resetScreenText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  resetText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: RED,
  },
});
