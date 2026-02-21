import { useEffect, useState, useCallback } from "react";
import { Redirect, Stack } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import * as Font from "expo-font";
import {
  PlusJakartaSans_300Light,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { AuthProvider, useAuth } from "../lib/auth/context";

const HEADER_STYLE = { backgroundColor: "#030712" } as const;
const HEADER_TINT = "#f0f2f5";
const HEADER_TITLE_STYLE = { fontFamily: "PlusJakartaSans_300Light", color: "#f0f2f5" };

function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#030712" }}>
        <ActivityIndicator size="large" color="#f5a623" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: HEADER_STYLE,
        headerTintColor: HEADER_TINT,
        headerTitleStyle: HEADER_TITLE_STYLE,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="(tabs)"
        redirect={!isAuthenticated}
      />
      <Stack.Screen
        name="(auth)"
        redirect={isAuthenticated}
      />
      <Stack.Screen
        name="trip-form"
        options={{ headerShown: true, title: "Trip" }}
      />
      <Stack.Screen
        name="vehicle-form"
        options={{ headerShown: true, title: "Vehicle" }}
      />
      <Stack.Screen
        name="earning-form"
        options={{ headerShown: true, title: "Earning" }}
      />
      <Stack.Screen
        name="fuel-form"
        options={{ headerShown: true, title: "Fuel Log" }}
      />
      <Stack.Screen
        name="profile-edit"
        options={{ headerShown: true, title: "Edit Profile" }}
      />
      <Stack.Screen
        name="exports"
        options={{ headerShown: true, title: "Tax Exports" }}
      />
      <Stack.Screen
        name="achievements"
        options={{ headerShown: true, title: "Achievements" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    Font.loadAsync({
      PlusJakartaSans_300Light,
      PlusJakartaSans_400Regular,
      PlusJakartaSans_500Medium,
      PlusJakartaSans_600SemiBold,
      PlusJakartaSans_700Bold,
    }).then(() => setFontsLoaded(true))
      .catch(() => setFontsLoaded(true)); // Continue even if fonts fail
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#030712" }}>
        <ActivityIndicator size="large" color="#f5a623" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
