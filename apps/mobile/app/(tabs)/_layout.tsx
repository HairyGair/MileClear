// The screens in this group draw their own header (components/AppHeader)
// rather than using Apple's navigation bar. The reason is documented at the
// top of AppHeader.tsx: on iOS 26 UIKit stretches a Liquid Glass capsule
// behind navigation bar button items, and nothing in our layout controls it.
//
// Note this is a plain Stack, not Tabs. There is no bottom tab bar in this
// app; the avatar menu is the only navigation between these screens.

import { Stack } from "expo-router";

export default function TabLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
      }}
    >
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="trips" />
      <Stack.Screen name="fuel" />
      <Stack.Screen name="earnings" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="admin" />
    </Stack>
  );
}
