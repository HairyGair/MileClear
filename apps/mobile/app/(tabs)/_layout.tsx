import { Tabs, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_ICONS: Record<string, string> = {
  dashboard: "\u25C9",  // ◉
  trips: "\u2630",      // ☰
  fuel: "\u2B22",       // ⬢
  earnings: "\u00A3",   // £
  profile: "\u2B24",    // ⬤
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icon = TAB_ICONS[name] ?? "\u25CB";
  return (
    <View style={tabIconStyles.wrap}>
      <Text
        style={[
          tabIconStyles.icon,
          name === "earnings" && tabIconStyles.iconEarnings,
          focused && tabIconStyles.iconActive,
        ]}
      >
        {icon}
      </Text>
      {focused && <View style={tabIconStyles.dot} />}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    height: 32,
  },
  icon: {
    fontSize: 18,
    color: "#4b5563",
    fontFamily: "PlusJakartaSans_400Regular",
  },
  iconEarnings: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  iconActive: {
    color: "#f5a623",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#f5a623",
    marginTop: 3,
  },
});

function HeaderAddButton({ route }: { route: string }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push(route as any)}
      hitSlop={8}
      style={headerStyles.addBtn}
    >
      <Text style={headerStyles.addBtnText}>+</Text>
    </TouchableOpacity>
  );
}

const headerStyles = StyleSheet.create({
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(245,166,35,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  addBtnText: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#f5a623",
    lineHeight: 22,
  },
});

const HEADER_BG = { backgroundColor: "#030712" } as const;

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: HEADER_BG,
        headerTintColor: "#f0f2f5",
        headerTitleStyle: { fontFamily: "PlusJakartaSans_300Light", color: "#f0f2f5" },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: "#060d1b",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: "rgba(255,255,255,0.06)",
          height: 52 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
            },
            android: {
              elevation: 12,
            },
          }),
        },
        tabBarActiveTintColor: "#f5a623",
        tabBarInactiveTintColor: "#4b5563",
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "PlusJakartaSans_600SemiBold",
          letterSpacing: 0.3,
          marginTop: -2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          headerShown: false,
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="dashboard" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: "Trips",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="trips" focused={focused} />
          ),
          headerRight: () => <HeaderAddButton route="/trip-form" />,
        }}
      />
      <Tabs.Screen
        name="fuel"
        options={{
          title: "Fuel",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="fuel" focused={focused} />
          ),
          headerRight: () => <HeaderAddButton route="/fuel-form" />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="earnings" focused={focused} />
          ),
          headerRight: () => <HeaderAddButton route="/earning-form" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
