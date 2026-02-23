import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth/context";
import { useUser } from "../lib/user/context";

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const CARD_BG = "#0c1425";

interface MenuItem {
  label: string;
  route?: string;
  icon: string;
  action?: () => void;
  badge?: string;
  isReplace?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AvatarDropdownMenu({ visible, onClose }: Props) {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { user } = useUser();

  const currentSegment = (segments as string[])[1] ?? "dashboard";

  const navItems: MenuItem[] = [
    { label: "Dashboard", route: "/(tabs)/dashboard", icon: "speedometer-outline", isReplace: true },
    { label: "Trips", route: "/(tabs)/trips", icon: "car-outline", isReplace: true },
    { label: "Fuel", route: "/(tabs)/fuel", icon: "water-outline", isReplace: true },
    { label: "Earnings", route: "/(tabs)/earnings", icon: "cash-outline", isReplace: true },
  ];

  const secondaryItems: MenuItem[] = [
    { label: "Profile", route: "/(tabs)/profile", icon: "person-outline", isReplace: true },
    { label: "Tax Exports", route: "/exports", icon: "download-outline", badge: "PRO" },
    { label: "Edit Profile", route: "/profile-edit", icon: "create-outline" },
  ];

  const handleNav = (item: MenuItem) => {
    onClose();
    if (item.action) {
      item.action();
      return;
    }
    if (item.route) {
      if (item.isReplace) {
        router.replace(item.route as any);
      } else {
        router.push(item.route as any);
      }
    }
  };

  const handleLogout = () => {
    onClose();
    logout();
  };

  const isActive = (route?: string) => {
    if (!route) return false;
    const routeSegment = route.split("/").pop();
    return routeSegment === currentSegment;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { top: insets.top + 52 }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* User info */}
          {user && (
            <View style={styles.userSection}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {(user.displayName || user.email)[0].toUpperCase()}
                </Text>
              </View>
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

          {/* Navigation items */}
          {navItems.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, isActive(item.route) && styles.menuItemActive]}
              onPress={() => handleNav(item)}
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
              onPress={() => handleNav(item)}
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
              {item.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}

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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
});
