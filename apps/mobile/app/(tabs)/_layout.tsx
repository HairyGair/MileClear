import { Tabs } from "expo-router";
import { View, Text, StyleSheet, Platform } from "react-native";
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
  },
  iconEarnings: {
    fontSize: 20,
    fontWeight: "700",
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

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
          fontWeight: "600",
          letterSpacing: 0.3,
          marginTop: -2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
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
        }}
      />
      <Tabs.Screen
        name="fuel"
        options={{
          title: "Fuel",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="fuel" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="earnings" focused={focused} />
          ),
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
