// AppHeader — the app's own header row for the tab screens.
//
// These screens used Apple's native navigation header until 13 Sep 2026.
// On iOS 26 UIKit draws a Liquid Glass capsule behind anything placed in a
// navigation bar button item, and it stretches: on Trips, Fuel, Earnings and
// Admin that capsule ran to the screen edge as a wide empty pill, shoving the
// wordmark against the left margin.
//
// It is drawn by the OS, not by us. Pinning the view's width does not stop it:
// AvatarMenuButton is already a fixed 36x36 and stretched anyway, which is how
// we know the cause is not our layout. react-native-screens 4.16, the version
// Expo SDK 54 pins, exposes no control over it, and `expo install --check`
// offers no newer in-SDK version.
//
// So the tab screens draw their own header instead. Ordinary React Native
// views, no UIKit involvement, identical on every screen and every iOS
// version. The tab group sets headerShown: false (see (tabs)/_layout.tsx).

import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AvatarMenuButton from "./AvatarMenuButton";
import { HeaderBackButton } from "./HeaderBackButton";

const ROUTE_LABELS: Record<string, string> = {
  "/trip-form": "Add trip",
  "/fuel-form": "Add fuel log",
  "/earning-form": "Add earning",
};

/**
 * @param title names the screen. There is no bottom tab bar in this app, so
 * without it nothing on screen says where you are. The dashboard omits it and
 * shows the wordmark instead, since it is home.
 * @param showBack shows a back chevron. Trips, Fuel and Earnings are opened
 * with `replace`, so there is no history to pop — HeaderBackButton routes
 * through `safeBack`, which falls back to the dashboard rather than dead-end.
 * @param addRoute when set, shows a "+" that opens this form route. Trips,
 * Fuel and Earnings use it; Dashboard, Profile and Admin do not.
 */
export default function AppHeader({
  title,
  showBack,
  addRoute,
}: {
  title?: string;
  showBack?: boolean;
  addRoute?: string;
}) {
  const router = useRouter();
  // expo-router mounts SafeAreaProvider itself (see ExpoRoot), so insets are
  // available without any extra provider in our tree.
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.left}>
        {showBack && <HeaderBackButton />}
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)/dashboard" as any)}
            activeOpacity={0.7}
            style={styles.brand}
            accessibilityRole="button"
            accessibilityLabel="Go to dashboard"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Image
              source={require("../assets/branding/logo-original.png")}
              style={styles.brandIcon}
              resizeMode="contain"
              accessible={false}
            />
            <Text style={styles.brandWhite}>Mile</Text>
            <Text style={styles.brandAmber}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.right}>
        {addRoute && (
          <TouchableOpacity
            onPress={() => router.push(addRoute as any)}
            hitSlop={8}
            style={styles.addBtn}
            accessibilityRole="button"
            accessibilityLabel={ROUTE_LABELS[addRoute] ?? "Add"}
          >
            <Ionicons name="add" size={20} color="#f5a623" accessible={false} />
          </TouchableOpacity>
        )}
        <AvatarMenuButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "#030712",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginRight: 8,
  },
  brandWhite: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  brandAmber: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(245,166,35,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
});
