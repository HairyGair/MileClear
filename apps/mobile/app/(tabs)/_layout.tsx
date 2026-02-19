import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="dashboard"
        options={{ title: "Dashboard" }}
      />
      <Tabs.Screen
        name="trips"
        options={{ title: "Trips" }}
      />
      <Tabs.Screen
        name="fuel"
        options={{ title: "Fuel" }}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: "Earnings" }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile" }}
      />
    </Tabs>
  );
}
