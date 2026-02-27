import React, { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator, LogBox, ScrollView, Alert } from "react-native";
import { Stack } from "expo-router";

// DEBUG: Catch all uncaught JS errors as a native alert — visible even on white screen
// Remove this block once the production crash is identified
const _originalHandler = (globalThis as any).ErrorUtils?.getGlobalHandler?.();
(globalThis as any).ErrorUtils?.setGlobalHandler?.((error: any, isFatal: boolean) => {
  try {
    Alert.alert(
      isFatal ? "Fatal JS Error" : "JS Error",
      String(error?.message || error).slice(0, 500),
      [{ text: "OK" }]
    );
  } catch {}
  _originalHandler?.(error, isFatal);
});
import * as Font from "expo-font";
import {
  PlusJakartaSans_300Light,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";

LogBox.ignoreLogs(["Not Found"]);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Root ErrorBoundary caught:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: "#030712", padding: 40, justifyContent: "center" }}>
          <Text style={{ color: "#ef4444", fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>App Crash</Text>
          <ScrollView>
            <Text style={{ color: "#f0f2f5", fontSize: 13, lineHeight: 20 }}>{this.state.error?.message}</Text>
            <Text style={{ color: "#6b7280", fontSize: 11, marginTop: 12, lineHeight: 16 }}>{this.state.error?.stack?.slice(0, 800)}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

import { AuthProvider, useAuth } from "../lib/auth/context";
import { UserProvider } from "../lib/user/context";
import { ModeProvider } from "../lib/mode/context";
import { SyncProvider } from "../lib/sync/context";
import { SyncStatusBar } from "../components/SyncStatusBar";
import { HydrationOverlay } from "../components/HydrationOverlay";
import "../lib/tracking/detection";
import {
  requestNotificationPermissions,
  setupNotificationResponseHandler,
  registerForPushNotifications,
} from "../lib/notifications/index";
import { setupNotificationChannels, scheduleWeeklyMileageSummary, scheduleTaxYearDeadlineReminder, checkUnclassifiedTripsNudge, checkStreakAtRisk, checkLongRunningShift } from "../lib/notifications/scheduler";
import { registerPushToken } from "../lib/api/notifications";
import { startDriveDetection } from "../lib/tracking/detection";
import { getDatabase } from "../lib/db/index";
import { hydrateLocalData, isHydrationComplete } from "../lib/sync/hydrate";

const HEADER_STYLE = { backgroundColor: "#030712" } as const;
const HEADER_TINT = "#f0f2f5";
const HEADER_TITLE_STYLE = { fontFamily: "PlusJakartaSans_300Light", color: "#f0f2f5" };

function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setOnboardingChecked(true);
      return;
    }
    getDatabase()
      .then(async (db) => {
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'onboarding_complete'"
        );
        if (row?.value === "true") {
          setOnboardingComplete(true);
        } else {
          // Auto-complete onboarding for returning users on fresh installs
          await db.runAsync(
            "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('onboarding_complete', 'true')"
          );
          setOnboardingComplete(true);
        }
        setOnboardingChecked(true);
      })
      .catch(() => {
        setOnboardingComplete(false);
        setOnboardingChecked(true);
      });
  }, [isAuthenticated]);

  const [hydrating, setHydrating] = useState(false);
  const [hydrateStep, setHydrateStep] = useState("Preparing...");
  const [hydrateDone, setHydrateDone] = useState(0);
  const hydrateRan = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || isLoading || hydrateRan.current) return;
    hydrateRan.current = true;
    isHydrationComplete().then((done) => {
      if (done) return;
      setHydrating(true);

      // Safety timeout — don't let hydration hang the app forever
      const timeout = setTimeout(() => {
        console.warn("Hydration timed out after 30s, continuing anyway");
        setHydrating(false);
      }, 30000);

      hydrateLocalData((step, stepDone) => {
        setHydrateStep(step);
        setHydrateDone(stepDone);
      })
        .catch(console.error)
        .finally(() => {
          clearTimeout(timeout);
          setHydrating(false);
        });
    });
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      startDriveDetection();
      registerForPushNotifications()
        .then((token) => { if (token) return registerPushToken(token); })
        .catch(() => {});
      scheduleWeeklyMileageSummary().catch(() => {});
      scheduleTaxYearDeadlineReminder().catch(() => {});
      checkUnclassifiedTripsNudge().catch(() => {});
      checkStreakAtRisk().catch(() => {});
      checkLongRunningShift().catch(() => {});
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading || !onboardingChecked) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#030712" }}>
        <ActivityIndicator size="large" color="#f5a623" />
      </View>
    );
  }

  return (
    <>
      {isAuthenticated && <SyncStatusBar />}
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: HEADER_STYLE,
          headerTintColor: HEADER_TINT,
          headerTitleStyle: HEADER_TITLE_STYLE,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="onboarding" redirect={!isAuthenticated || onboardingComplete} />
        <Stack.Screen name="(tabs)" redirect={!isAuthenticated || !onboardingComplete} />
        <Stack.Screen name="(auth)" redirect={isAuthenticated} />
        <Stack.Screen name="trip-form" options={{ headerShown: true, title: "Add Trip" }} />
        <Stack.Screen name="quick-trip" options={{ headerShown: true, title: "Quick Trip" }} />
        <Stack.Screen name="vehicle-form" options={{ headerShown: true, title: "Add Vehicle" }} />
        <Stack.Screen name="earning-form" options={{ headerShown: true, title: "Add Earning" }} />
        <Stack.Screen name="fuel-form" options={{ headerShown: true, title: "Log Fuel" }} />
        <Stack.Screen name="profile-edit" options={{ headerShown: true, title: "Edit Profile" }} />
        <Stack.Screen name="exports" options={{ headerShown: true, title: "Tax Exports" }} />
        <Stack.Screen name="achievements" options={{ headerShown: true, title: "Achievements" }} />
        <Stack.Screen name="csv-import" options={{ headerShown: true, title: "Import CSV" }} />
        <Stack.Screen name="open-banking" options={{ headerShown: true, title: "Open Banking" }} />
        <Stack.Screen name="admin-users" options={{ headerShown: true, title: "User Management" }} />
        <Stack.Screen name="admin-user-detail" options={{ headerShown: true, title: "User Detail" }} />
        <Stack.Screen name="admin-health" options={{ headerShown: true, title: "System Health" }} />
        <Stack.Screen name="feedback" options={{ headerShown: true, title: "Suggestions" }} />
        <Stack.Screen name="feedback-form" options={{ headerShown: true, title: "Submit Suggestion" }} />
        <Stack.Screen name="admin-feedback" options={{ headerShown: true, title: "Manage Feedback" }} />
        <Stack.Screen name="sync-status" options={{ headerShown: true, title: "Sync Status" }} />
      </Stack>
      <HydrationOverlay visible={hydrating} step={hydrateStep} done={hydrateDone} total={5} />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    requestNotificationPermissions();
    setupNotificationResponseHandler();
    setupNotificationChannels().catch(console.error);
  }, []);

  useEffect(() => {
    Font.loadAsync({
      PlusJakartaSans_300Light,
      PlusJakartaSans_400Regular,
      PlusJakartaSans_500Medium,
      PlusJakartaSans_600SemiBold,
      PlusJakartaSans_700Bold,
    }).then(() => setFontsLoaded(true))
      .catch(() => setFontsLoaded(true));
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#030712" }}>
        <ActivityIndicator size="large" color="#f5a623" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <UserProvider>
          <ModeProvider>
            <SyncProvider>
              <RootNavigator />
            </SyncProvider>
          </ModeProvider>
        </UserProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
