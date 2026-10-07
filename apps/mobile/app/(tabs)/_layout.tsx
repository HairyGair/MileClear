// Bottom tab bar for the main screens: Home, Trips, Tax (Work) or Insights
// (Personal), and More. Everything else the old avatar menu held is on the
// More tab (more.tsx) or the Tax tab (tax.tsx).
//
// This is the JS Tabs navigator, not native tabs, for the same reason the
// screens draw their own AppHeader: on iOS 26 the native bar is a Liquid
// Glass bar we can't style, and it would sit under our own solid header.
// Every screen in this group still sets headerShown: false and draws
// <AppHeader /> itself (see the top of components/AppHeader.tsx).
//
// Fuel, Earnings, Profile and Admin stay in the group as hidden tabs
// (href: null): no tab button, but `/(tabs)/fuel` and friends still resolve,
// so every existing link and notification route keeps working. Tax and
// Insights swap places with the work/personal mode in the same way.

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text } from "react-native";
import { Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useMode } from "../../lib/mode/context";
import { fetchUnclassifiedCount } from "../../lib/api/trips";
import { colors, fonts, tabBar } from "../../lib/theme";

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  active,
  inactive,
  focused,
  color,
}: {
  active: IconName;
  inactive: IconName;
  focused: boolean;
  color: string;
}) {
  return (
    <Ionicons
      name={focused ? active : inactive}
      size={tabBar.icon}
      color={color}
      accessible={false}
    />
  );
}

function TabLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      style={{
        color,
        fontSize: tabBar.label,
        fontFamily: fonts.semibold,
        letterSpacing: 0.1,
      }}
      numberOfLines={1}
      maxFontSizeMultiplier={1.2}
    >
      {label}
    </Text>
  );
}

// Render-prop factories for the navigator options; the real components are above.
const tabIcon =
  (active: IconName, inactive: IconName) =>
  // eslint-disable-next-line react/display-name
  ({ focused, color }: { focused: boolean; color: string }) =>
    <TabIcon active={active} inactive={inactive} focused={focused} color={color} />;

const tabLabel =
  (label: string) =>
  // eslint-disable-next-line react/display-name
  ({ color }: { focused: boolean; color: string }) =>
    <TabLabel label={label} color={color} />;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isWork } = useMode();
  const segments = useSegments();
  const [unclassified, setUnclassified] = useState(0);
  const mounted = useRef(true);

  const refreshCount = useCallback(() => {
    fetchUnclassifiedCount()
      .then((res) => {
        if (mounted.current) setUnclassified(res.count ?? 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Refresh when the driver lands on a tab (they may just have classified
  // trips) and when the app comes back to the foreground. Throttled so
  // opening and closing trip-form does not hit the API each time.
  const lastFetch = useRef(0);
  const throttledRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastFetch.current < 30000) return;
    lastFetch.current = now;
    refreshCount();
  }, [refreshCount]);

  const tabKey = (segments as string[])[0] === "(tabs)" ? (segments as string[])[1] ?? "" : null;
  useEffect(() => {
    if (tabKey !== null) throttledRefresh();
  }, [tabKey, throttledRefresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") throttledRefresh();
    });
    return () => sub.remove();
  }, [throttledRefresh]);

  return (
    <Tabs
      backBehavior="history"
      screenListeners={{
        tabPress: () => {
          try {
            Haptics.selectionAsync().catch(() => {});
          } catch {}
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarLabelPosition: "below-icon",
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.text2,
        tabBarIconStyle: { marginBottom: 2 },
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopWidth: 0.5,
          borderTopColor: colors.hairline,
          elevation: 0,
          shadowOpacity: 0,
          height: tabBar.contentHeight + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.amber,
          color: colors.bg,
          fontSize: 11,
          fontFamily: fonts.bold,
          minWidth: 18,
          height: 18,
          lineHeight: 15,
          borderRadius: 9,
          paddingHorizontal: 5,
          borderWidth: 2,
          borderColor: colors.bg,
          top: -4,
          end: -10,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarLabel: tabLabel("Home"),
          tabBarIcon: tabIcon("home", "home-outline"),
          tabBarAccessibilityLabel: "Home",
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: "Trips",
          tabBarLabel: tabLabel("Trips"),
          tabBarIcon: tabIcon("car", "car-outline"),
          tabBarBadge:
            unclassified > 0 ? (unclassified > 99 ? "99+" : unclassified) : undefined,
          tabBarAccessibilityLabel:
            unclassified > 0 ? `Trips, ${unclassified} to classify` : "Trips",
        }}
      />
      <Tabs.Screen
        name="tax"
        options={{
          title: "Tax",
          href: isWork ? undefined : null,
          tabBarLabel: tabLabel("Tax"),
          tabBarIcon: tabIcon("document-text", "document-text-outline"),
          tabBarAccessibilityLabel: "Tax",
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          href: isWork ? null : undefined,
          tabBarLabel: tabLabel("Insights"),
          tabBarIcon: tabIcon("stats-chart", "stats-chart-outline"),
          tabBarAccessibilityLabel: "Insights",
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarLabel: tabLabel("More"),
          tabBarIcon: tabIcon("ellipsis-horizontal-circle", "ellipsis-horizontal-circle-outline"),
          tabBarAccessibilityLabel: "More",
        }}
      />
      <Tabs.Screen name="fuel" options={{ href: null }} />
      <Tabs.Screen name="earnings" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="admin" options={{ href: null }} />
    </Tabs>
  );
}
