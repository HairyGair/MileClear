import { useState, useCallback } from "react";
import {
  Pressable,
  Text,
  View,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth/context";
import { useUser } from "../lib/user/context";
import { AvatarIcon } from "./avatars/AvatarRegistry";

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const CARD_BG = "#0c1425";

export default function AvatarMenuButton() {
  const { user } = useUser();
  const { logout } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [menuVisible, setMenuVisible] = useState(false);

  const initial = user
    ? (user.displayName || user.email)[0].toUpperCase()
    : "?";

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

  const navItems = [
    { label: "Dashboard", route: "/(tabs)/dashboard", icon: "speedometer-outline", replace: true },
    { label: "Trips", route: "/(tabs)/trips", icon: "car-outline", replace: true },
    { label: "Fuel", route: "/(tabs)/fuel", icon: "water-outline", replace: true },
    { label: "Earnings", route: "/(tabs)/earnings", icon: "cash-outline", replace: true },
  ];

  const secondaryItems = [
    { label: "Profile", route: "/(tabs)/profile", icon: "person-outline", replace: true },
    { label: "Tax Exports", route: "/exports", icon: "download-outline", badge: "PRO" },
    { label: "Edit Profile", route: "/profile-edit", icon: "create-outline" },
    { label: "Suggestions", route: "/feedback", icon: "bulb-outline" },
  ];

  return (
    <>
      <Pressable
        onPress={() => setMenuVisible(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginRight: 8 })}
      >
        {user?.avatarId ? (
          <AvatarIcon avatarId={user.avatarId} size={32} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.initial}>{initial}</Text>
          </View>
        )}
      </Pressable>

      {menuVisible && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => setMenuVisible(false)}
          >
            <View style={[styles.card, { top: insets.top + 52 }]}>
              {/* User info */}
              {user && (
                <View style={styles.userSection}>
                  {user.avatarId ? (
                    <AvatarIcon avatarId={user.avatarId} size={36} />
                  ) : (
                    <View style={styles.userAvatar}>
                      <Text style={styles.userAvatarText}>
                        {(user.displayName || user.email)[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {user.displayName || "Driver"}
                    </Text>
                    <Text style={styles.userEmail} numberOfLines={1}>
                      {user.email}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.separator} />

              {/* Nav items */}
              {navItems.map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuItem, isActive(item.route) && styles.menuItemActive]}
                  onPress={() => handleNav(item.route, item.replace)}
                  activeOpacity={0.7}
                >
                  {isActive(item.route) && <View style={styles.activeIndicator} />}
                  <Ionicons
                    name={item.icon as any}
                    size={18}
                    color={isActive(item.route) ? AMBER : TEXT_2}
                  />
                  <Text style={[styles.menuLabel, isActive(item.route) && styles.menuLabelActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}

              <View style={styles.separator} />

              {/* Secondary items */}
              {secondaryItems.map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuItem, isActive(item.route) && styles.menuItemActive]}
                  onPress={() => handleNav(item.route, (item as any).replace)}
                  activeOpacity={0.7}
                >
                  {isActive(item.route) && <View style={styles.activeIndicator} />}
                  <Ionicons
                    name={item.icon as any}
                    size={18}
                    color={isActive(item.route) ? AMBER : TEXT_2}
                  />
                  <Text style={[styles.menuLabel, isActive(item.route) && styles.menuLabelActive]}>
                    {item.label}
                  </Text>
                  {(item as any).badge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{(item as any).badge}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}

              {/* Admin */}
              {user?.isAdmin && (
                <>
                  <View style={styles.separator} />
                  <TouchableOpacity
                    style={[styles.menuItem, isActive("/(tabs)/admin") && styles.menuItemActive]}
                    onPress={() => handleNav("/(tabs)/admin", true)}
                    activeOpacity={0.7}
                  >
                    {isActive("/(tabs)/admin") && <View style={styles.activeIndicator} />}
                    <Ionicons
                      name="shield-outline"
                      size={18}
                      color={isActive("/(tabs)/admin") ? AMBER : TEXT_2}
                    />
                    <Text style={[styles.menuLabel, isActive("/(tabs)/admin") && styles.menuLabelActive]}>
                      Admin
                    </Text>
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>ADMIN</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.separator} />

              {/* Logout */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <Ionicons name="log-out-outline" size={18} color="#ef4444" />
                <Text style={styles.logoutLabel}>Log out</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f5a623",
    justifyContent: "center",
    alignItems: "center",
  },
  initial: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  card: {
    position: "absolute",
    right: 12,
    width: 240,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
  },
  userSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AMBER,
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatarText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  userEmail: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 1,
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 4,
    marginHorizontal: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  menuItemActive: {
    backgroundColor: "rgba(245, 166, 35, 0.06)",
  },
  activeIndicator: {
    position: "absolute",
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: AMBER,
  },
  menuLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
    flex: 1,
  },
  menuLabelActive: {
    color: AMBER,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  badge: {
    backgroundColor: AMBER,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
    letterSpacing: 0.3,
  },
  logoutLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#ef4444",
    flex: 1,
  },
  adminBadge: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  adminBadgeText: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    letterSpacing: 0.3,
  },
});
