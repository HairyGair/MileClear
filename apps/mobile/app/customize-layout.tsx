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
        >
          <Ionicons name="chevron-back" size={24} color="#f0f2f5" />
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

      {/* Reset button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.resetBtn}
          onPress={handleResetAll}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={16} color="#ef4444" />
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

        return (
          <View
            key={pref.key}
            style={[
              styles.item,
              !pref.visible && !section.locked && styles.itemHidden,
            ]}
          >
            {/* Move arrows */}
            <View style={styles.arrows}>
              <TouchableOpacity
                onPress={() => moveUp(pref.key)}
                disabled={isFirst}
                hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                activeOpacity={0.5}
              >
                <Ionicons
                  name="chevron-up"
                  size={18}
                  color={isFirst ? "#1f2937" : "#8494a7"}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveDown(pref.key)}
                disabled={isLast}
                hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                activeOpacity={0.5}
              >
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={isLast ? "#1f2937" : "#8494a7"}
                />
              </TouchableOpacity>
            </View>

            {/* Icon */}
            <View style={styles.iconWrap}>
              <Ionicons
                name={
                  section.locked
                    ? "lock-closed"
                    : (section.icon as any)
                }
                size={18}
                color={section.locked ? "#6b7280" : "#f5a623"}
              />
            </View>

            {/* Label + description */}
            <View style={styles.labelWrap}>
              <Text
                style={[
                  styles.label,
                  !pref.visible && !section.locked && styles.labelHidden,
                ]}
              >
                {section.label}
              </Text>
              {section.description && (
                <Text style={styles.description}>{section.description}</Text>
              )}
            </View>

            {/* Toggle or lock badge */}
            {section.locked ? (
              <View style={styles.lockedBadge}>
                <Text style={styles.lockedText}>ALWAYS</Text>
              </View>
            ) : (
              <Switch
                value={pref.visible}
                onValueChange={() => toggleVisibility(pref.key)}
                trackColor={{ false: "#374151", true: "#f5a623" }}
                thumbColor="#fff"
                style={styles.toggle}
              />
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={styles.resetScreenBtn}
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
        <Ionicons name="refresh-outline" size={14} color="#8494a7" />
        <Text style={styles.resetScreenText}>
          Reset {TAB_LABELS[screen]} layout
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const AMBER = "#f5a623";
const CARD_BG = "#0a1120";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },
  tabTextActive: {
    color: AMBER,
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    marginBottom: 4,
  },
  screenHint: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  labelHidden: {
    color: TEXT_2,
  },
  description: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#4a5568",
    marginTop: 2,
  },
  lockedBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  lockedText: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#6b7280",
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
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#ef4444",
  },
});
