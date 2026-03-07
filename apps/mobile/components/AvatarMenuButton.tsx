import { useState, useCallback, useMemo } from "react";
import {
  Pressable,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth/context";
import { useUser } from "../lib/user/context";
import { UserAvatar } from "./avatars/AvatarRegistry";
import { useLayoutPrefs } from "../lib/layout/index";

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const CARD_BG = "#0a1120";
const SHEET_BG = "#0a1120";

// ── Menu item definitions ──────────────────────────────────────────

interface MenuItem {
  key: string;
  label: string;
  route: string;
  icon: string;
  replace?: boolean;
  badge?: string;
}

const MENU_ITEMS: Record<string, MenuItem> = {
  menu_dashboard: { key: "menu_dashboard", label: "Dashboard", route: "/(tabs)/dashboard", icon: "speedometer-outline", replace: true },
  menu_trips: { key: "menu_trips", label: "Trips", route: "/(tabs)/trips", icon: "car-outline", replace: true },
  menu_fuel: { key: "menu_fuel", label: "Fuel", route: "/(tabs)/fuel", icon: "water-outline", replace: true },
  menu_earnings: { key: "menu_earnings", label: "Earnings", route: "/(tabs)/earnings", icon: "cash-outline", replace: true },
  menu_insights: { key: "menu_insights", label: "Insights", route: "/insights", icon: "stats-chart-outline" },
  menu_analytics: { key: "menu_analytics", label: "Analytics", route: "/analytics", icon: "bar-chart-outline" },
  menu_exports: { key: "menu_exports", label: "Tax Exports", route: "/exports", icon: "download-outline", badge: "PRO" },
  menu_suggestions: { key: "menu_suggestions", label: "Suggestions", route: "/feedback", icon: "bulb-outline" },
  menu_schedule: { key: "menu_schedule", label: "Work Schedule", route: "/work-schedule", icon: "time-outline" },
};

// Group definitions — items render in layout-pref order within each group
const GROUPS = [
  { id: "nav", label: "NAVIGATE", keys: ["menu_dashboard", "menu_trips", "menu_fuel", "menu_earnings"] },
  { id: "tools", label: "TOOLS", keys: ["menu_insights", "menu_analytics", "menu_exports", "menu_suggestions", "menu_schedule"] },
];

// ── Component ──────────────────────────────────────────────────────

export default function AvatarMenuButton() {
  const { user } = useUser();
  const { logout } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [menuVisible, setMenuVisible] = useState(false);
  const menuLayout = useLayoutPrefs("avatar_menu");

  const currentSegment = (segments as string[])[1] ?? "dashboard";

  const handleNav = useCallback(
    (route: string, replace?: boolean) => {
      setMenuVisible(false);
      setTimeout(() => {
        if (replace) {
          router.replace(route as any);
        } else {
          router.push(route as any);
        }
      }, 100);
    },
    [router]
  );

  const handleLogout = useCallback(() => {
    setMenuVisible(false);
    logout();
  }, [logout]);

  const isActive = (route: string) => {
    const routeSegment = route.split("/").pop();
    return routeSegment === currentSegment;
  };

  // Build grouped items respecting layout visibility + ordering
  const visibleSet = useMemo(
    () => new Set(menuLayout.visibleKeys),
    [menuLayout.visibleKeys]
  );

  const displayName = user?.displayName || user?.email?.split("@")[0] || "";
  const shortName = displayName.length > 10
    ? displayName.slice(0, 10)
    : displayName;

  return (
    <>
      <View style={styles.headerRow}>
        {/* Username — taps to profile */}
        <Pressable
          onPress={() => router.push("/(tabs)/profile" as any)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          accessibilityRole="button"
          accessibilityLabel={`${shortName}, go to profile`}
        >
          <Text style={styles.headerName} numberOfLines={1}>{shortName}</Text>
        </Pressable>

        {/* Avatar — taps to open menu */}
        <Pressable
          onPress={() => setMenuVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
        >
          <UserAvatar
            avatarId={user?.avatarId}
            name={user?.displayName}
            email={user?.email}
            size={32}
          />
        </Pressable>
      </View>

      {/* ── Bottom Sheet Menu ── */}
      {menuVisible && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setMenuVisible(false)}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => setMenuVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          >
            <View
              style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}
              onStartShouldSetResponder={() => true}
              accessibilityViewIsModal
            >
              {/* Handle */}
              <View style={styles.handle} />

              {/* User card */}
              {user && (
                <TouchableOpacity
                  style={styles.userCard}
                  onPress={() => handleNav("/(tabs)/profile", true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${user.displayName || "Driver"}, ${user.email}. Go to profile`}
                >
                  <UserAvatar
                    avatarId={user.avatarId}
                    name={user.displayName}
                    email={user.email}
                    size={44}
                  />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {user.displayName || "Driver"}
                    </Text>
                    <Text style={styles.userEmail} numberOfLines={1}>
                      {user.email}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={TEXT_3} />
                </TouchableOpacity>
              )}

              <ScrollView
                style={styles.scrollArea}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {/* Grouped menu items */}
                {GROUPS.map((group) => {
                  const items = group.keys
                    .filter((k) => visibleSet.has(k) && MENU_ITEMS[k])
                    .sort((a, b) => {
                      const ai = menuLayout.visibleKeys.indexOf(a);
                      const bi = menuLayout.visibleKeys.indexOf(b);
                      return ai - bi;
                    })
                    .map((k) => MENU_ITEMS[k]);

                  if (items.length === 0) return null;

                  return (
                    <View key={group.id} style={styles.group}>
                      <Text style={styles.groupLabel}>{group.label}</Text>
                      <View style={styles.groupCard}>
                        {items.map((item, idx) => (
                          <TouchableOpacity
                            key={item.key}
                            style={[
                              styles.menuItem,
                              isActive(item.route) && styles.menuItemActive,
                              idx < items.length - 1 && styles.menuItemBorder,
                            ]}
                            onPress={() => handleNav(item.route, item.replace)}
                            activeOpacity={0.6}
                            accessibilityRole="menuitem"
                            accessibilityLabel={item.badge ? `${item.label} — ${item.badge}` : item.label}
                            accessibilityState={{ selected: isActive(item.route) }}
                          >
                            <View style={[
                              styles.iconCircle,
                              isActive(item.route) && styles.iconCircleActive,
                            ]}>
                              <Ionicons
                                name={item.icon as any}
                                size={18}
                                color={isActive(item.route) ? AMBER : TEXT_2}
                              />
                            </View>
                            <Text style={[
                              styles.menuLabel,
                              isActive(item.route) && styles.menuLabelActive,
                            ]}>
                              {item.label}
                            </Text>
                            {item.badge && (
                              <View style={styles.badge}>
                                <Text style={styles.badgeText}>{item.badge}</Text>
                              </View>
                            )}
                            {isActive(item.route) && (
                              <View style={styles.activeDot} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })}

                {/* Admin */}
                {user?.isAdmin && (
                  <View style={styles.group}>
                    <Text style={styles.groupLabel}>ADMIN</Text>
                    <View style={styles.groupCard}>
                      <TouchableOpacity
                        style={[
                          styles.menuItem,
                          isActive("/(tabs)/admin") && styles.menuItemActive,
                        ]}
                        onPress={() => handleNav("/(tabs)/admin", true)}
                        activeOpacity={0.6}
                        accessibilityRole="menuitem"
                        accessibilityLabel="Admin Panel"
                        accessibilityState={{ selected: isActive("/(tabs)/admin") }}
                      >
                        <View style={[
                          styles.iconCircle,
                          { backgroundColor: "rgba(239, 68, 68, 0.1)" },
                        ]}>
                          <Ionicons name="shield-outline" size={18} color="#ef4444" />
                        </View>
                        <Text style={[
                          styles.menuLabel,
                          isActive("/(tabs)/admin") && styles.menuLabelActive,
                        ]}>
                          Admin Panel
                        </Text>
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminBadgeText}>ADMIN</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Logout */}
                <TouchableOpacity
                  style={styles.logoutBtn}
                  onPress={handleLogout}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel="Log out"
                >
                  <Ionicons name="log-out-outline" size={18} color="#ef4444" />
                  <Text style={styles.logoutLabel}>Log out</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header trigger
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginRight: 8,
  },
  headerName: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    maxWidth: 100,
  },
  // Bottom sheet
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    maxHeight: "85%",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.06)",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 12,
  },

  // User card
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    padding: 14,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 8,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
  },
  userEmail: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 1,
  },

  // Scroll area
  scrollArea: {
    paddingHorizontal: 16,
  },

  // Groups
  group: {
    marginTop: 12,
  },
  groupLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_3,
    letterSpacing: 1,
    marginBottom: 6,
    marginLeft: 4,
  },
  groupCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  // Menu items
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
  },
  menuItemActive: {
    backgroundColor: "rgba(245, 166, 35, 0.05)",
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
    alignItems: "center",
  },
  iconCircleActive: {
    backgroundColor: "rgba(245, 166, 35, 0.1)",
  },
  menuLabel: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
    flex: 1,
  },
  menuLabelActive: {
    color: AMBER,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AMBER,
  },
  badge: {
    backgroundColor: AMBER,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
    letterSpacing: 0.3,
  },

  // Admin
  adminBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  adminBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#ef4444",
    letterSpacing: 0.3,
  },

  // Logout
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.12)",
  },
  logoutLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#ef4444",
  },
});
