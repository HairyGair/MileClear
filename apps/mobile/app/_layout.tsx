import { useEffect, useRef, useState } from "react";
import { Redirect, Stack } from "expo-router";
import { View, ActivityIndicator, LogBox } from "react-native";

LogBox.ignoreLogs(["Not Found"]);
import * as Font from "expo-font";
import {
  PlusJakartaSans_300Light,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { AuthProvider, useAuth } from "../lib/auth/context";
import { UserProvider } from "../lib/user/context";
import { SyncProvider } from "../lib/sync/context";
import { ModeProvider } from "../lib/mode/context";
import { SyncStatusBar } from "../components/SyncStatusBar";
import { HydrationOverlay } from "../components/HydrationOverlay";
import "../lib/tracking/detection"; // Register drive detection TaskManager task
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

  // ── Onboarding check ──────────────────────────────────────────
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setOnboardingChecked(true);
      return;
    }
    getDatabase()
      .then((db) =>
        db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'onboarding_complete'"
        )
      )
      .then((row) => {
        setOnboardingComplete(row?.value === "true");
        setOnboardingChecked(true);
      })
      .catch(() => {
        setOnboardingComplete(false);
        setOnboardingChecked(true);
      });
  }, [isAuthenticated]);

  // ── Data hydration (first login on new device) ────────────────
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
      hydrateLocalData((step, stepDone) => {
        setHydrateStep(step);
        setHydrateDone(stepDone);
      })
        .catch(console.error)
        .finally(() => setHydrating(false));
    });
  }, [isAuthenticated, isLoading]);

  // ── Notifications, tracking, etc. ─────────────────────────────
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      startDriveDetection();

      // Register push token and sync to API
      registerForPushNotifications()
        .then((token) => {
          if (token) return registerPushToken(token);
        })
        .catch(() => {});

      // Schedule recurring and one-off local notifications
      scheduleWeeklyMileageSummary().catch(() => {});
      scheduleTaxYearDeadlineReminder().catch(() => {});

      // Check conditions that fire immediately if met
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
        <Stack.Screen
          name="onboarding"
          redirect={!isAuthenticated || onboardingComplete}
        />
        <Stack.Screen
          name="(tabs)"
          redirect={!isAuthenticated || !onboardingComplete}
        />
        <Stack.Screen
          name="(auth)"
          redirect={isAuthenticated}
        />
        <Stack.Screen
          name="trip-form"
          options={{ headerShown: true, title: "Add Trip" }}
        />
        <Stack.Screen
          name="quick-trip"
          options={{ headerShown: true, title: "Quick Trip" }}
        />
        <Stack.Screen
          name="vehicle-form"
          options={{ headerShown: true, title: "Add Vehicle" }}
        />
        <Stack.Screen
          name="earning-form"
          options={{ headerShown: true, title: "Add Earning" }}
        />
        <Stack.Screen
          name="fuel-form"
          options={{ headerShown: true, title: "Log Fuel" }}
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
        <Stack.Screen
          name="csv-import"
          options={{ headerShown: true, title: "Import CSV" }}
        />
        <Stack.Screen
          name="open-banking"
          options={{ headerShown: true, title: "Open Banking" }}
        />
        <Stack.Screen
          name="admin-users"
          options={{ headerShown: true, title: "User Management" }}
        />
        <Stack.Screen
          name="admin-user-detail"
          options={{ headerShown: true, title: "User Detail" }}
        />
        <Stack.Screen
          name="admin-health"
          options={{ headerShown: true, title: "System Health" }}
        />
        <Stack.Screen
          name="feedback"
          options={{ headerShown: true, title: "Suggestions" }}
        />
        <Stack.Screen
          name="feedback-form"
          options={{ headerShown: true, title: "Submit Suggestion" }}
        />
        <Stack.Screen
          name="admin-feedback"
          options={{ headerShown: true, title: "Manage Feedback" }}
        />
        <Stack.Screen
          name="sync-status"
          options={{ headerShown: true, title: "Sync Status" }}
        />
      </Stack>
      <HydrationOverlay
        visible={hydrating}
        step={hydrateStep}
        done={hydrateDone}
        total={5}
      />
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
      <UserProvider>
        <ModeProvider>
          <SyncProvider>
            <RootNavigator />
          </SyncProvider>
        </ModeProvider>
      </UserProvider>
    </AuthProvider>
  );
}
